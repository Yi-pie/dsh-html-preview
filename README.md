# 🖼 dsh-html-preview

<p align="center">
  <b>HTML 预览 · 直接改文案 · 区域批注给 AI · 整页缩放 · 会话悬浮窗</b><br>
  <i>HTML preview · in-place copy editing · region annotation for AI · page zoom · floating conversation</i>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-html-preview"><img src="https://img.shields.io/npm/v/dsh-html-preview" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-html-preview"><img src="https://img.shields.io/npm/dm/dsh-html-preview" alt="npm downloads"></a>
  <a href="https://github.com/Yi-pie/dsh-html-preview/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Yi-pie/dsh-html-preview" alt="license"></a>
  <a href="https://github.com/Yi-pie/dsh-html-preview"><img src="https://img.shields.io/github/stars/Yi-pie/dsh-html-preview" alt="stars"></a>
</p>

**DeepSeek Harness (DSH) Web 插件**：把"所见即所得"的 HTML 预览、直接改文案、框选区域批注与 AI 协同带进会话。对标 Trae Work 的 HTML 产物管理与 Codex 桌面端内置浏览器——让 AI 生成的页面可以被**实时查看、随手修改、圈选批注**。

**A plugin for the DeepSeek Harness (DSH) Web GUI** that brings live HTML preview, in-place copy editing, region annotation for the AI, and a floating conversation window into your session — inspired by Trae Work's HTML artifacts and Codex desktop's built-in browser.

---

## ✨ 功能 / Features

| 功能 | 说明 | Feature |
|---|---|---|
| 🖼 停靠式预览 | 注册在 DSh 右列布局中，打开时会话区自动收缩；拖动左边缘自由调整宽度（无上限），会话区实时伸缩 | Docked preview panel in the layout column; unlimited width drag |
| 🔍 真实渲染 | 内置 HTTP 服务加载，CSS/JS/图片等相对资源全部正常渲染 | Real rendering via built-in HTTP route — relative assets load normally |
| ✏️ 直接改文案 | 点击页面文字即点即改，保存时以最小文本替换写回源文件，保留格式 | Click-to-edit copy with minimal text replacement back into the source |
| 🎯 区域批注 | 拖拽框选任意区域，自动识别 CSS 路径与文案，批注直接唤醒 AI 修改 | Drag-box regions → annotation delivered to the AI via `agent.steer` |
| 🔎 整页缩放 | 50%–150% 手动档 +「适配宽度」自动档，PC 页面按桌面断点渲染后适配面板 | Zoom 50–150% + fit-width auto mode for desktop pages |
| 🪟 会话悬浮窗 | 一键把会话区分离为置顶悬浮窗：拖动条移动、右下角缩放、一键还原 | Detach the conversation into a floating always-on-top window |
| 📂 一键打开 | 会话中点击 HTML 文件自动在面板打开，工作区外自动导入 | Click any HTML file in the conversation to open it in the panel |
| 🧩 AI 兜底工具 | 全局注册 `html_preview_annotations`，AI 可随时读取未处理批注 | Global `html_preview_annotations` tool as a fallback |

## 📦 安装 / Install

要求 / Requirements：DSH 的 Web 部署（`dsh web`，即 `~/.dsh/profiles/web/` 标准 profile 结构）。/ A DSH web deployment with the standard profile layout.

**从 npm（推荐）/ from npm (recommended):**

```bash
cd ~/.dsh/profiles/web
pnpm add dsh-html-preview
```

**从 GitHub / from GitHub:**

```bash
cd ~/.dsh/profiles/web
pnpm add github:Yi-pie/dsh-html-preview
```

然后在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 末尾加入 `"dsh-html-preview"`：/ Then append `"dsh-html-preview"` to `dsh.profile.bundles` in `~/.dsh/profiles/web/package.json`:

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-html-preview"
    ]
  }
}
```

```bash
pnpm install
dsh-web restart   # 或按你的方式重启 dsh web
```

刷新页面，侧边栏底部出现「🖼 预览」入口。/ Refresh the page — the「🖼 预览」entry appears at the sidebar footer.

> 💡 安装提示：DSH 标准 profile 已内置 `autoInstallPeers: false`（`@deepseek-ai/*`、`react` 等 peer 依赖由 profile 环境解析）。若安装时报 `@deepseek-ai/* is not in the npm registry`，请在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 中加入 `autoInstallPeers: false` 后重新 `pnpm install`。
>
> 💡 Tip: the standard DSH profile ships `autoInstallPeers: false` (peer deps resolve from the profile environment). If you see `@deepseek-ai/* is not in the npm registry`, add `autoInstallPeers: false` to your `pnpm-workspace.yaml` and re-run `pnpm install`.

## 🖥 使用 / Usage

1. 侧边栏点「🖼 预览」→ 右列展开预览面板（自动授权当前会话工作区）/ Click「🖼 预览」in the sidebar → the panel opens in the right column (auto-authorizes the session workspace);
2. 下拉选择工作区 HTML 文件，或「导入…」浏览本地目录（拷贝到 `.dsh/html-preview/`）/ Pick a workspace HTML file from the dropdown or「导入…」to browse local directories;
3. 模式 / Modes：
   - **预览 / View**：普通浏览；缩放选「适配宽度」查看 PC 页面 / plain browsing; use「适配宽度」to fit desktop pages;
   - **改文案 / Edit**：点击文字直接编辑 →「保存 (N)」写回文件 / click text to edit →「保存 (N)」writes back;
   - **批注 / Annotate**：拖拽框选区域 → 填写要求 → 添加 → 图钉上屏 →「提交批注给 AI」/ drag to select a region → describe the change → add → pin →「提交批注给 AI」;
4. 「悬浮会话」把会话区变成置顶悬浮窗（顶部条拖动、右下角缩放、一键还原）/「悬浮会话」detaches the conversation into a floating window (drag the top bar, resize at the bottom-right corner, restore with one click).

## 📤 发布 / Release

本项目通过 GitHub Actions 自动发布：推送 `v*` tag 即触发 npm 发布 + GitHub Release。/ Pushing a `v*` tag triggers npm publish + GitHub Release automatically:

```bash
# 1. 更新 package.json 中的 version（如 0.1.2）/ bump version in package.json
# 2. 提交并打 tag / commit and tag
git add -A && git commit -m "release: v0.1.2"
git tag v0.1.2 && git push origin main --tags
```

首次使用前需要在仓库设置中添加 secret：/ Before the first release, add this secret in the repo settings:

- **`NPM_TOKEN`**：npm 的 Automation token（Settings → Secrets and variables → Actions → New repository secret）/ an npm Automation token.

## 🔧 本地开发 / Development

源码即产物（无构建步骤）/ Source is the artifact (no build step):

- `lib/index.js` — Host 半部：HTTP 路由（`/dsh-preview/*` 预览、`/dsh-preview-api/*` API）、文件处理、批注存储、`agent.steer` 投递、`html_preview_annotations` 工具 / host half: routes, file ops, annotation store, agent steering, tool;
- `lib/client.js` — Client 半部（`window.__ModuleLoader__` 工厂格式）：面板 UI、页内桥接、缩放、悬浮窗 / client half (module-loader factory format): panel UI, in-page bridge, zoom, floating window;
- `cordis.patch.yml` — 宿主行挂载 / host row mount; `dsh.plugin.json` — 插件元数据 / plugin metadata.

本地联调：把仓库 link 进 profile 即可 / Local testing: link the repo into your profile:

```bash
cd ~/.dsh/profiles/web
pnpm add file:/绝对路径/到/dsh-html-preview   # 或 workspace: 协议
# 修改源码后 dsh-web restart 生效
```

`@deepseek-ai/*` 与 `react` 为 peerDependencies，由 profile 环境解析，不随包分发。/ `@deepseek-ai/*` and `react` are peer dependencies provided by the profile environment.

## 🔒 安全说明 / Security

- 预览路由只服务面板授权过的工作区根目录（白名单 + 包含关系校验），拒绝 `..` 路径段，单文件读取上限 8MB，仅监听 loopback。/ The preview route only serves workspace roots authorized by the panel (allowlist + containment checks), rejects `..` segments, caps reads at 8MB, and binds to loopback only;
- 预览 iframe 使用 `allow-same-origin allow-scripts` 以支持页内编辑/框选，请只预览可信的 HTML 文件。/ The preview iframe uses `allow-same-origin allow-scripts` for in-page editing; preview only trusted HTML;
- 会话悬浮窗直接驱动外壳布局网格实现，若 DSh 升级改变外壳 DOM 结构，该功能可能失效（其他功能不受影响）。/ The floating window drives the shell layout grid directly; it may break if a DSh upgrade changes the shell DOM (other features are unaffected).

## License

[MIT](./LICENSE)
