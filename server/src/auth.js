const crypto = require("node:crypto");

const SESSION_COOKIE = "codex_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.SESSION_SECRET || "dev-session-secret-change-me";
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSessionValue(username) {
  const payload = JSON.stringify({ username, exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifySessionValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload.username !== "string" || Number(payload.exp) <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || "admin";
  if (typeof password !== "string") {
    return false;
  }

  const actualBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  const session = verifySessionValue(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    res.redirect("/admin/login");
    return;
  }

  req.admin = session;
  next();
}

function login(req, res) {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";

  if (username !== expectedUsername || !verifyPassword(password)) {
    res.status(401).send("登录失败");
    return;
  }

  res.cookie(SESSION_COOKIE, createSessionValue(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS
  });
  res.redirect("/admin/messages");
}

function logout(req, res) {
  res.clearCookie(SESSION_COOKIE);
  res.redirect("/admin/login");
}

module.exports = {
  SESSION_COOKIE,
  login,
  logout,
  requireAdmin,
  verifySessionValue
};
