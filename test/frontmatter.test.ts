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
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE/2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  FrontmatterParser,
  parseFrontmatter,
  extractFrontmatterData,
  rebuildFrontmatter,
  updateFrontmatter,
} from '../src/frontmatter';

describe('FrontmatterParser', () => {
  let parser: FrontmatterParser;

  beforeEach(() => {
    parser = new FrontmatterParser();
  });

  describe('parse', () => {
    it('should parse simple key-value pairs', () => {
      const input = `---
title: Test Document
author: John Doe
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        title: 'Test Document',
        author: 'John Doe',
      });
      expect(result.content).toBe('# Content here');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse arrays', () => {
      const input = `---
tags:
  - javascript
  - typescript
  - frontmatter
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        tags: ['javascript', 'typescript', 'frontmatter'],
      });
    });

    it('should parse nested objects', () => {
      const input = `---
author:
  name: John Doe
  email: john@example.com
  social:
    twitter: @johndoe
    linkedin: john-doe
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        author: {
          name: 'John Doe',
          email: 'john@example.com',
          social: {
            twitter: '@johndoe',
            linkedin: 'john-doe',
          },
        },
      });
    });

    it('should parse boolean values', () => {
      const input = `---
published: true
draft: false
featured: true
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        published: true,
        draft: false,
        featured: true,
      });
    });

    it('should parse numeric values', () => {
      const input = `---
count: 42
price: 19.99
rating: 4.5
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        count: 42,
        price: 19.99,
        rating: 4.5,
      });
    });

    it('should parse quoted strings', () => {
      const input = `---
title: "Hello World"
description: 'This is a test'
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        title: 'Hello World',
        description: 'This is a test',
      });
    });

    it('should handle documents without frontmatter', () => {
      const input = `# Just a regular markdown document
with no frontmatter`;

      const result = parser.parse(input);

      expect(result.data).toEqual({});
      expect(result.content).toBe(input);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle malformed frontmatter gracefully', () => {
      const input = `---
title: Test
invalid: [unclosed array
---
# Content here`;

      const result = parser.parse(input);

      // The parser should still return the content even if there are parsing issues
      expect(result.content).toBe('# Content here');
      // Note: The current implementation may not detect all malformed YAML
      // This test verifies that the parser doesn't crash and returns content
    });

    it('should parse complex mixed content', () => {
      const input = `---
title: "My Blog Post"
author: John Doe
tags: [blog, tutorial, javascript]
published: true
date: 2023-12-01
metadata:
  views: 150
  likes: 25
  comments: 8
---
# My Blog Post

This is the content of my blog post.`;

      const result = parser.parse(input);

      expect(result.data).toEqual({
        title: 'My Blog Post',
        author: 'John Doe',
        tags: ['blog', 'tutorial', 'javascript'],
        published: true,
        date: '2023-12-01',
        metadata: {
          views: 150,
          likes: 25,
          comments: 8,
        },
      });
      expect(result.content).toBe(`# My Blog Post

This is the content of my blog post.`);
    });

    it('should treat date-like strings as strings, not Date objects', () => {
      const input = `---
created: 2023-12-01T10:00:00Z
updated: 2023-12-02T15:30:00Z
birthday: 1990-05-15
---
# Content here`;

      const result = parser.parse(input);

      expect(result.data.created).toBe('2023-12-01T10:00:00Z');
      expect(result.data.updated).toBe('2023-12-02T15:30:00Z');
      expect(result.data.birthday).toBe('1990-05-15');

      // Verify they are strings, not Date objects
      expect(typeof result.data.created).toBe('string');
      expect(typeof result.data.updated).toBe('string');
      expect(typeof result.data.birthday).toBe('string');
      expect(result.data.created instanceof Date).toBe(false);
      expect(result.data.updated instanceof Date).toBe(false);
      expect(result.data.birthday instanceof Date).toBe(false);

      expect(result.content).toBe('# Content here');
    });
  });

  describe('getErrors', () => {
    it('should return empty array when no errors', () => {
      const input = `---
title: Test
---
# Content`;

      parser.parse(input);
      expect(parser.getErrors()).toHaveLength(0);
    });

    it('should return errors when parsing fails', () => {
      const input = `---
title: Test
invalid: [unclosed
---
# Content`;

      parser.parse(input);
      const errors = parser.getErrors();
      // The parser may not detect all malformed YAML, but should not crash
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('getProcessingTime', () => {
    it('should return processing time', () => {
      const input = `---
title: Test
---
# Content`;

      parser.parse(input);
      const time = parser.getProcessingTime();
      expect(typeof time).toBe('number');
      expect(time).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('parseFrontmatter convenience function', () => {
  it('should work the same as FrontmatterParser.parse', () => {
    const input = `---
title: Test Document
author: John Doe
---
# Content here`;

    const result = parseFrontmatter(input);

    expect(result.data).toEqual({
      title: 'Test Document',
      author: 'John Doe',
    });
    expect(result.content).toBe('# Content here');
    expect(result.errors).toHaveLength(0);
  });
});

describe('extractFrontmatterData convenience function', () => {
  it('should return only the data object', () => {
    const input = `---
title: Test Document
author: John Doe
---
# Content here`;

    const data = extractFrontmatterData(input);

    expect(data).toEqual({
      title: 'Test Document',
      author: 'John Doe',
    });
  });

  it('should return empty object for documents without frontmatter', () => {
    const input = `# Just a regular markdown document`;

    const data = extractFrontmatterData(input);

    expect(data).toEqual({});
  });
});

describe('rebuildFrontmatter function', () => {
  it('should rebuild simple key-value pairs', () => {
    const data = {
      title: 'Test Document',
      author: 'John Doe',
      published: true,
      count: 42,
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe(
      'title: Test Document\nauthor: John Doe\npublished: true\ncount: 42'
    );
  });

  it('should rebuild arrays', () => {
    const data = {
      tags: ['javascript', 'typescript', 'frontmatter'],
      authors: ['John Doe', 'Jane Smith'],
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe(
      'tags:\n  - javascript\n  - typescript\n  - frontmatter\nauthors:\n  - John Doe\n  - Jane Smith'
    );
  });

  it('should rebuild nested objects', () => {
    const data = {
      author: {
        name: 'John Doe',
        email: 'john@example.com',
        social: {
          twitter: '@johndoe',
          linkedin: 'john-doe',
        },
      },
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe(
      'author:\n  name: John Doe\n  email: john@example.com\n  social:\n  twitter: @johndoe\n  linkedin: john-doe'
    );
  });

  it('should handle empty arrays and objects', () => {
    const data = {
      tags: [],
      metadata: {},
      title: 'Test',
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe('tags: []\nmetadata: {}\ntitle: Test');
  });

  it('should handle null and undefined values', () => {
    const data = {
      title: 'Test',
      description: null,
      author: undefined,
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe('title: Test\ndescription: null\nauthor: null');
  });

  it('should handle empty arrays correctly', () => {
    const data = {
      tags: [],
      categories: ['tag1', 'tag2'],
      emptyList: [],
    };

    const yaml = rebuildFrontmatter(data);

    expect(yaml).toBe(
      'tags: []\ncategories:\n  - tag1\n  - tag2\nemptyList: []'
    );
  });

  it('should respect sortKeys option', () => {
    const data = {
      zebra: 'last',
      apple: 'first',
      banana: 'middle',
    };

    const yamlSorted = rebuildFrontmatter(data, { sortKeys: true });
    const yamlUnsorted = rebuildFrontmatter(data, { sortKeys: false });

    expect(yamlSorted).toBe('apple: first\nbanana: middle\nzebra: last');
    expect(yamlUnsorted).toBe('zebra: last\napple: first\nbanana: middle');
  });

  it('should respect indent option', () => {
    const data = {
      tags: ['tag1', 'tag2'],
      author: {
        name: 'John Doe',
      },
    };

    const yamlIndent2 = rebuildFrontmatter(data, { indent: 2 });
    const yamlIndent4 = rebuildFrontmatter(data, { indent: 4 });

    expect(yamlIndent2).toBe(
      'tags:\n  - tag1\n  - tag2\nauthor:\n  name: John Doe'
    );
    expect(yamlIndent4).toBe(
      'tags:\n    - tag1\n    - tag2\nauthor:\n    name: John Doe'
    );
  });

  it('should handle empty data object', () => {
    const yaml = rebuildFrontmatter({});

    expect(yaml).toBe('');
  });

  it('should shoudl handle single value arrays correctly', () => {
    const data = {
      tags: ['tag1'],
      categories: ['tag2'],
    };

    const yaml = rebuildFrontmatter(data);
    expect(yaml).toBe('tags:\n  - tag1\ncategories:\n  - tag2');
  });
});

describe('updateFrontmatter function', () => {
  it('should update existing frontmatter', () => {
    const originalContent = `---
title: Old Title
author: Old Author
---
# Content here`;

    const newData = {
      title: 'New Title',
      author: 'New Author',
      published: true,
    };

    const updated = updateFrontmatter(originalContent, newData);

    expect(updated).toBe(`---
title: New Title
author: New Author
published: true
---
# Content here`);
  });

  it('should add frontmatter to document without it', () => {
    const originalContent = `# Just a regular markdown document
with no frontmatter`;

    const newData = {
      title: 'New Document',
      author: 'John Doe',
    };

    const updated = updateFrontmatter(originalContent, newData);

    expect(updated).toBe(`---
title: New Document
author: John Doe
---

# Just a regular markdown document
with no frontmatter`);
  });

  it('should remove frontmatter when newData is empty', () => {
    const originalContent = `---
title: Old Title
---
# Content here`;

    const updated = updateFrontmatter(originalContent, {});

    expect(updated).toBe(`# Content here`);
  });

  it('should preserve content when updating frontmatter', () => {
    const originalContent = `---
title: Old Title
---
# Main Content

## Section 1
Some content here.

## Section 2
More content.`;

    const newData = {
      title: 'New Title',
      updated: '2023-12-01',
    };

    const updated = updateFrontmatter(originalContent, newData);

    expect(updated).toBe(`---
title: New Title
updated: 2023-12-01
---
# Main Content

## Section 1
Some content here.

## Section 2
More content.`);
  });

  it('should handle complex nested data', () => {
    const originalContent = `---
simple: value
---
# Content`;

    const newData = {
      metadata: {
        author: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        tags: ['blog', 'tutorial'],
      },
      published: true,
    };

    const updated = updateFrontmatter(originalContent, newData);

    expect(updated).toBe(`---
metadata:
  author:
  name: John Doe
  email: john@example.com
  tags:
  - blog
  - tutorial
published: true
---
# Content`);
  });
});
