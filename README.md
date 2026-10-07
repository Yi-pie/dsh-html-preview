# 🖼 dsh-html-preview

<p align="center">
  <b>HTML 预览 · 直接改文案 · 区域批注给 AI · 整页缩放</b><br>
  <i>HTML preview · in-place copy editing · region annotation for AI · page zoom</i>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-html-preview"><img src="https://img.shields.io/npm/v/dsh-html-preview" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-html-preview"><img src="https://img.shields.io/npm/dm/dsh-html-preview" alt="npm downloads"></a>
  <a href="https://github.com/Yi-pie/dsh-html-preview/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Yi-pie/dsh-html-preview" alt="license"></a>
  <a href="https://github.com/Yi-pie/dsh-html-preview"><img src="https://img.shields.io/github/stars/Yi-pie/dsh-html-preview" alt="stars"></a>
</p>

**DeepSeek Harness (DSH) Web 插件**：在右栏标签页里真实渲染 HTML 页面，支持点击文字直接改文案、框选区域批注交给 AI、整页缩放适配 PC 页面。

**A plugin for the DeepSeek Harness (DSH) Web GUI**: renders HTML pages in a right-column tab with in-place copy editing, region annotation for the AI, and desktop-page zoom.

> **v0.2.0 已适配 DSH 0.2.x 的右栏标签页体系。** 旧版通过直接改写外壳 DOM（`grid-template-columns`、`details` 槽）实现停靠面板与「会话悬浮窗」，那套做法在新外壳上已经失效，现在改为官方扩展点：注册**标签页类型**（`ctx.sidebarRightTabs`）+ **标签页主体**（`slots: sidebar.right.pane.tab`）。面板宽度、停靠、分屏、全屏、浮动都由外壳原生负责。

---

## ✨ 功能 / Features

| 功能 | 说明 | Feature |
|---|---|---|
| 🖼 右栏标签页 | 作为右栏的一个标签页打开，由外壳负责宽度拖拽、分屏、全屏与浮动；无需也不应改写外壳布局 | A right-column tab type; the shell owns width, split, fullscreen and floats |
| 📂 点文件即预览 | 会话里点击 `*.html` / `*.htm` 链接直接在右栏打开本面板（以 `extension` 优先级接管 HTML 资源归属） | Clicking an HTML file link in the conversation opens this panel |
| 🔍 真实渲染 | 内置 HTTP 路由加载，CSS/JS/图片等相对资源全部正常（相对路径按 URL 目录解析） | Real rendering through a built-in route; relative assets resolve normally |
| ✏️ 直接改文案 | 点击页面文字即点即改，「保存改动 (N)」以最小文本替换写回源文件，保留格式 | Click-to-edit copy written back as a minimal text replacement |
| 🎯 区域批注 | 拖拽框选任意区域，自动识别 CSS 路径与文案，批注直接唤醒 AI 修改 | Drag-box a region → CSS path + snippet → annotation delivered to the AI |
| 🔎 整页缩放 | 适配宽度 + 50%–150% 手动档，按桌面断点渲染 PC 页面 | Fit-width plus 50–150% manual zoom for desktop pages |
| 🧩 AI 兜底工具 | 全局注册 `html_preview_annotations`，AI 可随时读取未处理批注 | Global `html_preview_annotations` tool as a fallback path |
| 🧭 引导页入口 | 在右栏引导页注册一个「HTML 预览」入口 | One guide entry in the right sidebar |
| 💬 悬浮会话 | 一键把**当前会话**浮成可拖动、可缩放的小窗，再点「收回会话」关闭：预览面板占满视线时也能边看页面边对话 | Float the current Session's Conversation into a draggable window |

> 面板宽度拖拽、分屏、全屏与标签页浮动都由外壳自己提供（标签页菜单与面板控件里就有），插件不再自带这些窗口控制；插件只提供「悬浮会话」这一个窗口动作。

**「悬浮会话」怎么实现的**：新外壳里会话就是中栏本身，没有"把会话区抠出来"的动作（`sidebar.chat.conversation` 是 `ui-subagent` 给子会话声明的槽）。但外壳公开了可复用的会话渲染工厂 `conversation.content`——插件据此注册第二个标签页类型（`kind: 'htmlpreviewchat'`），用 `renderFactorySlot('conversation.content', …)` 在其中渲染当前会话，再用 dockkit 的 `float(tabId)` 把它浮成独立小窗，全程走官方扩展点。交互上处理了三件事：浮起后用 `focus(previewTabId)` 把预览标签换回前台（否则 `openTab` 会把面板工具栏顶掉，导致来回切标签）、悬浮窗自带「⇲ 收回」、浮动状态由两处共享的 DOM 探测（`closest('[data-dockkit-float]')`）驱动。

## 📦 安装 / Install

要求：DSH `0.2.x`（右栏标签页体系）/ Requires DSH `0.2.x`.

**从 npm / from npm:**

```bash
cd ~/.dsh/profiles/<你的 profile>
pnpm add dsh-html-preview
```

**从 GitHub / from GitHub:**

```bash
cd ~/.dsh/profiles/<你的 profile>
pnpm add github:Yi-pie/dsh-html-preview
```

**从本地源码 / from a local checkout**（开发推荐 / recommended for development）:

```bash
cd ~/.dsh/profiles/<你的 profile>
pnpm add file:/绝对路径/到/dsh-html-preview
```

然后在 profile 的 `package.json` 里把它加进 `dsh.profile.bundles` 末尾 / then append it to `dsh.profile.bundles`:

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
```

宿主半部（HTTP 路由、工具）在 profile 重新组合时生效；客户端半部在被 profile 加载后可由 `dsh-client-hmr` 自动热更新。

> 💡 安装提示：DSH 标准 profile 已内置 `autoInstallPeers: false`（`@deepseek-ai/*`、`react` 等 peer 依赖由 profile 环境解析）。若安装时报 `@deepseek-ai/* is not in the npm registry`，请在 `pnpm-workspace.yaml` 中加入 `autoInstallPeers: false` 后重新 `pnpm install`。

## 🖥 使用 / Usage

1. 三种打开方式 / three ways to open it：
   - 点击左侧边栏底部的「🖼 HTML 预览」；
   - 在会话里点击任意 `.html` 文件链接（该类型以最高优先级接管 HTML 资源）；
   - 右栏引导页里的「HTML 预览」入口。
2. 工具栏 / toolbar：
   - 文件下拉选择工作区 HTML，或「打开…」浏览目录并导入外部页面（拷贝到 `.dsh/html-preview/`）；
   - `⟳` 重新加载；缩放选择「适配宽度」或固定档位；
   - 模式 / modes：**预览**、**改文案**（点击文字直接改 →「保存改动 (N)」写回文件）、**批注**（拖拽框选 → 填写要求 →「添加批注」→ 上屏图钉 →「提交批注 (N)」）。
3. 批注会作为一条消息投递给当前会话的 Agent；若投递失败则暂存，AI 可通过 `html_preview_annotations` 工具读取。

## 🏗 架构 / Architecture

源码即产物（无构建步骤）/ source is the artifact (no build step):

- `lib/index.js` — **宿主半部**：`/dsh-preview/*`（带桥接脚本注入的页面与静态资源）、`/dsh-preview-api/*`（授权、列文件、浏览、导入、写回文本、批注增删查）、`agent.steer` 投递、`html_preview_annotations` 工具；
- `lib/client.js` — **客户端半部**（`window.__ModuleLoader__` 工厂格式）：

  | 扩展点 | 用途 |
  |---|---|
  | `ctx.sidebarRightTabs.register({ id, kind, patterns, priority, title, guide, keepMounted })` | 注册标签页类型，并以 `priority: 'extension'` + `patterns: ['*.html','*.htm']` 接管 HTML 资源 |
  | `slots.register({ name: 'sidebar.right.pane.tab', key: id })` | 标签页主体（通过 `useTabInfo()` 拿到 `tab.contentId` / `navigation`，通过 `useResource()` 解析宿主绝对路径） |
  | `slots.register({ name: 'sidebar.right.pane.tab.title', key: id })` | 标签页标题（文件名） |
  | `slots.register({ name: 'sidebar.footer.action', id: 'html-preview' })` | 左侧边栏底部的打开入口 |
  | `ctx.get('sidebarRight').openTab(kind)` | 打开/聚焦本面板 |

- `cordis.patch.yml` — 宿主行挂载；`package.json` 的 `dsh` 字段是声明权威（`dsh.bundle.patch` 挂载行、`dsh.client.platform: "web"` 声明浏览器半部）。

**地址解析**：`dsh-resource://file/session/<sessionId>/<relPath>` 由 `useResource()` 解析出宿主绝对路径；工作区根 = 绝对路径去掉相对路径后缀，从而无需额外服务即可授权并生成 `/dsh-preview/<root>/<rel>`。

## 🔧 本地开发 / Development

- 只改 `lib/client.js`：**不需要重启**。`dsh-client-hmr` 每 500ms 轮询客户端产物，写入后约 1 秒内自动替换运行中的插件（组件状态会丢失，会话状态保留）。
- 改 `lib/index.js`（宿主半部）：让 profile 重新组合即可——在 **应用独占 profile**（如 desktop）上需要重启应用；在 CLI 管理的 profile 上保存 `cordis.patch.yml` 会触发重载。
- 调试：客户端半部失败会注册一个**不渲染任何内容**的诊断单元（`sidebar.footer.action` 里 id 形如 `html-preview-diag:<错误>`），可用客户端 Slots inspect 读到；同时会输出到浏览器控制台（`[dsh-html-preview] ...`）。

```bash
# 本地联调：把仓库 link 进 profile
cd ~/.dsh/profiles/<你的 profile>
pnpm add file:/绝对路径/到/dsh-html-preview
```

`@deepseek-ai/*` 与 `react` 为 peerDependencies，由 profile 环境解析，不随包分发。

## 🔒 安全说明 / Security

- 预览路由只服务面板已授权的工作区根目录（白名单 + 包含关系校验），拒绝 `..` 路径段，单文件读取上限 8MB；
- **写回受沙箱约束**：DSH 0.2.x 的 `ctx.fs.writeText` 需要每次调用显式携带 `SandboxExecutionPolicy`。插件通过 `ctx.sessions.get(sessionId)` 取出会话、用 `ctx.sandboxPolicy.resolve({ session })` 解析出该会话的模式与工作区边界：**只读会话直接拒绝写回**，其余一律以 `mode: 'workspace-write'` + 会话工作区为围栏，并再次校验目标落在边界内。插件不会、也无法借写回扩大会话原有的文件权限。
- 预览 iframe 使用 `sandbox="allow-same-origin allow-scripts …"` 以支持页内编辑与框选；被预览页面的脚本因此与外壳同源，**请只预览可信的 HTML 文件**（这也是 v0.2.0 新增写回围栏的原因）。
- v0.2.0 起不再直接操作外壳布局 DOM，因此外壳升级不会像旧版那样把面板搞崩。

## 📝 变更 / Changelog

**0.2.0**
- 重写客户端半部，改用官方右栏扩展点（`sidebarRightTabs` + `sidebar.right.pane.tab` / `.title`），移除改写 `grid-template-columns` 与 `details` 槽的旧实现；
- 以 `extension` 优先级接管 `*.html` / `*.htm` 资源，会话中点击 HTML 文件直接在右栏打开；
- **写回修复**：`apply-text-edits` 与 `import-file` 现在显式携带会话级沙箱策略（`ctx.sessions.get` + `ctx.sandboxPolicy.resolve({ session })`），修复 DSH 0.2.x 下写回一律被 `FS_SANDBOX_DENIED` 拒绝的问题；
- 窗口控制收敛：面板浮动与全屏按钮移除（外壳的标签页菜单与面板控件本就提供）；**保留「悬浮会话」**——通过公开的 `conversation.content` 工厂把当前会话渲染进第二个标签页类型再浮动，并解决了「浮起后预览工具栏被顶掉」「收回要切标签」「按钮状态可能说反」三个交互问题；
- 移除手动面板宽度接管（宽度、分屏、全屏归外壳）；
- 预览路由改为按 URL 目录解析相对资源，支持会话相对路径与绝对路径两侧的文件；
- 新增右栏引导页入口、面板内错误诊断单元、渲染中/无工作区/非 HTML 资源等空状态提示。

**0.1.1** — npm 发布配置、双语 README、GitHub Actions 自动发布。

## 📤 发布 / Release

推送 `v*` tag 触发 npm 发布 + GitHub Release / pushing a `v*` tag triggers the release workflow:

```bash
git add -A && git commit -m "release: v0.2.0"
git tag v0.2.0 && git push origin main --tags
```

首次使用前需在仓库设置添加 secret `NPM_TOKEN`（npm Automation token）。

## 📄 License

MIT
