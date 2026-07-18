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
  toastContainer: document.getElementById("toastContainer"),
  createSupergroupBtn: document.getElementById("createSupergroupBtn"),
  supergroupForm: document.getElementById("supergroupForm"),
  supergroupName: document.getElementById("supergroupName"),
  supergroupOptions: document.getElementById("supergroupOptions"),
  confirmSupergroupBtn: document.getElementById("confirmSupergroupBtn"),
  supergroupsList: document.getElementById("supergroupsList")
};

let installedExtensions = [];
let state = {
  groups: [],
  assignments: {},
  aliases: {},
  snapshots: [],
  supergroups: []
};
let activeGroupFilter = "all";
let activeSupergroupFilter = null;
let sgClickTimer = null;
let groupClickTimer = null;
let pendingDeleteGroupId = null;
let pendingDeleteSnapshotId = null;
let pendingDeleteSupergroupId = null;
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
  const vLabel = document.getElementById("versionLabel");
  if (vLabel) {
    vLabel.textContent = "v" + chrome.runtime.getManifest().version;
  }
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

  const exportBtn = document.getElementById("exportConfigBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportConfig);
  }
  const importBtn = document.getElementById("importConfigBtn");
  const importFile = document.getElementById("importFileInput");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", handleImportConfig);
  }

  refs.groupsList.addEventListener("dragover", (event) => {
    event.preventDefault();
    const target = event.target.closest("[data-drop-group]");
    refs.groupsList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (target) target.classList.add("drag-over");
  });

  refs.groupsList.addEventListener("dragleave", (event) => {
    const target = event.target.closest("[data-drop-group]");
    if (target) target.classList.remove("drag-over");
  });

  refs.groupsList.addEventListener("drop", async (event) => {
    event.preventDefault();
    refs.groupsList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));

    const extensionId = event.dataTransfer.getData("text/extensio-ext-id");
    if (!extensionId) return;

    const target = event.target.closest("[data-drop-group]");
    if (!target) return;

    const groupId = target.dataset.dropGroup;
    if (groupId) {
      state.assignments[extensionId] = groupId;
    } else {
      delete state.assignments[extensionId];
    }

    await saveState();
    renderGroups();
    renderExtensionRows();
    showToast(groupId ? "Extension assigned to group" : "Extension removed from group");
  });

  refs.createSupergroupBtn.addEventListener("click", () => {
    const form = refs.supergroupForm;
    const visible = form.style.display !== "none";
    form.style.display = visible ? "none" : "block";
    renderSupergroups();
  });

  refs.supergroupOptions.addEventListener("click", (event) => {
    const chip = event.target.closest(".sg-chip");
    if (!chip) return;
    chip.classList.toggle("active");
  });

  refs.confirmSupergroupBtn.addEventListener("click", async () => {
    const name = refs.supergroupName.value.trim();
    if (!name) return;
    const activeChips = refs.supergroupOptions.querySelectorAll(".sg-chip.active");
    const groupIds = [...activeChips].map((c) => c.dataset.sgGroup);
    if (!groupIds.length) return;

    state.supergroups.push({
      id: crypto.randomUUID(),
      name,
      groupIds
    });

    refs.supergroupForm.style.display = "none";
    await saveState();
    renderSupergroups();
    showToast(`Supergroup "${name}" created`);
  });

  refs.supergroupsList.addEventListener("click", async (event) => {
    const filterBtn = event.target.closest("button[data-filter-supergroup]");
    if (filterBtn) {
      if (sgClickTimer) clearTimeout(sgClickTimer);
      const sgId = filterBtn.dataset.filterSupergroup;
      sgClickTimer = setTimeout(() => {
        if (activeSupergroupFilter === sgId) {
          activeSupergroupFilter = null;
        } else {
          activeSupergroupFilter = sgId;
        }
        renderAll();
        sgClickTimer = null;
      }, 250);
      return;
    }

    const bulkBtn = event.target.closest("button[data-bulk-supergroup]");
    if (bulkBtn) {
      await toggleSupergroup(bulkBtn.dataset.bulkSupergroup);
      return;
    }

    const deleteBtn = event.target.closest("button[data-delete-supergroup]");
    if (deleteBtn) {
      const sgId = deleteBtn.dataset.deleteSupergroup;
      const sg = state.supergroups.find((s) => s.id === sgId);
      if (!sg) return;

      pendingDeleteGroupId = null;
      pendingDeleteSnapshotId = null;
      pendingDeleteSupergroupId = sgId;
      refs.confirmTitle.textContent = "Delete supergroup";
      refs.confirmText.textContent = `Delete supergroup "${sg.name}"? This action cannot be undone.`;
      refs.confirmModal.showModal();
    }
  });

  refs.openChromeExtensionsBtn.addEventListener("click", async () => {
    await chrome.tabs.create({ url: "chrome://extensions/" });
  });
  document.addEventListener("keydown", handleGlobalShortcuts);

  refs.groupsList.addEventListener("click", async (event) => {
    const filterBtn = event.target.closest("button[data-filter-group]");
    if (filterBtn) {
      if (groupClickTimer) clearTimeout(groupClickTimer);
      const groupId = filterBtn.dataset.filterGroup || "all";
      groupClickTimer = setTimeout(() => {
        activeGroupFilter = groupId;
        activeSupergroupFilter = null;
        renderAll();
        groupClickTimer = null;
      }, 250);
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
    const deletingSupergroup = pendingDeleteSupergroupId;

    pendingDeleteGroupId = null;
    pendingDeleteSnapshotId = null;
    pendingDeleteSupergroupId = null;
    closeDeleteModal();

    if (deletingSupergroup) {
      const sgName = state.supergroups.find((s) => s.id === deletingSupergroup)?.name || "Supergroup";
      state.supergroups = state.supergroups.filter((s) => s.id !== deletingSupergroup);
      await saveState();
      renderAll();
      showToast(`Supergroup "${sgName}" deleted`);
      return;
    }

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

      for (const sg of state.supergroups) {
        sg.groupIds = sg.groupIds.filter((gid) => gid !== deletingGroup);
      }
      state.supergroups = state.supergroups.filter((sg) => sg.groupIds.length > 0);

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
      renderSupergroups();
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

  refs.groupsList.addEventListener("dblclick", (event) => {
    if (groupClickTimer) { clearTimeout(groupClickTimer); groupClickTimer = null; }
    const btn = event.target.closest("[data-rename-group]");
    if (!btn) return;
    const group = state.groups.find((g) => g.id === btn.dataset.renameGroup);
    if (!group) return;

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 32;
    input.value = group.name;
    input.style.width = btn.offsetWidth + "px";
    input.style.fontSize = "12px";
    btn.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (newName) group.name = newName;
      await saveState();
      renderGroups();
      renderSupergroups();
      renderExtensionRows();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      renderGroups();
      renderSupergroups();
      renderExtensionRows();
    };
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") { e.preventDefault(); await commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", () => { commit(); });
  });

  refs.supergroupsList.addEventListener("dblclick", (event) => {
    if (sgClickTimer) { clearTimeout(sgClickTimer); sgClickTimer = null; }
    const btn = event.target.closest("[data-rename-supergroup]");
    if (!btn) return;
    const sg = state.supergroups.find((s) => s.id === btn.dataset.renameSupergroup);
    if (!sg) return;

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 32;
    input.value = sg.name;
    input.style.width = btn.offsetWidth + "px";
    input.style.fontSize = "12px";
    btn.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (newName) sg.name = newName;
      await saveState();
      renderSupergroups();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      renderSupergroups();
    };
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") { e.preventDefault(); await commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", () => { commit(); });
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
  triggerFlash();
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

function handleExportConfig() {
  const data = {
    groups: state.groups,
    supergroups: state.supergroups,
    assignments: state.assignments,
    aliases: state.aliases,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "extensio-patronus-config.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Configuration exported");
}

async function handleImportConfig() {
  const fileInput = document.getElementById("importFileInput");
  const file = fileInput?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.groups)) {
      state.groups = sanitizeGroups(data.groups);
    }
    if (Array.isArray(data.supergroups)) {
      const groupIds = new Set(state.groups.map((g) => g.id));
      state.supergroups = data.supergroups
        .filter((sg) => sg && typeof sg.id === "string" && typeof sg.name === "string" && Array.isArray(sg.groupIds))
        .map((sg) => ({
          id: sg.id,
          name: sg.name.slice(0, 32).trim() || "Supergroup",
          groupIds: sg.groupIds.filter((gid) => groupIds.has(gid))
        }))
        .filter((sg) => sg.groupIds.length > 0);
    }
    if (data.assignments && typeof data.assignments === "object") {
      const extensionIds = new Set(installedExtensions.map((ext) => ext.id));
      const groupIds = new Set(state.groups.map((g) => g.id));
      state.assignments = sanitizeAssignments(data.assignments, extensionIds, groupIds);
    }
    if (data.aliases && typeof data.aliases === "object") {
      const extensionIds = new Set(installedExtensions.map((ext) => ext.id));
      state.aliases = sanitizeAliases(data.aliases, extensionIds);
    }
    await saveState();
    renderAll();
    showToast("Configuration imported");
  } catch {
    showToast("Invalid configuration file");
  }
  fileInput.value = "";
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
    ),
    supergroups: sanitizeSupergroups(
      Array.isArray(maybeState?.supergroups) ? maybeState.supergroups : [],
      groupIds
    )
  };
}

function sanitizeSupergroups(rawSupergroups, groupIds) {
  const seen = new Set();
  const result = [];
  for (const sg of rawSupergroups) {
    if (!sg || typeof sg.id !== "string" || typeof sg.name !== "string") continue;
    if (seen.has(sg.id)) continue;
    if (!Array.isArray(sg.groupIds)) continue;
    seen.add(sg.id);
    result.push({
      id: sg.id,
      name: sg.name.slice(0, 32).trim() || "Supergroup",
      groupIds: sg.groupIds.filter((gid) => groupIds.has(gid))
    });
  }
  return result;
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
    renderSupergroups();
    renderExtensionRows();
  } else if (tabId === "snapshots") {
    renderSnapshots();
  }
}

function renderAll() {
  renderGroups();
  renderSupergroups();
  renderSnapshots();
  renderExtensionRows();
}

function renderSnapshots() {
  if (!refs.snapshotsList || !refs.saveSnapshotBtn || !refs.snapshotLimitHint) return;

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
  if (!refs.groupsList) return;

  refs.groupsList.innerHTML = "";

  const visibleGroups = activeSupergroupFilter
    ? state.groups.filter((g) => {
        const sg = state.supergroups.find((s) => s.id === activeSupergroupFilter);
        return sg?.groupIds.includes(g.id);
      })
    : state.groups;

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

  for (const group of visibleGroups) {
    const groupExtensions = installedExtensions.filter((item) => state.assignments[item.id] === group.id);
    const count = groupExtensions.length;
    const enabledCount = groupExtensions.filter((item) => item.enabled).length;
    const powerClass = getPowerClass(count, enabledCount);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.dropGroup = group.id;
    chip.innerHTML = `
      <button class="chip-filter ${activeGroupFilter === group.id ? "active" : ""}" data-filter-group="${group.id}" data-rename-group="${group.id}" title="Double click to rename" type="button">
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

function renderSupergroups() {
  if (!refs.supergroupsList || !refs.createSupergroupBtn || !refs.supergroupForm) return;

  refs.supergroupsList.innerHTML = "";

  const visible = refs.supergroupForm.style.display !== "none";
  refs.createSupergroupBtn.textContent = visible ? "Cancel" : "New supergroup";

  if (visible && state.groups.length) {
    refs.supergroupOptions.innerHTML = state.groups.map((g) =>
      `<button class="sg-chip" data-sg-group="${g.id}" type="button">${escapeHtml(g.name)}</button>`
    ).join("");
  }

  for (const sg of state.supergroups) {
    const containedGroups = sg.groupIds
      .map((gid) => state.groups.find((g) => g.id === gid))
      .filter(Boolean);

    const allExts = installedExtensions.filter((ext) =>
      containedGroups.some((cg) => state.assignments[ext.id] === cg.id)
    );
    const count = allExts.length;
    const enabledCount = allExts.filter((e) => e.enabled).length;
    const powerClass = getPowerClass(count, enabledCount);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <button class="chip-filter ${activeSupergroupFilter === sg.id ? "active" : ""}" data-filter-supergroup="${sg.id}" data-rename-supergroup="${sg.id}" title="Click to filter, double click to rename" type="button">
        ${escapeHtml(sg.name)}
      </button>
      <button class="chip-bulk icon-btn power ${powerClass}" data-bulk-supergroup="${sg.id}" type="button" aria-label="Toggle ${escapeHtml(sg.name)}" title="Toggle supergroup">
        ${POWER_ICON}
      </button>
      <button class="chip-delete" data-delete-supergroup="${sg.id}" type="button" aria-label="Delete supergroup ${escapeHtml(sg.name)}">X</button>
    `;
    refs.supergroupsList.append(chip);
  }
}

function renderExtensionRows() {
  if (!refs.extensionsList || !refs.searchInput) return;

  const query = refs.searchInput.value.trim().toLowerCase();

  const visible = installedExtensions.filter((item) => {
    const alias = (state.aliases[item.id] || "").toLowerCase();
    const inQuery = !query || item.name.toLowerCase().includes(query) || alias.includes(query);
    if (!inQuery) return false;

    if (activeSupergroupFilter) {
      const sg = state.supergroups.find((s) => s.id === activeSupergroupFilter);
      if (sg) return sg.groupIds.includes(state.assignments[item.id]);
      return false;
    }
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
    row.draggable = true;
    row.dataset.dragExt = extension.id;
    row.addEventListener("dragstart", handleDragStart);
    row.addEventListener("dragend", handleDragEnd);

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

async function toggleSupergroup(sgId) {
  const sg = state.supergroups.find((s) => s.id === sgId);
  if (!sg) return;

  const extIds = new Set();
  for (const gid of sg.groupIds) {
    for (const [eid, groupId] of Object.entries(state.assignments)) {
      if (groupId === gid) extIds.add(eid);
    }
  }
  const exts = installedExtensions.filter((e) => extIds.has(e.id));
  const shouldEnable = !exts.every((e) => e.enabled);
  await safeToggleMany(exts, shouldEnable);
  await reloadExtensionsOnly();
  renderGroups();
  renderSupergroups();
  renderExtensionRows();
  showToast(`Supergroup "${sg.name}" ${shouldEnable ? "enabled" : "disabled"}`);
}

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

function triggerFlash() {
  const overlay = document.createElement("div");
  overlay.className = "flash-overlay";
  document.body.append(overlay);
  setTimeout(() => overlay.remove(), 320);
}

function handleDragStart(event) {
  const row = event.currentTarget;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/extensio-ext-id", row.dataset.dragExt);
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
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
  const hasGroupFilter = activeGroupFilter !== "all" || activeSupergroupFilter;
  if (!hasSearch && !hasGroupFilter) return;

  refs.searchInput.value = "";
  activeGroupFilter = "all";
  activeSupergroupFilter = null;
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
  pendingDeleteSupergroupId = null;
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
