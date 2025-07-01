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
 * Constants for boolean settings values.
 */
const YES = 'Yes';
const NO = 'No';

/**
 * The Settings class provides a way to manage script parameters/settings
 * directly within a Google Sheet, making it accessible for non-technical users.
 */
export class Settings {
  private sheetName: string;
  private spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private settingsSheet: GoogleAppsScript.Spreadsheet.Sheet | null;
  private settingsMap: Map<string, string>;

  /**
   * Constructor initializes the settings sheet and map.
   * @param {string} [sheetName="Settings"] - Name of the sheet where settings are stored.
   */
  constructor(sheetName = 'Settings') {
    this.sheetName = sheetName;
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    this.settingsSheet = this.spreadsheet.getSheetByName(sheetName);
    this.settingsMap = this.initSettingsMap();
  }

  /**
   * Initializes the settings sheet if it doesn't exist.
   */
  init() {
    if (!this.settingsSheet) {
      this.settingsSheet = this.spreadsheet.insertSheet(this.sheetName);
      this.settingsSheet.appendRow(['Setting', 'Value']);
      this.settingsSheet.getRange('1:1').setFontWeight('bold');
    }
  }

  /**
   * Initializes the settings map from the sheet data.
   * @returns {Map<string, string>} - A map of settings.
   */
  initSettingsMap(): Map<string, string> {
    if (!this.settingsSheet) return new Map<string, string>();

    const data = this.settingsSheet.getDataRange().getValues();
    const map = new Map<string, string>();

    for (const [key, value] of data) {
      map.set(key, value);
    }

    return map;
  }

  /**
   * Sets or updates a setting in the sheet.
   * @param {string} settingName - Name of the setting.
   * @param {string} settingValue - Value of the setting.
   */
  setSetting(settingName: string, settingValue: string): void {
    const rowIndex = [...this.settingsMap.keys()].indexOf(settingName) + 1;

    if (rowIndex > 0) {
      this.settingsSheet!.getRange(rowIndex, 2).setValue(settingValue);
    } else {
      this.settingsSheet!.appendRow([settingName, settingValue]);
    }

    this.settingsMap.set(settingName, settingValue);
  }

  /**
   * Retrieves a setting's value from the map.
   * @param {string} settingName - Name of the setting.
   * @returns {string|null} - Value of the setting or null if not found.
   */
  get(settingName: string): string | null {
    return this.settingsMap.get(settingName) || null;
  }

  /**
   * Retrieves a boolean setting's value.
   * @param {string} settingName - Name of the setting.
   * @returns {boolean|null} - True if 'Yes', False if 'No', or null if neither.
   */
  getBoolean(settingName: string): boolean | null {
    const settingValue = this.get(settingName);

    if (settingValue === YES) return true;
    if (settingValue === NO) return false;

    Logger.log(`Setting value is not ${YES} or ${NO}: ${settingName}`);
    return null;
  }

  getNumber(settingName: string): number | null {
    const settingValue = this.get(settingName);
    if (!settingValue) return null;
    return Number(settingValue);
  }

  /**
   * Sets a setting in the script properties.
   * @param {string} settingName - Name of the setting.
   * @param {string} settingValue - Value of the setting.
   */
  setSettingInScriptProperties(
    settingName: string,
    settingValue: string
  ): void {
    PropertiesService.getScriptProperties().setProperty(
      settingName,
      settingValue
    );
  }

  /**
   * Retrieves a setting from the script properties.
   * @param {string} settingName - Name of the setting.
   * @returns {string} - Value of the setting.
   */
  getSettingFromScriptProperties(settingName: string): string | null {
    return PropertiesService.getScriptProperties().getProperty(settingName);
  }
}
