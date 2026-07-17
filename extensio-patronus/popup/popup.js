const STORAGE_KEY = "hubState";

const refs = {
  saveSnapshotBtn: document.getElementById("saveSnapshotBtn"),
  snapshotLimitHint: document.getElementById("snapshotLimitHint"),
  snapshotsList: document.getElementById("snapshotsList"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  groupName: document.getElementById("groupName"),
  groupsList: document.getElementById("groupsList"),
  groupsHint: document.getElementById("groupsHint"),
  searchInput: document.getElementById("searchInput"),
  sortOrder: document.getElementById("sortOrder"),
  openChromeExtensionsBtn: document.getElementById("openChromeExtensionsBtn"),
  extensionsList: document.getElementById("extensionsList"),
  confirmModal: document.getElementById("confirmModal"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmText: document.getElementById("confirmText"),
  cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
  confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
  toastContainer: document.getElementById("toastContainer")
};

let installedExtensions = [];
let state = {
  groups: [],
  assignments: {},
  aliases: {},
  snapshots: []
};
let activeGroupFilter = "all";
let pendingDeleteGroupId = null;
let pendingDeleteSnapshotId = null;
let statusTimeoutId = null;
let sortMode = "az";

const POWER_ICON = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 3v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M7.05 5.95a8 8 0 1 0 9.9 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const GEAR_ICON = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" stroke="currentColor" stroke-width="1.8"/>
  <path d="m19 12 .8 1.4-1.2 2.1-1.6-.1a7.8 7.8 0 0 1-1.2 1.2l.1 1.6-2.1 1.2L12 19a7.8 7.8 0 0 1-1.8 0l-.8 1.4-2.1-1.2.1-1.6a7.8 7.8 0 0 1-1.2-1.2l-1.6.1-1.2-2.1L5 12a7.8 7.8 0 0 1 0-1.8l-1.4-.8 1.2-2.1 1.6.1A7.8 7.8 0 0 1 7.6 6l-.1-1.6 2.1-1.2.8 1.4a7.8 7.8 0 0 1 1.8 0l.8-1.4 2.1 1.2-.1 1.6a7.8 7.8 0 0 1 1.2 1.2l1.6-.1 1.2 2.1-1.4.8c.1.6.1 1.2 0 1.8Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
</svg>
`;

try {
  await init();
} catch (error) {
  console.error("Init failed", error);
}

async function init() {
  await loadData();
  wireEvents();
  renderAll();
}

function wireEvents() {
  refs.saveSnapshotBtn.addEventListener("click", handleSaveSnapshot);
  refs.createGroupBtn.addEventListener("click", handleCreateGroup);
  refs.searchInput.addEventListener("input", renderExtensionRows);
  refs.sortOrder.addEventListener("change", () => {
    sortMode = refs.sortOrder.value;
    renderExtensionRows();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  refs.openChromeExtensionsBtn.addEventListener("click", async () => {
    await chrome.tabs.create({ url: "chrome://extensions/" });
  });
  document.addEventListener("keydown", handleGlobalShortcuts);

  refs.groupsList.addEventListener("click", async (event) => {
    const filterBtn = event.target.closest("button[data-filter-group]");
    if (filterBtn) {
      activeGroupFilter = filterBtn.dataset.filterGroup || "all";
      renderAll();
      return;
    }

    const btn = event.target.closest("button[data-delete-group]");
    if (!btn) return;

    const groupId = btn.dataset.deleteGroup;
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return;

    pendingDeleteGroupId = group.id;
    pendingDeleteSnapshotId = null;
    refs.confirmTitle.textContent = "Delete group";
    refs.confirmText.textContent = `Delete group "${group.name}" and clear related assignments? This action cannot be undone.`;
    refs.confirmModal.showModal();
  });

  refs.cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  refs.confirmDeleteBtn.addEventListener("click", async () => {
    const deletingGroup = pendingDeleteGroupId;
    const deletingSnapshot = pendingDeleteSnapshotId;

    pendingDeleteGroupId = null;
    pendingDeleteSnapshotId = null;
    closeDeleteModal();

    if (deletingSnapshot) {
      const snapName = state.snapshots.find((s) => s.id === deletingSnapshot)?.name || "Snapshot";
      state.snapshots = state.snapshots.filter((item) => item.id !== deletingSnapshot);
      await saveState();
      renderAll();
      showToast(`Snapshot "${snapName}" deleted`);
      return;
    }

    if (deletingGroup) {
      const groupName = state.groups.find((g) => g.id === deletingGroup)?.name || "Group";
      state.groups = state.groups.filter((group) => group.id !== deletingGroup);

      for (const [extensionId, assignedGroupId] of Object.entries(state.assignments)) {
        if (assignedGroupId === deletingGroup) {
          delete state.assignments[extensionId];
        }
      }

      if (activeGroupFilter === deletingGroup) {
        activeGroupFilter = "all";
      }

      await saveState();
      renderAll();
      showToast(`Group "${groupName}" deleted`);
    }
  });

  refs.confirmModal.addEventListener("click", (event) => {
    if (event.target === refs.confirmModal && refs.confirmModal.open) {
      closeDeleteModal();
    }
  });

  refs.extensionsList.addEventListener("change", async (event) => {
    const selector = event.target.closest("select[data-assign]");
    if (!selector) return;

    const extensionId = selector.dataset.assign;
    const newGroupId = selector.value;

    if (newGroupId) {
      state.assignments[extensionId] = newGroupId;
    } else {
      delete state.assignments[extensionId];
    }

    await saveState();
    renderGroups();
    renderExtensionRows();
  });

  refs.extensionsList.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const extensionId = btn.dataset.extension;
    const extension = installedExtensions.find((item) => item.id === extensionId);
    if (!extension) return;

    const action = btn.dataset.action;

    if (action === "toggle") {
      await safeToggleOne(extension);
      await reloadExtensionsOnly();
      renderGroups();
      renderExtensionRows();
      return;
    }

    if (action === "openOptions") {
      await openBestPageForExtension(extension);
    }
  });

  refs.extensionsList.addEventListener("dblclick", (event) => {
    const name = event.target.closest(".name[data-alias-target]");
    if (!name) return;

    const extensionId = name.dataset.aliasTarget;
    if (!extensionId) return;

    const extension = installedExtensions.find((item) => item.id === extensionId);
    if (!extension) return;

    startAliasEdit(name, extension);
  });

  refs.snapshotsList.addEventListener("click", async (event) => {
    const restoreBtn = event.target.closest("button[data-restore-snapshot]");
    if (restoreBtn) {
      await handleRestoreSnapshot(restoreBtn.dataset.restoreSnapshot);
      return;
    }

    const deleteBtn = event.target.closest("button[data-delete-snapshot]");
    if (deleteBtn) {
      const snapshotId = deleteBtn.dataset.deleteSnapshot;
      const snapshot = state.snapshots.find((item) => item.id === snapshotId);
      if (!snapshot) return;

      pendingDeleteGroupId = null;
      pendingDeleteSnapshotId = snapshotId;
      refs.confirmTitle.textContent = "Delete snapshot";
      refs.confirmText.textContent = `Delete snapshot "${snapshot.name}"? This action cannot be undone.`;
      refs.confirmModal.showModal();
    }
  });

  refs.snapshotsList.addEventListener("dblclick", (event) => {
    const snapName = event.target.closest(".snap-name[data-rename-snapshot]");
    if (!snapName) return;

    const snapshotId = snapName.dataset.renameSnapshot;
    const snapshot = state.snapshots.find((item) => item.id === snapshotId);
    if (snapshot) startSnapshotRename(snapName, snapshot);
  });
}

async function handleCreateGroup() {
  const rawName = refs.groupName.value.trim();
  if (!rawName) return;

  const duplicate = state.groups.some(
    (group) => group.name.toLowerCase() === rawName.toLowerCase()
  );
  if (duplicate) return;

  state.groups.push({
    id: crypto.randomUUID(),
    name: rawName
  });

  refs.groupName.value = "";
  await saveState();
  renderAll();
  showToast(`Group "${rawName}" created`);
}

async function handleSaveSnapshot() {
  if (state.snapshots.length >= 9) {
    showToast("Maximum of 9 snapshots reached.");
    return;
  }

  const index = state.snapshots.length + 1;

  const extensionStates = {};
  for (const ext of installedExtensions) {
    extensionStates[ext.id] = ext.enabled;
  }

  const name = `Snapshot ${index}`;

  state.snapshots.push({
    id: crypto.randomUUID(),
    name,
    groups: state.groups.map((g) => ({ id: g.id, name: g.name })),
    assignments: { ...state.assignments },
    aliases: { ...state.aliases },
    extensionStates
  });

  await saveState();
  renderAll();
  showToast(`Snapshot "${name}" saved`);
}

async function handleRestoreSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;

  state.groups = snapshot.groups.map((g) => ({ id: g.id, name: g.name }));
  state.assignments = { ...snapshot.assignments };
  state.aliases = { ...snapshot.aliases };

  const setEnabledOps = [];
  for (const [extId, targetEnabled] of Object.entries(snapshot.extensionStates)) {
    const ext = installedExtensions.find((item) => item.id === extId);
    if (!ext) continue;
    if (ext.enabled !== targetEnabled) {
      setEnabledOps.push(
        chrome.management.setEnabled(extId, targetEnabled).catch(() => {})
      );
    }
  }

  await Promise.allSettled(setEnabledOps);
  await saveState();
  await reloadExtensionsOnly();
  renderAll();
  showToast(`Snapshot "${snapshot.name}" restored`);
}

function startSnapshotRename(nameNode, snapshot) {
  const input = document.createElement("input");
  input.className = "alias-input";
  input.type = "text";
  input.maxLength = 32;
  input.value = snapshot.name;

  nameNode.replaceWith(input);
  input.focus();
  input.select();

  let done = false;

  const commit = async () => {
    if (done) return;
    done = true;

    const value = input.value.trim();
    if (value) {
      snapshot.name = value;
    }

    await saveState();
    renderSnapshots();
  };

  const cancel = () => {
    if (done) return;
    done = true;
    renderSnapshots();
  };

  input.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });

  input.addEventListener("blur", () => {
    commit().catch((error) => {
      console.error("Snapshot rename failed", error);
    });
  });
}

async function loadData() {
  const [extensions, stored] = await Promise.all([
    chrome.management.getAll(),
    chrome.storage.local.get(STORAGE_KEY)
  ]);

  installedExtensions = extensions
    .filter((item) => item.type === "extension" && item.id !== chrome.runtime.id)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  state = normalizeState(stored[STORAGE_KEY]);
  await saveState();
}

function normalizeState(maybeState) {
  const rawGroups = Array.isArray(maybeState?.groups) ? maybeState.groups : [];
  const validGroups = sanitizeGroups(rawGroups);
  const groupIds = new Set(validGroups.map((group) => group.id));
  const extensionIds = new Set(installedExtensions.map((item) => item.id));
  const rawAssignments =
    typeof maybeState?.assignments === "object" && maybeState.assignments
      ? { ...maybeState.assignments }
      : {};
  const rawAliases =
    typeof maybeState?.aliases === "object" && maybeState.aliases
      ? { ...maybeState.aliases }
      : {};

  return {
    groups: validGroups,
    assignments: sanitizeAssignments(rawAssignments, extensionIds, groupIds),
    aliases: sanitizeAliases(rawAliases, extensionIds),
    snapshots: sanitizeSnapshots(
      Array.isArray(maybeState?.snapshots) ? maybeState.snapshots : [],
      extensionIds
    )
  };
}

function sanitizeGroups(rawGroups) {
  const validGroups = [];
  const groupIds = new Set();

  for (const group of rawGroups) {
    if (!group || typeof group.id !== "string" || typeof group.name !== "string") {
      continue;
    }
    if (groupIds.has(group.id)) continue;

    groupIds.add(group.id);
    validGroups.push({ id: group.id, name: group.name.slice(0, 32) });
  }

  return validGroups;
}

function sanitizeAssignments(rawAssignments, extensionIds, groupIds) {
  const result = {};

  for (const [extensionId, groupId] of Object.entries(rawAssignments)) {
    if (!extensionIds.has(extensionId) || !groupIds.has(groupId)) {
      continue;
    }
    result[extensionId] = groupId;
  }

  return result;
}

function sanitizeAliases(rawAliases, extensionIds) {
  const result = {};

  for (const [extensionId, alias] of Object.entries(rawAliases)) {
    if (!extensionIds.has(extensionId) || typeof alias !== "string") {
      continue;
    }

    const trimmed = alias.slice(0, 48).trim();
    if (!trimmed) continue;
    result[extensionId] = trimmed;
  }

  return result;
}

function sanitizeSnapshots(rawSnapshots, extensionIds) {
  const MAX_SNAPSHOTS = 9;
  const seen = new Set();
  const result = [];

  for (const snap of rawSnapshots) {
    if (result.length >= MAX_SNAPSHOTS) break;
    if (!isValidSnapshotShape(snap) || seen.has(snap.id)) continue;

    seen.add(snap.id);

    const validGroups = sanitizeGroups(snap.groups);
    const groupIds = new Set(validGroups.map((g) => g.id));
    const rawAliases = snap.aliases && typeof snap.aliases === "object" ? snap.aliases : {};
    const cleanExtStates = filterExtensionStates(snap.extensionStates, extensionIds);

    result.push({
      id: snap.id,
      name: snap.name.slice(0, 32).trim() || "Snapshot",
      groups: validGroups,
      assignments: sanitizeAssignments(snap.assignments, extensionIds, groupIds),
      aliases: sanitizeAliases(rawAliases, extensionIds),
      extensionStates: cleanExtStates
    });
  }

  return result;
}

function isValidSnapshotShape(snap) {
  return snap
    && typeof snap.id === "string"
    && typeof snap.name === "string"
    && Array.isArray(snap.groups)
    && snap.assignments && typeof snap.assignments === "object"
    && snap.extensionStates && typeof snap.extensionStates === "object";
}

function filterExtensionStates(rawStates, extensionIds) {
  const clean = {};
  for (const [extId, enabled] of Object.entries(rawStates)) {
    if (extensionIds.has(extId) && typeof enabled === "boolean") {
      clean[extId] = enabled;
    }
  }
  return clean;
}

async function reloadExtensionsOnly() {
  const all = await chrome.management.getAll();
  installedExtensions = all
    .filter((item) => item.type === "extension" && item.id !== chrome.runtime.id)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

async function saveState() {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state
  });
}

function getPowerClass(total, enabledCount) {
  if (total === 0) return "off";
  if (enabledCount === total) return "on";
  if (enabledCount === 0) return "off";
  return "mixed";
}

function applySort(list) {
  if (sortMode === "za") {
    list.sort((a, b) => b.name.localeCompare(a.name, "en"));
  } else if (sortMode === "enabled-first") {
    list.sort((a, b) => {
      if (a.enabled === b.enabled) return a.name.localeCompare(b.name, "en");
      return a.enabled ? -1 : 1;
    });
  } else if (sortMode === "disabled-first") {
    list.sort((a, b) => {
      if (a.enabled === b.enabled) return a.name.localeCompare(b.name, "en");
      return a.enabled ? 1 : -1;
    });
  } else {
    list.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== "tab" + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  });

  if (tabId === "groups") {
    renderGroups();
    renderExtensionRows();
  } else if (tabId === "snapshots") {
    renderSnapshots();
  }
}

function renderAll() {
  renderSnapshots();
  renderGroups();
  renderExtensionRows();
}

function renderSnapshots() {
  refs.snapshotsList.innerHTML = "";

  const atMax = state.snapshots.length >= 9;
  refs.saveSnapshotBtn.disabled = atMax;
  refs.snapshotLimitHint.classList.toggle("hidden", !atMax);

  if (!state.snapshots.length) {
    refs.snapshotsList.innerHTML = "<p class=\"snap-empty\">No snapshots saved yet.</p>";
    return;
  }

  for (const snap of state.snapshots) {
    const totalExts = Object.keys(snap.extensionStates).length;
    const enabledExts = Object.values(snap.extensionStates).filter((v) => v === true).length;
    const row = document.createElement("div");
    row.className = "snap-row";
    row.innerHTML = `
      <div class="snap-info">
        <span class="snap-name" data-rename-snapshot="${snap.id}" title="Double click to rename">${escapeHtml(snap.name)}</span>
        <span class="snap-meta">${enabledExts} of ${totalExts} enabled</span>
      </div>
      <button class="icon-btn snap-btn" data-restore-snapshot="${snap.id}" type="button" aria-label="Restore ${escapeHtml(snap.name)}" title="Restore">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="chip-delete" data-delete-snapshot="${snap.id}" type="button" aria-label="Delete snapshot ${escapeHtml(snap.name)}">X</button>
    `;
    refs.snapshotsList.append(row);
  }
}

function renderGroups() {
  refs.groupsList.innerHTML = "";

  const allCount = installedExtensions.length;
  const allEnabledCount = installedExtensions.filter((item) => item.enabled).length;
  const allPowerClass = getPowerClass(allCount, allEnabledCount);
  const allChip = document.createElement("div");
  allChip.className = "chip single";
  allChip.innerHTML = `
    <button class="chip-filter ${activeGroupFilter === "all" ? "active" : ""}" data-filter-group="all" type="button">
      All (${allCount})
    </button>
    <button class="chip-bulk icon-btn power ${allPowerClass}" data-bulk-toggle="all" type="button" aria-label="Toggle all extensions" title="Toggle all">
      ${POWER_ICON}
    </button>
  `;
  refs.groupsList.append(allChip);

  for (const group of state.groups) {
    const groupExtensions = installedExtensions.filter((item) => state.assignments[item.id] === group.id);
    const count = groupExtensions.length;
    const enabledCount = groupExtensions.filter((item) => item.enabled).length;
    const powerClass = getPowerClass(count, enabledCount);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <button class="chip-filter ${activeGroupFilter === group.id ? "active" : ""}" data-filter-group="${group.id}" type="button">
        ${escapeHtml(group.name)} (${count})
      </button>
      <button class="chip-bulk icon-btn power ${powerClass}" data-bulk-toggle="${group.id}" type="button" aria-label="Toggle ${escapeHtml(group.name)} extensions" title="Toggle group">
        ${POWER_ICON}
      </button>
      <button class="chip-delete" data-delete-group="${group.id}" type="button" aria-label="Delete group ${escapeHtml(group.name)}">X</button>
    `;

    refs.groupsList.append(chip);
  }

  refs.groupsHint.textContent = state.groups.length ? "" : "No groups yet. Create one to begin.";
}

function renderExtensionRows() {
  const query = refs.searchInput.value.trim().toLowerCase();

  const visible = installedExtensions.filter((item) => {
    const alias = (state.aliases[item.id] || "").toLowerCase();
    const inQuery = !query || item.name.toLowerCase().includes(query) || alias.includes(query);
    if (!inQuery) return false;

    if (activeGroupFilter === "all") return true;
    return state.assignments[item.id] === activeGroupFilter;
  });

  applySort(visible);

  refs.extensionsList.innerHTML = "";

  for (const extension of visible) {
    const assignedGroupId = state.assignments[extension.id] || "";
    const alias = state.aliases[extension.id] || "";
    const displayName = alias || extension.name;

    const row = document.createElement("div");
    row.className = "row";

    const groupOptions = [
      `<option value="">No group</option>`,
      ...state.groups.map(
        (group) =>
          `<option value="${group.id}" ${group.id === assignedGroupId ? "selected" : ""}>${escapeHtml(group.name)}</option>`
      )
    ].join("");

    row.innerHTML = `
      <div class="ext-main">
        <div class="name-row">
          ${renderExtensionIcon(extension)}
          <div class="name" data-alias-target="${extension.id}" title="Double click to set alias">${escapeHtml(displayName)}</div>
        </div>
        <div class="meta">${alias ? escapeHtml(extension.name) : `ID: ${extension.id.slice(0, 8)}...`}</div>
      </div>
      <div class="status-wrap" title="${extension.enabled ? "Enabled" : "Disabled"}">
        <span class="status-dot ${extension.enabled ? "on" : "off"}"></span>
      </div>
      <div>
        <select class="ctrl" data-assign="${extension.id}" aria-label="Group for ${escapeHtml(extension.name)}">
          ${groupOptions}
        </select>
      </div>
      <div class="actions">
        <button class="icon-btn power ${extension.enabled ? "on" : "off"}" data-action="toggle" data-extension="${extension.id}" type="button" aria-label="Toggle ${escapeHtml(extension.name)}" title="Toggle">
          ${POWER_ICON}
        </button>
        <button class="icon-btn gear" data-action="openOptions" data-extension="${extension.id}" type="button" aria-label="Open options for ${escapeHtml(extension.name)}" title="Options">
          ${GEAR_ICON}
        </button>
      </div>
    `;

    refs.extensionsList.append(row);
  }

  if (!visible.length) {
    refs.extensionsList.innerHTML = "<p class=\"meta\">No matches found.</p>";
  }
}

refs.groupsList.addEventListener("click", async (event) => {
  const bulkBtn = event.target.closest("button[data-bulk-toggle]");
  if (!bulkBtn) return;

  const scope = bulkBtn.dataset.bulkToggle;
  await toggleGroupExtensions(scope);
});

async function toggleGroupExtensions(scope) {
  let targetExtensions = installedExtensions;

  if (scope !== "all") {
    targetExtensions = installedExtensions.filter((item) => state.assignments[item.id] === scope);
  }

  const shouldEnable = !targetExtensions.every((item) => item.enabled);

  let label;
  if (scope === "all") {
    label = shouldEnable ? "All extensions enabled" : "All extensions disabled";
  } else {
    const group = state.groups.find((g) => g.id === scope);
    const action = shouldEnable ? "enabled" : "disabled";
    label = group ? `Group "${group.name}" ${action}` : "Group toggled";
  }

  await safeToggleMany(targetExtensions, shouldEnable);
  await reloadExtensionsOnly();
  renderAll();
  showToast(label);
}

async function safeToggleOne(extension) {
  const targetState = !extension.enabled;

  if (!targetState && extension.mayDisable === false) {
    showStatus("This extension cannot be disabled.");
    return;
  }

  try {
    await chrome.management.setEnabled(extension.id, targetState);
    const action = targetState ? "enabled" : "disabled";
    showToast(`"${extension.name}" ${action}`);
  } catch (error) {
    showStatus("Chrome blocked this toggle request.");
    console.warn("Toggle blocked", error);
  }
}

async function safeToggleMany(extensions, targetState) {
  if (!extensions.length) return;

  const candidates = targetState
    ? extensions
    : extensions.filter((item) => item.mayDisable !== false);

  if (!candidates.length) {
    showStatus("No extensions can be disabled in this group.");
    return;
  }

  const results = await Promise.allSettled(
    candidates.map((item) => chrome.management.setEnabled(item.id, targetState))
  );

  const failures = results.filter((item) => item.status === "rejected").length;
  if (failures > 0) {
    showStatus(`${failures} extension toggle(s) were blocked by Chrome.`);
  }
}

function showStatus(message) {
  refs.groupsHint.textContent = message;
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
  }

  statusTimeoutId = setTimeout(() => {
    refs.groupsHint.textContent = state.groups.length ? "" : "No groups yet. Create one to begin.";
    statusTimeoutId = null;
  }, 2600);
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  refs.toastContainer.append(toast);

  setTimeout(() => {
    toast.remove();
  }, 2250);
}

function handleGlobalShortcuts(event) {
  if (event.ctrlKey && event.key >= "1" && event.key <= "9") {
    event.preventDefault();
    const digit = Number.parseInt(event.key, 10);

    if (digit === 1) {
      toggleGroupExtensions("all");
      return;
    }

    const groupIndex = digit - 2;
    if (groupIndex >= 0 && groupIndex < state.groups.length) {
      toggleGroupExtensions(state.groups[groupIndex].id);
    }
    return;
  }

  if (event.key === "/" && !isEditableTarget(event.target)) {
    event.preventDefault();
    refs.searchInput.focus();
    refs.searchInput.select();
    return;
  }

  if (event.key !== "Escape") return;

  if (refs.confirmModal.open) {
    closeDeleteModal();
    return;
  }

  const hasSearch = refs.searchInput.value.trim().length > 0;
  const hasGroupFilter = activeGroupFilter !== "all";
  if (!hasSearch && !hasGroupFilter) return;

  refs.searchInput.value = "";
  activeGroupFilter = "all";
  renderAll();
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function renderExtensionIcon(extension) {
  const iconUrl = pickBestIconUrl(extension.icons, 15);
  if (!iconUrl) {
    return '<span class="ext-icon-fallback" aria-hidden="true"></span>';
  }

  return `<img class="ext-icon" src="${escapeHtml(iconUrl)}" alt="" loading="lazy" decoding="async" />`;
}

function pickBestIconUrl(icons, wantedSize) {
  if (!Array.isArray(icons) || icons.length === 0) return "";

  const sorted = [...icons]
    .filter((item) => item && typeof item.url === "string" && typeof item.size === "number")
    .sort((a, b) => a.size - b.size);

  if (!sorted.length) return "";

  const preferred = sorted.find((item) => item.size >= wantedSize);
  return (preferred || sorted.at(-1)).url;
}

function startAliasEdit(nameNode, extension) {
  const currentAlias = state.aliases[extension.id] || extension.name;
  const input = document.createElement("input");
  input.className = "alias-input";
  input.type = "text";
  input.maxLength = 48;
  input.value = currentAlias;

  nameNode.replaceWith(input);
  input.focus();
  input.select();

  let done = false;

  const commit = async () => {
    if (done) return;
    done = true;

    const value = input.value.trim();
    if (!value || value.toLowerCase() === extension.name.toLowerCase()) {
      delete state.aliases[extension.id];
    } else {
      state.aliases[extension.id] = value;
    }

    await saveState();
    renderExtensionRows();
  };

  const cancel = () => {
    if (done) return;
    done = true;
    renderExtensionRows();
  };

  input.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });

  input.addEventListener("blur", () => {
    commit().catch((error) => {
      console.error("Alias commit failed", error);
    });
  });
}

function closeDeleteModal() {
  if (refs.confirmModal.open) {
    refs.confirmModal.close();
  }
  pendingDeleteGroupId = null;
  pendingDeleteSnapshotId = null;
}

async function openBestPageForExtension(extension) {
  if (extension.optionsUrl) {
    await chrome.tabs.create({ url: extension.optionsUrl });
    return;
  }

  if (extension.homepageUrl) {
    await chrome.tabs.create({ url: extension.homepageUrl });
    return;
  }

  await chrome.tabs.create({ url: `chrome://extensions/?id=${extension.id}` });
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
