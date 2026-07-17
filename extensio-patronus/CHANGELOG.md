# Changelog

All notable changes to Extensio Patronus are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0]

### Added

- **Extension aliases**: double-click an extension name to assign a custom alias (max 48 characters). The alias visually replaces the original name in the table and is also searchable.
- **Bulk toggle per group**: each group chip includes a power button that enables or disables _all_ extensions assigned to that group.
- **Global bulk toggle ("All")**: the "All" chip also includes a toggle button affecting every installed extension.
- **Keyboard shortcuts**:
  - `/` : focuses the search input.
  - `Escape` : clears the search query and active group filter, or closes the confirmation modal.
- **Visual status indicator**: green dot with `pulse` animation for enabled extensions; static red dot for disabled ones.
- **Confirmation modal** when deleting a group, warning that the action cannot be undone.
- **Open `chrome://extensions`** via the gear icon in the header.
- **Extension icon** in each row (uses the 16px icon or the closest available size; gradient fallback if none).
- **Temporary status messages** (e.g. "This extension cannot be disabled", "X extension toggle(s) were blocked by Chrome") that auto-dismiss after 2.6 s.
- **Full dark theme** with CSS custom properties: backgrounds `#0f1115` / `#171b23`, blue accent `#3b82f6`, monospaced typography.
- **Inline SVG icons** for power and gear buttons (no external dependencies).

### Changed

- Completely redesigned UI from the initial prototype: two-column layout with header, group creation, filter chips, and an extension table with search.
- State (groups, assignments, aliases) is persisted in `chrome.storage.local` under the `hubState` key.

### Fixed

- Stored state validation and sanitization: removes duplicate groups, orphaned assignments (uninstalled extension or deleted group), and invalid aliases on load.

---

## [1.0.0]

### Added

- **Initial release** of Extensio Patronus (Chrome MV3).
- **Group management**: create, list, and delete custom groups (Work, Dev, AI, etc.).
- **Installed extension listing** via `chrome.management.getAll()`, filtering out the extension itself.
- **Assign extensions to groups** through a per-row `<select>` dropdown.
- **Search** by extension name or alias.
- **Enable/disable extensions** individually with `chrome.management.setEnabled`.
- **Open extension options pages** (fallback: `homepageUrl` → `chrome://extensions/?id=`).
- **Permissions requested**: `management`, `storage`, `tabs`.
- **Icons in 5 sizes** (16, 32, 48, 128, 512) + editable SVG.
- **README** with local installation instructions and Chrome API limitation docs.
