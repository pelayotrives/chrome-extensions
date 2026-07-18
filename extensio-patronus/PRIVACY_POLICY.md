# Privacy Policy for Extensio Patronus

Last updated: July 18, 2026

## Overview

Extensio Patronus is designed to work locally in your browser.

The extension does not require account creation, does not use analytics, does not send your extension configuration to external servers, and does not sell or share personal data.

## What Data the Extension Accesses

To function correctly, Extensio Patronus reads limited extension metadata from your browser through Chrome's extension management APIs, such as:

- extension name
- extension ID
- enabled or disabled status
- available options page or homepage URL
- extension icon metadata exposed by Chrome

This information is used only to render and control your extensions inside the popup.

## What Data the Extension Stores

Extensio Patronus stores configuration locally in `chrome.storage.local`, including:

- custom groups
- supergroups
- extension-to-group assignments
- local aliases you assign to extensions
- snapshots of extension states

This stored data remains on your machine, inside your browser profile, unless you explicitly export it as a JSON file.

## Exported Files

If you use the export feature, Extensio Patronus generates a JSON file containing the configuration you chose to export.

That file is created only at your request and is saved under your control. Once exported, its handling depends on where you store, copy, or share it.

## What the Extension Does Not Do

Extensio Patronus does not:

- collect account details
- collect payment information
- collect browsing history
- record page contents
- track keystrokes
- sync data to a remote server
- send telemetry or analytics events
- use advertising SDKs
- sell personal information

## Permissions and Why They Are Needed

### `management`

Used to list installed extensions and enable or disable them from the popup.

### `storage`

Used to save your local configuration, including groups, aliases, supergroups, and snapshots.

### `tabs`

Used to open extension options pages or relevant extension-related pages when you request them.

## Data Sharing

Extensio Patronus does not share your data with third parties.

## Data Retention

Your stored configuration remains in your local browser storage until:

- you delete it yourself
- you remove the extension
- you clear the relevant browser storage

## Children’s Privacy

Extensio Patronus is not directed to children and does not knowingly collect personal information from children.

## Security

The extension is intentionally designed to minimize data handling by keeping configuration local whenever possible. However, no software environment can guarantee absolute security.

## Changes to This Policy

This policy may be updated if the extension’s functionality or data practices change. The latest version of the policy should be published alongside the project and any store listing used for distribution.

## Contact

For privacy questions or requests related to Extensio Patronus, contact:

Pelayo Trives
