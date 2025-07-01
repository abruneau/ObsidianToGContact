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
import { Obsidian } from './obsidian';
import { Log } from './logger';
import {
  ContactCreationError,
  ContactRetrievalError,
  ContactSearchError,
  FileOperationError,
} from './errors';
import { Settings } from './settings';

const settings = new Settings();

function onOpen(): void {
  settings.init();

  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Contact Sync')
    .addItem('Process Single Contact', 'showProcessSingleContactDialog')
    .addToUi();
}

/**
 * Shows a dialog to process a single contact by file ID.
 * This function is called from the spreadsheet menu.
 */
function showProcessSingleContactDialog(): void {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Process Single Contact',
    'Enter the file ID of the contact to process:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const fileId = response.getResponseText().trim();
    if (fileId) {
      try {
        processSingleContact(fileId);
        ui.alert('Success', 'Contact processed successfully!', ui.ButtonSet.OK);
      } catch (error: any) {
        ui.alert(
          'Error',
          `Failed to process contact: ${error.message}`,
          ui.ButtonSet.OK
        );
      }
    } else {
      ui.alert('Error', 'Please enter a valid file ID', ui.ButtonSet.OK);
    }
  }
}

/**
 * Main entry point for the application.
 * Processes Obsidian contact files and synchronizes them with Google Contacts.
 *
 * The function:
 * 1. Resets properties if requested
 * 2. Gets the last run timestamp
 * 3. Cleans up any existing triggers
 * 4. Gets the folder containing contact files
 * 5. Processes files in batches
 * 6. Schedules the next run if there are more files
 *
 * @throws {Error} If any critical operation fails
 */
function main(): void {
  try {
    const properties: GoogleAppsScript.Properties.Properties =
      PropertiesService.getUserProperties();

    if (settings.getBoolean('RESET')) {
      properties.deleteAllProperties();
      Log.info('Properties reset.');
    }

    const lastRunDate = properties.getProperty('lastRunDate');
    const lastRunTimestamp = lastRunDate ? new Date(lastRunDate).getTime() : 0;

    cleanupExistingTrigger(properties);
    const folerId = settings.get('FOLDER');
    if (!folerId) {
      throw new Error(
        'FOLDER property is not set or is invalid. Please set it in the Settings sheet.'
      );
    }

    const folder = DriveApp.getFolderById(folerId);

    // Check if we stopped in the middle of a series of updates
    const lastToken = properties.getProperty('lastToken');
    let files: GoogleAppsScript.Drive.FileIterator;
    if (lastToken) {
      files = DriveApp.continueFileIterator(lastToken);
    } else {
      properties.setProperty('lastRunDate', new Date().toString());
      const lastDate = new Date(lastRunTimestamp).toISOString().split('T')[0];
      const query = `modifiedDate > '${lastDate}'`;
      files = folder.searchFiles(query);
    }

    processFiles(files, properties, lastRunTimestamp);
  } catch (error: any) {
    Log.error(`Error in main execution: ${error.message}`);
    throw error;
  }
}

/**
 * Cleans up any existing trigger for the main function.
 *
 * @param properties - The user properties service
 */
function cleanupExistingTrigger(
  properties: GoogleAppsScript.Properties.Properties
): void {
  const lastTrigger = properties.getProperty('last_triggerId');
  if (lastTrigger) {
    ScriptApp.getProjectTriggers().forEach(trigger => {
      if (trigger.getUniqueId() === lastTrigger) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    properties.deleteProperty('last_triggerId');
  }
}

/**
 * Processes a batch of files from the file iterator.
 *
 * For each file:
 * 1. Updates the continuation token
 * 2. Creates or updates the contact in Google Contacts
 * 3. Continues to the next file if there's an error
 *
 * @param files - The file iterator
 * @param properties - The user properties service
 * @param lastRunTimestamp - The timestamp of the last run
 */
function processFiles(
  files: GoogleAppsScript.Drive.FileIterator,
  properties: GoogleAppsScript.Properties.Properties,
  lastRunTimestamp: number
): void {
  let count = 0;
  const batchSize = settings.getNumber('BATCH_SIZE') || 20;
  while (files.hasNext() && count < batchSize) {
    try {
      properties.setProperty('lastToken', files.getContinuationToken());
      const file = files.next();
      const o = new Obsidian.Contact(file);
      Log.info(`Processing file: ${file.getName()}`);
      const g = findGoogleContact(o.id, o.emails?.[0]);
      if (g) {
        merge(o, g);
      } else {
        createGoogleContact(o);
      }
      count++;
    } catch (error: any) {
      if (error instanceof FileOperationError) {
        Log.error(`File operation failed: ${error.message}`);
      } else if (
        error instanceof ContactCreationError ||
        error instanceof ContactRetrievalError ||
        error instanceof ContactSearchError
      ) {
        Log.error(`Google People API error: ${error.message}`);
      } else {
        Log.error(`Unexpected error: ${error.message}`);
      }
      // Continue with next file instead of failing completely
    }
  }
  Log.info(`Processed ${count} files`);

  if (!files.hasNext()) {
    properties.deleteProperty('lastToken');
  } else {
    scheduleNextRun(properties);
  }
}

/**
 * Schedules the next run of the main function.
 *
 * @param properties - The user properties service
 */
function scheduleNextRun(
  properties: GoogleAppsScript.Properties.Properties
): void {
  const delayMs = settings.getNumber('TRIGGER_DELAY_MS') || 10 * 60 * 1000;
  const trigger = ScriptApp.newTrigger('main')
    .timeBased()
    .after(delayMs)
    .create();

  properties.setProperty('last_triggerId', trigger.getUniqueId());
  Log.info(`Scheduled next run in ${delayMs}ms`);
}

/**
 * Creates a new contact in Google Contacts.
 *
 * @param o - The Obsidian contact to create
 * @throws {ContactCreationError} If the contact creation fails
 */
function createGoogleContact(o: Obsidian.Contact): void {
  const peopleService = People.People;
  if (!peopleService) {
    throw new Error('People service is not available');
  }
  const groupMember = People.newContactGroupMembership();
  groupMember.contactGroupId = 'contactGroups/myContacts';
  const membership = People.newMembership();
  membership.contactGroupMembership = groupMember;
  const contact: GoogleAppsScript.People.Schema.Person = {
    memberships: [membership],
    names: [{ givenName: o.name }],
    emailAddresses: o.emails?.map(email => ({ value: email })),
    phoneNumbers: o.phone?.map(phone => ({ value: phone })),
    organizations: [
      {
        name: o.company?.join(', '),
        title: o.role,
        department: o.team,
        current: true,
      },
    ],
    urls: o.linkedin ? [{ type: 'linkedin', value: o.linkedin }] : [],
    userDefined: o.manager ? [{ key: 'manager', value: o.manager }] : [],
  };

  try {
    const response = peopleService?.createContact(contact);
    o.id = response?.resourceName;
    o.save();
    Log.debug(settings, 'Google Contact created: ' + response?.resourceName);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    throw new ContactCreationError(
      `Failed to create contact for ${o.name}: ${error.message}`,
      statusCode
    );
  }
}

/**
 * Compares two lists of strings to determine which one should be used.
 *
 * @param a - First list of strings
 * @param b - Second list of strings
 * @returns -1 if a should be used, 1 if b should be used, 0 if either can be used
 */
function compareList(a: string[], b: string[]): number {
  if (!a || a.length === 0) return b && b.length > 0 ? 1 : 0;
  if (!b || b.length === 0) return a.length > 0 ? -1 : 0;
  return 0;
}

/**
 * Merges an Obsidian contact with a Google Contact.
 *
 * The merge strategy:
 * 1. Always uses the Obsidian name
 * 2. Uses the list with more items for emails and phones
 * 3. Preserves existing data if one source is missing it
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function merge(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  mergeName(o, g);
  mergeLinkedIn(o, g);
  mergeManager(o, g);
  mergeCompany(o, g);
  mergeEmails(o, g);
  mergePhones(o, g);

  o.id = g.resourceName;
  o.save();
}

/**
 * Merges the name from the Obsidian contact to the Google Contact.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergeName(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  g.names = [{ givenName: o.name }];
}

/**
 * Merges the LinkedIn URL between the Obsidian contact and Google Contact.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergeLinkedIn(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  const gLinkedin = g.urls?.find(u => u.type === 'linkedin');
  if (o.linkedin && !gLinkedin) {
    g.urls = g.urls || [];
    g.urls.push({ type: 'linkedin', value: o.linkedin });
  } else if (gLinkedin && !o.linkedin) {
    o.linkedin = gLinkedin.value;
  }
}

/**
 * Merges the manager information between the Obsidian contact and Google Contact.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergeManager(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  const gManager = g.biographies?.find(b => b.contentType === 'manager');
  if (o.manager && !gManager) {
    g.biographies = g.biographies || [];
    g.biographies.push({ contentType: 'manager', value: o.manager });
  } else if (gManager && !o.manager) {
    o.manager = gManager.value;
  }
}

/**
 * Merges the company information between the Obsidian contact and Google Contact.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergeCompany(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  const gCompany = g.organizations?.find(org => org.current);
  if (o.company && !gCompany) {
    g.organizations = g.organizations || [];
    g.organizations.push({
      name: o.company.join(', '),
      title: o.role,
      department: o.team,
      current: true,
    });
  } else if (gCompany) {
    if (gCompany.name && !o.company) {
      o.company = gCompany.name.split(', ');
    }
    if (!o.role && gCompany.title) {
      o.role = gCompany.title;
    }
    if (o.role && !gCompany.title) {
      gCompany.title = o.role;
    }
    if (!o.team && gCompany.department) {
      o.team = gCompany.department;
    }
    if (o.team && !gCompany.department) {
      gCompany.department = o.team;
    }
  }
}

/**
 * Merges the email addresses between the Obsidian contact and Google Contact.
 * Uses the list with more items, or the Obsidian list if they have the same number.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergeEmails(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  const eCompare = compareList(
    o.emails || [],
    g.emailAddresses
      ?.map(e => e.value)
      .filter((v): v is string => v !== undefined) || []
  );
  if (eCompare <= 0) {
    g.emailAddresses = (o.emails || []).map(email => ({ value: email }));
  } else if (eCompare > 0) {
    o.emails =
      g.emailAddresses
        ?.map(e => e.value)
        .filter((v): v is string => v !== undefined) || [];
  }
}

/**
 * Merges the phone numbers between the Obsidian contact and Google Contact.
 * Uses the list with more items, or the Obsidian list if they have the same number.
 *
 * @param o - The Obsidian contact
 * @param g - The Google Contact
 */
function mergePhones(
  o: Obsidian.Contact,
  g: GoogleAppsScript.People.Schema.Person
): void {
  const pCompare = compareList(
    o.phone || [],
    g.phoneNumbers
      ?.map(p => p.value)
      .filter((v): v is string => v !== undefined) || []
  );
  if (pCompare <= 0) {
    g.phoneNumbers = (o.phone || []).map(phone => ({ value: phone }));
  } else if (pCompare > 0) {
    o.phone =
      g.phoneNumbers
        ?.map(p => p.value)
        .filter((v): v is string => v !== undefined) || [];
  }
}

/**
 * Finds a Google Contact by ID or email.
 *
 * @param id - The Google Contact ID
 * @param email - The email address to search for
 * @returns The found Google Contact or null if not found
 * @throws {ContactRetrievalError} If retrieving by ID fails
 * @throws {ContactSearchError} If searching by email fails
 */
function findGoogleContact(
  id: string | undefined,
  email: string | undefined
): GoogleAppsScript.People.Schema.Person | null {
  const peopleService = People.People;
  if (!peopleService) {
    throw new Error('People service is not available');
  }
  try {
    if (id) {
      Log.debug(settings, 'Google Contact found: ' + id);
      return peopleService.get(`people/${id}`, {
        personFields:
          'memberships,names,emailAddresses,phoneNumbers,urls,biographies,organizations',
      });
    } else if (email && email.length > 0) {
      const response = peopleService.searchContacts({
        query: email,
        pageSize: 1,
        readMask:
          'memberships,names,emailAddresses,phoneNumbers,urls,biographies,organizations',
      });
      if (
        response &&
        response.results &&
        response.results.length > 0 &&
        response.results[0].person
      ) {
        Log.debug(
          settings,
          'Google Contact found: ' + response.results[0].person.resourceName
        );
        return response.results[0].person;
      } else {
        Log.debug(settings, 'No Google Contact found for email: ' + email);
      }
    }
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    if (id) {
      throw new ContactRetrievalError(
        `Failed to retrieve contact with ID ${id}: ${error.message}`,
        statusCode
      );
    } else {
      throw new ContactSearchError(
        `Failed to search contact with email ${email}: ${error.message}`,
        statusCode
      );
    }
  }
  return null;
}

/**
 * Processes a single contact file by its ID.
 * This function is useful for testing or manual processing of specific contacts.
 *
 * @param fileId - The ID of the file to process
 * @throws {Error} If the file cannot be found or processed
 */
function processSingleContact(fileId: string): void {
  try {
    const file = DriveApp.getFileById(fileId);
    if (!file) {
      throw new Error(`File with ID ${fileId} not found`);
    }

    Log.info(`Processing single file: ${file.getName()}`);
    const o = new Obsidian.Contact(file);
    const g = findGoogleContact(o.id, o.emails?.[0]);

    if (g) {
      merge(o, g);
    } else {
      createGoogleContact(o);
    }

    Log.info(`Successfully processed contact: ${o.name}`);
  } catch (error: any) {
    if (error instanceof FileOperationError) {
      Log.error(`File operation failed: ${error.message}`);
    } else if (
      error instanceof ContactCreationError ||
      error instanceof ContactRetrievalError ||
      error instanceof ContactSearchError
    ) {
      Log.error(`Google People API error: ${error.message}`);
    } else {
      Log.error(`Unexpected error: ${error.message}`);
    }
    throw error;
  }
}
