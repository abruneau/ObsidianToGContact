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
import { Obsidian } from '../src/obsidian';
import { FileOperationError } from '../src/errors';
const doArraysIntersect = (array1: string[], array2: string[]): boolean => {
  return array1.some(item1 => array2.includes(item1.trim()));
};

// Mock Google Apps Script APIs
global.DriveApp = {
  getFileById: jest.fn(),
  getFolderById: jest.fn(),
} as any;

describe('Obsidian Namespace', () => {
  describe('Utility Functions', () => {
    describe('extractContactAttribute', () => {
      it('should extract key and values from a valid line', () => {
        const result = Obsidian.extractContactAttribute(
          'Email:: john.doe@example.com, jane.doe@example.com'
        );
        expect(result).toEqual({
          key: 'Email',
          values: ['john.doe@example.com', 'jane.doe@example.com'],
        });
      });

      it("should return null if the line does not contain '::'", () => {
        const line = 'Email: john.doe@example.com';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toBeNull();
      });

      it('should return null if the key or value is missing', () => {
        const line = 'Email:: ';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toBeNull();
      });

      it('should remove brackets from the values', () => {
        const line =
          'Email:: [[john.doe@example.com]], [[jane.doe@example.com]]';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toEqual({
          key: 'Email',
          values: ['john.doe@example.com', 'jane.doe@example.com'],
        });
      });

      it('should clean URLs in the values', () => {
        const line = 'Linkedin:: <https://www.linkedin.com/in/johndoe/>';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toEqual({
          key: 'Linkedin',
          values: ['https://www.linkedin.com/in/johndoe'],
        });
      });

      it('should handle multiple values separated by commas', () => {
        const line = 'Phone:: 123-456-7890, 098-765-4321';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toEqual({
          key: 'Phone',
          values: ['123-456-7890', '098-765-4321'],
        });
      });

      it('should trim whitespace from key and values', () => {
        const line =
          '  Email  ::  john.doe@example.com  ,  jane.doe@example.com  ';
        const result = Obsidian.extractContactAttribute(line);
        expect(result).toEqual({
          key: 'Email',
          values: ['john.doe@example.com', 'jane.doe@example.com'],
        });
      });
    });

    describe('removeBrackets', () => {
      it('should remove square brackets from the string', () => {
        const input = '[[example]]';
        const result = Obsidian.removeBrackets(input);
        expect(result).toBe('example');
      });

      it('should remove parentheses from the string', () => {
        const input = '(example)';
        const result = Obsidian.removeBrackets(input);
        expect(result).toBe('example');
      });

      it('should not alter the string if there are no brackets or parentheses', () => {
        const input = 'example';
        const result = Obsidian.removeBrackets(input);
        expect(result).toBe('example');
      });

      it('should handle an empty string', () => {
        const input = '';
        const result = Obsidian.removeBrackets(input);
        expect(result).toBe('');
      });
    });

    describe('cleanUrl', () => {
      it('should remove angle brackets from the beginning and end of the URL', () => {
        const url = '<https://www.example.com/>';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('https://www.example.com');
      });

      it('should remove only the angle bracket from the beginning of the URL', () => {
        const url = '<https://www.example.com';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('https://www.example.com');
      });

      it('should remove only the angle bracket from the end of the URL', () => {
        const url = 'https://www.example.com/>';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('https://www.example.com');
      });

      it('should remove angle brackets even without a slash at the end', () => {
        const url = '<https://www.example.com>';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('https://www.example.com');
      });

      it('should not alter the URL if there are no angle brackets', () => {
        const url = 'https://www.example.com';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('https://www.example.com');
      });

      it('should handle an empty string', () => {
        const url = '';
        const cleanedUrl = Obsidian.cleanUrl(url);
        expect(cleanedUrl).toBe('');
      });
    });
  });

  describe('Contact Class', () => {
    let mockFile: GoogleAppsScript.Drive.File;
    let mockBlob: GoogleAppsScript.Base.Blob;
    let mockContent: string;

    beforeEach(() => {
      mockContent = `
        ---
        aliases: []
        date_created: 2022-11-10 10:24
        tags:
          - contacts
        title: John Doe
        ---    
        # John Doe
  
        Company:: [[acme]]
  
        Team:: [[acme first team]]
  
        Role:: architecte [[Salesforce]]
  
        Email:: john.doe@acme.com
  
        Phone::123-456-7890
  
        Linkedin:: <https://www.linkedin.com/in/johndoe/>
  
        Manager:: [[Jane Smith]]
                `;

      mockBlob = {
        getDataAsString: jest.fn().mockReturnValue(mockContent),
      } as unknown as GoogleAppsScript.Base.Blob;

      mockFile = {
        getBlob: jest.fn().mockReturnValue(mockBlob),
        setContent: jest.fn(),
        getName: jest.fn().mockReturnValue('test.md'),
      } as unknown as GoogleAppsScript.Drive.File;

      global.DriveApp = {
        getFolderById: jest.fn(),
      } as unknown as GoogleAppsScript.Drive.DriveApp;
    });

    describe('constructor', () => {
      it('should parse markdown content and extract contact details', () => {
        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        expect(contact.name).toBe('John Doe');
        expect(contact.emails).toEqual(['john.doe@acme.com']);
        expect(contact.phone).toEqual(['123-456-7890']);
        expect(contact.company).toEqual(['acme']);
        expect(contact.role).toBe('architecte Salesforce');
        expect(contact.team).toBe('acme first team');
        expect(contact.linkedin).toBe('https://www.linkedin.com/in/johndoe');
        expect(contact.manager).toBe('Jane Smith');
      });

      it('should handle missing optional fields', () => {
        mockContent = `
        # John Doe
        Email:: john.doe@example.com
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        expect(contact.name).toBe('John Doe');
        expect(contact.emails).toEqual(['john.doe@example.com']);
        expect(contact.phone).toBeUndefined();
        expect(contact.company).toBeUndefined();
        expect(contact.role).toBeUndefined();
        expect(contact.team).toBeUndefined();
        expect(contact.linkedin).toBeUndefined();
        expect(contact.manager).toBeUndefined();
      });

      it('should return undefined if no valid details are found', () => {
        mockContent = `
        # John Doe
        Email:: 
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        expect(contact.name).toBe('John Doe');
        expect(contact.emails).toBeUndefined();
      });

      it('should throw FileOperationError if the file is not found', () => {
        mockContent = `
        # 
        Email:: 
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        expect(() => {
          const contact = new Obsidian.Contact(mockFile);
          contact.parseMarkdown();
        }).toThrow(FileOperationError);
      });

      it('should ignore lines that do not match the expected format', () => {
        mockContent = `
        # John Doe
        Random Line
        Email:: john.doe@example.com
        Another Random Line
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        expect(contact.name).toBe('John Doe');
        expect(contact.emails).toEqual(['john.doe@example.com']);
      });

      it('should extract gcontact_id if present', () => {
        mockContent = `
        # John Doe
        gcontact_id: 12345
        Email:: john.doe@example.com
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        expect(contact.id).toBe('12345');
        const hasGContactId = (contact as any).hasGContactId;
        expect(hasGContactId).toBe(true);
      });

      it('should handle properties section correctly', () => {
        mockContent = `
        ---
        aliases: []
        date_created: 2022-11-10 10:24
        tags:
          - contacts
        title: John Doe
        ---    
        # John Doe
        Email:: john.doe@example.com
              `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);

        const hasProperties = (contact as any).hasProperties;
        expect(hasProperties).toBe(true);
        const propertiesLineStart = (contact as any).propertiesLineStart;
        expect(propertiesLineStart).toBe(1);
      });
    });

    describe('contactId setter', () => {
      it('should not append gcontact_id if it already exists', () => {
        mockContent = `
            ---
            aliases: []
            date_created: 2022-11-10 10:24
            tags:
              - contacts
            title: John Doe
            gcontact_id: 12345
            ---    
            # John Doe
            Email:: john.doe@example.com
                  `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.id = '12345';
        const lines: string[] = (contact as any).lines;
        expect(doArraysIntersect(lines, ['gcontact_id: 12345'])).toBe(true);
        const lineOffset = (contact as any).lineOffset;
        expect(lineOffset).toBe(0);
      });

      it('should append gcontact_id to existing properties section', () => {
        mockContent = `
            ---
            aliases: []
            date_created: 2022-11-10 10:24
            tags:
              - contacts
            title: John Doe
            ---    
            # John Doe
            Email:: john.doe@example.com
                  `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.id = '12345';
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['gcontact_id: 12345'])).toBe(true);
        const lineOffset = (contact as any).lineOffset;
        expect(lineOffset).toBe(1);
      });

      it('should create a new properties section if none exists', () => {
        mockContent = `
            # John Doe
            Email:: john.doe@example.com
                  `;
        (mockBlob.getDataAsString as jest.Mock).mockReturnValue(mockContent);

        const contact = new Obsidian.Contact(mockFile);
        contact.id = '12345';
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['gcontact_id: 12345'])).toBe(true);
        const lineOffset = (contact as any).lineOffset;
        expect(lineOffset).toBe(3);
      });
    });
    describe('emails setter', () => {
      it('should update the emails and the corresponding line in the file', () => {
        const contact = new Obsidian.Contact(mockFile);

        const newEmails = [
          'new.email@example.com',
          'another.email@example.com',
        ];
        contact.emails = newEmails;

        expect(contact.emails).toEqual(newEmails);
        const lines = (contact as any).lines;
        expect(
          doArraysIntersect(lines, [`Email:: ${newEmails.join(', ')}`])
        ).toBe(true);
      });

      it('should handle setting emails to undefined', () => {
        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        contact.emails = undefined;

        expect(contact.emails).toBeUndefined();
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['Email::'])).toBe(true);
      });

      it('should handle setting emails to an empty array', () => {
        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        contact.emails = [];

        expect(contact.emails).toEqual([]);
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['Email::'])).toBe(true);
      });
    });
    describe('manager setter', () => {
      it('should update the manager and the corresponding line in the file', () => {
        const contact = new Obsidian.Contact(mockFile);

        const newManager = 'New Manager';
        contact.manager = newManager;

        expect(contact.manager).toBe(newManager);
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, [`Manager:: ${newManager}`])).toBe(
          true
        );
      });

      it('should handle setting manager to undefined', () => {
        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        contact.manager = undefined;

        expect(contact.manager).toBeUndefined();
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['Manager::'])).toBe(true);
      });

      it('should handle setting manager to an empty string', () => {
        const contact = new Obsidian.Contact(mockFile);
        contact.parseMarkdown();

        contact.manager = '';

        expect(contact.manager).toBe('');
        const lines = (contact as any).lines;
        expect(doArraysIntersect(lines, ['Manager::'])).toBe(true);
      });
    });
  });
});
