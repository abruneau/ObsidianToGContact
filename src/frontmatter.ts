/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * TypeScript frontmatter parser adapted from YAML.js
 * Supports parsing YAML frontmatter from markdown files
 */

export interface FrontmatterParseResult {
  data: Record<string, any>;
  content: string;
  errors: string[];
}

export interface FrontmatterBlock {
  parent: FrontmatterBlock | null;
  length: number;
  level: number;
  lines: string[];
  children: FrontmatterBlock[];
  addChild: (obj: FrontmatterBlock) => void;
}

export class FrontmatterParser {
  private errors: string[] = [];
  private referenceBlocks: Record<string, any> = {};
  private processingTime = 0;

  private readonly regex = {
    regLevel: /^([\s\-]+)/,
    invalidLine: /^---|^\.\.\.|^\s*#.*|^\s*$/,
    dashesString: /^\s*\"([^\"]*)\"\s*$/,
    quotesString: /^\s*\'([^\']*)\'\s*$/,
    float: /^[+-]?[0-9]+\.[0-9]+(e[+-]?[0-9]+(\.[0-9]+)?)?$/,
    integer: /^[+-]?[0-9]+$/,
    array: /\[\s*(.*)\s*\]/,
    map: /\{\s*(.*)\s*\}/,
    keyValue: /([a-z0-9_-][ a-z0-9_-]*):( .+)/i,
    singleKeyValue: /^([a-z0-9_-][ a-z0-9_-]*):( .+?)$/i,
    key: /([a-z0-9_-][ a-z0-9_-]+):( .+)?/i,
    item: /^-\s+/,
    trim: /^\s+|\s+$/,
    comment: /([^\'\"#]+([\'\"][^\'\"]*[\'\"])*)*(#.*)?/,
  };

  /**
   * Parse frontmatter from a markdown string
   * @param str - The markdown string containing frontmatter
   * @returns Parse result with data, content, and any errors
   */
  public parse(str: string): FrontmatterParseResult {
    this.errors = [];
    this.referenceBlocks = {};
    this.processingTime = Date.now();

    // Handle frontmatter with potential leading whitespace and newlines
    const frontmatterMatch = str.match(
      /^\s*---\s*\n([\s\S]*?)\n\s*---\s*\n([\s\S]*)$/
    );

    // If the first match fails, try a more flexible pattern
    if (!frontmatterMatch) {
      const flexibleMatch = str.match(/---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
      if (flexibleMatch) {
        return this.parseFrontmatterContent(flexibleMatch[1], flexibleMatch[2]);
      }
    }

    if (!frontmatterMatch) {
      return {
        data: {},
        content: str,
        errors: [],
      };
    }

    return this.parseFrontmatterContent(
      frontmatterMatch[1],
      frontmatterMatch[2]
    );
  }

  /**
   * Parse the frontmatter content and return the result
   */
  private parseFrontmatterContent(
    frontmatterYaml: string,
    content: string
  ): FrontmatterParseResult {
    // Normalize indentation by finding the minimum indentation and removing it
    const lines = frontmatterYaml
      .split('\n')
      .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      return {
        data: {},
        content,
        errors: [],
      };
    }

    // Find the minimum indentation (excluding empty lines)
    const minIndent = Math.min(
      ...lines.map(line => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      })
    );

    // Remove the minimum indentation from all lines
    const normalizedYaml = lines
      .map(line => line.substring(minIndent))
      .join('\n');

    try {
      const preprocessed = this.preProcess(normalizedYaml);
      const doc = this.parser(preprocessed);
      const data = this.semanticAnalysis(doc);

      this.processingTime = Date.now() - this.processingTime;

      return {
        data,
        content,
        errors: this.errors,
      };
    } catch (error) {
      this.errors.push(
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        data: {},
        content,
        errors: this.errors,
      };
    }
  }

  /**
   * Get errors from the last parse operation
   */
  public getErrors(): string[] {
    return this.errors;
  }

  /**
   * Get processing time for the last parse operation
   */
  public getProcessingTime(): number {
    return this.processingTime;
  }

  /**
   * Create a block for organizing parsed content
   */
  private createBlock(level: number): FrontmatterBlock {
    return {
      parent: null,
      length: 0,
      level,
      lines: [],
      children: [],
      addChild: function (obj: FrontmatterBlock) {
        this.children.push(obj);
        obj.parent = this;
        ++this.length;
      },
    };
  }

  /**
   * Parse YAML content into blocks
   */
  private parser(str: string): FrontmatterBlock {
    const regLevel = this.regex.regLevel;
    const invalidLine = this.regex.invalidLine;
    const lines = str.split('\n');
    let level = 0;
    let curLevel = 0;

    const blocks: FrontmatterBlock[] = [];
    const result = this.createBlock(-1);
    let currentBlock = this.createBlock(0);
    result.addChild(currentBlock);
    const levels: number[] = [];

    blocks.push(currentBlock);
    levels.push(level);

    for (let i = 0, len = lines.length; i < len; ++i) {
      const line = lines[i];

      if (line.match(invalidLine)) {
        continue;
      }

      const m = regLevel.exec(line);
      if (m) {
        level = m[1].length;
      } else {
        level = 0;
      }

      if (level > curLevel) {
        const oldBlock = currentBlock;
        currentBlock = this.createBlock(level);
        oldBlock.addChild(currentBlock);
        blocks.push(currentBlock);
        levels.push(level);
      } else if (level < curLevel) {
        let added = false;

        let k = levels.length - 1;
        for (; k >= 0; --k) {
          if (levels[k] === level) {
            currentBlock = this.createBlock(level);
            blocks.push(currentBlock);
            levels.push(level);
            if (blocks[k].parent !== null) {
              blocks[k].parent!.addChild(currentBlock);
            }
            added = true;
            break;
          }
        }

        if (!added) {
          this.errors.push(`Error: Invalid indentation at line ${i}: ${line}`);
          return result;
        }
      }

      currentBlock.lines.push(line.replace(this.regex.trim, ''));
      curLevel = level;
    }

    return result;
  }

  /**
   * Process a value string into its appropriate type
   */
  private processValue(val: string): any {
    val = val.replace(this.regex.trim, '');
    let m: RegExpMatchArray | null = null;

    if (val === 'true') {
      return true;
    } else if (val === 'false') {
      return false;
    } else if (val === '.NaN') {
      return Number.NaN;
    } else if (val === 'null') {
      return null;
    } else if (val === '.inf') {
      return Number.POSITIVE_INFINITY;
    } else if (val === '-.inf') {
      return Number.NEGATIVE_INFINITY;
    } else if ((m = val.match(this.regex.dashesString))) {
      return m[1];
    } else if ((m = val.match(this.regex.quotesString))) {
      return m[1];
    } else if ((m = val.match(this.regex.float))) {
      return parseFloat(m[0]);
    } else if ((m = val.match(this.regex.integer))) {
      return parseInt(m[0], 10);
    } else if ((m = val.match(this.regex.singleKeyValue))) {
      const res: Record<string, any> = {};
      res[m[1]] = this.processValue(m[2]);
      return res;
    } else if ((m = val.match(this.regex.array))) {
      let count = 0;
      let c = ' ';
      const res: any[] = [];
      let content = '';
      let str: string | false = false;

      for (let j = 0, lenJ = m[1].length; j < lenJ; ++j) {
        c = m[1][j];
        if (c === "'" || c === '"') {
          if (str === false) {
            str = c;
            content += c;
            continue;
          } else if ((c === "'" && str === "'") || (c === '"' && str === '"')) {
            str = false;
            content += c;
            continue;
          }
        } else if (str === false && (c === '[' || c === '{')) {
          ++count;
        } else if (str === false && (c === ']' || c === '}')) {
          --count;
        } else if (str === false && count === 0 && c === ',') {
          res.push(this.processValue(content));
          content = '';
          continue;
        }

        content += c;
      }

      if (content.length > 0) {
        res.push(this.processValue(content));
      }
      return res;
    } else if ((m = val.match(this.regex.map))) {
      let count = 0;
      let c = ' ';
      const res: string[] = [];
      let content = '';
      let str: string | false = false;

      for (let j = 0, lenJ = m[1].length; j < lenJ; ++j) {
        c = m[1][j];
        if (c === "'" || c === '"') {
          if (str === false) {
            str = c;
            content += c;
            continue;
          } else if ((c === "'" && str === "'") || (c === '"' && str === '"')) {
            str = false;
            content += c;
            continue;
          }
        } else if (str === false && (c === '[' || c === '{')) {
          ++count;
        } else if (str === false && (c === ']' || c === '}')) {
          --count;
        } else if (str === false && count === 0 && c === ',') {
          res.push(content);
          content = '';
          continue;
        }

        content += c;
      }

      if (content.length > 0) {
        res.push(content);
      }

      const newRes: Record<string, any> = {};
      for (let j = 0, lenJ = res.length; j < lenJ; ++j) {
        const keyValueMatch = res[j].match(this.regex.keyValue);
        if (keyValueMatch) {
          newRes[keyValueMatch[1]] = this.processValue(keyValueMatch[2]);
        }
      }

      return newRes;
    } else {
      return val;
    }
  }

  /**
   * Process folded block content
   */
  private processFoldedBlock(block: FrontmatterBlock): string {
    const lines = block.lines;
    const children = block.children;
    const str = lines.join(' ');
    const chunks = [str];

    for (let i = 0, len = children.length; i < len; ++i) {
      chunks.push(this.processFoldedBlock(children[i]));
    }

    return chunks.join('\n');
  }

  /**
   * Process literal block content
   */
  private processLiteralBlock(block: FrontmatterBlock): string {
    const lines = block.lines;
    const children = block.children;
    let str = lines.join('\n');

    for (let i = 0, len = children.length; i < len; ++i) {
      str += this.processLiteralBlock(children[i]);
    }

    return str;
  }

  /**
   * Process blocks into structured data
   */
  private processBlock(blocks: FrontmatterBlock[]): any {
    let m: RegExpMatchArray | null = null;
    let res: any = {};
    let lines: string[] | null = null;
    let children: FrontmatterBlock[] | null = null;
    let currentObj: any = null;

    let level = -1;
    const processedBlocks: number[] = [];
    let isMap = true;

    for (let j = 0, lenJ = blocks.length; j < lenJ; ++j) {
      if (level !== -1 && level !== blocks[j].level) {
        continue;
      }

      processedBlocks.push(j);
      level = blocks[j].level;
      lines = blocks[j].lines;
      children = blocks[j].children;
      currentObj = null;

      for (let i = 0, len = lines.length; i < len; ++i) {
        const line = lines[i];

        if ((m = line.match(this.regex.key))) {
          let key = m[1];

          if (key[0] === '-') {
            key = key.replace(this.regex.item, '');
            if (isMap) {
              isMap = false;
              if (typeof (res as any).length === 'undefined') {
                res = [];
              }
            }
            if (currentObj !== null) {
              (res as any[]).push(currentObj);
            }
            currentObj = {};
            isMap = true;
          }

          if (typeof m[2] !== 'undefined') {
            const value = m[2].replace(this.regex.trim, '');
            if (value[0] === '&') {
              const nb = this.processBlock(children);
              if (currentObj !== null) {
                currentObj[key] = nb;
              } else {
                res[key] = nb;
              }
              this.referenceBlocks[value.substr(1)] = nb;
            } else if (value[0] === '|') {
              if (currentObj !== null) {
                currentObj[key] = this.processLiteralBlock(children.shift()!);
              } else {
                res[key] = this.processLiteralBlock(children.shift()!);
              }
            } else if (value[0] === '*') {
              const v = value.substr(1);
              const no: Record<string, any> = {};

              if (typeof this.referenceBlocks[v] === 'undefined') {
                this.errors.push(`Reference '${v}' not found!`);
              } else {
                for (const k in this.referenceBlocks[v]) {
                  no[k] = this.referenceBlocks[v][k];
                }

                if (currentObj !== null) {
                  currentObj[key] = no;
                } else {
                  res[key] = no;
                }
              }
            } else if (value[0] === '>') {
              if (currentObj !== null) {
                currentObj[key] = this.processFoldedBlock(children.shift()!);
              } else {
                res[key] = this.processFoldedBlock(children.shift()!);
              }
            } else {
              if (currentObj !== null) {
                currentObj[key] = this.processValue(value);
              } else {
                res[key] = this.processValue(value);
              }
            }
          } else {
            if (currentObj !== null) {
              currentObj[key] = this.processBlock(children);
            } else {
              res[key] = this.processBlock(children);
            }
          }
        } else if (line.match(/^-\s*$/)) {
          if (isMap) {
            isMap = false;
            if (typeof (res as any).length === 'undefined') {
              res = [];
            }
          }
          if (currentObj !== null) {
            (res as any[]).push(currentObj);
          }
          currentObj = {};
          isMap = true;
          continue;
        } else if ((m = line.match(/^-\s*(.*)/))) {
          if (currentObj !== null) {
            (currentObj as any[]).push(this.processValue(m[1]));
          } else {
            if (isMap) {
              isMap = false;
              if (typeof (res as any).length === 'undefined') {
                res = [];
              }
            }
            (res as any[]).push(this.processValue(m[1]));
          }
          continue;
        }
      }

      if (currentObj !== null) {
        if (isMap) {
          isMap = false;
          if (typeof (res as any).length === 'undefined') {
            res = [];
          }
        }
        (res as any[]).push(currentObj);
      }
    }

    for (let j = processedBlocks.length - 1; j >= 0; --j) {
      blocks.splice(processedBlocks[j], 1);
    }

    return res;
  }

  /**
   * Perform semantic analysis on parsed blocks
   */
  private semanticAnalysis(blocks: FrontmatterBlock): any {
    return this.processBlock(blocks.children);
  }

  /**
   * Preprocess YAML content by removing comments
   */
  private preProcess(src: string): string {
    const lines = src.split('\n');
    const r = this.regex.comment;

    for (const i in lines) {
      const m = lines[i].match(r);
      if (m && typeof m[3] !== 'undefined') {
        lines[i] = m[0].substr(0, m[0].length - m[3].length);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Convenience function to parse frontmatter from a string
 * @param str - The markdown string containing frontmatter
 * @returns Parse result with data, content, and any errors
 */
export function parseFrontmatter(str: string): FrontmatterParseResult {
  const parser = new FrontmatterParser();
  return parser.parse(str);
}

/**
 * Convenience function to extract just the frontmatter data
 * @param str - The markdown string containing frontmatter
 * @returns The parsed frontmatter data object
 */
export function extractFrontmatterData(str: string): Record<string, any> {
  const result = parseFrontmatter(str);
  return result.data;
}

/**
 * Rebuilds frontmatter YAML from a data object
 * @param data - The data object to convert to YAML
 * @param options - Options for formatting the output
 * @returns The YAML string representation of the data
 */
export function rebuildFrontmatter(
  data: Record<string, any>,
  options: {
    indent?: number;
    sortKeys?: boolean;
  } = {}
): string {
  const { indent = 2, sortKeys = false } = options;

  if (!data || Object.keys(data).length === 0) {
    return '';
  }

  const lines: string[] = [];
  const keys = sortKeys ? Object.keys(data).sort() : Object.keys(data);

  for (const key of keys) {
    const value = data[key];
    const yamlValue = convertValueToYaml(value, indent);
    lines.push(`${key}:${yamlValue}`);
  }

  return lines.join('\n');
}

/**
 * Converts a JavaScript value to its YAML representation
 * @param value - The value to convert
 * @param indent - The indentation level
 * @returns The YAML string representation
 */
function convertValueToYaml(value: any, indent: number): string {
  if (value === null || value === undefined) {
    return ' null';
  }

  if (typeof value === 'boolean') {
    return ` ${value}`;
  }

  if (typeof value === 'number') {
    return ` ${value}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ' []';
    }

    const lines: string[] = [];
    for (const item of value) {
      const itemYaml = convertValueToYaml(item, indent);
      // Remove the leading space and add proper indentation with space after dash
      const itemValue = itemYaml.substring(1);
      lines.push(`${' '.repeat(indent)}- ${itemValue}`);
    }
    return '\n' + lines.join('\n');
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return ' {}';
    }

    const lines: string[] = [];
    for (const key of keys) {
      const itemValue = value[key];
      const itemYaml = convertValueToYaml(itemValue, indent);
      lines.push(`${' '.repeat(indent)}${key}:${itemYaml}`);
    }
    return '\n' + lines.join('\n');
  }

  // String values - always return as-is without quoting
  return ` ${String(value)}`;
}

/**
 * Rebuilds a complete markdown document with updated frontmatter
 * @param originalContent - The original markdown content
 * @param newData - The new frontmatter data
 * @param options - Options for formatting the frontmatter
 * @returns The updated markdown content with new frontmatter
 */
export function updateFrontmatter(
  originalContent: string,
  newData: Record<string, any>,
  options: {
    indent?: number;
    sortKeys?: boolean;
  } = {}
): string {
  const result = parseFrontmatter(originalContent);

  // If no new data, remove frontmatter if it exists
  if (Object.keys(newData).length === 0) {
    return result.content;
  }

  // If there was no frontmatter originally, add it
  if (Object.keys(result.data).length === 0) {
    const frontmatterYaml = rebuildFrontmatter(newData, options);
    return `---\n${frontmatterYaml}\n---\n\n${result.content}`;
  }

  // If there was frontmatter, replace it
  const frontmatterYaml = rebuildFrontmatter(newData, options);
  return `---\n${frontmatterYaml}\n---\n${result.content}`;
}
