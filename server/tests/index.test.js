const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-server-test-"));
process.env.DB_PATH = path.join(testDataDir, "server.json");

const { createApp, getListenOptions } = require("../src/index");
const db = require("../src/db");

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

function resetTestDb() {
  fs.writeFileSync(process.env.DB_PATH, JSON.stringify({
    extension_installs: [],
    messages: [],
    message_reads: [],
    analytics_events: []
  }, null, 2));
}

function readTestDb() {
  return JSON.parse(fs.readFileSync(process.env.DB_PATH, "utf8"));
}

async function startTestServer(t) {
  const server = createApp().listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  return server.address().port;
}

test("getListenOptions defaults to port 3000 without a host", () => {
  const options = getListenOptions({});

  assert.deepEqual(options, { port: 3000 });
});

test("getListenOptions accepts HOST and PORT from the environment", () => {
  const options = getListenOptions({ HOST: "127.0.0.1", PORT: "3301" });

  assert.deepEqual(options, { port: 3301, host: "127.0.0.1" });
});

test("root path serves the public extension website", async (t) => {
  resetTestDb();

  const port = await startTestServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /<link rel="icon" type="image\/png" sizes="48x48" href="\/icon48\.png">/);
  assert.match(body, /<link rel="apple-touch-icon" sizes="128x128" href="\/icon128\.png">/);
  assert.match(body, /\/site\.css\?v=20260523-2/);
  assert.match(body, /codex登录验证器/);
  assert.match(body, /下载插件/);
  assert.match(body, /\/extension\/releases\/codex-login-status-extension-1\.1\.0\.zip\?v=20260523-2/);
  assert.doesNotMatch(body, /\/admin\/messages/);
});

test("root path records a page view analytics event", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { "user-agent": "analytics-test-browser" }
  });

  assert.equal(response.status, 200);
  const state = readTestDb();
  assert.equal(state.analytics_events.length, 1);
  assert.equal(state.analytics_events[0].type, "page_view");
  assert.equal(state.analytics_events[0].path, "/");
  assert.equal(typeof state.analytics_events[0].visitor_hash, "string");
  assert.ok(state.analytics_events[0].visitor_hash.length > 20);
});

test("analytics visitor hash respects proxy client IP headers", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  await fetch(`http://127.0.0.1:${port}/`, {
    headers: {
      "user-agent": "same-browser",
      "x-real-ip": "203.0.113.10"
    }
  });
  await fetch(`http://127.0.0.1:${port}/`, {
    headers: {
      "user-agent": "same-browser",
      "x-real-ip": "203.0.113.11"
    }
  });

  const summary = db.getAnalyticsSummary();

  assert.equal(summary.today.page_view, 2);
  assert.equal(summary.today.unique_visitors, 2);
});


test("public website style matches the blue gradient logo identity", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "site", "site.css"), "utf8");

  assert.match(css, /--logo-blue:\s*#0aa8ff/);
  assert.match(css, /--logo-violet:\s*#7b2cff/);
  assert.match(css, /@keyframes\s+riseIn/);
  assert.match(css, /@keyframes\s+shine/);
});

test("public website icons reuse the extension logo assets", () => {
  const projectRoot = path.join(__dirname, "..", "..");
  const siteDir = path.join(__dirname, "..", "public", "site");
  const siteIcon48 = path.join(siteDir, "icon48.png");
  const siteIcon128 = path.join(siteDir, "icon128.png");
  const rootIcon48 = path.join(projectRoot, "icon48.png");
  const rootIcon128 = path.join(projectRoot, "icon128.png");

  assert.ok(fs.statSync(siteIcon48).size > 0);
  assert.ok(fs.statSync(siteIcon128).size > 0);

  if (fs.existsSync(rootIcon48)) {
    assert.deepEqual(fs.readFileSync(siteIcon48), fs.readFileSync(rootIcon48));
  }
  if (fs.existsSync(rootIcon128)) {
    assert.deepEqual(fs.readFileSync(siteIcon128), fs.readFileSync(rootIcon128));
  }
});

test("analytics summary counts totals, today values, unique visitors, and daily rows", () => {
  resetTestDb();

  db.recordAnalyticsEvent({
    type: "page_view",
    path: "/",
    visitor_hash: "visitor-a",
    occurred_at: "2026-05-23T01:00:00.000Z"
  });
  db.recordAnalyticsEvent({
    type: "page_view",
    path: "/",
    visitor_hash: "visitor-a",
    occurred_at: "2026-05-23T02:00:00.000Z"
  });
  db.recordAnalyticsEvent({
    type: "download_click",
    path: "/extension/releases/codex-login-status-extension-1.1.0.zip",
    visitor_hash: "visitor-b",
    occurred_at: "2026-05-23T03:00:00.000Z"
  });
  db.recordAnalyticsEvent({
    type: "download_file",
    path: "/extension/releases/codex-login-status-extension-1.1.0.zip",
    visitor_hash: "visitor-b",
    occurred_at: "2026-05-22T03:00:00.000Z"
  });

  const summary = db.getAnalyticsSummary("2026-05-23T12:00:00.000Z");

  assert.deepEqual(summary.totals, {
    page_view: 2,
    download_click: 1,
    download_file: 1,
    unique_visitors: 2
  });
  assert.deepEqual(summary.today, {
    date: "2026-05-23",
    page_view: 2,
    download_click: 1,
    download_file: 0,
    unique_visitors: 2
  });
  assert.equal(summary.days.length, 7);
  assert.deepEqual(summary.days.at(-1), {
    date: "2026-05-23",
    page_view: 2,
    download_click: 1,
    download_file: 0,
    unique_visitors: 2
  });
});

test("download click event API records analytics events", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "download-click-test"
    },
    body: JSON.stringify({
      type: "download_click",
      path: "/extension/releases/codex-login-status-extension-1.1.0.zip"
    })
  });

  assert.equal(response.status, 204);
  const state = readTestDb();
  assert.equal(state.analytics_events.length, 1);
  assert.equal(state.analytics_events[0].type, "download_click");
});

test("successful download release requests record download file analytics", async (t) => {
  resetTestDb();
  const releasePath = path.join(__dirname, "..", "public", "extension", "releases", "analytics-test.zip");
  fs.writeFileSync(releasePath, "zip placeholder");
  t.after(() => fs.rmSync(releasePath, { force: true }));
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/extension/releases/analytics-test.zip`, {
    headers: { "user-agent": "download-file-test" }
  });

  assert.equal(response.status, 200);
  const state = readTestDb();
  assert.equal(state.analytics_events.length, 1);
  assert.equal(state.analytics_events[0].type, "download_file");
  assert.equal(state.analytics_events[0].path, "/extension/releases/analytics-test.zip");
});

test("missing download release requests do not count as actual downloads", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/extension/releases/missing.zip`, {
    headers: { "user-agent": "download-file-test" }
  });

  assert.equal(response.status, 404);
  const state = readTestDb();
  assert.equal(state.analytics_events.length, 0);
});

test("admin analytics API requires login", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/admin/api/analytics`);

  assert.equal(response.status, 401);
});

test("admin analytics API returns summary for logged-in admins", async (t) => {
  resetTestDb();
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "secret";
  const port = await startTestServer(t);

  const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "admin", password: "secret" })
  });
  const cookie = loginResponse.headers.get("set-cookie");

  await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "download_click" })
  });
  const response = await fetch(`http://127.0.0.1:${port}/admin/api/analytics`, {
    headers: { cookie }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.analytics.totals.download_click, 1);
  assert.equal(payload.analytics.days.length, 7);

  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

test("admin page exposes analytics dashboard inside the management system", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "messages.html"), "utf8");

  assert.match(html, /Codex 后台管理系统/);
  assert.match(html, /id="analytics"/);
  assert.match(html, /访问统计/);
});

test("admin login page uses management system branding", async (t) => {
  resetTestDb();
  const port = await startTestServer(t);

  const response = await fetch(`http://127.0.0.1:${port}/admin/login`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Codex 后台管理系统/);
});

test("landing page loads analytics script and marks download links", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "site", "index.html"), "utf8");

  assert.match(html, /data-analytics="download_click"/);
  assert.match(html, /<script src="\/site\.js\?v=20260523-1" defer><\/script>/);
});
