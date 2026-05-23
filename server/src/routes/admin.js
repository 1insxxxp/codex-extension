const crypto = require("node:crypto");
const express = require("express");
const path = require("node:path");
const db = require("../db");
const { login, logout, requireAdmin } = require("../auth");

const router = express.Router();
const VALID_LEVELS = new Set(["info", "success", "warning", "urgent"]);
const VALID_TARGETS = new Set(["all", "install_id"]);

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function cleanUrl(value) {
  const text = cleanString(value, 500);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function createMessageId() {
  return `msg_${crypto.randomUUID()}`;
}

function serializeMessage(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level,
    target: row.target,
    target_value: row.target_value || "",
    url: row.url || "",
    created_at: row.created_at,
    expires_at: row.expires_at || ""
  };
}

router.get("/login", (req, res) => {
  res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 - Codex 后台管理系统</title>
  <link rel="stylesheet" href="/admin/messages.css">
</head>
<body>
  <main class="login-card">
    <h1>Codex 后台管理系统</h1>
    <form method="post" action="/admin/login" class="stack">
      <label>用户名<input name="username" autocomplete="username" required></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">登录</button>
    </form>
  </main>
</body>
</html>`);
});

router.post("/login", login);
router.post("/logout", logout);

router.get("/messages", requireAdmin, (req, res) => {
  res.sendFile("messages.html", { root: path.join(__dirname, "..", "..", "public", "admin") });
});

router.get("/api/installs", requireAdmin, (req, res) => {
  res.json({ ok: true, installs: db.listInstalls() });
});

router.get("/api/messages", requireAdmin, (req, res) => {
  res.json({ ok: true, messages: db.listAdminMessages().map(serializeMessage) });
});

router.get("/api/analytics", requireAdmin, (req, res) => {
  res.json({ ok: true, analytics: db.getAnalyticsSummary() });
});

router.post("/api/messages", requireAdmin, (req, res) => {
  const title = cleanString(req.body?.title, 120);
  const body = cleanString(req.body?.body, 4000);
  const level = VALID_LEVELS.has(req.body?.level) ? req.body.level : "info";
  const target = VALID_TARGETS.has(req.body?.target) ? req.body.target : "all";
  const targetValue = target === "install_id" ? cleanString(req.body?.target_value, 128) : "";
  const url = cleanUrl(req.body?.url);
  const expiresAt = cleanString(req.body?.expires_at, 80);

  if (!title || !body) {
    res.status(400).json({ ok: false, error: "title and body are required" });
    return;
  }

  if (target === "install_id" && !targetValue) {
    res.status(400).json({ ok: false, error: "target_value is required for install_id target" });
    return;
  }

  const message = db.createMessage({
    id: createMessageId(),
    title,
    body,
    level,
    target,
    target_value: targetValue,
    url,
    created_at: nowIso(),
    expires_at: expiresAt
  });

  res.status(201).json({ ok: true, message });
});

router.delete("/api/messages/:id", requireAdmin, (req, res) => {
  const messageId = cleanString(req.params.id, 128);
  res.json({ ok: true, deleted: db.deleteMessage(messageId) });
});

module.exports = router;
