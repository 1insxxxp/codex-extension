const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");

const router = express.Router();
const VALID_EVENT_TYPES = new Set(["download_click"]);
const VALID_DOWNLOAD_PATH = /^\/extension\/releases\/[\w.-]+\.(zip|crx)$/;

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function getClientIp(req) {
  const cloudflareIp = cleanString(req.headers["cf-connecting-ip"], 200);
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const realIp = cleanString(req.headers["x-real-ip"], 200);
  if (realIp) {
    return realIp;
  }

  const forwardedFor = cleanString(req.headers["x-forwarded-for"], 200);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "";
}

function createVisitorHash(req, timestamp = new Date().toISOString()) {
  const day = timestamp.slice(0, 10);
  const userAgent = cleanString(req.headers["user-agent"], 500);
  return crypto
    .createHash("sha256")
    .update(`${day}|${getClientIp(req)}|${userAgent}`)
    .digest("hex");
}

function normalizeDownloadPath(pathValue) {
  const value = cleanString(pathValue, 500);
  return VALID_DOWNLOAD_PATH.test(value) ? value : "";
}

function recordRequestEvent(req, type, pathValue) {
  const occurredAt = new Date().toISOString();
  return db.recordAnalyticsEvent({
    type,
    path: cleanString(pathValue || req.originalUrl || req.path, 500),
    visitor_hash: createVisitorHash(req, occurredAt),
    occurred_at: occurredAt
  });
}

router.post("/event", (req, res) => {
  const type = cleanString(req.body?.type, 80);
  if (!VALID_EVENT_TYPES.has(type)) {
    res.status(400).json({ ok: false, error: "invalid analytics event type" });
    return;
  }

  recordRequestEvent(req, type, normalizeDownloadPath(req.body?.path) || "");
  res.status(204).end();
});

module.exports = {
  router,
  recordRequestEvent
};
