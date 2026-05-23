const express = require("express");
const db = require("../db");

const router = express.Router();
const VALID_LEVELS = new Set(["info", "success", "warning", "urgent"]);

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function cleanInstallId(value) {
  return cleanString(value, 128);
}

function serializeMessage(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: VALID_LEVELS.has(row.level) ? row.level : "info",
    url: row.url || "",
    created_at: row.created_at,
    expires_at: row.expires_at || "",
    read_at: row.read_at || ""
  };
}

router.post("/register", (req, res) => {
  const installId = cleanInstallId(req.body?.install_id);
  if (!installId) {
    res.status(400).json({ ok: false, error: "install_id is required" });
    return;
  }

  const timestamp = nowIso();
  db.upsertInstall({
    id: installId,
    created_at: timestamp,
    last_seen_at: timestamp,
    extension_version: cleanString(req.body?.extension_version, 50) || "unknown",
    locale: cleanString(req.body?.locale, 50),
    user_agent: cleanString(req.body?.user_agent, 500)
  });

  res.json({ ok: true, install_id: installId, server_time: timestamp });
});

router.get("/messages", (req, res) => {
  const installId = cleanInstallId(req.query.install_id);
  if (!installId) {
    res.status(400).json({ ok: false, error: "install_id is required" });
    return;
  }

  const timestamp = nowIso();
  db.touchInstall(installId, timestamp);

  const messages = db.listMessagesForInstall(installId, timestamp).map(serializeMessage);
  const cursor = messages.reduce((latest, row) => row.created_at > latest ? row.created_at : latest, "");
  res.json({
    ok: true,
    cursor: cursor || timestamp,
    messages
  });
});

router.post("/messages/read", (req, res) => {
  const installId = cleanInstallId(req.body?.install_id);
  const messageId = cleanString(req.body?.message_id, 128);
  const readAt = cleanString(req.body?.read_at, 80) || nowIso();

  if (!installId || !messageId) {
    res.status(400).json({ ok: false, error: "install_id and message_id are required" });
    return;
  }

  db.markMessageRead(messageId, installId, readAt);
  res.json({ ok: true, message_id: messageId, read_at: readAt });
});

router.get("/latest", (req, res) => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://codex.passionapi.com";
  const version = process.env.LATEST_EXTENSION_VERSION || "1.1.0";
  const crxFile = process.env.LATEST_CRX_FILE || `codex-login-status-extension-${version}.crx`;

  res.json({
    ok: true,
    version,
    released_at: process.env.LATEST_RELEASED_AT || "2026-05-23T00:00:00.000Z",
    download_url: `${publicBaseUrl}/extension/releases/${crxFile}`,
    changelog_url: `${publicBaseUrl}/extension/releases/${version}.html`,
    force_update: process.env.LATEST_FORCE_UPDATE === "true",
    message: process.env.LATEST_MESSAGE || "新增插件内消息同步功能。"
  });
});

module.exports = router;
