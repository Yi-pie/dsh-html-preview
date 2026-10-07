window.__ModuleLoader__.load({
  id: 'dsh-html-preview',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    /** Tab-type identity: the registry id, the body/title slot key, and the kind `openTab` names. */
    const TYPE_ID = 'dsh-html-preview'
    const KIND = 'html-preview'
    /** A second tab type whose body hosts the current Session's Conversation. */
    const CHAT_ID = 'dsh-html-preview/chat'
    const CHAT_KIND = 'htmlpreviewchat'
    const API = '/dsh-preview-api'
    const ROUTE = '/dsh-preview'
    const FILE_PREFIX = 'dsh-resource://file/'

    // ───────────────────────────────────────────────────────────────────────────
    // Diagnostics: a last-known-error line, mirrored into a sidebar cell so a
    // failed client half is observable instead of silent.
    // ───────────────────────────────────────────────────────────────────────────
    const diagLines = []
    let diagCell = null
    /** `ctx.sidebarRight`, captured in apply(); the controller owns float/dock. */
    let rightbarController = null

    // Live placement of the floating-conversation tab. Both bodies share it, so the
    // preview toolbar's control stays truthful however the window was moved.
    const chatProbe = { tabId: '', floating: false, subscribers: [] }
    function publishChatProbe(tabId, floating) {
      if (chatProbe.tabId === tabId && chatProbe.floating === floating) return
      chatProbe.tabId = tabId
      chatProbe.floating = floating
      chatProbe.subscribers.slice().forEach(function (fn) {
        try { fn(chatProbe) } catch (e) {}
      })
    }
    function subscribeChatProbe(fn) {
      chatProbe.subscribers.push(fn)
      try { fn(chatProbe) } catch (e) {}
      return function () {
        const index = chatProbe.subscribers.indexOf(fn)
        if (index >= 0) chatProbe.subscribers.splice(index, 1)
      }
    }
    function diag(code, detail) {
      const line = String(code) + (detail ? ' · ' + String(detail).slice(0, 300) : '')
      if (diagLines.indexOf(line) !== -1) return
      diagLines.push(line)
      while (diagLines.length > 4) diagLines.shift()
      try { console.error('[dsh-html-preview] ' + line) } catch (e) {}
      if (diagCell) { try { diagCell(diagLines.join(' | ')) } catch (e) {} }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Host half API and preview addressing.
    // ───────────────────────────────────────────────────────────────────────────
    async function api(method, args) {
      const res = await fetch(API + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      })
      let json = null
      try { json = await res.json() } catch (e) { json = null }
      if (!json || json.ok !== true) throw new Error((json && json.error) || ('HTTP ' + res.status))
      return json
    }

    function dec(s) { try { return decodeURIComponent(s) } catch (e) { return s } }

    /** Read `dsh-resource://file/<scope>/…` into its session-relative or absolute parts. */
    function parseFileAddress(address) {
      if (typeof address !== 'string' || address.indexOf(FILE_PREFIX) !== 0) return null
      const body = address.slice(FILE_PREFIX.length).split(/[?#]/)[0]
      const parts = body.split('/')
      const scope = parts.shift()
      if (scope === 'session') {
        const sessionId = parts.shift()
        if (!sessionId || parts.length === 0) return null
        return { scope: scope, sessionId: dec(sessionId), path: parts.map(dec).join('/') }
      }
      if (scope === 'absolute') {
        if (parts.length === 0 || parts[0] === '') return null
        return { scope: scope, path: '/' + parts.map(dec).join('/') }
      }
      return null
    }

    /** Split an absolute host path into the authorized root and the path relative to it. */
    function targetOf(address, absolutePath) {
      if (!absolutePath || typeof absolutePath !== 'string') return null
      const parsed = parseFileAddress(address)
      if (parsed && parsed.scope === 'session' && parsed.path) {
        const suffix = '/' + parsed.path
        if (absolutePath.length > suffix.length && absolutePath.slice(-suffix.length) === suffix) {
          return { root: absolutePath.slice(0, absolutePath.length - suffix.length), rel: parsed.path }
        }
      }
      const cut = absolutePath.lastIndexOf('/')
      if (cut <= 0) return null
      return { root: absolutePath.slice(0, cut), rel: absolutePath.slice(cut + 1) }
    }

    function previewSrc(root, rel) {
      return ROUTE + '/' + encodeURIComponent(root) + '/' +
        rel.split('/').map(encodeURIComponent).join('/')
    }

    /** Tab records of one session, or an empty list when the surface is not adopted. */
    function chatTabsOf(controller, sessionId) {
      try {
        const list = controller.tabsIn(sessionId)
        return Array.isArray(list) ? list : []
      } catch (e) { return [] }
    }

    function basename(path) {
      if (typeof path !== 'string' || path === '') return ''
      const cut = path.lastIndexOf('/')
      return cut === -1 ? path : path.slice(cut + 1)
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Page bridge: the previewed document reports its state and accepts commands.
    // ───────────────────────────────────────────────────────────────────────────
    function readBridge(frame) {
      try {
        const win = frame && frame.contentWindow
        const bridge = win && win.__dshPreview
        return bridge && bridge.state ? bridge.state : null
      } catch (e) { return null }
    }

    function sendCmd(frame, cmd) {
      try {
        const win = frame && frame.contentWindow
        if (!win) return
        const bridge = win.__dshPreview
        if (bridge && typeof bridge.handleCmd === 'function') { bridge.handleCmd(cmd); return }
        if (win.__dshPreviewCmd === null || win.__dshPreviewCmd === undefined) win.__dshPreviewCmd = cmd
      } catch (e) {}
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Styles.
    // ───────────────────────────────────────────────────────────────────────────
    const CSS = [
      '.hp-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}',
      '.hp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:0 0 auto}',
      '.hp-bar select,.hp-bar input{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 6px;max-width:100%}',
      '.hp-file{flex:1 1 140px;min-width:90px}',
      '.hp-btn{font:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px;cursor:pointer;white-space:nowrap;line-height:1.4;transition:background 120ms ease,color 120ms ease}',
      '.hp-btn:hover:not([disabled]){background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}',
      '.hp-btn[disabled]{opacity:.45;cursor:default}',
      // Engaged toggle — the shell's ghost-active idiom, readable in both themes.
      '.hp-btn.hp-on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-ghost-active-fill, var(--dsw-alias-bg-layer-2));border-color:transparent;box-shadow:inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-brand-primary));font-weight:600}',
      // Primary action — the shell's primary-button tokens, never a hard-coded white.
      '.hp-btn.hp-primary{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base));font-weight:600}',
      '.hp-btn.hp-primary:hover:not([disabled]){background:var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary))}',
      // Mode switch: a track plus one raised pill under the selected segment.
      '.hp-seg{display:flex;gap:2px;padding:2px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}',
      '.hp-seg .hp-btn{border:none;background:transparent;box-shadow:none;border-radius:8px;color:var(--dsw-alias-label-secondary)}',
      '.hp-seg .hp-btn:hover:not([disabled]){color:var(--dsw-alias-label-primary);background:transparent}',
      '.hp-seg .hp-btn.hp-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft, 0 1px 3px rgba(0,0,0,.2));font-weight:600}',
      '.hp-status{flex:0 0 auto;padding:4px 8px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5;border-bottom:.5px solid var(--dsw-alias-border-l1);word-break:break-all}',
      '.hp-status.hp-err{color:var(--dsw-alias-state-error-primary)}',
      '.hp-status.hp-ok{color:var(--dsw-alias-state-success-primary)}',
      '.hp-stage{position:relative;flex:1 1 auto;min-height:0;display:flex}',
      '.hp-frame{flex:1 1 auto;width:100%;border:0;background:#fff}',
      '.hp-chat{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.hp-chat-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.hp-chat-label{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hp-empty{margin:auto;padding:24px 18px;text-align:center;color:var(--dsw-alias-label-secondary);max-width:340px;line-height:1.7}',
      '.hp-anns{flex:0 0 auto;max-height:34%;overflow:auto;border-top:.5px solid var(--dsw-alias-border-l1);padding:6px 8px;display:flex;flex-direction:column;gap:6px}',
      '.hp-ann{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 8px;background:var(--dsw-alias-bg-layer-1)}',
      '.hp-ann-head{display:flex;align-items:center;gap:6px;margin-bottom:4px}',
      '.hp-pin{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground, #fff);font-size:11px;line-height:18px;text-align:center}',
      '.hp-ann-sel{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hp-ann-text{white-space:pre-wrap;word-break:break-word;line-height:1.6}',
      '.hp-ann-snippet{color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hp-picker{position:absolute;inset:0;z-index:5;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;min-height:0}',
      '.hp-picker-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.hp-picker-path{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}',
      '.hp-picker-list{flex:1 1 auto;overflow:auto;padding:4px 0}',
      '.hp-row{display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;line-height:1.6}',
      '.hp-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.hp-row-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.hp-row-tag{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.hp-row.hp-dim{opacity:.5;cursor:default}',
      '.hp-foot-btn{display:flex;align-items:center;gap:8px;width:100%;font:inherit;color:inherit;background:none;border:none;border-radius:8px;padding:6px 8px;cursor:pointer;text-align:left;line-height:1.5}',
      '.hp-foot-btn:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.hp-foot-icon{flex:0 0 auto;font-size:15px;line-height:1}',
      '.hp-foot-label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    ].join('\n')

    function installStyles() {
      try {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          return styles.insert(CSS)
        }
      } catch (e) {}
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-html-preview')
      tag.textContent = CSS
      document.head.append(tag)
      return function () { tag.remove() }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Tab body: toolbar, previewed page, annotation list.
    // ───────────────────────────────────────────────────────────────────────────
    function Body(props) {
      const useTabInfo = props.useTabInfo
      const useResource = props.useResource
      const sessionId = props.sessionId

      let tab = null
      try {
        const info = typeof useTabInfo === 'function' ? useTabInfo() : null
        tab = info && info.tab ? info.tab : null
      } catch (e) { tab = null }

      const contentId = tab && typeof tab.contentId === 'string' ? tab.contentId : ''
      let meta = null
      try { meta = typeof useResource === 'function' ? useResource(contentId) : null } catch (e) { meta = null }
      const absolutePath = meta && meta.value && typeof meta.value.absolutePath === 'string' ? meta.value.absolutePath : ''
      const target = targetOf(contentId, absolutePath)
      const targetRoot = target ? target.root : ''
      const targetRel = target ? target.rel : ''
      const parsedAddress = parseFileAddress(contentId)
      const addressIsFile = !!(parsedAddress && /\.[A-Za-z0-9]+$/.test(parsedAddress.path))

      const [root, setRoot] = React.useState(targetRoot)
      const [rel, setRel] = React.useState(targetRel)
      const [files, setFiles] = React.useState([])
      const [status, setStatus] = React.useState('')
      const [statusKind, setStatusKind] = React.useState('')
      const [mode, setMode] = React.useState('view')
      const [zoom, setZoom] = React.useState('fit')
      const [frameKey, setFrameKey] = React.useState(0)
      const [bridge, setBridge] = React.useState(null)
      const [annotations, setAnnotations] = React.useState([])
      const [comment, setComment] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [picker, setPicker] = React.useState(false)
      const [browse, setBrowse] = React.useState(null)
      const frameRef = React.useRef(null)
      const lastBridgeKey = React.useRef('')

      // 「悬浮会话」: host the current Session's Conversation in a tab and float it,
      // so a fullscreen preview still leaves a draggable, resizable chat window.
      const [chatFloating, setChatFloating] = React.useState(false)
      React.useEffect(function () {
        return subscribeChatProbe(function (state) { setChatFloating(!!state.floating) })
      }, [])

      const toggleChat = React.useCallback(function () {
        const controller = rightbarController
        if (!controller) { diag('no-sidebar-right'); return }
        const find = function () {
          return chatTabsOf(controller, sessionId).filter(function (t) { return t && t.kind === CHAT_KIND })
        }
        if (chatProbe.floating && chatProbe.tabId !== '') {
          try { controller.close(chatProbe.tabId) } catch (e) { diag('chat-close-failed', e && e.message) }
          return
        }
        const existing = find()
        if (existing.length === 0) {
          try { controller.openTab(CHAT_KIND) } catch (e) { diag('chat-open-failed', e && e.message); return }
        }
        const target = existing[0] || find()[0]
        if (!target || !target.id) { diag('chat-tab-missing'); return }
        try { controller.float(target.id) } catch (e) { diag('chat-float-failed', e && e.message) }
        // Opening the chat tab also selects it, which would hide this toolbar (and
        // the only 收回 control in reach). Put the preview tab back in front.
        const previewId = tab && typeof tab.id === 'string' ? tab.id : ''
        if (previewId !== '' && previewId !== target.id && typeof controller.focus === 'function') {
          try { controller.focus(previewId) } catch (e) {}
        }
      }, [sessionId, tab])

      const note = React.useCallback(function (text, kind) {
        setStatus(text || '')
        setStatusKind(kind || '')
      }, [])

      // A resource tab must resolve its address to a host path; a page tab
      // (`sidebar://html-preview`) legitimately has none.
      React.useEffect(function () {
        if (typeof useTabInfo !== 'function') diag('no-tabinfo-hook')
        if (typeof useResource !== 'function') diag('no-resource-hook')
        if (contentId.indexOf(FILE_PREFIX) === 0 && absolutePath === '' && addressIsFile) {
          diag('unresolved-address', contentId.slice(0, 90))
        }
      }, [contentId, absolutePath, addressIsFile, useTabInfo, useResource])

      // The opened resource decides the workspace root and the relative path.
      React.useEffect(function () {
        if (targetRoot === '' || targetRel === '') return
        setRoot(targetRoot)
        setRel(targetRel)
        setPicker(false)
      }, [targetRoot, targetRel])

      // Authorize the root on the host, then learn its HTML files.
      React.useEffect(function () {
        if (root === '') return undefined
        let live = true
        api('authorize-root', { root: root })
          .then(function () { return api('list-files', { root: root }) })
          .then(function (out) {
            if (!live) return
            setFiles(Array.isArray(out.files) ? out.files : [])
          })
          .catch(function (e) {
            if (!live) return
            note('无法读取工作区：' + e.message, 'err')
            diag('list-files-failed', e.message)
          })
        return function () { live = false }
      }, [root, note])

      const loadAnnotations = React.useCallback(async function () {
        if (rel === '') { setAnnotations([]); return }
        try {
          const out = await api('list-annotations', { rel: rel })
          setAnnotations(Array.isArray(out.annotations) ? out.annotations : [])
        } catch (e) { diag('list-annotations-failed', e.message) }
      }, [rel])

      React.useEffect(function () { loadAnnotations() }, [loadAnnotations])

      // Page mode with no workspace yet: ask the host for its default root.
      React.useEffect(function () {
        if (root !== '' || targetRoot !== '') return undefined
        let live = true
        api('list-files', {})
          .then(function (out) {
            if (!live) return
            if (typeof out.root === 'string' && out.root !== '') setRoot(out.root)
            setFiles(Array.isArray(out.files) ? out.files : [])
          })
          .catch(function (e) {
            if (!live) return
            note('未找到工作区目录：' + e.message, 'err')
            diag('default-root-failed', e.message)
          })
        return function () { live = false }
      }, [root, targetRoot, note])

      // Poll the previewed page for its live state (edits, selection, zoom).
      React.useEffect(function () {
        const id = setInterval(function () {
          const state = readBridge(frameRef.current)
          if (!state) {
            if (lastBridgeKey.current !== 'none') { lastBridgeKey.current = 'none'; setBridge(null) }
            return
          }
          const key = JSON.stringify([
            state.mode,
            state.zoom && state.zoom.kind,
            state.zoom && state.zoom.scale,
            (state.edits || []).length,
            state.selection ? state.selection.selector + '@' + state.selection.at : '',
            state.lastError || ''
          ])
          if (key === lastBridgeKey.current) return
          lastBridgeKey.current = key
          setBridge({
            mode: state.mode,
            zoom: state.zoom || null,
            edits: Array.isArray(state.edits) ? state.edits : [],
            selection: state.selection || null,
            lastError: state.lastError || ''
          })
        }, 250)
        return function () { clearInterval(id) }
      }, [])

      const pushMode = React.useCallback(function (next) {
        setMode(next)
        sendCmd(frameRef.current, { t: 'mode', v: next })
      }, [])

      const pushZoom = React.useCallback(function (next) {
        setZoom(next)
        sendCmd(frameRef.current, { t: 'zoom', v: next === 'fit' ? 'fit' : Number(next) })
      }, [])

      const pushPins = React.useCallback(function (list) {
        sendCmd(frameRef.current, {
          t: 'pins',
          pins: (list || []).map(function (a) {
            return { x: a.docX, y: a.docY, comment: a.comment, selector: a.selector }
          })
        })
      }, [])

      React.useEffect(function () { pushPins(annotations) }, [annotations, frameKey, pushPins])

      const onFrameLoad = React.useCallback(function () {
        note('', '')
        pushMode(mode)
        pushZoom(zoom)
        sendCmd(frameRef.current, { t: 'clearEdits' })
        pushPins(annotations)
      }, [mode, zoom, annotations, pushMode, pushZoom, pushPins, note])

      const reloadFrame = React.useCallback(function () {
        setFrameKey(function (n) { return n + 1 })
      }, [])

      const pick = React.useCallback(function (nextRel) {
        setRel(nextRel)
        setPicker(false)
        setAnnotations([])
        note('', '')
      }, [note])

      const saveEdits = React.useCallback(async function () {
        const edits = (bridge && bridge.edits) || []
        if (edits.length === 0) { note('没有检测到文案改动', ''); return }
        setBusy(true)
        try {
          const out = await api('apply-text-edits', { root: root, rel: rel, edits: edits, sessionId: sessionId || '' })
          const skipped = Array.isArray(out.skipped) ? out.skipped.length : 0
          note('已写回 ' + out.applied + ' 处改动' + (skipped ? '，' + skipped + ' 处未匹配' : ''), out.applied > 0 ? 'ok' : '')
          sendCmd(frameRef.current, { t: 'clearEdits' })
          reloadFrame()
        } catch (e) {
          diag('save-fail', String(e && e.message))
          note('保存失败：' + e.message, 'err')
        } finally { setBusy(false) }
      }, [bridge, root, rel, sessionId, note, reloadFrame])

      const addAnnotation = React.useCallback(async function () {
        const selection = bridge && bridge.selection
        if (!selection) { note('请先在页面上框选要批注的区域', ''); return }
        if (comment.trim() === '') { note('请填写批注内容', ''); return }
        setBusy(true)
        try {
          const out = await api('add-annotation', {
            rel: rel,
            annotation: {
              selector: selection.selector, tag: selection.tag, snippet: selection.snippet,
              comment: comment, x: selection.x, y: selection.y, w: selection.w, h: selection.h,
              sx: selection.sx, sy: selection.sy, docX: selection.docX, docY: selection.docY
            }
          })
          setAnnotations(Array.isArray(out.annotations) ? out.annotations : [])
          setComment('')
          sendCmd(frameRef.current, { t: 'clearSel' })
          note('已添加批注', 'ok')
        } catch (e) {
          note('添加批注失败：' + e.message, 'err')
        } finally { setBusy(false) }
      }, [bridge, comment, rel, note])

      const removeAnnotation = React.useCallback(async function (id) {
        try {
          const out = await api('delete-annotation', { rel: rel, id: id })
          setAnnotations(Array.isArray(out.annotations) ? out.annotations : [])
        } catch (e) { note('删除失败：' + e.message, 'err') }
      }, [rel, note])

      const submitAnnotations = React.useCallback(async function () {
        if (annotations.length === 0) { note('没有可提交的批注', ''); return }
        setBusy(true)
        try {
          const out = await api('submit-annotations', {
            rel: rel, annotations: annotations, sessionId: sessionId || ''
          })
          if (out.delivered) note('已把 ' + out.count + ' 条批注投递给 AI', 'ok')
          else note('批注已暂存：' + (out.reason || '未投递'), '')
          await loadAnnotations()
        } catch (e) {
          note('提交失败：' + e.message, 'err')
        } finally { setBusy(false) }
      }, [annotations, rel, sessionId, note, loadAnnotations])

      const browseTo = React.useCallback(async function (path) {
        setBusy(true)
        try {
          const out = await api('browse-dir', { path: path })
          setBrowse(out)
          setPicker(true)
        } catch (e) {
          note('无法浏览目录：' + e.message, 'err')
        } finally { setBusy(false) }
      }, [note])

      const importFile = React.useCallback(async function (path) {
        setBusy(true)
        try {
          const out = await api('import-file', { root: root, path: path, sessionId: sessionId || '' })
          setFiles(function (prev) {
            const next = prev.slice()
            next.push({ rel: out.rel, name: basename(out.rel) })
            return next
          })
          pick(out.rel)
          note('已导入到 ' + out.rel, 'ok')
        } catch (e) {
          note('导入失败：' + e.message, 'err')
        } finally { setBusy(false) }
      }, [root, sessionId, pick, note])

      // ── render ──────────────────────────────────────────────────────────────
      const src = root !== '' && rel !== '' ? previewSrc(root, rel) : ''
      const edits = (bridge && bridge.edits) || []
      const selection = bridge && bridge.selection

      const fileOptions = files.slice()
      if (rel !== '' && !fileOptions.some(function (f) { return f.rel === rel })) {
        fileOptions.push({ rel: rel, name: basename(rel) })
      }

      const bar = h('div', { className: 'hp-bar' },
        h('select', {
          className: 'hp-file',
          value: rel,
          title: rel || '选择工作区中的 HTML 文件',
          onChange: function (e) { pick(e.target.value) }
        },
          h('option', { value: '' }, fileOptions.length ? '选择 HTML 文件…' : '未找到 HTML 文件'),
          fileOptions.map(function (f) {
            return h('option', { key: f.rel, value: f.rel }, f.rel)
          })
        ),
        h('button', {
          type: 'button', className: 'hp-btn', disabled: busy || root === '',
          title: '浏览其它目录并导入 HTML 文件',
          onClick: function () { browseTo(root || '/') }
        }, '打开…'),
        h('button', {
          type: 'button', className: 'hp-btn', disabled: src === '',
          title: '重新加载预览', onClick: reloadFrame
        }, '⟳'),
        h('button', {
          type: 'button', className: 'hp-btn' + (chatFloating ? ' hp-on' : ''),
          title: chatFloating
            ? '收回悬浮的会话窗口'
            : '把当前会话浮成可拖动的小窗：预览全屏时也能边看页面边对话',
          onClick: toggleChat
        }, chatFloating ? '⇲ 收回会话' : '⇱ 悬浮会话'),
        h('div', { className: 'hp-seg' },
          ['view', 'edit', 'annotate'].map(function (m) {
            const labels = { view: '预览', edit: '改文案', annotate: '批注' }
            return h('button', {
              key: m, type: 'button', disabled: src === '',
              className: 'hp-btn' + (mode === m ? ' hp-on' : ''),
              title: labels[m], onClick: function () { pushMode(m) }
            }, labels[m])
          })
        ),
        h('select', {
          value: zoom, disabled: src === '', title: '缩放',
          onChange: function (e) { pushZoom(e.target.value) }
        },
          [['fit', '适配宽度'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']]
            .map(function (pair) { return h('option', { key: pair[0], value: pair[0] }, pair[1]) })
        ),
        mode === 'edit' ? h('button', {
          type: 'button', className: 'hp-btn hp-primary', disabled: busy || edits.length === 0,
          onClick: saveEdits
        }, '保存改动' + (edits.length ? ' (' + edits.length + ')' : '')) : null,
        mode === 'annotate' ? h('button', {
          type: 'button', className: 'hp-btn' + (annotations.length ? ' hp-primary' : ''),
          disabled: busy || annotations.length === 0, onClick: submitAnnotations
        }, '提交批注' + (annotations.length ? ' (' + annotations.length + ')' : '')) : null
      )

      const statusText = status !== '' ? status
        : (mode === 'annotate' && selection ? '已框选 ' + (selection.selector || '区域') + '，填写批注后添加'
          : (mode === 'edit' ? '点击页面文字直接修改，改完点「保存改动」' : ''))

      const stage = h('div', { className: 'hp-stage' },
        src !== ''
          ? h('iframe', {
            key: frameKey, ref: frameRef, className: 'hp-frame', src: src,
            sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals',
            onLoad: onFrameLoad
          })
          : h('div', { className: 'hp-empty' },
            contentId.indexOf(FILE_PREFIX) === 0 && absolutePath === ''
              ? (addressIsFile
                ? '正在解析文件…'
                : '这个标签页打开的不是 HTML 文件，请从上方列表选择要预览的页面。')
              : (root === ''
                ? '没有可用的工作区。请在一个会话里打开 HTML 文件，或先选择工作区中的文件。'
                : '选择上方文件列表中的 HTML 文件，或用「打开…」导入本地页面。')
          ),
        mode === 'annotate' && selection ? h('div', { className: 'hp-anns' },
          h('div', { className: 'hp-ann' },
            h('div', { className: 'hp-ann-head' },
              h('span', { className: 'hp-pin' }, '+'),
              h('span', { className: 'hp-ann-sel' }, selection.selector || selection.tag || '区域')
            ),
            selection.snippet ? h('div', { className: 'hp-ann-snippet' }, '“' + selection.snippet + '”') : null,
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
              h('input', {
                style: { flex: '1 1 auto' }, value: comment, placeholder: '这条区域要怎么改？',
                onChange: function (e) { setComment(e.target.value) },
                onKeyDown: function (e) { if (e.key === 'Enter') addAnnotation() }
              }),
              h('button', { type: 'button', className: 'hp-btn hp-primary', disabled: busy, onClick: addAnnotation }, '添加批注')
            )
          )
        ) : null,
        picker ? h('div', { className: 'hp-picker' },
          h('div', { className: 'hp-picker-head' },
            h('button', { type: 'button', className: 'hp-btn', onClick: function () { setPicker(false) } }, '关闭'),
            h('button', {
              type: 'button', className: 'hp-btn', disabled: busy,
              onClick: function () {
                const path = browse && browse.path ? browse.path : ''
                const cut = path.lastIndexOf('/')
                browseTo(cut > 0 ? path.slice(0, cut) : '/')
              }
            }, '↑ 上级'),
            h('span', { className: 'hp-picker-path', title: browse && browse.path }, (browse && browse.path) || '')
          ),
          h('div', { className: 'hp-picker-list' },
            (browse && Array.isArray(browse.entries) ? browse.entries : []).map(function (entry) {
              const isDir = entry.type === 'directory'
              const isHtml = /\.html?$/i.test(entry.name)
              return h('div', {
                key: entry.path, className: 'hp-row' + (isDir || isHtml ? '' : ' hp-dim'),
                onClick: function () {
                  if (isDir) browseTo(entry.path)
                  else if (isHtml) importFile(entry.path)
                }
              },
                h('span', { className: 'hp-row-name' }, (isDir ? '📁 ' : '📄 ') + entry.name),
                h('span', { className: 'hp-row-tag' }, isDir ? '' : (isHtml ? '导入' : '非 HTML'))
              )
            }),
            browse && Array.isArray(browse.entries) && browse.entries.length === 0
              ? h('div', { className: 'hp-row hp-dim' }, '（空目录）') : null
          )
        ) : null
      )

      const anns = annotations.length > 0
        ? h('div', { className: 'hp-anns' },
          annotations.map(function (a, i) {
            return h('div', { className: 'hp-ann', key: a.id },
              h('div', { className: 'hp-ann-head' },
                h('span', { className: 'hp-pin' }, String(i + 1)),
                h('span', { className: 'hp-ann-sel', title: a.selector }, a.selector || a.tag || '区域'),
                h('button', {
                  type: 'button', className: 'hp-btn',
                  onClick: function () { sendCmd(frameRef.current, { t: 'jump', x: a.sx || 0, y: a.sy || 0 }) }
                }, '定位'),
                h('button', { type: 'button', className: 'hp-btn', onClick: function () { removeAnnotation(a.id) } }, '删除')
              ),
              h('div', { className: 'hp-ann-text' }, a.comment),
              a.snippet ? h('div', { className: 'hp-ann-snippet' }, '“' + a.snippet + '”') : null
            )
          })
        ) : null

      return h('div', { className: 'hp-root' },
        bar,
        statusText !== ''
          ? h('div', { className: 'hp-status' + (statusKind === 'err' ? ' hp-err' : statusKind === 'ok' ? ' hp-ok' : '') }, statusText)
          : null,
        stage,
        anns
      )
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Floating conversation: host the current Session's Conversation in a tab so
    // the shell's dockkit can float it. `conversation.content` is the public
    // reusable factory the shell's own sidebar chat tab renders through.
    // ───────────────────────────────────────────────────────────────────────────
    function ChatView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    function ChatBody(props) {
      const sessionId = props.sessionId
      let chatTabId = ''
      try {
        const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
        chatTabId = info && info.tab && typeof info.tab.id === 'string' ? info.tab.id : ''
      } catch (e) { chatTabId = '' }
      const rootRef = React.useRef(null)
      React.useEffect(function () {
        const el = rootRef.current
        const floating = !!(el && typeof el.closest === 'function' && el.closest('[data-dockkit-float]'))
        publishChatProbe(chatTabId, floating)
      })
      React.useEffect(function () {
        return function () { publishChatProbe('', false) }
      }, [])
      const closeSelf = React.useCallback(function () {
        const controller = rightbarController
        if (!controller || chatTabId === '') { diag('chat-close-no-tab'); return }
        try { controller.close(chatTabId) } catch (e) { diag('chat-close-failed', e && e.message) }
      }, [chatTabId])
      const useSession = props.useSession
      const useConversation = props.useConversation
      const useSessions = props.useSessions
      const renderFactorySlot = props.renderFactorySlot
      let phase = 'active'
      let hero = false
      try {
        const session = typeof useSession === 'function' ? useSession(function (value) { return value }) : null
        const conversation = typeof useConversation === 'function' ? useConversation(function (value) { return value }) : null
        const summaryBlank = typeof useSessions === 'function'
          ? useSessions(function (state) { return state.byId[sessionId] ? state.byId[sessionId].blank : undefined })
          : undefined
        const live = !!(conversation && conversation.activeTargets && conversation.activeTargets.size > 0)
        const shellPhase = live || (session && !session.blank && !session.awaitingFirstTurn) || (session && session.running)
          ? 'active'
          : (session && session.promptAttempted ? 'engaging' : 'blank')
        const settling = shellPhase === 'blank' && session && session.openState === 'loading' && summaryBlank !== true
        hero = shellPhase === 'blank' && !!session && (session.openState === 'open' || summaryBlank === true)
        phase = settling ? 'settling' : hero ? 'hero' : 'active'
      } catch (e) { diag('chat-phase-failed', e && e.message) }
      try {
        if (typeof renderFactorySlot !== 'function') throw new Error('renderFactorySlot 不可用')
        return h('div', { className: 'hp-chat', ref: rootRef },
          h('div', { className: 'hp-chat-bar' },
            h('span', { className: 'hp-chat-label' }, '会话'),
            h('button', {
              type: 'button', className: 'hp-btn',
              title: '收回这个悬浮会话窗口', onClick: closeSelf
            }, '⇲ 收回')
          ),
          renderFactorySlot('conversation.content',
            { variant: 'embedded', phase: phase, hero: hero },
            { slots: { views: ChatView } }))
      } catch (e) {
        diag('chat-render-failed', e && e.message)
        return h('div', { className: 'hp-empty' }, '无法在此渲染会话：' + ((e && e.message) || String(e)))
      }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Tab chip title.
    // ───────────────────────────────────────────────────────────────────────────
    function Title(props) {
      let tab = null
      try {
        const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
        tab = info && info.tab ? info.tab : null
      } catch (e) { tab = null }
      const parsed = tab ? parseFileAddress(tab.contentId) : null
      return h('span', null, parsed && parsed.path ? basename(parsed.path) : 'HTML 预览')
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Sidebar entry point.
    // ───────────────────────────────────────────────────────────────────────────
    function SidebarAction(props) {
      return h('button', {
        type: 'button', className: 'hp-foot-btn', title: 'HTML 预览：预览、直接改文案、框选区域批注给 AI',
        onClick: props.onOpen
      },
        h('span', { className: 'hp-foot-icon' }, '🖼'),
        props.wide ? h('span', { className: 'hp-foot-label' }, 'HTML 预览') : null
      )
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Client body.
    // ───────────────────────────────────────────────────────────────────────────
    function apply(ctx) {
      let disposeStyles = null
      try { disposeStyles = installStyles() } catch (e) { diag('styles-failed', e && e.message) }

      const slots = ctx.get('slots')
      const tabs = ctx.get('sidebarRightTabs')
      rightbarController = ctx.get('sidebarRight') || null
      if (slots === undefined) { diag('no-slots-service'); return }
      if (tabs === undefined) { diag('no-tab-registry'); return }

      // Mirror the last error into one non-rendering sidebar cell. A healthy
      // install registers nothing; a failure becomes inspectable.
      let diagDisposer = null
      diagCell = function (text) {
        try {
          if (diagDisposer) { try { diagDisposer() } catch (e) {} diagDisposer = null }
          diagDisposer = slots.inject('sidebar.footer.action', function () {
            return slots.register(
              { name: 'sidebar.footer.action', id: 'html-preview-diag:' + text.slice(0, 320), order: 99 },
              function () { return null }
            )
          })
        } catch (e) {}
      }

      function openPreview() {
        try {
          const controller = ctx.get('sidebarRight')
          if (!controller) { diag('no-sidebar-right'); return }
          controller.openTab(KIND)
        } catch (e) { diag('open-tab-failed', e && e.message) }
      }

      // The tab type: claims HTML resources so a conversation file link opens here,
      // and appears as one guide entry for an empty right column.
      ctx.effect(function () {
        let dispose = null
        try {
          dispose = tabs.register({
            id: TYPE_ID,
            kind: KIND,
            patterns: ['*.html', '*.htm'],
            priority: 'extension',
            title: function (address) {
              const parsed = parseFileAddress(address)
              return parsed && parsed.path ? basename(parsed.path) : 'HTML 预览'
            },
            guide: [{
              id: 'html-preview', kind: KIND, title: 'HTML 预览',
              description: '预览页面、直接改文案、框选区域批注给 AI'
            }],
            keepMounted: true
          })
        } catch (e) {
          diag('type-register-failed', e && e.message)
          return
        }
        try {
          if (typeof tabs.candidates !== 'function') { diag('claim-api-absent'); return dispose }
          const ranked = tabs.candidates('dsh-resource://file/session/probe/page.html')
          const idOf = function (entry) { return entry && entry.id ? entry.id : entry }
          const mine = Array.isArray(ranked) && ranked.some(function (entry) {
            return idOf(entry) === TYPE_ID
          })
          if (!mine) diag('claim-miss', JSON.stringify(ranked).slice(0, 180))
          else if (idOf(ranked[0]) !== TYPE_ID) diag('claim-not-first', String(idOf(ranked[0])))
        } catch (e) { diag('claim-check-failed', e && e.message) }
        return dispose
      }, 'dsh-html-preview: tab type')

      ctx.effect(function () {
        return slots.inject('sidebar.right.pane.tab', function () {
          return slots.register({ name: 'sidebar.right.pane.tab', key: TYPE_ID }, Body)
        })
      }, 'dsh-html-preview: tab body')

      ctx.effect(function () {
        return slots.inject('sidebar.right.pane.tab.title', function () {
          return slots.register({ name: 'sidebar.right.pane.tab.title', key: TYPE_ID }, Title)
        })
      }, 'dsh-html-preview: tab title')

      ctx.effect(function () {
        try {
          return tabs.register({
            id: CHAT_ID,
            kind: CHAT_KIND,
            title: function () { return '会话' },
            keepMounted: true
          })
        } catch (e) { diag('chat-type-failed', e && e.message); return }
      }, 'dsh-html-preview: chat type')

      ctx.effect(function () {
        return slots.inject('sidebar.right.pane.tab', function () {
          return slots.register({ name: 'sidebar.right.pane.tab', key: CHAT_ID }, ChatBody)
        })
      }, 'dsh-html-preview: chat body')

      ctx.effect(function () {
        return slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'html-preview', order: 5, label: 'HTML 预览' },
            function (slotProps) { return h(SidebarAction, { wide: slotProps.wide, onOpen: openPreview }) }
          )
        })
      }, 'dsh-html-preview: sidebar action')

      ctx.effect(function () {
        return function () { if (disposeStyles) { try { disposeStyles() } catch (e) {} } }
      }, 'dsh-html-preview: styles')
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  }
})
