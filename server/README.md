# Codex 扩展消息后台

这个目录提供 `https://codex.passionapi.com` 可部署的 Node.js 服务，用于：

- 注册插件安装 ID。
- 群发或按安装 ID 定向发送插件内消息。
- 提供自托管 CRX 更新清单和发布文件静态目录。

## 本地启动

```bash
cd server
npm install
cp .env.example .env
npm start
```

默认监听 `PORT=3000`。

## 环境变量

参考 `.env.example`：

- `PUBLIC_BASE_URL`：公网域名，例如 `https://codex.passionapi.com`。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：管理后台登录账号。
- `SESSION_SECRET`：管理登录 cookie 签名密钥。
- `DB_PATH`：JSON 数据文件路径，默认 `server/data/server.json`。
- `EXTENSION_ID`：打包后稳定扩展 ID。
- `LATEST_EXTENSION_VERSION`：当前发布版本。
- `LATEST_CRX_FILE`：CRX 文件名。

不要把真实 `.env` 或打包私钥提交到仓库。

## 管理页面

启动后访问：

```text
/admin/messages
```

可创建：

- 全部用户消息。
- 指定安装 ID 消息。

插件侧边栏会展示安装 ID，可复制后用于定向推送。

## 自托管更新

静态目录：

```text
public/extension/updates.xml
public/extension/releases/
```

发布新版本时：

1. 使用同一个私钥打包 CRX，保持扩展 ID 不变。
2. 将 CRX 放到 `public/extension/releases/`。
3. 更新 `public/extension/updates.xml` 中的 `appid`、`codebase` 和 `version`。
4. 同步更新扩展 `manifest.json` 的 `version`。

普通 Chrome 对非商店自托管更新有限制，请优先在企业策略、开发者模式或允许外部更新的 Chromium 环境中使用。
