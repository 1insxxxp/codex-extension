const SESSION_URL = "https://chatgpt.com/api/auth/session";
const TOKEN_KEY_PATTERN = /(token|jwt|cookie|secret|csrf|credential|authorization)/i;

const statusBadge = document.getElementById("statusBadge");
const message = document.getElementById("message");
const details = document.getElementById("details");
const nameValue = document.getElementById("name");
const emailValue = document.getElementById("email");
const planTypeValue = document.getElementById("planType");
const refreshButton = document.getElementById("refresh");
const copySessionButton = document.getElementById("copySession");
const checkedAt = document.getElementById("checkedAt");
const authJson = document.getElementById("authJson");
const copyAuthJsonButton = document.getElementById("copyAuthJson");
const copyStatus = document.getElementById("copyStatus");
const installIdValue = document.getElementById("installId");
const copyInstallIdButton = document.getElementById("copyInstallId");
const syncMessagesButton = document.getElementById("syncMessages");
const messagesList = document.getElementById("messagesList");
const messagesStatus = document.getElementById("messagesStatus");

let currentSafeAuthJson = "";
let currentIdToken = "";
let currentSessionJson = "";
let currentInstallId = "";

function setStatus(type, text, body) {
  statusBadge.className = `badge badge-${type}`;
  statusBadge.textContent = text;
  message.textContent = body;
}

function displayValue(value) {
  if (typeof value !== "string") {
    return "未返回";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "未返回";
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function updateCheckedAt() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
  checkedAt.textContent = `最近检测 ${time}`;
}

function encodeBase64UrlJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function epochSecondsFromValue(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
}

function buildSyntheticIdToken(profile) {
  if (!profile.accountId) {
    return "";
  }

  const now = Math.trunc(Date.now() / 1000);
  const expires = epochSecondsFromValue(profile.expiresAt) || now + 90 * 24 * 60 * 60;
  const authInfo = {
    chatgpt_account_id: profile.accountId
  };

  if (profile.planType) {
    authInfo.chatgpt_plan_type = profile.planType;
  }

  if (profile.userId) {
    authInfo.chatgpt_user_id = profile.userId;
    authInfo.user_id = profile.userId;
  }

  const payload = {
    iat: now,
    exp: expires,
    "https://api.openai.com/auth": authInfo
  };

  if (profile.email) {
    payload.email = profile.email;
  }

  return `${encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
}

function buildIdToken(profile) {
  return firstNonEmpty(profile.idToken, buildSyntheticIdToken(profile));
}

function buildSafeAuthJson(profile = {}) {
  const finalIdToken = buildIdToken(profile);
  const payload = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: displayValue(finalIdToken),
      access_token: displayValue(profile.accessToken),
      refresh_token: "",
      account_id: displayValue(profile.accountId)
    },
    last_refresh: new Date().toISOString()
  };

  return JSON.stringify(payload, null, 2);
}

function renderSafeAuthJson(profile = {}) {
  currentIdToken = buildIdToken(profile);
  currentSafeAuthJson = buildSafeAuthJson({ ...profile, idToken: currentIdToken });
  authJson.textContent = currentSafeAuthJson;
}

function setCurrentSession(session) {
  currentSessionJson = session && typeof session === "object" ? JSON.stringify(session, null, 2) : "";
}

function getAllowedAccountId(session) {
  const candidates = [
    session?.account?.id,
    session?.account_id,
    session?.accountId,
    session?.user?.id,
    session?.user_id,
    session?.userId
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

function getAccessToken(session) {
  const candidates = [
    session?.accessToken,
    session?.access_token,
    session?.tokens?.accessToken,
    session?.tokens?.access_token
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

function getIdToken(session) {
  return firstNonEmpty(
    session?.idToken,
    session?.id_token,
    session?.tokens?.idToken,
    session?.tokens?.id_token,
    session?.token?.idToken,
    session?.token?.id_token,
    session?.credentials?.id_token
  );
}

function getUserId(session) {
  return firstNonEmpty(
    session?.user?.id,
    session?.user_id,
    session?.userId,
    session?.chatgptUserId,
    session?.providerSpecificData?.chatgptUserId,
    session?.providerSpecificData?.chatgpt_user_id
  );
}

function getPlanType(session) {
  return firstNonEmpty(
    session?.account?.planType,
    session?.account?.plan_type,
    session?.planType,
    session?.plan_type,
    session?.providerSpecificData?.chatgptPlanType,
    session?.providerSpecificData?.chatgpt_plan_type,
    session?.credentials?.plan_type
  );
}

function getExpiresAt(session) {
  return firstNonEmpty(
    session?.expires,
    session?.expiresAt,
    session?.expired,
    session?.expires_at
  );
}

function hasUser(session) {
  return Boolean(session && typeof session === "object" && session.user && typeof session.user === "object");
}

function sanitizeSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  for (const key of Object.keys(session)) {
    if (TOKEN_KEY_PATTERN.test(key)) {
      continue;
    }
  }

  if (!hasUser(session)) {
    return null;
  }

  return {
    name: safeString(session.user.name),
    email: safeString(session.user.email),
    accountId: getAllowedAccountId(session),
    accessToken: getAccessToken(session),
    idToken: getIdToken(session),
    userId: getUserId(session),
    planType: getPlanType(session),
    expiresAt: getExpiresAt(session)
  };
}

function showLoggedOut() {
  details.hidden = true;
  nameValue.textContent = "未返回";
  emailValue.textContent = "未返回";
  planTypeValue.textContent = "未返回";
  setCurrentSession();
  renderSafeAuthJson();
  setStatus("logged-out", "未登录", "未检测到登录状态，请先登录 ChatGPT。");
}

function showLoggedIn(profile) {
  details.hidden = false;
  nameValue.textContent = displayValue(profile.name);
  emailValue.textContent = displayValue(profile.email);
  planTypeValue.textContent = displayValue(profile.planType);
  renderSafeAuthJson(profile);
  setStatus("logged-in", "已登录", "已成功获取凭证。");
}

function showError() {
  details.hidden = true;
  setCurrentSession();
  renderSafeAuthJson();
  setStatus("error", "读取失败", "状态读取失败，请检查网络或刷新重试。");
}

async function copySafeAuthJson() {
  try {
    await navigator.clipboard.writeText(currentSafeAuthJson || buildSafeAuthJson());
    copyStatus.textContent = "已复制 auth.json。";
  } catch {
    copyStatus.textContent = "复制失败，请手动选中复制。";
  }
}

async function copyFullSession() {
  try {
    if (!currentSessionJson) {
      copyStatus.textContent = "暂无 session 数据。";
      return;
    }

    await navigator.clipboard.writeText(currentSessionJson);
    copyStatus.textContent = "已复制完整 session。";
  } catch {
    copyStatus.textContent = "复制失败，请手动复制。";
  }
}

async function checkLoginStatus() {
  refreshButton.disabled = true;
  copySessionButton.disabled = true;
  details.hidden = true;
  copyStatus.textContent = "";
  setCurrentSession();
  renderSafeAuthJson();
  setStatus("checking", "检测中", "正在获取凭证...");

  try {
    const response = await fetch(SESSION_URL, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow"
    });

    if (response.status === 401 || response.status === 403) {
      showLoggedOut();
      return;
    }

    if (!response.ok) {
      showError();
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      showError();
      return;
    }

    const session = await response.json();
    setCurrentSession(session);
    const profile = sanitizeSession(session);

    if (!profile) {
      showLoggedOut();
      return;
    }

    showLoggedIn(profile);
  } catch {
    showError();
  } finally {
    updateCheckedAt();
    refreshButton.disabled = false;
    copySessionButton.disabled = false;
  }
}

function renderMessageStatus(text) {
  if (messagesStatus) {
    messagesStatus.textContent = text;
  }
}

function sendRuntimeMessage(request) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.resolve({ ok: false, error: "扩展后台不可用" });
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(request, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({ ok: false, error: lastError.message || "后台请求失败" });
          return;
        }

        resolve(response || { ok: false, error: "后台无响应" });
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : "后台请求失败" });
    }
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && item.id.trim())
    .map((item) => ({
      id: item.id.trim(),
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "通知",
      body: typeof item.body === "string" ? item.body : "",
      level: typeof item.level === "string" && item.level.trim() ? item.level.trim() : "info",
      url: typeof item.url === "string" ? item.url.trim() : "",
      created_at: typeof item.created_at === "string" ? item.created_at : "",
      expires_at: typeof item.expires_at === "string" ? item.expires_at : "",
      read_at: typeof item.read_at === "string" ? item.read_at : ""
    }))
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
}

function formatMessageTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(time));
}

function getMessageLevelText(level) {
  if (level === "urgent") {
    return "重要";
  }

  if (level === "warning") {
    return "提醒";
  }

  if (level === "success") {
    return "完成";
  }

  return "通知";
}

function getSafeMessageUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function createMessageElement(item) {
  const messageItem = document.createElement("span");
  messageItem.className = `ticker-item${item.read_at ? "" : " unread"}`;

  const level = createTextElement("span", `ticker-level message-level-${item.level}`, getMessageLevelText(item.level));
  const body = createTextElement("strong", "ticker-body", item.body || "（无正文）");
  messageItem.append(level, body);

  return messageItem;
}

function createTickerTrack(messages) {
  const track = document.createElement("div");
  track.className = "ticker-track";
  track.append(...messages.map(createMessageElement));
  return track;
}

function enableTickerMarquee(ticker, track, messages) {
  if (typeof requestAnimationFrame !== "function") {
    return;
  }

  requestAnimationFrame(() => {
    if (track.scrollWidth <= messagesList.clientWidth) {
      return;
    }

    ticker.classList.add("ticker-marquee");
    ticker.append(createTickerTrack(messages));
  });
}

function renderMessages(messages) {
  if (!messagesList) {
    return;
  }

  const normalized = normalizeMessages(messages);
  if (normalized.length === 0) {
    const empty = createTextElement("p", "message-empty", "暂无通知。");
    messagesList.replaceChildren(empty);
    return;
  }

  const unread = normalized.filter((item) => !item.read_at);
  const tickerMessages = unread.length > 0 ? unread : normalized;
  const ticker = document.createElement("div");
  const track = createTickerTrack(tickerMessages);
  ticker.className = `ticker${tickerMessages.length === 1 ? " ticker-single" : ""}`;
  ticker.append(track);
  messagesList.replaceChildren(ticker);
  enableTickerMarquee(ticker, track, tickerMessages);
}

async function loadInstallId() {
  if (!installIdValue) {
    return "";
  }

  const response = await sendRuntimeMessage({ type: "install:getId" });
  currentInstallId = response.ok && response.installId ? response.installId : "";
  installIdValue.textContent = currentInstallId || "未生成";
  return currentInstallId;
}

async function loadMessages() {
  if (!messagesList) {
    return;
  }

  const response = await sendRuntimeMessage({ type: "messages:get" });
  if (!response.ok) {
    renderMessageStatus(response.error || "消息读取失败。");
    return;
  }

  if (response.installId && installIdValue) {
    currentInstallId = response.installId;
    installIdValue.textContent = response.installId;
  }

  renderMessages(response.messages || []);
  renderMessageStatus(response.error ? "显示本地缓存，服务器同步失败。" : "");
}

async function syncMessages() {
  if (!messagesList) {
    return;
  }

  if (syncMessagesButton) {
    syncMessagesButton.disabled = true;
  }

  renderMessageStatus("正在同步消息...");

  try {
    const response = await sendRuntimeMessage({ type: "messages:sync" });
    if (!response.ok) {
      renderMessageStatus(response.error || "消息同步失败。");
      return;
    }

    if (response.installId && installIdValue) {
      currentInstallId = response.installId;
      installIdValue.textContent = response.installId;
    }

    renderMessages(response.messages || []);
    renderMessageStatus(response.error ? "显示本地缓存，服务器同步失败。" : "消息已同步。");
  } finally {
    if (syncMessagesButton) {
      syncMessagesButton.disabled = false;
    }
  }
}

async function markMessageRead(messageId) {
  const response = await sendRuntimeMessage({ type: "messages:markRead", messageId });
  if (!response.ok) {
    renderMessageStatus(response.error || "标记已读失败。");
    return;
  }

  renderMessages(response.messages || []);
  renderMessageStatus("已标记为已读。");
}

async function copyInstallId() {
  if (!currentInstallId) {
    await loadInstallId();
  }

  if (!currentInstallId) {
    renderMessageStatus("暂无安装 ID。");
    return;
  }

  try {
    await navigator.clipboard.writeText(currentInstallId);
    renderMessageStatus("已复制安装 ID。");
  } catch {
    renderMessageStatus("复制安装 ID 失败。");
  }
}

function initializeMessages() {
  loadInstallId();
  loadMessages().then(syncMessages);
}

refreshButton.addEventListener("click", checkLoginStatus);
copySessionButton.addEventListener("click", copyFullSession);
copyAuthJsonButton.addEventListener("click", copySafeAuthJson);
syncMessagesButton?.addEventListener("click", syncMessages);
copyInstallIdButton?.addEventListener("click", copyInstallId);
document.addEventListener("DOMContentLoaded", () => {
  checkLoginStatus();
  initializeMessages();
});
