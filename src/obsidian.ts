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
import { ContactParsingError, FileOperationError } from './errors';
import {
  parseFrontmatter,
  rebuildFrontmatter,
  updateFrontmatter,
} from './frontmatter';

namespace Obsidian {
  /**
   * Extracts a contact attribute from a markdown line.
   * The line should be in the format "Key:: Value" where Value can be a comma-separated list.
   *
   * @param line - The markdown line to parse
   * @returns An object containing the key and values, or null if the line is invalid
   * @example
   * // Returns { key: "email", values: ["john@example.com"] }
   * extractContactAttribute("Email:: john@example.com")
   *
   * // Returns { key: "phone", values: ["+1234567890", "+0987654321"] }
   * extractContactAttribute("Phone:: +1234567890, +0987654321")
   */
  export function extractContactAttribute(line: string): {
    key: string;
    values: string[];
  } | null {
    const separatorIndex = line.indexOf('::');
    if (separatorIndex === -1) return null;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 2).trim();
    if (!key || !value) return null;
    const preservedGeoLinks = new Map<string, string>();
    value = preserveGeoMarkdownLinks(value, preservedGeoLinks);
    value = removeBrackets(value);
    const values = value
      .split(',')
      .map(str => removeBrackets(str.trim()))
      .map(str => cleanUrl(str))
      .map(str => restorePreservedGeoMarkdownLinks(str, preservedGeoLinks));
    return { key, values };
  }

  function preserveGeoMarkdownLinks(
    input: string,
    preservedLinks: Map<string, string>
  ): string {
    return input.replace(/\[[^\]\n]+\]\(\s*geo:[^)]+\)/gi, match => {
      const token = `__PRESERVED_GEO_MARKDOWN_LINK_${preservedLinks.size}__`;
      preservedLinks.set(token, match);
      return token;
    });
  }

  function restorePreservedGeoMarkdownLinks(
    input: string,
    preservedLinks: Map<string, string>
  ): string {
    let output = input;
    preservedLinks.forEach((value, token) => {
      output = output.replace(token, value);
    });
    return output;
  }

  /**
   * Extracts clean text from Obsidian link format [[Text]].
   * If the input is not an Obsidian link, returns it unchanged.
   *
   * @param input - The string that may contain an Obsidian link
   * @returns The extracted text without the double brackets, or the original string if not a link
   * @example
   * // Returns "Decathlon"
   * extractObsidianLinkText("[[Decathlon]]")
   *
   * // Returns "Adeo" (no change, not a link)
   * extractObsidianLinkText("Adeo")
   *
   * // Returns "Team Name"
   * extractObsidianLinkText("[[Team Name]]")
   */
  export function extractObsidianLinkText(input: string): string {
    const match = input.match(/^\[\[(.+?)\]\]$/);
    if (match) {
      return match[1].trim();
    }
    return input;
  }

  /**
   * Removes single square brackets and parentheses from a string.
   * Preserves double square brackets (Obsidian links) intact.
   *
   * @param input - The string to clean
   * @returns The string with single brackets and parentheses removed, double brackets preserved
   * @example
   * // Returns "[[Obsidian]]" (preserved)
   * removeBrackets("[[Obsidian]]")
   *
   * // Returns "example" (single brackets removed)
   * removeBrackets("[example]")
   *
   * // Returns "example" (parentheses removed)
   * removeBrackets("(example)")
   */
  export function removeBrackets(input: string): string {
    // Remove single brackets and parentheses, but preserve double brackets [[...]]
    // Strategy: Replace single [ or ] that are NOT part of [[ or ]]
    return input.replace(/(?<!\[)\[(?!\[)|(?<!\])\](?!\])|[()]/g, '');
  }

  /**
   * Cleans a URL string by removing angle brackets.
   *
   * @param url - The URL string to clean
   * @returns The cleaned URL string
   * @example
   * // Returns "https://example.com"
   * cleanUrl("<https://example.com>")
   */
  export function cleanUrl(url: string): string {
    return url.replace(/^<|\/?>$/g, '');
  }

  /**
   * Represents a contact from an Obsidian markdown file.
   * Handles parsing and updating contact information in markdown format.
   */
  export class Contact {
    name!: string;
    private lineOffset = 0;
    private properties: Properties = new Properties([]);

    private file: GoogleAppsScript.Drive.File;
    private lines: string[];
    private hasProperties = false;
    private propertiesLineStart = -1;
    private propertiesLineEnd = -1;

    /**
     * Creates a new Contact instance from a Google Drive file.
     *
     * @param file - The Google Drive file containing the contact information
     * @throws {FileOperationError} If the file cannot be read
     * @throws {ContactParsingError} If the contact data cannot be parsed
     */
    constructor(file: GoogleAppsScript.Drive.File) {
      this.file = file;
      try {
        const content: string = file.getBlob().getDataAsString();
        this.lines = content.split('\n');
        this.hasProperties = false;
        this.propertiesLineStart = -1;
        this.propertiesLineEnd = -1;
        this.lineOffset = 0;
        this.parseMarkdown();
      } catch (error: unknown) {
        throw new FileOperationError(
          `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          file.getName(),
          'read'
        );
      }
    }

    /**
     * Parses the markdown content and extracts contact attributes.
     *
     * The method processes each line of the markdown content and performs the following actions:
     * - If a line contains a `#`, it extracts the name of the contact
     * - If a line contains `---`, it marks the presence of properties
     * - If a line contains `gcontact_id`, it extracts the Google Contact ID
     * - If a line contains `::`, it extracts and assigns various contact attributes
     *
     * @throws {ContactParsingError} If the contact name is empty or parsing fails
     */
    parseMarkdown(): void {
      try {
        for (let i = 0; i < this.lines.length; i++) {
          const line = this.lines[i];
          if (line.includes('#')) {
            this.name = line.replace(/^\s*#\s*/, '').trim();
            if (this.name.length === 0) {
              throw new ContactParsingError(
                'Contact name cannot be empty',
                this.file.getName(),
                i + 1
              );
            }
          } else if (line.includes('---')) {
            this.hasProperties = true;
            if (this.propertiesLineStart === -1) {
              this.propertiesLineStart = i;
            } else {
              this.propertiesLineEnd = i;
            }
          } else if (line.includes('::')) {
            const attribute = extractContactAttribute(line);
            if (!attribute) continue;
            this.properties.set(attribute.key, attribute.values, i);
          }
        }
        this.parseFrontMatter();
      } catch (error: unknown) {
        if (error instanceof ContactParsingError) {
          throw error;
        }
        throw new ContactParsingError(
          `Failed to parse contact: ${error instanceof Error ? error.message : String(error)}`,
          this.file.getName()
        );
      }
    }

    /**
     * Parses Obsidian front matter from the markdown file using the robust frontmatter parser.
     * Front matter is enclosed between `---` markers and contains YAML-like key-value pairs.
     *
     * Supports:
     * - Simple key-value pairs: `key: value`
     * - Arrays: `key: [value1, value2]` or `key:\n  - value1\n  - value2`
     * - Nested objects: `key:\n  subkey: value`
     * - Boolean values: `published: true`
     * - Numeric values: `count: 42`
     * - Quoted strings: `title: "Hello World"`
     * - Dates: `date: 2023-12-01`
     *
     * @throws {ContactParsingError} If front matter parsing fails
     */
    parseFrontMatter(): void {
      try {
        if (
          !this.hasProperties ||
          this.propertiesLineStart === -1 ||
          this.propertiesLineEnd === -1
        ) {
          return; // No front matter to parse
        }

        // Extract the frontmatter section from the file content
        const content = this.lines.join('\n');
        const frontmatterResult = parseFrontmatter(content);

        // Process the parsed frontmatter data
        this.processFrontmatterData(
          frontmatterResult.data,
          this.propertiesLineStart + 1
        );

        // Log any parsing errors
        if (frontmatterResult.errors.length > 0) {
          console.warn(
            `Frontmatter parsing warnings for ${this.file.getName()}:`,
            frontmatterResult.errors
          );
        }
      } catch (error: unknown) {
        throw new ContactParsingError(
          `Failed to parse front matter: ${error instanceof Error ? error.message : String(error)}`,
          this.file.getName()
        );
      }
    }

    /**
     * Processes the parsed frontmatter data and adds it to the properties.
     *
     * @param data - The parsed frontmatter data
     * @param startLine - The starting line number for frontmatter properties
     */
    private processFrontmatterData(
      data: Record<string, any>,
      startLine: number
    ): void {
      let lineOffset = 0;

      for (const [key, value] of Object.entries(data)) {
        const values = this.convertValueToStringArray(value);
        this.properties.set(key, values, startLine + lineOffset, true, false);
        lineOffset++;
      }
    }

    /**
     * Converts a frontmatter value to a string array format expected by the Properties class.
     *
     * @param value - The value to convert
     * @returns Array of string values
     */
    private convertValueToStringArray(value: any): string[] {
      if (value === null || value === undefined) {
        return [];
      }

      if (Array.isArray(value)) {
        const hadObjectElement = value.some(
          v => v !== null && typeof v === 'object'
        );
        const out = value.map(v => {
          if (v === null || v === undefined) {
            return '';
          }
          if (typeof v === 'object') {
            return JSON.stringify(v);
          }
          return String(v);
        });
        // #region agent log
        if (hadObjectElement) {
          const post = (globalThis as { fetch?: typeof fetch }).fetch;
          if (typeof post === 'function') {
            post(
              'http://127.0.0.1:7751/ingest/6dbcf72c-888b-4fa0-99ad-0b0772d3d5b6',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': 'c12397',
                },
                body: JSON.stringify({
                  sessionId: 'c12397',
                  hypothesisId: 'A',
                  location: 'obsidian.ts:convertValueToStringArray',
                  message:
                    'frontmatter array had object element(s); normalized to JSON strings',
                  data: { sample: out.slice(0, 5) },
                  timestamp: Date.now(),
                  runId: 'post-fix',
                }),
              }
            ).catch(() => {});
          }
        }
        // #endregion
        return out;
      }

      if (typeof value === 'object') {
        // For complex objects, convert to JSON string
        return [JSON.stringify(value)];
      }

      // Convert primitive values to strings
      return [String(value)];
    }

    /**
     * Gets the Google Contact ID.
     * @returns The Google Contact ID or undefined if not set
     */
    get id(): string | undefined {
      return this.properties.get('gcontact_id')?.values?.[0];
    }

    /**
     * Sets the Google Contact ID and updates the markdown file.
     *
     * This method checks if the Google Contact ID is already present in the file.
     * If it is, the method returns without making any changes.
     * If the file has properties, it inserts the Google Contact ID as the first property.
     * Otherwise, it creates a new properties section at the top of the file and adds the Google Contact ID.
     *
     * @param id - The Google Contact ID to set
     */
    set id(id: string | undefined) {
      const existing = this.properties.get('gcontact_id');
      if (existing) {
        if (existing.values?.[0] !== id) {
          existing.values = [id ?? ''];
        }
        return;
      }
      this.properties.set(
        'gcontact_id',
        [id ?? ''],
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's email addresses.
     * @returns Array of email addresses or undefined if not set
     */
    get emails(): string[] | undefined {
      return this.properties.get('email')?.values;
    }

    /**
     * Sets the contact's email addresses and updates the markdown file.
     * @param emails - Array of email addresses to set
     */
    set emails(emails: string[] | undefined) {
      const currentEmails = this.properties.get('email');
      if (currentEmails) {
        currentEmails.values = emails;
        return;
      }
      this.properties.set(
        'email',
        emails,
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's phone numbers.
     * @returns Array of phone numbers or undefined if not set
     */
    get phone(): string[] | undefined {
      return this.properties.get('phone')?.values;
    }

    /**
     * Sets the contact's phone numbers and updates the markdown file.
     * @param phone - Array of phone numbers to set
     */
    set phone(phone: string[] | undefined) {
      const currentPhone = this.properties.get('phone');
      if (currentPhone) {
        currentPhone.values = phone;
        return;
      }
      this.properties.set(
        'phone',
        phone,
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's company names with clean text extracted from Obsidian links.
     * Extracts "Company" from "[[Company]]" format for use with Google Contacts API.
     * @returns Array of company names (clean text) or undefined if not set
     */
    get company(): string[] | undefined {
      const values = this.properties.get('company')?.values;
      if (!values) return undefined;
      return values.map(v => extractObsidianLinkText(v));
    }

    /**
     * Sets the contact's company names and updates the markdown file.
     * Company names are wrapped in double brackets for Obsidian links.
     * @param company - Array of company names to set
     */
    set company(company: string[] | undefined) {
      const currentCompany = this.properties.get('company');
      if (currentCompany) {
        currentCompany.values = company;
        return;
      }
      this.properties.set(
        'company',
        company?.map(c => `[[${c}]]`),
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's role.
     * @returns The role or undefined if not set
     */
    get role(): string | undefined {
      return this.properties.get('role')?.values?.[0];
    }

    /**
     * Sets the contact's role and updates the markdown file.
     * @param role - The role to set
     */
    set role(role: string | undefined) {
      const currentRole = this.properties.get('role');
      if (currentRole) {
        currentRole.values = role === undefined ? undefined : [role];
        return;
      }
      this.properties.set(
        'role',
        role === undefined ? undefined : [role],
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's team with clean text extracted from Obsidian links.
     * Extracts "Team" from "[[Team]]" format for use with Google Contacts API.
     * @returns The team (clean text) or undefined if not set
     */
    get team(): string | undefined {
      const value = this.properties.get('team')?.values?.[0];
      if (value === undefined) return undefined;
      return extractObsidianLinkText(value);
    }

    /**
     * Sets the contact's team and updates the markdown file.
     * @param team - The team to set
     */
    set team(team: string | undefined) {
      const currentTeam = this.properties.get('team');
      if (currentTeam) {
        currentTeam.values = team === undefined ? undefined : [team];
        return;
      }
      this.properties.set(
        'team',
        team === undefined ? undefined : [team],
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's LinkedIn URL.
     * @returns The LinkedIn URL or undefined if not set
     */
    get linkedin(): string | undefined {
      return this.properties.get('linkedin')?.values?.[0];
    }

    /**
     * Sets the contact's LinkedIn URL and updates the markdown file.
     * @param linkedin - The LinkedIn URL to set
     */
    set linkedin(linkedin: string | undefined) {
      const currentLinkedin = this.properties.get('linkedin');
      if (currentLinkedin) {
        currentLinkedin.values =
          linkedin === undefined ? undefined : [linkedin];
        return;
      }
      this.properties.set(
        'linkedin',
        linkedin === undefined ? undefined : [linkedin],
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    /**
     * Gets the contact's manager with clean text extracted from Obsidian links.
     * Extracts "Manager" from "[[Manager]]" format for use with Google Contacts API.
     * @returns The manager (clean text) or undefined if not set
     */
    get manager(): string | undefined {
      const value = this.properties.get('manager')?.values?.[0];
      if (value === undefined) return undefined;
      return extractObsidianLinkText(value);
    }

    /**
     * Sets the contact's manager and updates the markdown file.
     * @param manager - The manager to set
     */
    set manager(manager: string | undefined) {
      const currentManager = this.properties.get('manager');
      if (currentManager) {
        currentManager.values = manager === undefined ? undefined : [manager];
        return;
      }
      this.properties.set(
        'manager',
        manager === undefined ? undefined : [manager],
        this.propertiesLineStart + this.lineOffset + 1,
        true,
        false
      );
      this.lineOffset += 1;
    }

    update(): void {
      // Build the new frontmatter data
      const frontmatterData: Record<string, any> = {};

      // Fields that should always be arrays even with one element
      const arrayFields = ['tags', 'aliases', 'categories'];

      Array.from(this.properties.properties.values())
        .filter((p: Property) => p.isFrontmatter)
        .forEach((p: Property) => {
          if (p.values !== undefined) {
            // Preserve empty arrays for array fields
            if (arrayFields.includes(p.key.toLowerCase())) {
              frontmatterData[p.key] = p.values;
            } else if (p.values.length > 1) {
              frontmatterData[p.key] = p.values;
            } else if (p.values.length === 1) {
              frontmatterData[p.key] = p.values[0];
            }
            // Skip fields with empty non-array values
          }
        });

      // Get the current content
      const currentContent = this.lines.join('\n');

      // Use the robust updateFrontmatter function
      const updatedContent = updateFrontmatter(
        currentContent,
        frontmatterData,
        {
          indent: 2,
          sortKeys: false,
        }
      );

      // Update the lines array
      this.lines = updatedContent.split('\n');

      // Update non-frontmatter properties in the content
      // Note: After using updateFrontmatter, we need to find the correct line numbers
      // for non-frontmatter properties since the content structure may have changed
      Array.from(this.properties.properties.values()).forEach(
        (property: Property) => {
          if (!property.isFrontmatter) {
            // Find the line containing this property by searching for the key::
            for (let i = 0; i < this.lines.length; i++) {
              if (this.lines[i].includes(`${property.key}::`)) {
                this.lines[i] = property.values?.length
                  ? `${property.key}:: ${property.values.join(', ')}`
                  : `${property.key}::`;
                break;
              }
            }
          }
        }
      );
    }

    /**
     * Saves the contact information back to the markdown file.
     * @throws {FileOperationError} If the file cannot be written
     */
    save(): void {
      try {
        this.file.setContent(this.lines.join('\n').trim());
      } catch (error: unknown) {
        throw new FileOperationError(
          `Failed to save file: ${error instanceof Error ? error.message : String(error)}`,
          this.file.getName(),
          'write'
        );
      }
    }
  }

  export class Property {
    isFrontmatter: boolean;
    key: string;
    values: string[] | undefined;
    line: number;
    deleted = false;

    constructor(
      key: string,
      values: string[] | undefined,
      line: number,
      isFrontmatter = false,
      deleted = false
    ) {
      this.key = key;
      this.values = values;
      this.line = line;
      this.isFrontmatter = isFrontmatter;
      this.deleted = deleted;
    }
  }

  export class Properties {
    properties: Map<string, Property> = new Map();

    constructor(properties: Property[]) {
      properties.forEach(property => {
        this.properties.set(property.key.toLowerCase(), property);
      });
    }

    get(key: string): Property | undefined {
      return this.properties.get(key.toLowerCase());
    }

    set(
      key: string,
      values: string[] | undefined,
      line: number,
      isFrontmatter = false,
      deleted = false
    ): void {
      this.properties.set(
        key.toLowerCase(),
        new Property(key, values, line, isFrontmatter, deleted)
      );
    }

    delete(key: string): void {
      const property = this.properties.get(key.toLowerCase());
      if (property) {
        property.deleted = true;
      }
    }

    buildFrontMatter(): string[] {
      // Convert properties to a data object for the rebuild function
      const data: Record<string, any> = {};

      // Fields that should always be arrays even with one element
      const arrayFields = ['tags', 'aliases', 'categories'];

      Array.from(this.properties.values())
        .filter((p: Property) => p.isFrontmatter)
        .forEach((p: Property) => {
          if (p.values !== undefined) {
            // Preserve empty arrays for array fields
            if (arrayFields.includes(p.key.toLowerCase())) {
              data[p.key] = p.values;
            } else if (p.values.length > 1) {
              data[p.key] = p.values;
            } else if (p.values.length === 1) {
              data[p.key] = p.values[0];
            }
            // Skip fields with empty non-array values
          }
        });

      // Use the robust rebuild function
      const yaml = rebuildFrontmatter(data, {
        indent: 2,
        sortKeys: false,
      });

      return yaml.split('\n');
    }
  }
}

export { Obsidian };
