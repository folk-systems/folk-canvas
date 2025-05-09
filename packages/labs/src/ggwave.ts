/**
 * A wrapper class for ggwave.
 */

import { ggwave_factory } from './utils/ggwave.js';

// Protocol ID structure
interface GGWaveProtocolId {
  values: Record<number, number>;
}

// Parameters returned by getDefaultParameters
interface GGWaveParameters {
  sampleRateInp: number;
  sampleRateOut: number;
  payloadLength: number; // Add support for fixed payload length
  // Add more parameters as we discover them
}

interface iGGWave {
  // Constants and modes
  readonly ProtocolId: GGWaveProtocolId;
  readonly GGWAVE_OPERATING_MODE_RX: 2;
  readonly GGWAVE_OPERATING_MODE_TX: 4;
  readonly GGWAVE_OPERATING_MODE_RX_AND_TX: 6;
  readonly GGWAVE_OPERATING_MODE_TX_ONLY_TONES: 8;
  readonly GGWAVE_OPERATING_MODE_USE_DSS: 16;

  // Core functionality
  init(parameters: GGWaveParameters): any;
  encode(instance: any, text: string, protocol: number, volume: number): any;
  decode(instance: any, data: Int8Array): Uint8Array | null;
  getDefaultParameters(): GGWaveParameters;

  // Protocol control
  rxToggleProtocol(instance: any, protocol: number): void;
  txToggleProtocol(instance: any, protocol: number): void;
  rxProtocolSetFreqStart(instance: any, freq: number): void;
  txProtocolSetFreqStart(instance: any, freq: number): void;

  // Memory management
  free(instance: any): void;

  // Logging
  enableLog(): void;
  disableLog(): void;

  // WebAssembly related
  ready: Promise<any>;
  HEAP8: Int8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

export class GGWave {
  // Protocol constants
  static readonly GGWAVE_PROTOCOL_AUDIBLE_NORMAL = 0;
  static readonly GGWAVE_PROTOCOL_AUDIBLE_FAST = 1;
  static readonly GGWAVE_PROTOCOL_AUDIBLE_FASTEST = 2;
  static readonly GGWAVE_PROTOCOL_ULTRASOUND_NORMAL = 3;
  static readonly GGWAVE_PROTOCOL_ULTRASOUND_FAST = 4;
  static readonly GGWAVE_PROTOCOL_ULTRASOUND_FASTEST = 5;
  static readonly GGWAVE_PROTOCOL_DT_NORMAL = 6;
  static readonly GGWAVE_PROTOCOL_DT_FAST = 7;
  static readonly GGWAVE_PROTOCOL_DT_FASTEST = 8;

  // Fixed sample rate for consistency
  static readonly SAMPLE_RATE = 48000;

  // Maximum size for variable-length messages from C++ implementation
  static readonly MAX_VARIABLE_LENGTH = 140;

  // Message framing sequences
  static readonly MSG_START = '<<!';
  static readonly MSG_END = '!>>';

  #context: AudioContext | null = null;
  #ggwave: iGGWave | null = null;
  #instance: any = null;
  #mediaStream: MediaStreamAudioSourceNode | null = null;
  #recorder: ScriptProcessorNode | null = null;
  #onDataReceived: ((data: string) => void) | null = null;
  #currentProtocol: any = null;
  #visualizer: ((node: AudioNode | null, context: AudioContext) => void) | null = null;
  #ready: Promise<void>;
  #gainNode: GainNode | null = null;
  #stream: MediaStream | null = null;
  #fixedPayloadLength: number = -1; // -1 means variable length
  #currentMessage: string[] = [];

  constructor(fixedPayloadLength: number = -1) {
    this.#fixedPayloadLength = fixedPayloadLength;
    this.#ready = this.#initGGWave();
  }

  /**
   * Returns a promise that resolves when the audio wave is ready to use
   */
  async ready(): Promise<void> {
    return this.#ready;
  }

  /**
   * Set a callback to handle audio visualization
   * @param callback Function that receives the audio node and context for visualization
   */
  setVisualizer(callback: (node: AudioNode | null, context: AudioContext) => void): void {
    this.#visualizer = callback;
  }

  async #initGGWave() {
    this.#ggwave = await ggwave_factory();

    if (!this.#ggwave) {
      throw new Error('Failed to initialize GGWave');
    }

    this.setProtocol(GGWave.GGWAVE_PROTOCOL_AUDIBLE_FASTEST);

    // Create a single AudioContext at initialization
    this.#context = new AudioContext();
    const parameters = this.#ggwave.getDefaultParameters();
    parameters.sampleRateInp = this.#context.sampleRate;
    parameters.sampleRateOut = this.#context.sampleRate;
    parameters.payloadLength = this.#fixedPayloadLength; // Set fixed payload length if specified
    this.#instance = this.#ggwave.init(parameters);
  }

  #convertTypedArray(src: any, type: any) {
    const buffer = new ArrayBuffer(src.byteLength);
    new src.constructor(buffer).set(src);
    return new type(buffer);
  }

  /**
   * Set the protocol to use for sending data
   * @param protocol A protocol constant from FolkAudioWave static fields
   * @example
   * wave.setProtocol(FolkAudioWave.GGWAVE_PROTOCOL_AUDIBLE_FASTEST)
   */
  setProtocol(protocol: number): void {
    if (!this.#ggwave) throw new Error('GGWave not initialized');
    if (!this.#ggwave.ProtocolId.values[protocol]) throw new Error('Invalid protocol');
    this.#currentProtocol = this.#ggwave.ProtocolId.values[protocol];
  }

  /**
   * Send data over audio, handling chunking if necessary
   * @param text The text to send
   * @param volume Volume level from 1-100
   * @returns Promise that resolves when the audio finishes playing
   */
  async send(text: string, volume = 20): Promise<void> {
    if (!this.#context) throw new Error('Audio context not initialized');
    if (!this.#ggwave) throw new Error('GGWave not initialized');

    // Resume context if needed
    if (this.#context.state === 'suspended') {
      await this.#context.resume();
    }

    // If using fixed payload length, validate the message size
    if (this.#fixedPayloadLength > 0) {
      if (text.length > this.#fixedPayloadLength) {
        throw new Error(`Message length ${text.length} exceeds fixed payload length ${this.#fixedPayloadLength}`);
      }
    }
    // For variable length, chunk if needed
    else if (text.length > GGWave.MAX_VARIABLE_LENGTH) {
      const chunks = this.#chunkMessage(text);
      for (const chunk of chunks) {
        await this.#sendChunk(chunk, volume);
      }
      return;
    }

    await this.#sendChunk(text, volume);
  }

  /**
   * Split a message into chunks for transmission
   */
  #chunkMessage(text: string): string[] {
    const maxChunkSize = GGWave.MAX_VARIABLE_LENGTH - 4; // Leave minimal room for framing
    const chunks: string[] = [];

    for (let i = 0; i < text.length; i += maxChunkSize) {
      const chunk = text.slice(i, i + maxChunkSize);
      const isFirst = i === 0;
      const isLast = i + maxChunkSize >= text.length;

      // Format:
      // First chunk starts with <<!
      // Last chunk ends with !>>
      // Middle chunks are raw data
      chunks.push(`${isFirst ? GGWave.MSG_START : ''}${chunk}${isLast ? GGWave.MSG_END : ''}`);
    }

    return chunks;
  }

  /**
   * Send a single chunk of data
   */
  async #sendChunk(text: string, volume: number): Promise<void> {
    if (!this.#context) throw new Error('Audio context not initialized');
    if (!this.#ggwave) throw new Error('GGWave not initialized');

    const waveform = this.#ggwave.encode(this.#instance, text, this.#currentProtocol, volume);
    const buf = this.#convertTypedArray(waveform, Float32Array);
    const buffer = this.#context.createBuffer(1, buf.length, this.#context.sampleRate);
    buffer.getChannelData(0).set(buf);

    const source = this.#context.createBufferSource();
    source.buffer = buffer;

    this.#gainNode = this.#context.createGain();
    this.#gainNode.gain.value = volume / 100;
    source.connect(this.#gainNode);
    this.#gainNode.connect(this.#context.destination);

    if (this.#visualizer && this.#context) {
      this.#visualizer(this.#gainNode, this.#context);
    }

    return new Promise((resolve) => {
      source.onended = () => {
        resolve();
        if (this.#visualizer && this.#context) {
          this.#visualizer(null, this.#context);
        }
        source.disconnect();
        if (this.#gainNode) {
          this.#gainNode.disconnect();
          this.#gainNode = null;
        }
      };
      source.start(0);
    });
  }

  /**
   * Process received data, handling chunked messages if necessary
   */
  #processReceivedData(text: string): void {
    if (text.startsWith(GGWave.MSG_START)) {
      // Start of a new message
      const chunk = text.slice(GGWave.MSG_START.length);
      this.#currentMessage = [chunk];

      // Check if this is a single-chunk message
      if (text.endsWith(GGWave.MSG_END)) {
        const message = chunk.slice(0, -GGWave.MSG_END.length);
        this.#onDataReceived?.(message);
        this.#currentMessage = [];
      }
    } else if (text.endsWith(GGWave.MSG_END)) {
      // End of a multi-chunk message
      const chunk = text.slice(0, -GGWave.MSG_END.length);
      this.#currentMessage.push(chunk);
      const completeMessage = this.#currentMessage.join('');
      this.#onDataReceived?.(completeMessage);
      this.#currentMessage = [];
    } else if (this.#currentMessage.length > 0) {
      // Middle of a multi-chunk message
      this.#currentMessage.push(text);
    } else {
      // Not a chunked message
      this.#onDataReceived?.(text);
    }
  }

  /**
   * Start listening for incoming audio data
   * @param callback Function to call when data is received
   */
  async startListening(callback: (data: string) => void): Promise<void> {
    if (!this.#context) throw new Error('Audio context not initialized');
    if (!this.#ggwave) throw new Error('GGWave not initialized');

    this.#onDataReceived = callback;

    // Resume context if needed
    if (this.#context.state === 'suspended') {
      await this.#context.resume();
    }

    // Get mic permissions
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
        channelCount: 1,
      },
    });

    this.#mediaStream = this.#context.createMediaStreamSource(this.#stream);
    this.#recorder = this.#context.createScriptProcessor(4096, 1, 1);

    // Connect to visualizer if set
    if (this.#visualizer) {
      this.#visualizer(this.#mediaStream, this.#context);
    }

    let lastLogTime = 0;
    const LOG_INTERVAL = 5000;

    this.#recorder.onaudioprocess = (e) => {
      if (!this.#ggwave) return;
      const source = e.inputBuffer;
      const audioData = source.getChannelData(0);

      // Log audio levels periodically
      const now = Date.now();
      if (now - lastLogTime > LOG_INTERVAL) {
        const maxLevel = Math.max(...audioData.map(Math.abs));
        lastLogTime = now;
      }

      const res = this.#ggwave.decode(this.#instance, this.#convertTypedArray(new Float32Array(audioData), Int8Array));

      if (res && res.length > 0) {
        const text = new TextDecoder('utf-8').decode(res);
        this.#processReceivedData(text);
      }
    };

    // Connect the audio nodes properly
    this.#mediaStream.connect(this.#recorder);
    this.#recorder.connect(this.#context.destination);
  }

  /**
   * Stop listening for incoming audio data
   */
  stopListening(): void {
    if (this.#recorder && this.#context) {
      this.#recorder.disconnect();
      if (this.#mediaStream) {
        this.#mediaStream.disconnect();
      }
      this.#recorder = null;
    }

    if (this.#stream) {
      this.#stream.getTracks().forEach((track) => track.stop());
      this.#stream = null;
    }

    // Disconnect from visualizer
    if (this.#visualizer && this.#context) {
      this.#visualizer(null, this.#context);
    }

    this.#onDataReceived = null;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopListening();
    if (this.#context) {
      this.#context.close();
      this.#context = null;
    }
    if (this.#gainNode) {
      this.#gainNode.disconnect();
      this.#gainNode = null;
    }
    if (this.#stream) {
      this.#stream.getTracks().forEach((track) => track.stop());
      this.#stream = null;
    }
    this.#instance = null;
    this.#visualizer = null;
  }
}
