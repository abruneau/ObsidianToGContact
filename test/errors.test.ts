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
import {
  AppError,
  GooglePeopleApiError,
  ContactCreationError,
  ContactSearchError,
  ContactRetrievalError,
  FileOperationError,
  ContactParsingError,
} from '../src/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an AppError with the correct name and message', () => {
      const error = new AppError('Test error');
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Test error');
    });
  });

  describe('GooglePeopleApiError', () => {
    it('should create a GooglePeopleApiError with operation and status code', () => {
      const error = new GooglePeopleApiError(
        'API failed',
        'testOperation',
        500
      );
      expect(error.name).toBe('GooglePeopleApiError');
      expect(error.message).toBe(
        'Google People API Error (testOperation): API failed'
      );
      expect(error.operation).toBe('testOperation');
      expect(error.statusCode).toBe(500);
    });

    it('should create a GooglePeopleApiError without status code', () => {
      const error = new GooglePeopleApiError('API failed', 'testOperation');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('ContactCreationError', () => {
    it('should create a ContactCreationError with the correct operation', () => {
      const error = new ContactCreationError('Failed to create', 400);
      expect(error.name).toBe('ContactCreationError');
      expect(error.operation).toBe('createContact');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ContactSearchError', () => {
    it('should create a ContactSearchError with the correct operation', () => {
      const error = new ContactSearchError('Failed to search', 404);
      expect(error.name).toBe('ContactSearchError');
      expect(error.operation).toBe('searchContacts');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ContactRetrievalError', () => {
    it('should create a ContactRetrievalError with the correct operation', () => {
      const error = new ContactRetrievalError('Failed to retrieve', 403);
      expect(error.name).toBe('ContactRetrievalError');
      expect(error.operation).toBe('getContact');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('FileOperationError', () => {
    it('should create a FileOperationError with file name and operation', () => {
      const error = new FileOperationError('Failed to read', 'test.md', 'read');
      expect(error.name).toBe('FileOperationError');
      expect(error.message).toBe(
        'File Operation Error (test.md - read): Failed to read'
      );
      expect(error.fileName).toBe('test.md');
      expect(error.operation).toBe('read');
    });
  });

  describe('ContactParsingError', () => {
    it('should create a ContactParsingError with file name and line number', () => {
      const error = new ContactParsingError('Invalid format', 'test.md', 5);
      expect(error.name).toBe('ContactParsingError');
      expect(error.message).toBe(
        'Contact Parsing Error (test.md:5): Invalid format'
      );
      expect(error.fileName).toBe('test.md');
      expect(error.lineNumber).toBe(5);
    });

    it('should create a ContactParsingError without line number', () => {
      const error = new ContactParsingError('Invalid format', 'test.md');
      expect(error.message).toBe(
        'Contact Parsing Error (test.md): Invalid format'
      );
      expect(error.lineNumber).toBeUndefined();
    });
  });
});
