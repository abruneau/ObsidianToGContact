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

global.DriveApp = {
  getFileById: jest.fn(),
  getFolderById: jest.fn(),
} as any;

describe('Frontmatter tags with object-shaped list items', () => {
  it('should serialize nested YAML tag entries as JSON, not [object Object]', () => {
    const mockContent = `---
tags:
  - contacts
  - nested: true
---
# Person`;

    const mockBlob = {
      getDataAsString: jest.fn().mockReturnValue(mockContent),
    } as unknown as GoogleAppsScript.Base.Blob;

    const mockFile = {
      getBlob: jest.fn().mockReturnValue(mockBlob),
      setContent: jest.fn(),
      getName: jest.fn().mockReturnValue('test.md'),
    } as unknown as GoogleAppsScript.Drive.File;

    const contact = new Obsidian.Contact(mockFile);
    contact.id = 'people/x';
    contact.update();

    const content = (contact as unknown as { lines: string[] }).lines.join('\n');
    expect(content).not.toContain('[object Object]');
    expect(content).toContain('{"nested":true}');
  });
});
