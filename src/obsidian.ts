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
    // eslint-disable-next-line prefer-const
    let [key, value] = line
      .split('::')
      .map(str => str.trim())
      .filter(str => str.length > 0);
    if (!key || !value) return null;
    value = removeBrackets(value);
    const values = value
      .split(',')
      .map(str => removeBrackets(str.trim()))
      .map(str => cleanUrl(str));
    return { key, values };
  }

  /**
   * Removes square brackets and parentheses from a string.
   *
   * @param input - The string to clean
   * @returns The string with brackets and parentheses removed
   * @example
   * // Returns "example"
   * removeBrackets("[example]")
   *
   * // Returns "example"
   * removeBrackets("(example)")
   */
  export function removeBrackets(input: string): string {
    return input.replace(/[[\]()]/g, '');
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
     * Parses Obsidian front matter from the markdown file.
     * Front matter is enclosed between `---` markers and contains YAML-like key-value pairs.
     *
     * Supports:
     * - Simple key-value pairs: `key: value`
     * - Comma-separated values: `key: [value1, value2]`
     * - Array values with dashes: `key:\n  - value1\n  - value2`
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

        let currentKey: string | null = null;
        let currentLine = -1;
        let currentValues: string[] = [];

        for (
          let i = this.propertiesLineStart + 1;
          i < this.propertiesLineEnd;
          i++
        ) {
          const line = this.lines[i].trim();

          if (line.length === 0) continue;

          // Check if this is a new key-value pair (not an array item)
          if (!line.startsWith('-') && line.includes(':')) {
            // Save previous key-value pair if exists
            if (currentKey && currentLine !== -1) {
              this.properties.set(
                currentKey,
                currentValues,
                currentLine,
                true,
                false
              );
            }

            // Parse new key-value pair
            const [key, ...valueParts] = line.split(':');
            currentKey = key.trim();
            currentLine = i;
            if (valueParts.length > 0) {
              // Handle comma-separated values
              const value = valueParts.join(':').trim();
              if (value.includes('[')) {
                currentValues = JSON.parse(value);
              } else {
                currentValues = [value];
              }
            } else {
              // Key with no immediate value (might be followed by array items)
              currentValues = [];
            }
          } else if (line.startsWith('-') && currentKey) {
            // Array item
            const value = line.substring(1).trim();
            if (value.length > 0) {
              currentValues.push(value);
            }
          }
        }

        // Save the last key-value pair
        if (currentKey && currentValues.length > 0) {
          this.properties.set(
            currentKey,
            currentValues,
            currentLine,
            true,
            false
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
      const currentId = this.properties.get('gcontact_id')?.values?.[0];
      if (currentId) {
        // Log.debug("Google Contact ID already present in the file.");
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
      //   Log.debug("Google Contact ID appended to the file.");
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
     * Gets the contact's company names.
     * @returns Array of company names or undefined if not set
     */
    get company(): string[] | undefined {
      return this.properties.get('company')?.values;
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
     * Gets the contact's team.
     * @returns The team or undefined if not set
     */
    get team(): string | undefined {
      return this.properties.get('team')?.values?.[0];
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
     * Gets the contact's manager.
     * @returns The manager or undefined if not set
     */
    get manager(): string | undefined {
      return this.properties.get('manager')?.values?.[0];
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
      const frontMatter = this.properties.buildFrontMatter();
      const oldFrontMatterLenght =
        this.propertiesLineEnd - this.propertiesLineStart;
      const newFrontMatterLenght = frontMatter.length + 2;
      const offset = newFrontMatterLenght - oldFrontMatterLenght;

      if (this.hasProperties) {
        this.lines.splice(
          this.propertiesLineStart,
          oldFrontMatterLenght - 2,
          ...frontMatter
        );
      } else {
        this.lines.unshift('---');
        this.lines.unshift(...frontMatter);
        this.lines.unshift('---');
      }

      Array.from(this.properties.properties.values()).forEach(
        (property: Property) => {
          if (!property.isFrontmatter) {
            this.lines[property.line + offset] = property.values?.length
              ? `${property.key}:: ${property.values.join(', ')}`
              : `${property.key}::`;
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
      return Array.from(this.properties.values())
        .filter((p: Property) => p.isFrontmatter)
        .map((p: Property) => {
          if (p.values?.length === 1) {
            return `${p.key}: ${p.values[0]}`;
          }
          return `${p.key}:\n  - ${p.values?.join('\n  - ')}`;
        });
    }
  }
}

export { Obsidian };
