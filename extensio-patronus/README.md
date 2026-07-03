# Extensio Patronus (Chrome MV3)

Extension management hub. Keep only this icon pinned and manage your other extensions from its popup.

## What it does

- Create custom groups (Work, Dev, AI, etc.)
- List installed extensions
- Assign each extension to a group
- Search by name
- Enable/Disable extension (via `chrome.management` API)
- Open extension options page (if available)

## Chrome API Limitations

- There is no API to pin/unpin other extensions via code.
- There is no API to open another extension's popup from your extension.
- An extension icon popup only opens on click, not on hover.

## Structure

- `manifest.json`
- `popup/`
  - `popup.html`
  - `popup.css`
  - `popup.js`
- `icons/`

## Local Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extensio-patronus` folder
5. Pin only **Extensio Patronus** on the toolbar
6. Manually unpin the rest of the extensions you want to compact

## Permissions Used

- `management`: read extensions and enable/disable them
- `storage`: save groups and assignments
- `tabs`: open options pages

> This extension is under development and is not yet available in the Chrome Web Store.
