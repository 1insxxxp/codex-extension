# Codex Auth Exporter

一个 Chrome/Chromium 扩展，用来读取当前浏览器里的 ChatGPT Web 登录状态，并生成可复制的 `auth.json`。

这个项目的主要用途是：在已经登录 ChatGPT 的浏览器环境中导出 Codex 可用的认证信息，用复制出来的 `auth.json` 覆盖 Codex 的 `auth.json`，或配置到 ccswitch 中用于切换/覆盖 `auth.json`，从而避免在 Codex 登录流程里反复进行手机接码验证。

## 功能

- 检测当前浏览器是否已登录 ChatGPT。
- 展示基础账号信息：
  - 名称
  - 邮箱
  - 套餐类型
- 生成 `auth.json`：
  - `tokens.access_token`
  - `tokens.id_token`
  - `tokens.account_id`
  - `last_refresh`
- 支持一键复制完整 `auth.json`。
- 当 ChatGPT session 没有真实 `id_token` 时，会根据账号信息生成 Codex 可解析的 synthetic `id_token`。

## 安装扩展

1. 打开 Chrome/Edge 扩展管理页：

   ```text
   chrome://extensions
   ```

2. 打开右上角「开发者模式」。

3. 点击「加载已解压的扩展程序」。

4. 选择本项目目录：

   ```text
   /Users/alien/Workspace/codex-extension
   ```

5. 在同一个浏览器用户里打开并登录：

   ```text
   https://chatgpt.com/
   ```

6. 点击扩展图标，打开侧边栏，复制生成的 `auth.json`。

## 覆盖 Codex auth.json

复制扩展侧边栏里的 `auth.json` 后，覆盖 Codex 使用的认证文件。

常见路径是：

```text
~/.codex/auth.json
```

如果你的 Codex 使用了不同的配置目录，请以实际路径为准。覆盖前建议先备份原文件：

```bash
cp ~/.codex/auth.json ~/.codex/auth.json.bak
```

然后把扩展复制出来的 JSON 内容写入 `~/.codex/auth.json`。

## 配置到 ccswitch

如果你使用 ccswitch 管理多个 Codex 账号，可以把扩展复制出的 `auth.json` 配置到 ccswitch 对应账号条目中，让 ccswitch 在切换账号时覆盖 Codex 的 `auth.json`。

推荐流程：

1. 在浏览器中登录目标 ChatGPT 账号。
2. 打开扩展侧边栏。
3. 复制 `auth.json`。
4. 将该 JSON 保存到 ccswitch 管理的对应账号配置中。
5. 使用 ccswitch 切换到该账号时，让它覆盖 Codex 的 `auth.json`。

## 注意事项

- `auth.json` 包含敏感登录凭证，请只用于自己的账号。
- 不要把复制出来的 `auth.json`、`access_token`、`id_token` 发给他人。
- ChatGPT Web session 的 token 会过期；过期后需要重新登录 ChatGPT，并重新复制新的 `auth.json`。
- 本项目只在本地浏览器扩展中运行，不需要后端服务。

## 开发调试

项目是纯静态 Chrome 扩展，没有构建步骤。

调试侧边栏脚本：

1. 打开 `chrome://extensions`。
2. 找到本扩展。
3. 点击「检查视图：sidepanel.html」。
4. 在 DevTools 中打开 `popup.js` 设置断点。

运行测试：

```bash
node --test tests/popup.test.js
```
