const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("node:path");
const adminRoutes = require("./routes/admin");
const extensionRoutes = require("./routes/extension");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");

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

app.get("/", (req, res) => {
  res.redirect("/admin/messages");
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not found" });
});

app.listen(port, () => {
  console.log(`codex extension server listening on ${port}`);
});
