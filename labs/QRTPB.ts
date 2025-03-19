// QRTPB - QR Transfer Protocol with Backchannel (simplified version)
// A protocol that uses QR codes for data transfer with character-range based chunking

export type MessageLogCallback = (direction: string, type: string, message: string, data?: any) => void;
export type OnChangeCallback = (state: QRTPBState) => void;

export type QRTPBMode = 'send' | 'receive';

export interface QRTPBState {
  mode: QRTPBMode;
  receivedRanges: Array<[number, number]>; // Array of [start, end] ranges that have been received
  maxSeenIndex: number; // Highest character index seen
  isTransmissionComplete: boolean;
  receivedText: string; // The partially or fully assembled text
  excludedRanges: Array<[number, number]>; // Array of [start, end] ranges that have been acknowledged
  totalLength: number; // Total length of the data being sent
}

export interface QRTPBChunk {
  startIndex: number;
  endIndex: number;
  data: string;
}

export class QRTPB {
  // Static configuration
  static readonly DEFAULT_CHUNK_SIZE: number = 1000;
  static readonly QR_CYCLE_INTERVAL: number = 250; // ms between QR code updates
  static readonly DONE_SIGNAL: string = 'DONE'; // Signal for completion

  // Current mode
  private mode: QRTPBMode = 'send';

  // Data to be sent
  private dataToSend: string | null = null;
  private chunks: QRTPBChunk[] = [];
  private currentChunkIndex: number = 0;

  // Receiving state
  private receivedRanges: Array<[number, number]> = [];
  private maxSeenIndex: number = 0;
  private receivedText: string = '';

  // Cycling
  private qrCycleInterval: any = null;

  // Configuration
  private chunkSize: number = QRTPB.DEFAULT_CHUNK_SIZE;
  private protocolPrefix: string = 'QRTPB';

  // Callbacks
  private messageLogCallback: MessageLogCallback | null = null;
  private onChangeCallback: OnChangeCallback | null = null;

  // Backchannel state
  private excludedRanges: Array<[number, number]> = [];
  private lastBackchannelUpdate: number = 0;
  private static readonly BACKCHANNEL_INTERVAL: number = 4000; // 4 seconds

  // Completion state
  private receiverDone: boolean = false;
  private senderDone: boolean = false;

  constructor(messageLogCallback?: MessageLogCallback, onChangeCallback?: OnChangeCallback) {
    this.messageLogCallback = messageLogCallback || null;
    this.onChangeCallback = onChangeCallback || null;
  }

  // Switch between send and receive modes
  setMode(mode: QRTPBMode): void {
    if (this.mode === mode) return;

    this.reset();
    this.mode = mode;
    this.logMessage('system', 'mode', `Switched to ${mode} mode`);
    this.notifyChange();
  }

  // Get current mode
  getMode(): QRTPBMode {
    return this.mode;
  }

  // Notify about state changes
  private notifyChange(): void {
    if (this.onChangeCallback) {
      const state: QRTPBState = {
        mode: this.mode,
        receivedRanges: this.receivedRanges,
        maxSeenIndex: this.maxSeenIndex,
        isTransmissionComplete: this.isTransmissionComplete(),
        receivedText: this.receivedText,
        excludedRanges: this.senderDone ? [[0, (this.dataToSend?.length || 1) - 1]] : this.excludedRanges,
        totalLength: this.dataToSend?.length || 0,
      };
      this.onChangeCallback(state);
    }
  }

  // Log a message
  private logMessage(direction: string, type: string, message: string, data: any = null): void {
    if (this.messageLogCallback) {
      if (typeof data === 'object') {
        const rawData = JSON.stringify(data);
        this.messageLogCallback(direction, type, message, rawData);
      } else {
        this.messageLogCallback(direction, type, message, data);
      }
    }
  }

  // Set data to be sent and chunk it
  setData(data: string, chunkSize?: number): boolean {
    if (this.mode !== 'send') {
      this.logMessage('system', 'error', 'Cannot set data in receive mode');
      return false;
    }

    if (!data || data.trim() === '') {
      this.reset();
      return false;
    }

    this.dataToSend = data;
    this.chunkSize = chunkSize || this.chunkSize;
    this.chunkData();
    this.logMessage('outgoing', 'info', `Data set for sending: ${data.length} bytes, chunk size: ${this.chunkSize}`);
    this.startQRCycle();
    this.notifyChange();
    return true;
  }

  // Chunk the data into smaller pieces with character ranges
  private chunkData(): void {
    this.chunks = [];
    this.currentChunkIndex = 0;

    if (!this.dataToSend) return;

    // Split text into chunks with character ranges
    for (let i = 0; i < this.dataToSend.length; i += this.chunkSize) {
      const chunk = this.dataToSend.substring(i, Math.min(i + this.chunkSize, this.dataToSend.length));
      this.chunks.push({
        startIndex: i,
        endIndex: Math.min(i + chunk.length - 1, this.dataToSend.length - 1),
        data: chunk,
      });
    }

    this.logMessage('outgoing', 'info', `Data chunked into ${this.chunks.length} pieces`);
  }

  // Get the current QR code data to display
  getCurrentQRCodeData(): string {
    if (!this.dataToSend || this.chunks.length === 0) {
      return `${this.protocolPrefix}:idle`;
    }

    // Show DONE if we're done
    if (this.senderDone || (this.isAllChunksExcluded() && this.dataToSend)) {
      return `${this.protocolPrefix}:${QRTPB.DONE_SIGNAL}`;
    }

    // Filter out chunks that are fully contained in excluded ranges
    const availableChunks = this.chunks.filter((chunk) => {
      return !this.excludedRanges.some((range) => chunk.startIndex >= range[0] && chunk.endIndex <= range[1]);
    });

    if (availableChunks.length === 0) {
      // All chunks are excluded, cycle through them anyway in case of lost messages
      this.currentChunkIndex = (this.currentChunkIndex + 1) % this.chunks.length;
      const chunk = this.chunks[this.currentChunkIndex];
      return `${this.protocolPrefix}:${chunk.startIndex}-${chunk.endIndex}/${this.dataToSend.length}:${chunk.data}`;
    }

    // Use modulo on available chunks length
    const index = this.currentChunkIndex % availableChunks.length;
    const chunk = availableChunks[index];

    const qrData = `${this.protocolPrefix}:${chunk.startIndex}-${chunk.endIndex}/${this.dataToSend.length}:${chunk.data}`;

    // Move to next chunk for next cycle
    this.currentChunkIndex = (this.currentChunkIndex + 1) % availableChunks.length;

    return qrData;
  }

  // Check if all chunks are excluded (received by receiver)
  private isAllChunksExcluded(): boolean {
    if (!this.dataToSend || this.chunks.length === 0) return false;
    return this.chunks.every((chunk) =>
      this.excludedRanges.some((range) => chunk.startIndex >= range[0] && chunk.endIndex <= range[1]),
    );
  }

  // Process received QR code data
  processReceivedQRData(data: string): void {
    if (!data.startsWith(this.protocolPrefix)) {
      this.logMessage('incoming', 'error', 'Invalid QR code format');
      return;
    }

    const parts = data.split(':');
    if (parts.length !== 2 && parts.length !== 3) {
      this.logMessage('incoming', 'error', 'Invalid QR code format');
      return;
    }

    // Check for DONE signal
    if (parts[1] === QRTPB.DONE_SIGNAL) {
      this.logMessage('incoming', 'success', 'Received DONE signal from sender');
      this.receiverDone = true;
      this.notifyChange();
      return;
    }

    const rangeStr = parts[1];
    const payload = parts[2];

    if (rangeStr === 'idle') return;

    const [rangeInfo, totalChars] = rangeStr.split('/');
    const [startStr, endStr] = rangeInfo.split('-');
    const startIndex = parseInt(startStr);
    const endIndex = parseInt(endStr);
    const totalLength = parseInt(totalChars);

    if (isNaN(startIndex) || isNaN(endIndex) || isNaN(totalLength)) {
      this.logMessage('incoming', 'error', 'Invalid range format');
      return;
    }

    this.processChunk(startIndex, endIndex, payload, totalLength);
  }

  // Process a received chunk
  private processChunk(startIndex: number, endIndex: number, data: string, totalLength: number): void {
    // Update max seen index to be the total length if we have it
    this.maxSeenIndex = Math.max(this.maxSeenIndex, totalLength - 1);

    // Add the range to our received ranges
    this.addRange(startIndex, endIndex);

    // Update the received text
    if (this.receivedText.length < endIndex + 1) {
      this.receivedText = this.receivedText.padEnd(endIndex + 1, ' ');
    }
    this.receivedText = this.receivedText.substring(0, startIndex) + data + this.receivedText.substring(endIndex + 1);

    this.logMessage('incoming', 'chunk', `Received chunk ${startIndex}-${endIndex}/${totalLength}`, data);
    this.notifyChange();
  }

  // Add a range to our received ranges, merging overlapping ranges
  private addRange(start: number, end: number): void {
    const newRange: [number, number] = [start, end];

    // Find overlapping or adjacent ranges
    const overlapping: number[] = [];
    let mergedRange: [number, number] = [start, end];

    this.receivedRanges.forEach((range, index) => {
      if (this.rangesOverlap(range, newRange) || this.rangesAdjacent(range, newRange)) {
        overlapping.push(index);
        mergedRange = [Math.min(mergedRange[0], range[0]), Math.max(mergedRange[1], range[1])];
      }
    });

    // Remove overlapping ranges and add merged range
    for (let i = overlapping.length - 1; i >= 0; i--) {
      this.receivedRanges.splice(overlapping[i], 1);
    }
    this.receivedRanges.push(mergedRange);

    // Sort ranges by start index
    this.receivedRanges.sort((a, b) => a[0] - b[0]);
  }

  // Check if two ranges overlap
  private rangesOverlap(a: [number, number], b: [number, number]): boolean {
    return Math.max(a[0], b[0]) <= Math.min(a[1], b[1]);
  }

  // Check if two ranges are adjacent
  private rangesAdjacent(a: [number, number], b: [number, number]): boolean {
    return Math.abs(a[1] - b[0]) === 1 || Math.abs(a[0] - b[1]) === 1;
  }

  // Check if transmission is complete (no gaps in ranges from 0 to maxSeenIndex)
  private isTransmissionComplete(): boolean {
    if (this.receivedRanges.length === 0) return false;

    // Check if first range starts at 0
    if (this.receivedRanges[0][0] !== 0) return false;

    // Check for gaps between ranges
    for (let i = 1; i < this.receivedRanges.length; i++) {
      if (this.receivedRanges[i][0] > this.receivedRanges[i - 1][1] + 1) {
        return false;
      }
    }

    // Check if last range ends at maxSeenIndex
    return this.receivedRanges[this.receivedRanges.length - 1][1] === this.maxSeenIndex;
  }

  // Start cycling through QR codes
  private startQRCycle(): void {
    if (this.qrCycleInterval) clearInterval(this.qrCycleInterval);
    this.qrCycleInterval = setInterval(() => {
      this.notifyChange();
    }, QRTPB.QR_CYCLE_INTERVAL);
  }

  // Reset the protocol state
  reset(): void {
    this.dataToSend = null;
    this.chunks = [];
    this.currentChunkIndex = 0;
    this.receivedRanges = [];
    this.maxSeenIndex = 0;
    this.receivedText = '';
    this.excludedRanges = [];
    this.lastBackchannelUpdate = 0;
    this.receiverDone = false;
    this.senderDone = false;

    if (this.qrCycleInterval) {
      clearInterval(this.qrCycleInterval);
      this.qrCycleInterval = null;
    }

    this.logMessage('system', 'reset', 'Protocol state reset');
    this.notifyChange();
  }

  // Clean up resources
  dispose(): void {
    this.reset();
  }

  // Process backchannel message from receiver
  processBackchannelMessage(message: string): void {
    try {
      // Check for DONE signal
      if (message === QRTPB.DONE_SIGNAL) {
        this.logMessage('incoming', 'success', 'Received DONE signal from receiver');
        this.senderDone = true;
        this.notifyChange();
        return;
      }

      // Format: "R:start1-end1,start2-end2,..."
      if (!message.startsWith('R:')) {
        this.logMessage('incoming', 'backchannel', `Ignored non-range message: ${message}`);
        return;
      }

      const ranges = message
        .substring(2)
        .split(',')
        .map((range) => {
          const [start, end] = range.split('-').map(Number);
          return [start, end] as [number, number];
        })
        .filter((range) => !isNaN(range[0]) && !isNaN(range[1]));

      if (ranges.length === 0) {
        this.logMessage('incoming', 'backchannel', 'Received empty or invalid ranges');
        return;
      }

      this.excludedRanges = ranges;
      this.logMessage(
        'incoming',
        'backchannel',
        `Received ${ranges.length} ranges from receiver`,
        ranges.map((r) => `${r[0]}-${r[1]}`).join(', '),
      );

      // Log how many chunks are now excluded
      const excludedCount = this.chunks.filter((chunk) =>
        this.excludedRanges.some((range) => chunk.startIndex >= range[0] && chunk.endIndex <= range[1]),
      ).length;
      this.logMessage('system', 'info', `${excludedCount} of ${this.chunks.length} chunks are now excluded`);

      this.notifyChange();
    } catch (e) {
      this.logMessage('incoming', 'error', `Failed to process backchannel message: ${e}`);
    }
  }

  // Get backchannel message for sender
  getBackchannelMessage(): string | null {
    const now = Date.now();
    if (now - this.lastBackchannelUpdate < QRTPB.BACKCHANNEL_INTERVAL) {
      return null;
    }

    this.lastBackchannelUpdate = now;

    // If receiver has all chunks, send DONE signal
    if (this.isTransmissionComplete()) {
      this.logMessage('outgoing', 'success', 'Sending DONE signal to sender');
      return QRTPB.DONE_SIGNAL;
    }

    if (this.receivedRanges.length === 0) return null;

    // Format ranges as compact string
    const message = 'R:' + this.receivedRanges.map((range) => `${range[0]}-${range[1]}`).join(',');
    this.logMessage(
      'outgoing',
      'backchannel',
      `Sending ranges update`,
      this.receivedRanges.map((r) => `${r[0]}-${r[1]}`).join(', '),
    );
    return message;
  }
}
