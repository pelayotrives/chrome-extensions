# Changelog

All notable changes to Extensio Patronus are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.3]

### Added

- **Drag and drop**: drag an extension row onto a group chip to assign it instantly. A "Drop here to remove group" zone lets you unassign by dragging there too.

### Changed

- **Cards merged**: "New group" and "Groups" unified into a single card; "Search extension" and the extensions table merged into an "Extensions" card. Cleaner layout, less visual noise.
- Spacing standardized across all form rows, snapshot actions, and snapshot list items.

---

## [1.2.2]

### Changed

- **Info tab rewritten** with a more natural tone: "How it works" steps explain the why behind each feature.
- Steps body text uses muted gray; only the bold labels stay white for contrast.
- List markers dimmed to muted instead of accent blue.
- "Partial" legend label changed to "Some on, some off" for clarity.
- Section headings renamed: "Getting started" to "How it works", "Shortcuts" to "Keyboard shortcuts".

### Added

- **Version footnote** at the bottom of Info: reads from `manifest.json` at runtime so it always stays in sync.

### Removed

- Static version string and "Chrome MV3" label from the Info footnote.
- `.version` file (version lives in `manifest.json` only).

---

## [1.2.1]

### Added

- **Info tab**: explains how to use the extension (getting started steps, shortcuts, power color legend).
- **Extension count per snapshot**: each snapshot row shows "X of Y enabled" below its name.
- **Toast warning** when trying to save a 10th snapshot.

### Changed

- **Tab order**: Groups now appears first, Snapshots second, Info third.
- **Restore icon**: replaced the curved arrow with a simple checkmark for clarity.
- **Shortcuts and legend** moved from the footer into the Info tab; footer removed.

### Fixed

- Symbols replaced throughout the UI.
- Shortcut labels clarified: "Toggle all extensions" (Ctrl+1), "Toggle groups 1-8" (Ctrl+2..9).

---

## [1.2.0]

### Added

- **Snapshots**: save and restore the full extension state (groups, assignments, aliases, on/off status). Up to 9 snapshots. Rename via double-click, delete with confirmation modal.
- **Tabs**: "Snapshots" and "Groups" tabs split the popup into two focused views, reducing vertical scroll.
- **Toast notifications**: non-intrusive confirmation messages for create/delete/toggle/restore actions. Auto-dismiss after 2 s.
- **Ctrl+1…9 shortcuts**: toggle all extensions (`Ctrl+1`) or any of the first 8 groups (`Ctrl+2` through `Ctrl+9`).
- **Power color legend** in the footer explaining green/orange/red indicators.
- **Sort dropdown** next to search: A–Z, Z–A, Enabled first, Disabled first.
- **Extension logo** next to the header title.

### Changed

- **Color palette**: neutral grays (`#0d0d0d` / `#1a1a1a` / `#e0e0e0`) with a subtle blue accent (`#6b8fa3`). Color used sparingly for highlights only.
- Section titles unified to same size, weight, and color across all cards.
- Descriptive help text added under each section heading.
- Delete confirmation modal now adapts its title ("Delete group" / "Delete snapshot") depending on context.
- Footer moved below the main content as a distinct info block with shortcuts and legend.

### Fixed

- Stored state sanitization now covers snapshots as well as groups, assignments, and aliases.

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
