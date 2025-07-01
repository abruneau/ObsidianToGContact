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
 * Base error class for all application errors.
 * Extends the standard Error class and sets the error name to the constructor name.
 */
export class AppError extends Error {
  /**
   * Creates a new AppError instance.
   * @param message - The error message
   */
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when Google People API operations fail.
 * Includes the specific operation that failed and the HTTP status code if available.
 */
export class GooglePeopleApiError extends AppError {
  /**
   * Creates a new GooglePeopleApiError instance.
   * @param message - The error message
   * @param operation - The name of the API operation that failed
   * @param statusCode - The HTTP status code of the failed request (optional)
   */
  constructor(
    message: string,
    public readonly operation: string,
    public readonly statusCode?: number
  ) {
    super(`Google People API Error (${operation}): ${message}`);
  }
}

/**
 * Error thrown when contact creation fails in the Google People API.
 * Extends GooglePeopleApiError with a fixed operation name of "createContact".
 */
export class ContactCreationError extends GooglePeopleApiError {
  /**
   * Creates a new ContactCreationError instance.
   * @param message - The error message
   * @param statusCode - The HTTP status code of the failed request (optional)
   */
  constructor(message: string, statusCode?: number) {
    super(message, 'createContact', statusCode);
  }
}

/**
 * Error thrown when contact search fails in the Google People API.
 * Extends GooglePeopleApiError with a fixed operation name of "searchContacts".
 */
export class ContactSearchError extends GooglePeopleApiError {
  /**
   * Creates a new ContactSearchError instance.
   * @param message - The error message
   * @param statusCode - The HTTP status code of the failed request (optional)
   */
  constructor(message: string, statusCode?: number) {
    super(message, 'searchContacts', statusCode);
  }
}

/**
 * Error thrown when contact retrieval fails in the Google People API.
 * Extends GooglePeopleApiError with a fixed operation name of "getContact".
 */
export class ContactRetrievalError extends GooglePeopleApiError {
  /**
   * Creates a new ContactRetrievalError instance.
   * @param message - The error message
   * @param statusCode - The HTTP status code of the failed request (optional)
   */
  constructor(message: string, statusCode?: number) {
    super(message, 'getContact', statusCode);
  }
}

/**
 * Error thrown when file operations fail.
 * Includes the file name and the specific operation that failed.
 */
export class FileOperationError extends AppError {
  /**
   * Creates a new FileOperationError instance.
   * @param message - The error message
   * @param fileName - The name of the file where the operation failed
   * @param operation - The name of the file operation that failed (e.g., "read", "write")
   */
  constructor(
    message: string,
    public readonly fileName: string,
    public readonly operation: string
  ) {
    super(`File Operation Error (${fileName} - ${operation}): ${message}`);
  }
}

/**
 * Error thrown when parsing contact data fails.
 * Includes the file name and optionally the line number where parsing failed.
 */
export class ContactParsingError extends AppError {
  /**
   * Creates a new ContactParsingError instance.
   * @param message - The error message
   * @param fileName - The name of the file where parsing failed
   * @param lineNumber - The line number where parsing failed (optional)
   */
  constructor(
    message: string,
    public readonly fileName: string,
    public readonly lineNumber?: number
  ) {
    super(
      `Contact Parsing Error (${fileName}${lineNumber ? `:${lineNumber}` : ''}): ${message}`
    );
  }
}
