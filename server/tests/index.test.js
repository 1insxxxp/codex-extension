const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");

const { createApp, getListenOptions } = require("../src/index");

test("getListenOptions defaults to port 3000 without a host", () => {
  const options = getListenOptions({});

  assert.deepEqual(options, { port: 3000 });
});

test("getListenOptions accepts HOST and PORT from the environment", () => {
  const options = getListenOptions({ HOST: "127.0.0.1", PORT: "3301" });

  assert.deepEqual(options, { port: 3301, host: "127.0.0.1" });
});

test("root path serves the public extension website", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /<link rel="icon" type="image\/png" sizes="48x48" href="\/icon48\.png">/);
  assert.match(body, /<link rel="apple-touch-icon" sizes="128x128" href="\/icon128\.png">/);
  assert.match(body, /\/site\.css\?v=20260523-2/);
  assert.match(body, /codex登录验证器/);
  assert.match(body, /下载插件/);
  assert.match(body, /\/extension\/releases\/codex-login-status-extension-1\.1\.0\.zip/);
  assert.doesNotMatch(body, /\/admin\/messages/);
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

  assert.deepEqual(
    fs.readFileSync(path.join(siteDir, "icon48.png")),
    fs.readFileSync(path.join(projectRoot, "icon48.png"))
  );
  assert.deepEqual(
    fs.readFileSync(path.join(siteDir, "icon128.png")),
    fs.readFileSync(path.join(projectRoot, "icon128.png"))
  );
});
