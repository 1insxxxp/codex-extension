const SESSION_URL = "https://chatgpt.com/api/auth/session";
const TOKEN_KEY_PATTERN = /(token|jwt|cookie|secret|csrf|credential|authorization)/i;

const statusBadge = document.getElementById("statusBadge");
const message = document.getElementById("message");
const details = document.getElementById("details");
const nameValue = document.getElementById("name");
const emailValue = document.getElementById("email");
const accountIdValue = document.getElementById("accountId");
const refreshButton = document.getElementById("refresh");
const checkedAt = document.getElementById("checkedAt");
const authJson = document.getElementById("authJson");
const copyAuthJsonButton = document.getElementById("copyAuthJson");
const copyStatus = document.getElementById("copyStatus");

let currentSafeAuthJson = "";

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

function updateCheckedAt() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
  checkedAt.textContent = `最近检测 ${time}`;
}

function buildSafeAuthJson(accountId = "") {
  const payload = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: "[redacted]",
      access_token: "[redacted]",
      refresh_token: "[redacted]",
      account_id: displayValue(accountId)
    },
    last_refresh: new Date().toISOString()
  };

  return JSON.stringify(payload, null, 2);
}

function renderSafeAuthJson(accountId = "") {
  currentSafeAuthJson = buildSafeAuthJson(accountId);
  authJson.textContent = currentSafeAuthJson;
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
    accountId: getAllowedAccountId(session)
  };
}

function showLoggedOut() {
  details.hidden = true;
  nameValue.textContent = "未返回";
  emailValue.textContent = "未返回";
  accountIdValue.textContent = "未返回";
  renderSafeAuthJson();
  setStatus("logged-out", "未登录", "当前浏览器未检测到 ChatGPT 登录状态。请先打开 ChatGPT 并登录。");
}

function showLoggedIn(profile) {
  details.hidden = false;
  nameValue.textContent = displayValue(profile.name);
  emailValue.textContent = displayValue(profile.email);
  accountIdValue.textContent = displayValue(profile.accountId);
  renderSafeAuthJson(profile.accountId);
  setStatus("logged-in", "已登录", "当前浏览器已登录 ChatGPT。");
}

function showError() {
  details.hidden = true;
  renderSafeAuthJson();
  setStatus("error", "无法检测", "无法读取 ChatGPT 登录状态。请确认已能正常打开 ChatGPT，然后重试。");
}

async function copySafeAuthJson() {
  try {
    await navigator.clipboard.writeText(currentSafeAuthJson || buildSafeAuthJson());
    copyStatus.textContent = "已复制 auth.json。";
  } catch {
    copyStatus.textContent = "复制失败，请手动选中 JSON 内容复制。";
  }
}

async function checkLoginStatus() {
  refreshButton.disabled = true;
  details.hidden = true;
  copyStatus.textContent = "";
  renderSafeAuthJson();
  setStatus("checking", "检测中", "正在检测当前浏览器的 ChatGPT 登录状态...");

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
  }
}

refreshButton.addEventListener("click", checkLoginStatus);
copyAuthJsonButton.addEventListener("click", copySafeAuthJson);
document.addEventListener("DOMContentLoaded", checkLoginStatus);
