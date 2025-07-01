# Obsidian to Google Contacts Sync

A Google Apps Script application that synchronizes contact information from Obsidian markdown files to Google Contacts. This tool allows you to maintain your contacts in Obsidian's markdown format and automatically sync them with Google Contacts.

## Features

- **Bidirectional Sync**: Sync contact information from Obsidian markdown files to Google Contacts
- **Automatic Processing**: Process files in batches with configurable batch sizes
- **Incremental Updates**: Only process files modified since the last run
- **Error Handling**: Robust error handling with detailed logging
- **Flexible Configuration**: Easy-to-use settings management through Google Sheets
- **Contact Merging**: Intelligently merge contact information without duplicates

## Prerequisites

- Google Workspace account with access to Google Apps Script
- Google Drive folder containing Obsidian contact files
- Google Contacts API access
- Node.js 22+ (for development)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ObsidianToGContact2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Google Apps Script

1. Create a new Google Apps Script project
2. Enable the Google People API in your Google Cloud Console
3. Configure the required OAuth scopes:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/contacts`
   - `https://www.googleapis.com/auth/script.scriptapp`
   - `https://www.googleapis.com/auth/spreadsheets.currentonly`

### 4. Deploy the Script

```bash
# For development
npm run deploy

# For production
npm run deploy:prod
```

## Configuration

The application uses a Google Sheet for configuration. After deployment, a "Settings" sheet will be created with the following configurable parameters:

| Setting | Description | Default |
|---------|-------------|---------|
| `FOLDER` | Google Drive folder ID containing contact files | Required |
| `BATCH_SIZE` | Number of files to process in each batch | 20 |
| `RESET` | Reset all properties (Yes/No) | No |

### Setting up the Folder ID

1. Open your Google Drive folder containing Obsidian contact files
2. Copy the folder ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID`
3. Set this ID in the `FOLDER` setting

## Obsidian Contact Format

Your Obsidian contact files should follow this format:

```markdown
---
gcontact_id: 12345  # Optional: Google Contact ID for existing contacts
title: John Doe
date_created: 2022-11-10 10:24
tags:
  - contacts
  - important
---

# John Doe

Email:: john.doe@example.com, work.john@example.com
Phone:: +1-555-123-4567, +1-555-987-6543
Company:: [[Acme Corporation]]
Role:: Senior Developer
Team:: [[Engineering Team]]
Linkedin:: https://www.linkedin.com/in/johndoe
Manager:: [[Jane Smith]]
```

### Supported Contact Fields

- **Email**: Multiple email addresses (comma-separated)
- **Phone**: Multiple phone numbers (comma-separated)
- **Company**: Company name (supports Obsidian links)
- **Role**: Job title or role
- **Team**: Team or department (supports Obsidian links)
- **LinkedIn**: LinkedIn profile URL
- **Manager**: Manager's name (supports Obsidian links)

## Usage

### Automatic Sync

The script runs automatically and processes files in batches:

1. **Scheduled Execution**: The script automatically schedules itself to run periodically
2. **Incremental Processing**: Only processes files modified since the last run
3. **Batch Processing**: Processes files in configurable batches to avoid timeouts
4. **Error Recovery**: Continues processing even if individual files fail

### Manual Processing

You can also process individual contacts manually:

1. Open the Google Sheet where the script is deployed
2. Use the "Contact Sync" menu
3. Select "Process Single Contact"
4. Enter the file ID of the contact to process

### Processing Logic

The script follows this logic for each contact:

1. **Search for Existing Contact**: Looks for existing Google Contact by:
   - Google Contact ID (if present in the markdown)
   - Email address (if no ID is found)

2. **Create or Update**:
   - If contact exists: Merge new information with existing contact
   - If contact doesn't exist: Create new Google Contact

3. **Update Markdown**: Adds the Google Contact ID to the markdown file for future syncs

## Development

### Project Structure 

```
src/
├── index.ts # Main application logic
├── obsidian.ts # Obsidian markdown parsing and contact handling
├── settings.ts # Settings management
├── errors.ts # Custom error classes
└── logger.ts # Logging utilities
```

### Available Scripts

```bash
# Run tests
npm test

# Lint code
npm run lint

# Build the project
npm run build

# Deploy to development
npm run deploy

# Deploy to production
npm run deploy:prod
```

### Testing

The project includes comprehensive tests for:

- Obsidian markdown parsing
- Contact property handling
- Error scenarios
- Update function behavior

Run tests with:

```bash
npm test
```

## Error Handling

The application includes robust error handling for various scenarios:

- **File Operation Errors**: Issues reading or writing markdown files
- **Contact Creation Errors**: Problems creating new Google Contacts
- **Contact Retrieval Errors**: Issues fetching existing contacts
- **Contact Search Errors**: Problems searching for contacts

All errors are logged and the script continues processing other files.

## Logging

The application provides detailed logging for debugging and monitoring:

- **Info Logs**: Successful operations and processing status
- **Error Logs**: Detailed error information with context
- **Debug Logs**: Additional debugging information (when enabled)

## Limitations

- **Google Apps Script Timeout**: Scripts have a 6-minute execution limit
- **API Quotas**: Google People API has rate limits
- **File Size**: Large markdown files may cause performance issues
- **Concurrent Execution**: Only one instance can run at a time

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:

1. Check the existing issues in the repository
2. Create a new issue with detailed information
3. Include error logs and configuration details

## Changelog

### Version 0.0.0
- Initial release
- Basic contact synchronization
- Obsidian markdown parsing
- Google Contacts integration
- Batch processing support
- Error handling and logging
