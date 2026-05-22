const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createElement(id) {
  return {
    id,
    className: "",
    disabled: false,
    hidden: false,
    textContent: "",
    value: "",
    addEventListener() {}
  };
}

function loadPopup() {
  const elements = new Map();
  const ids = [
    "statusBadge",
    "message",
    "details",
    "name",
    "email",
    "planType",
    "accountId",
    "accessToken",
    "refresh",
    "copySession",
    "checkedAt",
    "authJson",
    "copyAuthJson",
    "copyStatus"
  ];

  for (const id of ids) {
    elements.set(id, createElement(id));
  }

  const context = {
    console,
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    TextEncoder,
    fetch: async () => {
      throw new Error("fetch should not run in unit tests");
    },
    Intl,
    Date,
    navigator: {
      clipboard: {
        async writeText(value) {
          context.__copiedText = value;
        }
      }
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      addEventListener() {}
    }
  };

  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");
  vm.runInNewContext(
    `${source}
globalThis.__popup = {
  sanitizeSession,
  buildSafeAuthJson,
  buildIdToken,
  showLoggedIn,
  copySafeAuthJson,
  setCurrentSession,
  copyFullSession
};`,
    context
  );

  return { api: context.__popup, elements, context };
}

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

test("sanitizeSession includes accessToken from session response", () => {
  const { api } = loadPopup();

  const profile = api.sanitizeSession({
    user: {
      name: "Ada",
      email: "ada@example.com"
    },
    account: {
      id: "acct_123"
    },
    accessToken: "sk-session-token"
  });

  assert.equal(profile.name, "Ada");
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.accountId, "acct_123");
  assert.equal(profile.accessToken, "sk-session-token");
});

test("buildSafeAuthJson writes the real access token", () => {
  const { api } = loadPopup();

  const payload = JSON.parse(api.buildSafeAuthJson({
    accountId: "acct_123",
    accessToken: "sk-session-token",
    idToken: "id-token"
  }));

  assert.equal(payload.tokens.account_id, "acct_123");
  assert.equal(payload.tokens.access_token, "sk-session-token");
  assert.equal(payload.tokens.id_token, "id-token");
});

test("buildIdToken prefers a real id token from the session", () => {
  const { api } = loadPopup();

  const idToken = api.buildIdToken({
    idToken: "real-id-token",
    email: "ada@example.com",
    accountId: "acct_123"
  });

  assert.equal(idToken, "real-id-token");
});

test("buildIdToken creates a synthetic Codex-compatible id token when missing", () => {
  const { api } = loadPopup();

  const idToken = api.buildIdToken({
    email: "ada@example.com",
    accountId: "acct_123",
    userId: "user_123",
    planType: "plus",
    expiresAt: "2030-01-01T00:00:00.000Z"
  });
  const payload = decodeJwtPayload(idToken);

  assert.match(idToken, /\.synthetic$/);
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.exp, 1893456000);
  assert.equal(payload["https://api.openai.com/auth"].chatgpt_account_id, "acct_123");
  assert.equal(payload["https://api.openai.com/auth"].chatgpt_user_id, "user_123");
  assert.equal(payload["https://api.openai.com/auth"].chatgpt_plan_type, "plus");
});

test("showLoggedIn renders name, email, and plan type in the details view", () => {
  const { api, elements } = loadPopup();

  api.showLoggedIn({
    name: "Ada",
    email: "ada@example.com",
    accountId: "acct_123",
    accessToken: "sk-session-token",
    idToken: "id-token",
    planType: "plus"
  });

  assert.equal(elements.get("name").textContent, "Ada");
  assert.equal(elements.get("email").textContent, "ada@example.com");
  assert.equal(elements.get("planType").textContent, "plus");
  assert.equal(elements.get("accountId").textContent, "");
  assert.equal(elements.get("accessToken").textContent, "");
});

test("copySafeAuthJson copies auth.json with id_token", async () => {
  const { api, elements, context } = loadPopup();

  api.showLoggedIn({
    name: "Ada",
    email: "ada@example.com",
    accountId: "acct_123",
    idToken: "id-token"
  });

  await api.copySafeAuthJson();

  const payload = JSON.parse(context.__copiedText);
  assert.equal(payload.tokens.id_token, "id-token");
  assert.equal(elements.get("copyStatus").textContent, "已复制 auth.json。");
});

test("copyFullSession copies the raw session response", async () => {
  const { api, elements, context } = loadPopup();
  const session = {
    user: {
      name: "Ada",
      email: "ada@example.com"
    },
    account: {
      id: "acct_123",
      planType: "plus"
    },
    accessToken: "sk-session-token",
    nested: {
      value: true
    }
  };

  api.setCurrentSession(session);
  await api.copyFullSession();

  assert.deepEqual(JSON.parse(context.__copiedText), session);
  assert.equal(elements.get("copyStatus").textContent, "已复制完整 session。");
});
