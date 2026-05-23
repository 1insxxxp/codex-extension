const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createElement(idOrTag) {
  const element = {
    id: idOrTag,
    tagName: String(idOrTag).toUpperCase(),
    className: "",
    disabled: false,
    hidden: false,
    textContent: "",
    value: "",
    href: "",
    target: "",
    rel: "",
    title: "",
    type: "",
    childNodes: [],
    children: [],
    addEventListener() {},
    append(...children) {
      this.childNodes.push(...children);
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.childNodes = [...children];
      this.children = [...children];
    }
  };

  return element;
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
    "copyStatus",
    "installId",
    "copyInstallId",
    "syncMessages",
    "messagesList",
    "messagesStatus"
  ];

  for (const id of ids) {
    elements.set(id, createElement(id));
  }

  const context = {
    console,
    URL,
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
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(request, callback) {
          context.__runtimeMessages.push(request);
          callback({ ok: true, installId: "inst_test", messages: [] });
        }
      }
    },
    document: {
      createElement(tagName) {
        return createElement(tagName);
      },
      getElementById(id) {
        return elements.get(id) || null;
      },
      addEventListener() {}
    },
    __runtimeMessages: []
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
  copyFullSession,
  normalizeMessages,
  renderMessages,
  getSafeMessageUrl
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

test("renderMessages shows an empty state", () => {
  const { api, elements } = loadPopup();

  api.renderMessages([]);

  const list = elements.get("messagesList");
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].className, "message-empty");
  assert.equal(list.children[0].textContent, "暂无通知。");
});

test("renderMessages renders multiple unread ticker messages as text", () => {
  const { api, elements } = loadPopup();

  api.renderMessages([
    {
      id: "msg_1",
      title: "<b>标题</b>",
      body: "<script>alert(1)</script>",
      level: "urgent",
      created_at: "2026-05-23T12:00:00.000Z"
    },
    {
      id: "msg_2",
      title: "第二条",
      body: "继续滚动",
      level: "info",
      created_at: "2026-05-23T12:01:00.000Z"
    }
  ]);

  const ticker = elements.get("messagesList").children[0];
  const firstTrack = ticker.children[0];
  const firstItem = firstTrack.children[0];
  const meta = firstItem.children[0];
  const title = firstItem.children[1];
  const body = firstItem.children[2];

  assert.equal(ticker.className, "ticker");
  assert.equal(firstTrack.children.length, 2);
  assert.match(firstItem.className, /ticker-item/);
  assert.equal(meta.textContent, "通知");
  assert.equal(title.textContent, "第二条");
  assert.equal(body.textContent, "继续滚动");
});

test("getSafeMessageUrl rejects non-http URLs", () => {
  const { api } = loadPopup();

  assert.equal(api.getSafeMessageUrl("javascript:alert(1)"), "");
  assert.equal(api.getSafeMessageUrl("https://codex.passionapi.com/a"), "https://codex.passionapi.com/a");
});
