const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("node:path");
const adminRoutes = require("./routes/admin");
const extensionRoutes = require("./routes/extension");

const publicDir = path.join(__dirname, "..", "public");

function getListenOptions(env = process.env) {
  const port = Number(env.PORT || 3000);
  const host = typeof env.HOST === "string" && env.HOST.trim() ? env.HOST.trim() : "";

  return host ? { port, host } : { port };
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  }));
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());

  app.get("/healthz", (req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/extension", extensionRoutes);
  app.use("/admin", adminRoutes);
  app.use("/extension", express.static(path.join(publicDir, "extension"), {
    etag: true,
    maxAge: "5m",
    setHeaders(res, filePath) {
      if (filePath.endsWith("updates.xml")) {
        res.type("application/xml; charset=utf-8");
        res.setHeader("cache-control", "no-cache");
      }
    }
  }));
  app.use("/admin", express.static(path.join(publicDir, "admin"), {
    etag: true,
    maxAge: "5m"
  }));
  app.use(express.static(path.join(publicDir, "site"), {
    etag: true,
    maxAge: "5m"
  }));

  app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "site", "index.html"));
  });

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "not found" });
  });

  return app;
}

function startServer(env = process.env) {
  const app = createApp();
  const listenOptions = getListenOptions(env);

  return app.listen(listenOptions, () => {
    const hostLabel = listenOptions.host ? `${listenOptions.host}:` : "";
    console.log(`codex extension server listening on ${hostLabel}${listenOptions.port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  getListenOptions,
  startServer
};
