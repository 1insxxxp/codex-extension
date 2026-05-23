const API_BASE = "https://codex.passionapi.com";
const MESSAGE_SYNC_ALARM = "codex-message-sync";
const MESSAGE_SYNC_PERIOD_MINUTES = 15;
const STORAGE_KEYS = {
  installId: "codexInstallId",
  messageCursor: "codexMessageCursor",
  messages: "codexMessages",
  lastMessageSync: "codexLastMessageSync",
  lastMessageError: "codexLastMessageError"
};

async function enableSidePanelOnActionClick() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Older Chromium builds may expose sidePanel without supporting this behavior flag.
  }
}

function getStorage(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
}

function setStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function createInstallId() {
  if (crypto.randomUUID) {
    return `inst_${crypto.randomUUID()}`;
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `inst_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function ensureInstallId() {
  const stored = await getStorage({ [STORAGE_KEYS.installId]: "" });
  const existing = stored[STORAGE_KEYS.installId];

  if (typeof existing === "string" && existing.trim()) {
    return existing;
  }

  const installId = createInstallId();
  await setStorage({ [STORAGE_KEYS.installId]: installId });
  return installId;
}

function getLocale() {
  return chrome.i18n?.getUILanguage?.() || navigator.language || "";
}

async function registerInstall() {
  const installId = await ensureInstallId();
  const manifest = chrome.runtime.getManifest();
  const response = await fetch(`${API_BASE}/api/extension/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({
      install_id: installId,
      extension_version: manifest.version,
      locale: getLocale(),
      user_agent: navigator.userAgent || ""
    })
  });

  if (!response.ok) {
    throw new Error(`register failed: ${response.status}`);
  }

  return installId;
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object" || typeof message.id !== "string" || !message.id.trim()) {
    return null;
  }

  return {
    id: message.id.trim(),
    title: typeof message.title === "string" ? message.title : "通知",
    body: typeof message.body === "string" ? message.body : "",
    level: typeof message.level === "string" ? message.level : "info",
    url: typeof message.url === "string" ? message.url : "",
    created_at: typeof message.created_at === "string" ? message.created_at : new Date().toISOString(),
    expires_at: typeof message.expires_at === "string" ? message.expires_at : "",
    read_at: typeof message.read_at === "string" ? message.read_at : ""
  };
}

function sortMessages(messages) {
  return [...messages].sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
}

function mergeMessages(existingMessages, incomingMessages) {
  const byId = new Map();

  for (const message of existingMessages || []) {
    const normalized = normalizeMessage(message);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  }

  for (const message of incomingMessages || []) {
    const normalized = normalizeMessage(message);
    if (!normalized) {
      continue;
    }

    const existing = byId.get(normalized.id);
    byId.set(normalized.id, {
      ...existing,
      ...normalized,
      read_at: normalized.read_at || existing?.read_at || ""
    });
  }

  return sortMessages(Array.from(byId.values())).slice(0, 100);
}

async function getCachedMessages() {
  const stored = await getStorage({
    [STORAGE_KEYS.installId]: "",
    [STORAGE_KEYS.messages]: [],
    [STORAGE_KEYS.messageCursor]: "",
    [STORAGE_KEYS.lastMessageSync]: "",
    [STORAGE_KEYS.lastMessageError]: ""
  });

  return {
    ok: true,
    installId: stored[STORAGE_KEYS.installId] || "",
    messages: sortMessages(stored[STORAGE_KEYS.messages] || []),
    cursor: stored[STORAGE_KEYS.messageCursor] || "",
    lastSync: stored[STORAGE_KEYS.lastMessageSync] || "",
    error: stored[STORAGE_KEYS.lastMessageError] || ""
  };
}

async function syncMessages() {
  const installId = await ensureInstallId();
  const stored = await getStorage({
    [STORAGE_KEYS.messages]: [],
    [STORAGE_KEYS.messageCursor]: ""
  });
  const url = new URL(`${API_BASE}/api/extension/messages`);
  url.searchParams.set("install_id", installId);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`message sync failed: ${response.status}`);
  }

  const payload = await response.json();
  const existingById = new Map((stored[STORAGE_KEYS.messages] || []).map((message) => [message.id, message]));
  const messages = mergeMessages([], Array.isArray(payload.messages) ? payload.messages.map((message) => ({
    ...message,
    read_at: message.read_at || existingById.get(message.id)?.read_at || ""
  })) : []);
  const cursor = typeof payload.cursor === "string" && payload.cursor ? payload.cursor : stored[STORAGE_KEYS.messageCursor];
  const lastSync = new Date().toISOString();

  await setStorage({
    [STORAGE_KEYS.messages]: messages,
    [STORAGE_KEYS.messageCursor]: cursor,
    [STORAGE_KEYS.lastMessageSync]: lastSync,
    [STORAGE_KEYS.lastMessageError]: ""
  });

  return {
    ok: true,
    installId,
    messages,
    cursor,
    lastSync,
    error: ""
  };
}

async function safeSyncMessages() {
  try {
    await registerInstall();
    return await syncMessages();
  } catch (error) {
    await setStorage({ [STORAGE_KEYS.lastMessageError]: error instanceof Error ? error.message : "sync failed" });
    return getCachedMessages();
  }
}

async function markMessageRead(messageId) {
  if (typeof messageId !== "string" || !messageId.trim()) {
    throw new Error("invalid message id");
  }

  const installId = await ensureInstallId();
  const stored = await getStorage({ [STORAGE_KEYS.messages]: [] });
  const readAt = new Date().toISOString();
  const messages = (stored[STORAGE_KEYS.messages] || []).map((message) => (
    message?.id === messageId ? { ...message, read_at: message.read_at || readAt } : message
  ));

  await setStorage({ [STORAGE_KEYS.messages]: messages });

  try {
    await fetch(`${API_BASE}/api/extension/messages/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        install_id: installId,
        message_id: messageId,
        read_at: readAt
      })
    });
  } catch {
    return getCachedMessages();
  }

  return getCachedMessages();
}

function scheduleMessageSync() {
  chrome.alarms.create(MESSAGE_SYNC_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: MESSAGE_SYNC_PERIOD_MINUTES
  });
}

async function initializeExtension() {
  await enableSidePanelOnActionClick();
  await ensureInstallId();
  scheduleMessageSync();
  await safeSyncMessages();
}

async function handleRuntimeMessage(request) {
  if (!request || typeof request !== "object") {
    return { ok: false, error: "invalid request" };
  }

  if (request.type === "install:getId") {
    return { ok: true, installId: await ensureInstallId() };
  }

  if (request.type === "messages:get") {
    return getCachedMessages();
  }

  if (request.type === "messages:sync") {
    return safeSyncMessages();
  }

  if (request.type === "messages:markRead") {
    return markMessageRead(request.messageId);
  }

  return { ok: false, error: "unknown request" };
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MESSAGE_SYNC_ALARM) {
    safeSyncMessages();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleRuntimeMessage(request)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "request failed" });
    });
  return true;
});
