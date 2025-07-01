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
    private _id?: string;
    name!: string;
    private _emails?: string[];
    private emailsLine!: number;
    private _phone?: string[];
    private phoneLine!: number;
    private _company?: string[];
    private companyLine!: number;
    private _role?: string;
    private roleLine!: number;
    private _team?: string;
    private teamLine!: number;
    private _linkedin?: string;
    private linkedinLine!: number;
    private _manager?: string;
    private managerLine!: number;
    private lineOffset = 0;

    private file: GoogleAppsScript.Drive.File;
    private lines: string[];
    private hasProperties = false;
    private hasGContactId = false;
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
          } else if (line.includes('gcontact_id')) {
            this.hasGContactId = true;
            this._id = line.split(':')[1].trim();
          } else if (line.includes('::')) {
            const attribute = extractContactAttribute(line);
            if (!attribute) continue;
            const { key, values } = attribute;
            switch (key.toLowerCase()) {
              case 'email':
                this._emails = values;
                this.emailsLine = i;
                break;
              case 'phone':
                this._phone = values;
                this.phoneLine = i;
                break;
              case 'company':
                this._company = values;
                this.companyLine = i;
                break;
              case 'role':
                this._role = values.join(', ');
                this.roleLine = i;
                break;
              case 'team':
                this._team = values.join(', ');
                this.teamLine = i;
                break;
              case 'linkedin':
                this._linkedin = values[0];
                this.linkedinLine = i;
                break;
              case 'manager':
                this._manager = values[0];
                this.managerLine = i;
                break;
            }
          }
        }
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
     * Gets the Google Contact ID.
     * @returns The Google Contact ID or undefined if not set
     */
    get id(): string | undefined {
      return this._id;
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
      this._id = id;
      if (this.hasGContactId) {
        // Log.debug("Google Contact ID already present in the file.");
        return;
      }
      if (this.hasProperties) {
        this.lines.splice(
          this.propertiesLineStart + 1,
          0,
          `gcontact_id: ${id}`
        );
        this.lineOffset = 1;
        // Log.debug("Google Contact ID appended to the file.");
        return;
      }
      this.lines = ['---', `gcontact_id: ${id}`, '---', ...this.lines];
      this.lineOffset = 3;
      //   Log.debug("Google Contact ID appended to the file.");
    }

    /**
     * Gets the contact's email addresses.
     * @returns Array of email addresses or undefined if not set
     */
    get emails(): string[] | undefined {
      return this._emails;
    }

    /**
     * Sets the contact's email addresses and updates the markdown file.
     * @param emails - Array of email addresses to set
     */
    set emails(emails: string[] | undefined) {
      this.lines[this.emailsLine + this.lineOffset] = emails
        ? `Email:: ${emails.join(', ')}`
        : 'Email::';
      this._emails = emails;
    }

    /**
     * Gets the contact's phone numbers.
     * @returns Array of phone numbers or undefined if not set
     */
    get phone(): string[] | undefined {
      return this._phone;
    }

    /**
     * Sets the contact's phone numbers and updates the markdown file.
     * @param phone - Array of phone numbers to set
     */
    set phone(phone: string[] | undefined) {
      this.lines[this.phoneLine + this.lineOffset] = phone
        ? `Phone:: ${phone.join(', ')}`
        : 'Phone::';
      this._phone = phone;
    }

    /**
     * Gets the contact's company names.
     * @returns Array of company names or undefined if not set
     */
    get company(): string[] | undefined {
      return this._company;
    }

    /**
     * Sets the contact's company names and updates the markdown file.
     * Company names are wrapped in double brackets for Obsidian links.
     * @param company - Array of company names to set
     */
    set company(company: string[] | undefined) {
      this.lines[this.companyLine + this.lineOffset] = company
        ? `Company:: ${company.map(c => `[[${c}]]`).join(', ')}`
        : 'Company::';
      this._company = company;
    }

    /**
     * Gets the contact's role.
     * @returns The role or undefined if not set
     */
    get role(): string | undefined {
      return this._role;
    }

    /**
     * Sets the contact's role and updates the markdown file.
     * @param role - The role to set
     */
    set role(role: string | undefined) {
      this.lines[this.roleLine + this.lineOffset] = role
        ? `Role:: ${role}`
        : 'Role::';
      this._role = role;
    }

    /**
     * Gets the contact's team.
     * @returns The team or undefined if not set
     */
    get team(): string | undefined {
      return this._team;
    }

    /**
     * Sets the contact's team and updates the markdown file.
     * @param team - The team to set
     */
    set team(team: string | undefined) {
      this.lines[this.teamLine + this.lineOffset] = team
        ? `Team:: ${team}`
        : 'Team::';
      this._team = team;
    }

    /**
     * Gets the contact's LinkedIn URL.
     * @returns The LinkedIn URL or undefined if not set
     */
    get linkedin(): string | undefined {
      return this._linkedin;
    }

    /**
     * Sets the contact's LinkedIn URL and updates the markdown file.
     * @param linkedin - The LinkedIn URL to set
     */
    set linkedin(linkedin: string | undefined) {
      this.lines[this.linkedinLine + this.lineOffset] = linkedin
        ? `Linkedin:: ${linkedin}`
        : 'Linkedin::';
      this._linkedin = linkedin;
    }

    /**
     * Gets the contact's manager.
     * @returns The manager or undefined if not set
     */
    get manager(): string | undefined {
      return this._manager;
    }

    /**
     * Sets the contact's manager and updates the markdown file.
     * @param manager - The manager to set
     */
    set manager(manager: string | undefined) {
      this.lines[this.managerLine + this.lineOffset] = manager
        ? `Manager:: ${manager}`
        : 'Manager::';
      this._manager = manager;
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
}

export { Obsidian };
