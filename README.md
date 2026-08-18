# dsh-html-preview

DeepSeek Harness (DSH) Web 插件：把 HTML 预览、直接改文案、区域批注与"会话悬浮窗"带进 DSh 会话。

> 对标 Trae Work 的 HTML 产物管理与 Codex 桌面端内置浏览器：预览真实渲染、点击文字直接改文案、框选页面区域批注给 AI、整页缩放适配 PC 页面，还支持把会话区分离为置顶悬浮窗。

## 功能

- 🖼 **停靠式预览面板**：注册在 DSh 右列（details 布局列），与会话区平级；拖动左边缘可自由调整宽度（无 520px 上限），会话区同步伸缩；
- 🔍 **真实渲染**：通过插件自带的 HTTP 路由（`/dsh-preview/*`）加载工作区文件，相对路径的 CSS/JS/图片都能正常加载；
- ✏️ **直接改文案**：「改文案」模式下点击页面文字即可编辑，「保存」以最小文本替换写回源文件（保留原格式与注释）；
- 🎯 **区域批注**：「批注」模式下拖拽框选任意区域，自动识别 CSS 路径与当前文案，填写修改要求后「提交批注给 AI」——批注通过 agent.steer 直接唤醒 AI 进入会话；
- 🔎 **整页缩放适配**：50%–150% 手动档位 + 「适配宽度」自动档（PC 页面按桌面断点渲染后缩至面板宽度，窗口变化实时重算）；
- 🪟 **会话悬浮窗**：一键把会话区分离为置顶悬浮窗（顶部拖动条移动、右下角缩放、一键还原），预览列即可占满几乎全部宽度，两者互不遮挡；
- 📂 **一键打开**：会话中点击任意 HTML 文件引用自动在面板中打开（工作区外文件自动导入）；支持浏览本地目录导入；
- 🧩 **AI 兜底工具**：全局注册 `html_preview_annotations` 工具，AI 可随时读取尚未处理的批注。

## 安装

要求：DSH 的 Web 部署（`dsh web`，浏览器访问 http://127.0.0.1:3080），即 `~/.dsh/profiles/web/` 存在（标准 profile 结构）。

```bash
cd ~/.dsh/profiles/web
pnpm add github:<你的用户名>/dsh-html-preview   # 或使用 zip/tarball 地址
```

然后在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 末尾加入 `"dsh-html-preview"`：

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

刷新页面，侧边栏底部出现「🖼 预览」入口。

## 使用

1. 点击侧边栏底部「🖼 预览」→ 右列展开预览面板（自动授权当前会话工作区）；
2. 下拉选择工作区 HTML 文件，或「导入…」浏览本地目录（拷贝到 `.dsh/html-preview/`）；
3. 模式：
   - 预览：普通浏览，缩放选择「适配宽度」查看 PC 页面；
   - 改文案：点击文字直接编辑 →「保存 (N)」写回文件；
   - 批注：拖拽框选区域 → 填写要求 → 添加 → 图钉上屏 →「提交批注给 AI」；
4. 「悬浮会话」把会话区变成置顶悬浮窗；关闭面板或「还原」恢复布局。

## 本地开发

源码即产物（无构建步骤）：

- `lib/index.js` — Host 半部：HTTP 路由（预览/API）、文件处理、批注存储、agent.steer 投递、`html_preview_annotations` 工具；
- `lib/client.js` — Client 半部（`window.__ModuleLoader__` 工厂格式）：面板 UI、桥接指令、缩放、悬浮窗；
- `cordis.patch.yml` — 宿主行挂载；`dsh.plugin.json` — 插件元数据。

修改后 `dsh-web restart` 生效。`@deepseek-ai/*` 与 `react` 为 peerDependencies，由 profile 环境解析，无需随包分发。

## 安全说明

- 预览路由只服务面板授权过的工作区根目录（目标键白名单 + 包含关系校验），拒绝 `..` 路径段，单文件读取上限 8MB，仅监听 loopback；
- 预览 iframe 使用 `allow-same-origin allow-scripts` 以支持页内编辑/框选，请只预览可信的 HTML 文件；
- 会话悬浮窗通过直接驱动外壳布局网格实现，升级 DSh 后若外壳 DOM 结构变化，该功能可能失效（其他功能不受影响）。

## License

MIT
