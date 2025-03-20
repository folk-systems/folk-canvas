/**
 * Protocol - A simplified string parsing and encoding library
 *
 * This library provides a DSL for defining string protocols using
 * tagged template literals. It handles basic parsing of structured text
 * formats into JavaScript objects and encoding objects back to strings.
 *
 * Basic usage:
 * const myProtocol = protocol`prefix <field:type> suffix`;
 * const result = myProtocol.decode("prefix value suffix");
 * const encoded = myProtocol.encode({ field: "value" });
 *
 * Supported types:
 * - text: Default type, represents a text string
 * - num: Numeric value
 * - bool: Boolean value (true/false)
 * - list: A comma-separated list of values
 * - nums: A list of numeric values
 * - pairs: A list of tuple arrays where each tuple is [key, value] (format is 'key;value;key;value')
 * - numPairs: A list of number tuple arrays where each tuple is [number, number] (format is 'num;num;num;num')
 *
 * Fixed-width fields:
 * You can specify a fixed width for a field by adding a size parameter:
 * <field:type(size)> - for example, <code:text(3)> for a 3-character code
 *
 * Special delimiters:
 * - $: Indicates that everything after this point is payload data
 * - !: Marks a fixed-size header where the header length is determined by the field sizes
 */

// Type definitions
type PatternType = 'text' | 'num' | 'bool' | 'list' | 'nums' | 'pairs' | 'numPairs';

interface Pattern {
  name: string;
  type: PatternType;
  size?: number;
  isFixedHeader?: boolean;
}

type ParseResult = Record<string, any>;

// Constants for protocol parsing
const DELIMITERS = {
  PAYLOAD: '$',
  FIXED_HEADER: '!',
  LIST: ',',
  PAIRS_ITEM: ';',
};

// --- Parse functions (for decoding) ---

function parseText(text: string, size?: number): string {
  if (size !== undefined && text.length > size) {
    return text.substring(0, size);
  }
  return text;
}

function parseNum(text: string): number {
  return Number(text);
}

function parseBool(text: string): boolean {
  return text.toLowerCase() === 'true';
}

function parseList(text: string, size?: number): string[] {
  if (size !== undefined) {
    // Fixed width parsing
    const chunks = [];
    for (let j = 0; j < text.length; j += size) {
      if (j + size <= text.length) {
        chunks.push(text.substring(j, j + size));
      }
    }
    return chunks;
  }
  // Standard parsing
  return text ? text.split(DELIMITERS.LIST) : [];
}

function parseNums(text: string, size?: number): number[] {
  if (size !== undefined) {
    // Fixed width parsing
    const nums = [];
    for (let j = 0; j < text.length; j += size) {
      if (j + size <= text.length) {
        nums.push(parseInt(text.substring(j, j + size)));
      }
    }
    return nums;
  }
  // Standard parsing
  return text ? text.split(DELIMITERS.LIST).map(Number) : [];
}

function parsePairs(text: string): string[][] {
  if (!text) return [];
  const items = text.split(DELIMITERS.PAIRS_ITEM);
  const pairs = [];
  for (let j = 0; j < items.length; j += 2) {
    if (j + 1 < items.length) {
      pairs.push([items[j], items[j + 1]]);
    }
  }
  return pairs;
}

function parseNumPairs(text: string): number[][] {
  if (!text) return [];
  const items = text.split(DELIMITERS.PAIRS_ITEM);
  const pairs = [];
  for (let j = 0; j < items.length; j += 2) {
    if (j + 1 < items.length) {
      pairs.push([Number(items[j]), Number(items[j + 1])]);
    }
  }
  return pairs;
}

interface TemplateInfo {
  staticParts: string[];
  patterns: Pattern[];
  hasFixedHeader: boolean;
  hasDollarDelimiter: boolean;
}

function parseTemplate(strings: TemplateStringsArray, placeholders: string[]): TemplateInfo {
  // Create a full template string
  let fullTemplate = strings[0];
  for (let i = 0; i < placeholders.length; i++) {
    fullTemplate += placeholders[i] + strings[i + 1];
  }

  // Extract patterns
  const staticParts: string[] = [];
  const patterns: Pattern[] = [];
  const placeholderRegex = /<([^:>]+)(?::([^>(]+)(?:\(([^)]*)\))?)?>/g;
  let lastIndex = 0;
  let match;

  while ((match = placeholderRegex.exec(fullTemplate)) !== null) {
    staticParts.push(fullTemplate.substring(lastIndex, match.index));

    const [, name, type = 'text', sizeStr] = match;
    const size = sizeStr ? parseInt(sizeStr) : undefined;

    patterns.push({ name, type: type as PatternType, size });
    lastIndex = match.index + match[0].length;
  }

  staticParts.push(fullTemplate.substring(lastIndex));

  // Detect special delimiters
  const hasFixedHeader = staticParts[staticParts.length - 1] === DELIMITERS.FIXED_HEADER;
  const hasDollarDelimiter = staticParts[staticParts.length - 1] === DELIMITERS.PAYLOAD;

  // Mark all patterns in a fixed header
  if (hasFixedHeader) {
    for (const pattern of patterns) {
      pattern.isFixedHeader = true;
      if (pattern.size === undefined) {
        throw new Error('Fixed-size header requires a size parameter for all fields');
      }
    }
  }

  return {
    staticParts,
    patterns,
    hasFixedHeader,
    hasDollarDelimiter,
  };
}

// --- Format functions (for encoding) ---

function formatText(value: any, size?: number): string {
  const str = String(value);
  if (size !== undefined) {
    if (str.length > size) {
      throw new Error(`Value "${str}" exceeds fixed width of ${size}`);
    }
    return str.padEnd(size, ' ');
  }
  return str;
}

function formatNum(value: number, size?: number): string {
  const str = String(value);
  if (size !== undefined) {
    if (str.length > size) {
      throw new Error(`Value "${str}" exceeds fixed width of ${size}`);
    }
    return str.padStart(size, '0');
  }
  return str;
}

function formatBool(value: boolean): string {
  return String(value);
}

function formatList(values: any[], size?: number): string {
  if (!Array.isArray(values)) return String(values);

  if (size !== undefined) {
    // Fixed width formatting
    return values
      .map((str) => {
        const s = String(str);
        if (s.length > size) {
          throw new Error(`Value "${s}" exceeds fixed width of ${size}`);
        }
        return s.padEnd(size, ' ');
      })
      .join('');
  }
  // Standard delimiter formatting
  return values.join(DELIMITERS.LIST);
}

function formatNums(values: number[], size?: number): string {
  if (!Array.isArray(values)) return String(values);

  if (size !== undefined) {
    // Fixed width formatting
    return values
      .map((num) => {
        const str = String(Math.floor(Number(num)));
        if (str.length > size) {
          throw new Error(`Value "${num}" exceeds fixed width of ${size}`);
        }
        return str.padStart(size, '0');
      })
      .join('');
  }
  // Standard delimiter formatting
  return values.map(String).join(DELIMITERS.LIST);
}

function formatPairs(pairs: string[][]): string {
  if (!Array.isArray(pairs)) return String(pairs);
  return pairs.flatMap((pair) => pair).join(DELIMITERS.PAIRS_ITEM);
}

function formatNumPairs(pairs: number[][]): string {
  if (!Array.isArray(pairs)) return String(pairs);
  return pairs.flatMap((pair) => pair.map(String)).join(DELIMITERS.PAIRS_ITEM);
}

interface HeaderPayload {
  header: string;
  payload?: string;
}

function splitHeaderAndPayload(
  input: string,
  hasFixedHeader: boolean,
  fixedHeaderLength: number,
  staticPrefixLength: number,
): HeaderPayload {
  const payloadStart = hasFixedHeader ? staticPrefixLength + fixedHeaderLength : input.indexOf(DELIMITERS.PAYLOAD);

  if (payloadStart < 0) {
    // No payload found
    return { header: input };
  }

  // For variable header, skip the $ delimiter
  const payloadOffset = hasFixedHeader ? 0 : 1;

  const header = input.substring(0, payloadStart);
  const payload =
    payloadStart + payloadOffset < input.length ? input.substring(payloadStart + payloadOffset) : undefined;

  return { header, payload };
}

function addPayload(encoded: string, payload?: string, hasFixedHeader = false, hasDollarDelimiter = false): string {
  if (payload === undefined) {
    return encoded;
  }

  // Add delimiter if needed
  if (!hasFixedHeader && !hasDollarDelimiter) {
    return encoded + DELIMITERS.PAYLOAD + payload;
  }

  // Otherwise just append payload
  return encoded + payload;
}

interface ExtractResult {
  value: string;
  newRemaining: string;
  newPosition: number;
  isLastField: boolean;
}

function extractPatternValue(
  pattern: Pattern,
  input: string,
  position: number,
  remaining: string,
  staticPart: string,
  nextStatic: string,
): ExtractResult {
  // Fixed width field handling
  if (pattern.isFixedHeader) {
    return {
      value: input.substring(position, position + pattern.size!),
      newRemaining: remaining,
      newPosition: position + pattern.size!,
      isLastField: false,
    };
  }

  // Variable width field handling
  if (!remaining.startsWith(staticPart)) {
    throw new Error(`Input doesn't match pattern at "${staticPart}"`);
  }

  // Skip the static prefix
  const afterPrefix = remaining.substring(staticPart.length);

  // Check for end markers
  if (nextStatic === DELIMITERS.PAYLOAD || nextStatic === DELIMITERS.FIXED_HEADER) {
    return {
      value: afterPrefix,
      newRemaining: '',
      newPosition: position,
      isLastField: true,
    };
  }

  // Find the end of this value (next delimiter)
  const endPos = nextStatic ? afterPrefix.indexOf(nextStatic) : afterPrefix.length;
  if (endPos === -1) {
    throw new Error(`Couldn't find delimiter "${nextStatic}" in remaining input`);
  }

  // Extract value and update remaining text
  return {
    value: afterPrefix.substring(0, endPos),
    newRemaining: afterPrefix.substring(endPos),
    newPosition: position,
    isLastField: false,
  };
}

interface Protocol {
  decode: (input: string) => ParseResult;
  encode: (data: Record<string, any>) => string;
}

export function protocol(strings: TemplateStringsArray, ...placeholders: string[]): Protocol {
  const { staticParts, patterns, hasFixedHeader, hasDollarDelimiter } = parseTemplate(strings, placeholders);

  // Calculate fixed header length if needed
  const fixedHeaderLength = hasFixedHeader ? patterns.reduce((sum, p) => sum + (p.size || 0), 0) : 0;

  return {
    decode(input: string): ParseResult {
      // SETUP
      const result: ParseResult = {};

      // Check input for fixed header patterns
      if (hasFixedHeader && !input.startsWith(staticParts[0])) {
        throw new Error(`Input doesn't match pattern at "${staticParts[0]}"`);
      }

      // Split input into header and payload
      const { header, payload } = splitHeaderAndPayload(
        input,
        hasFixedHeader,
        fixedHeaderLength,
        staticParts[0].length,
      );

      // Store payload if found
      if (payload) {
        result.payload = payload;
      }

      // MAIN LOOP: Process each pattern
      let pos = hasFixedHeader ? staticParts[0].length : 0;
      let remaining = header;
      let staticIndex = 0;

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];

        // Extract value for this pattern
        const { value, newRemaining, newPosition, isLastField } = extractPatternValue(
          pattern,
          input,
          pos,
          remaining,
          staticParts[staticIndex],
          staticParts[staticIndex + 1] || '',
        );

        // Parse according to pattern type
        switch (pattern.type) {
          case 'num':
            result[pattern.name] = parseNum(value);
            break;
          case 'bool':
            result[pattern.name] = parseBool(value);
            break;
          case 'list':
            result[pattern.name] = parseList(value, pattern.size);
            break;
          case 'nums':
            result[pattern.name] = parseNums(value, pattern.size);
            break;
          case 'pairs':
            result[pattern.name] = parsePairs(value);
            break;
          case 'numPairs':
            result[pattern.name] = parseNumPairs(value);
            break;
          default: // text
            result[pattern.name] = parseText(value, pattern.size);
            break;
        }

        // Update our state
        remaining = newRemaining;
        pos = newPosition;
        if (!pattern.isFixedHeader) staticIndex++;

        // Stop if this was the last field
        if (isLastField) break;
      }

      return result;
    },

    encode(data: Record<string, any>): string {
      // SETUP
      let result = staticParts[0];

      // MAIN LOOP: Format each pattern
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];

        // Verify required field exists
        if (data[pattern.name] === undefined) {
          throw new Error(`Missing required field "${pattern.name}"`);
        }

        // Format value and add to result according to pattern type
        switch (pattern.type) {
          case 'num':
            result += formatNum(data[pattern.name], pattern.size);
            break;
          case 'bool':
            result += formatBool(data[pattern.name]);
            break;
          case 'list':
            result += formatList(data[pattern.name], pattern.size);
            break;
          case 'nums':
            result += formatNums(data[pattern.name], pattern.size);
            break;
          case 'pairs':
            result += formatPairs(data[pattern.name]);
            break;
          case 'numPairs':
            result += formatNumPairs(data[pattern.name]);
            break;
          default: // text
            result += formatText(data[pattern.name], pattern.size);
            break;
        }

        // Add next static part (except for fixed header patterns)
        if (!pattern.isFixedHeader && i + 1 < staticParts.length) {
          result += staticParts[i + 1];
        }
      }

      // Add payload if present
      return addPayload(result, data.payload, hasFixedHeader, hasDollarDelimiter);
    },
  };
}
