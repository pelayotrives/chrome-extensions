const STORAGE_KEY = "hubState";

const refs = {
  createGroupBtn: document.getElementById("createGroupBtn"),
  groupName: document.getElementById("groupName"),
  groupsList: document.getElementById("groupsList"),
  groupsHint: document.getElementById("groupsHint"),
  searchInput: document.getElementById("searchInput"),
  openChromeExtensionsBtn: document.getElementById("openChromeExtensionsBtn"),
  extensionsList: document.getElementById("extensionsList"),
  confirmModal: document.getElementById("confirmModal"),
  confirmText: document.getElementById("confirmText"),
  cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
  confirmDeleteBtn: document.getElementById("confirmDeleteBtn")
};

let installedExtensions = [];
let state = {
  groups: [],
  assignments: {},
  aliases: {}
};
let activeGroupFilter = "all";
let pendingDeleteGroupId = null;
let statusTimeoutId = null;

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
  refs.createGroupBtn.addEventListener("click", handleCreateGroup);
  refs.searchInput.addEventListener("input", renderExtensionRows);
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
    refs.confirmText.textContent = `Delete group "${group.name}" and clear related assignments?`;
    refs.confirmModal.showModal();
  });

  refs.cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  refs.confirmDeleteBtn.addEventListener("click", async () => {
    if (!pendingDeleteGroupId) {
      closeDeleteModal();
      return;
    }

    const groupId = pendingDeleteGroupId;
    pendingDeleteGroupId = null;
    closeDeleteModal();

    state.groups = state.groups.filter((group) => group.id !== groupId);

    for (const [extensionId, assignedGroupId] of Object.entries(state.assignments)) {
      if (assignedGroupId === groupId) {
        delete state.assignments[extensionId];
      }
    }

    if (activeGroupFilter === groupId) {
      activeGroupFilter = "all";
    }

    await saveState();
    renderAll();
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
    aliases: sanitizeAliases(rawAliases, extensionIds)
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

function renderAll() {
  renderGroups();
  renderExtensionRows();
}

function renderGroups() {
  refs.groupsList.innerHTML = "";

  const allCount = installedExtensions.length;
  const allEnabled = installedExtensions.length > 0 && installedExtensions.every((item) => item.enabled);
  const allChip = document.createElement("div");
  allChip.className = "chip single";
  allChip.innerHTML = `
    <button class="chip-filter ${activeGroupFilter === "all" ? "active" : ""}" data-filter-group="all" type="button">
      All (${allCount})
    </button>
    <button class="chip-bulk icon-btn power ${allEnabled ? "on" : "off"}" data-bulk-toggle="all" type="button" aria-label="Toggle all extensions" title="Toggle all">
      ${POWER_ICON}
    </button>
  `;
  refs.groupsList.append(allChip);

  for (const group of state.groups) {
    const groupExtensions = installedExtensions.filter((item) => state.assignments[item.id] === group.id);
    const count = groupExtensions.length;
    const allInGroupEnabled = count > 0 && groupExtensions.every((item) => item.enabled);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <button class="chip-filter ${activeGroupFilter === group.id ? "active" : ""}" data-filter-group="${group.id}" type="button">
        ${escapeHtml(group.name)} (${count})
      </button>
      <button class="chip-bulk icon-btn power ${allInGroupEnabled ? "on" : "off"}" data-bulk-toggle="${group.id}" type="button" aria-label="Toggle ${escapeHtml(group.name)} extensions" title="Toggle group">
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
  let targetExtensions = installedExtensions;

  if (scope !== "all") {
    targetExtensions = installedExtensions.filter((item) => state.assignments[item.id] === scope);
  }

  const shouldEnable = !targetExtensions.every((item) => item.enabled);
  await safeToggleMany(targetExtensions, shouldEnable);
  await reloadExtensionsOnly();
  renderAll();
});

async function safeToggleOne(extension) {
  const targetState = !extension.enabled;

  if (!targetState && extension.mayDisable === false) {
    showStatus("This extension cannot be disabled.");
    return;
  }

  try {
    await chrome.management.setEnabled(extension.id, targetState);
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

function handleGlobalShortcuts(event) {
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
