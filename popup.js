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

let currentSafeAuthJson = "";
let currentIdToken = "";
let currentSessionJson = "";

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
      refresh_token: "[redacted]",
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
  setStatus("logged-out", "未登录", "当前浏览器未检测到 ChatGPT 登录状态。请先打开 ChatGPT 并登录。");
}

function showLoggedIn(profile) {
  details.hidden = false;
  nameValue.textContent = displayValue(profile.name);
  emailValue.textContent = displayValue(profile.email);
  planTypeValue.textContent = displayValue(profile.planType);
  renderSafeAuthJson(profile);
  setStatus("logged-in", "已登录", "当前浏览器已登录 ChatGPT。");
}

function showError() {
  details.hidden = true;
  setCurrentSession();
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

async function copyFullSession() {
  try {
    if (!currentSessionJson) {
      copyStatus.textContent = "暂无完整 session，请先刷新状态。";
      return;
    }

    await navigator.clipboard.writeText(currentSessionJson);
    copyStatus.textContent = "已复制完整 session。";
  } catch {
    copyStatus.textContent = "复制失败，请手动复制完整 session。";
  }
}

async function checkLoginStatus() {
  refreshButton.disabled = true;
  copySessionButton.disabled = true;
  details.hidden = true;
  copyStatus.textContent = "";
  setCurrentSession();
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
    setCurrentSession(session);
    console.log(session)
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

refreshButton.addEventListener("click", checkLoginStatus);
copySessionButton.addEventListener("click", copyFullSession);
copyAuthJsonButton.addEventListener("click", copySafeAuthJson);
document.addEventListener("DOMContentLoaded", checkLoginStatus);
