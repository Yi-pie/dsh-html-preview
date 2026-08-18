window.__ModuleLoader__.load({ id: 'dsh-html-preview', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
const React = require('react')

const store = { open: false, pendingOpenPath: null, pendingRel: null, wsRoot: '', rel: null, mode: 'view', lastW: 0, zoomSel: 'fit', floatOn: false }
const subs = []
let frameEl = null
const cmdQueue = []
let lastPollKey = ''

function findFrame() {
  const ov = document.querySelector('[data-shell-overlay]')
  return ov ? ov.parentElement : null
}

function parseSidebarPx(frame) {
  const m = /^\s*([\d.]+)px/.exec(frame.style.gridTemplateColumns || '')
  return m ? parseFloat(m[1]) : 56
}

function parseDetailsPx(frame) {
  const tracks = String(frame.style.gridTemplateColumns || '').split(/\s+/)
  const m = /^([\d.]+)px$/.exec(tracks[tracks.length - 1] || '')
  return m ? parseFloat(m[1]) : 480
}

const MIN_CENTER = 240
const MIN_PANEL = 280

function applyColumnWidth(W) {
  const frame = findFrame()
  if (!frame) return false
  const sidebar = parseSidebarPx(frame)
  const maxW = Math.max(MIN_PANEL, window.innerWidth - sidebar - MIN_CENTER)
  const w = Math.min(Math.max(Math.round(W), MIN_PANEL), maxW)
  frame.style.gridTemplateColumns = sidebar + 'px minmax(' + MIN_CENTER + 'px, 1fr) ' + w + 'px'
  store.lastW = w
  return true
}

// ── 会话区悬浮窗 ────────────────────────────────────────────────────────────────
const floatStore = { on: false, x: 0, y: 0, w: 0, h: 0 }
let floatChrome = null
let floatBaseStyles = null
let floatGridCols = null
let shellHandleEl = null
let shellHandleDisplay = ''

function frameCols() {
  const frame = findFrame()
  if (!frame || frame.children.length < 3) return null
  const overlay = frame.querySelector('[data-shell-overlay]')
  const sidebarCol = frame.children[0]
  const panelEl = frame.querySelector('.dsh-pp')
  let detailsCol = null
  if (panelEl) {
    let p = panelEl.parentElement
    while (p && p !== frame) {
      if (p.parentElement === frame) { detailsCol = p; break }
      p = p.parentElement
    }
  }
  if (!detailsCol) detailsCol = frame.children[2]
  let centerCol = null
  for (let i = 0; i < frame.children.length; i++) {
    const el = frame.children[i]
    if (el === sidebarCol || el === detailsCol || el === overlay) continue
    if (el.hasAttribute && el.hasAttribute('data-side')) continue
    centerCol = el
    break
  }
  if (!centerCol || centerCol === detailsCol || centerCol === sidebarCol) return null
  return { frame: frame, sidebarCol: sidebarCol, centerCol: centerCol, detailsCol: detailsCol, overlay: overlay }
}

function hideShellDetailsHandle() {
  const frame = findFrame()
  if (!frame) return
  const h = frame.querySelector('[data-side="details"]')
  if (!h) return
  if (shellHandleEl && shellHandleEl !== h) {
    try { shellHandleEl.style.display = shellHandleDisplay } catch (e) {}
  }
  if (shellHandleEl !== h) {
    shellHandleDisplay = h.style.display
    shellHandleEl = h
  }
  if (h.style.display !== 'none') h.style.display = 'none'
}

function restoreShellDetailsHandle() {
  if (shellHandleEl) {
    try { shellHandleEl.style.display = shellHandleDisplay } catch (e) {}
    shellHandleEl = null
  }
}

function ensureFloatChrome() {
  if (floatChrome) return floatChrome
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;z-index:2003;height:30px;display:flex;align-items:center;gap:10px;padding:0 10px;cursor:move;user-select:none;background:linear-gradient(180deg,rgba(28,28,30,.94),rgba(28,28,30,.8));color:#fff;border-radius:12px 12px 0 0;font:600 12px/1 system-ui,-apple-system,sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.25);box-sizing:border-box'
  const title = document.createElement('span')
  title.textContent = '会话（悬浮）'
  const hint = document.createElement('span')
  hint.textContent = '拖动此条移动 · 右下角调整大小'
  hint.style.cssText = 'font-weight:400;font-size:11px;color:#b8b8c0'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '还原'
  btn.style.cssText = 'font:inherit;color:#fff;background:#2f6bff;border:0;border-radius:6px;padding:3px 10px;cursor:pointer;margin-left:auto'
  btn.addEventListener('click', function (e) {
    e.stopPropagation()
    disableFloat()
  })
  bar.appendChild(title)
  bar.appendChild(hint)
  bar.appendChild(btn)
  const corner = document.createElement('div')
  corner.style.cssText = 'position:fixed;z-index:2003;width:26px;height:26px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 46%,rgba(47,107,255,.9) 46%);border-radius:0 0 12px 0'
  bar.addEventListener('pointerdown', function (e) { beginFloatDrag(e, 'move') })
  corner.addEventListener('pointerdown', function (e) { beginFloatDrag(e, 'resize') })
  document.body.appendChild(bar)
  document.body.appendChild(corner)
  floatChrome = { bar: bar, corner: corner }
  return floatChrome
}

function beginFloatDrag(e, kind) {
  if (e.button !== undefined && e.button !== 0) return
  e.preventDefault()
  const el = e.currentTarget
  try { el.setPointerCapture(e.pointerId) } catch (err) {}
  const sx = e.clientX
  const sy = e.clientY
  const ox = floatStore.x
  const oy = floatStore.y
  const ow = floatStore.w
  const oh = floatStore.h
  function move(ev) {
    if (kind === 'move') {
      floatStore.x = Math.min(Math.max(ox + (ev.clientX - sx), -floatStore.w + 80), window.innerWidth - 80)
      floatStore.y = Math.min(Math.max(oy + (ev.clientY - sy), 0), window.innerHeight - 40)
    } else {
      floatStore.w = Math.min(Math.max(ow + (ev.clientX - sx), 320), window.innerWidth)
      floatStore.h = Math.min(Math.max(oh + (ev.clientY - sy), 220), window.innerHeight)
    }
    applyFloatPos()
  }
  function up() {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

function removeFloatChrome() {
  if (!floatChrome) return
  try {
    if (floatChrome.bar.parentNode) floatChrome.bar.parentNode.removeChild(floatChrome.bar)
    if (floatChrome.corner.parentNode) floatChrome.corner.parentNode.removeChild(floatChrome.corner)
  } catch (e) {}
  floatChrome = null
}

function layoutFloatChrome() {
  const c = floatChrome
  if (!c) return
  c.bar.style.left = floatStore.x + 'px'
  c.bar.style.top = floatStore.y + 'px'
  c.bar.style.width = floatStore.w + 'px'
  c.corner.style.left = (floatStore.x + floatStore.w - 26) + 'px'
  c.corner.style.top = (floatStore.y + floatStore.h - 26) + 'px'
}

function applyFloatPos() {
  const cols = frameCols()
  if (cols && cols.centerCol) {
    cols.centerCol.style.left = floatStore.x + 'px'
    cols.centerCol.style.top = floatStore.y + 'px'
    cols.centerCol.style.width = floatStore.w + 'px'
    cols.centerCol.style.height = floatStore.h + 'px'
  }
  layoutFloatChrome()
}

function reassertFloatGrid() {
  if (!floatStore.on) return
  const cols = frameCols()
  if (!cols) return
  const sidebar = parseSidebarPx(cols.frame)
  const want = sidebar + 'px 0px minmax(0,1fr)'
  if (cols.frame.style.gridTemplateColumns !== want) cols.frame.style.gridTemplateColumns = want
  if (cols.sidebarCol) cols.sidebarCol.style.gridColumn = '1'
  if (cols.detailsCol) cols.detailsCol.style.gridColumn = '3'
}

function enableFloat() {
  const cols = frameCols()
  if (!cols || floatStore.on) return false
  const col = cols.centerCol
  const frame = cols.frame
  const sidebar = parseSidebarPx(frame)
  floatBaseStyles = {
    position: col.style.position || '', left: col.style.left || '', top: col.style.top || '',
    width: col.style.width || '', height: col.style.height || '',
    zIndex: col.style.zIndex || '', boxShadow: col.style.boxShadow || '',
    borderRadius: col.style.borderRadius || '', border: col.style.border || ''
  }
  if (!floatStore.w) {
    floatStore.w = Math.min(520, Math.max(340, Math.round(window.innerWidth * 0.44)))
    floatStore.h = Math.max(320, window.innerHeight - 120)
    floatStore.x = sidebar + 12
    floatStore.y = 56
  }
  col.style.position = 'fixed'
  col.style.zIndex = '2000'
  col.style.boxShadow = '0 18px 60px rgba(0,0,0,.35)'
  col.style.borderRadius = '12px'
  col.style.border = '1px solid rgba(127,127,127,.35)'
  floatGridCols = {
    s: cols.sidebarCol ? cols.sidebarCol.style.gridColumn || '' : '',
    d: cols.detailsCol ? cols.detailsCol.style.gridColumn || '' : ''
  }
  if (cols.sidebarCol) cols.sidebarCol.style.gridColumn = '1'
  if (cols.detailsCol) cols.detailsCol.style.gridColumn = '3'
  frame.style.gridTemplateColumns = sidebar + 'px 0px minmax(0,1fr)'
  ensureFloatChrome()
  applyFloatPos()
  hideShellDetailsHandle()
  floatStore.on = true
  store.floatOn = true
  notify()
  return true
}

function disableFloat() {
  removeFloatChrome()
  const cols = frameCols()
  const col = cols ? cols.centerCol : null
  if (col && floatBaseStyles) {
    const st = floatBaseStyles
    col.style.position = st.position
    col.style.left = st.left
    col.style.top = st.top
    col.style.width = st.width
    col.style.height = st.height
    col.style.zIndex = st.zIndex
    col.style.boxShadow = st.boxShadow
    col.style.borderRadius = st.borderRadius
    col.style.border = st.border
    floatBaseStyles = null
  }
  if (cols) {
    if (floatGridCols) {
      if (cols.sidebarCol) cols.sidebarCol.style.gridColumn = floatGridCols.s
      if (cols.detailsCol) cols.detailsCol.style.gridColumn = floatGridCols.d
      floatGridCols = null
    }
    applyColumnWidth(store.lastW || 480)
  }
  floatStore.on = false
  store.floatOn = false
  notify()
}

function openPathInPanel(p) {
  const root = store.wsRoot
  let target = null
  if (root && p.indexOf(root) === 0 && (p.length === root.length || p[root.length] === '/')) {
    target = p.slice(root.length).replace(/^\/+/, '')
  }
  if (target) {
    store.pendingRel = target
    toggle(true)
    notify()
  } else {
    api('import-file', { path: p, root: root }).then(function (r) {
      if (r && r.ok) {
        store.pendingRel = r.rel
        toggle(true)
        notify()
      }
    }).catch(function () {})
  }
}

function api(method, args) {
  return fetch('/dsh-preview-api/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  }).then(function (r) { return r.json() })
}

function subscribe(fn) {
  subs.push(fn)
  return function () {
    const i = subs.indexOf(fn)
    if (i >= 0) subs.splice(i, 1)
  }
}
function notify() {
  subs.slice().forEach(function (f) { try { f() } catch (e) {} })
}
function toggle(open) {
  store.open = open === undefined ? !store.open : !!open
  notify()
}

function el(type, props) {
  const args = [type, props]
  for (let i = 2; i < arguments.length; i++) args.push(arguments[i])
  return React.createElement.apply(null, args)
}

function encRel(rel) {
  return String(rel || '').split('/').map(function (s) { return encodeURIComponent(s) }).join('/')
}

function installOpenPathHook(workspaces) {
  if (!workspaces || workspaces.__dshPreviewHooked) return
  const orig = workspaces.openPath
  if (typeof orig !== 'function') return
  workspaces.__dshPreviewHooked = true
  workspaces.openPath = function (path) {
    if (typeof path === 'string' && /\.html?$/i.test(path)) {
      store.pendingOpenPath = path
      notify()
      return Promise.resolve()
    }
    return orig.apply(workspaces, arguments)
  }
}

function SidebarToggle(props) {
  const [open, setOpen] = React.useState(store.open)
  React.useEffect(function () {
    return subscribe(function () { setOpen(store.open) })
  }, [])
  return el('button', {
    type: 'button',
    className: 'dsh-pp-toggle' + (open ? ' dsh-pp-toggle-open' : ''),
    title: 'HTML 预览面板：预览工作区 HTML、直接改文案、框选区域批注给 AI',
    onClick: function () { toggle() }
  },
    el('span', { className: 'dsh-pp-toggle-icon' }, '🖼'),
    props.wide ? el('span', { className: 'dsh-pp-toggle-label' }, '预览') : null)
}

function sendCmd(cmd) {
  const win = frameEl && frameEl.contentWindow
  if (!win) return
  const b = win.__dshPreview
  if (b && typeof b.handleCmd === 'function') {
    try { b.handleCmd(cmd); return } catch (e) {}
  }
  if (win.__dshPreviewCmd === null || win.__dshPreviewCmd === undefined) win.__dshPreviewCmd = cmd
  else cmdQueue.push(cmd)
}

function Panel(props) {
  const pctx = props.ctx
  const useSessions = props.useSessions
  const currentSessionId = typeof useSessions === 'function' ? useSessions(function (s) { return s.current }) : undefined
  const wsRoot = typeof useSessions === 'function' ? useSessions(function (s) {
    const cur = s.current
    const row = cur && s.byId ? s.byId[cur] : undefined
    return row && typeof row.cwd === 'string' ? row.cwd : ''
  }) : ''
  const workspaces = pctx ? pctx.get('workspaces') : undefined

  const [files, setFiles] = React.useState([])
  const [rel, setRel] = React.useState(store.rel)
  const [frameKey, setFrameKey] = React.useState(0)
  const [mode, setMode] = React.useState(store.mode)
  const [edits, setEdits] = React.useState([])
  const [selection, setSelection] = React.useState(null)
  const [annotations, setAnnotations] = React.useState([])
  const [comment, setComment] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [browse, setBrowse] = React.useState(null)
  const [listTick, setListTick] = React.useState(0)
  const [bridgeInfo, setBridgeInfo] = React.useState(null)
  const [zoomSel, setZoomSel] = React.useState(store.zoomSel)
  const [floatOn, setFloatOn] = React.useState(store.floatOn)

  const annRef = { current: annotations }
  const modeRef = { current: mode }
  annRef.current = annotations
  modeRef.current = mode
  store.wsRoot = wsRoot

  React.useEffect(function () {
    return subscribe(function () {
      setFloatOn(store.floatOn)
      const t = store.pendingRel
      if (t === null) return
      store.pendingRel = null
      openFile(t)
    })
  }, [])

  React.useEffect(function () {
    const t = store.pendingRel
    if (t === null) return
    store.pendingRel = null
    openFile(t)
  }, [])

  React.useEffect(function () {
    if (workspaces) installOpenPathHook(workspaces)
  }, [workspaces])

  React.useEffect(function () {
    if (!wsRoot) return
    let dead = false
    api('authorize-root', { root: wsRoot }).catch(function () {}).then(function () {
      if (dead) return
      return api('list-files', { root: wsRoot })
    }).then(function (r) {
      if (dead || !r || !r.ok) return
      setFiles(r.files || [])
    }).catch(function () {})
    return function () { dead = true }
  }, [wsRoot, listTick])

  React.useEffect(function () {
    setRel(null)
    setAnnotations([])
    setSelection(null)
    setEdits([])
    setStatus('')
    setBridgeInfo(null)
  }, [wsRoot])

  React.useEffect(function () {
    if (!store.lastW) return
    const t = setTimeout(function () { applyColumnWidth(store.lastW) }, 80)
    return function () { clearTimeout(t) }
  }, [])

  function startDrag(e) {
    e.preventDefault()
    const frame = findFrame()
    if (!frame) return
    const startX = e.clientX
    const startW = parseDetailsPx(frame)
    frame.setAttribute('data-dragging', '')
    function onMove(ev) {
      applyColumnWidth(startW + (startX - ev.clientX))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      frame.removeAttribute('data-dragging')
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  React.useEffect(function () {
    if (!pctx) return
    const dispose = pctx.interval(function () {
      if (store.open) hideShellDetailsHandle()
      if (floatStore.on) reassertFloatGrid()
      while (cmdQueue.length > 0) {
        const win = frameEl && frameEl.contentWindow
        if (!win) { cmdQueue.length = 0; break }
        if (win.__dshPreviewCmd === null || win.__dshPreviewCmd === undefined) win.__dshPreviewCmd = cmdQueue.shift()
        else break
      }
      const win = frameEl && frameEl.contentWindow
      if (!win) { if (bridgeInfo !== null) setBridgeInfo(null); return }
      const b = win.__dshPreview
      if (!b) { if (bridgeInfo !== null) setBridgeInfo(null); return }
      const st = b.state || {}
      const info = { ready: !!b.ready, lastError: b.lastError || '', mode: st.mode || 'view' }
      setBridgeInfo(function (prev) {
        if (prev && prev.ready === info.ready && prev.lastError === info.lastError && prev.mode === info.mode) return prev
        return info
      })
      const editsNow = st.edits || []
      const selNow = st.selection || null
      const key = editsNow.length + ':' + (selNow ? selNow.at : '-')
      if (key === lastPollKey) return
      lastPollKey = key
      setEdits(editsNow.map(function (e) { return { path: e.path, original: e.original, current: e.current } }))
      if (selNow) {
        setSelection({
          x: selNow.x, y: selNow.y, w: selNow.w, h: selNow.h,
          sx: selNow.sx, sy: selNow.sy, docX: selNow.docX, docY: selNow.docY,
          selector: selNow.selector, tag: selNow.tag, snippet: selNow.snippet, at: selNow.at
        })
      } else setSelection(null)
    }, 300)
    return dispose
  }, [pctx])

  const src = rel && wsRoot ? '/dsh-preview/' + encodeURIComponent(wsRoot) + '/' + encRel(rel) + '?v=' + frameKey : null

  function openFile(nextRel) {
    store.rel = nextRel
    setRel(nextRel)
    setFrameKey(function (k) { return k + 1 })
    setEdits([])
    setSelection(null)
    setComment('')
    setStatus('')
    setBridgeInfo(null)
    lastPollKey = ''
    api('list-annotations', { rel: nextRel }).then(function (r) {
      if (r && Array.isArray(r.annotations)) setAnnotations(r.annotations)
    }).catch(function () {})
  }

  function handleLoad() {
    const win = frameEl && frameEl.contentWindow
    if (!win) return
    sendCmd({ t: 'mode', v: modeRef.current })
    sendCmd({ t: 'zoom', v: store.zoomSel === 'fit' ? 'fit' : parseFloat(store.zoomSel) })
    const pins = annRef.current.map(function (a) { return { x: a.docX, y: a.docY, comment: a.comment, selector: a.selector } })
    sendCmd({ t: 'pins', pins: pins })
  }

  function changeZoom(next) {
    store.zoomSel = next
    setZoomSel(next)
    sendCmd({ t: 'zoom', v: next === 'fit' ? 'fit' : parseFloat(next) })
  }

  function toggleFloat() {
    if (floatStore.on) disableFloat()
    else if (!enableFloat()) { setStatus('无法悬浮：未找到会话列布局元素'); return }
    setFloatOn(store.floatOn)
  }

  function changeMode(next) {
    store.mode = next
    setMode(next)
    sendCmd({ t: 'mode', v: next })
    if (next !== 'annotate') { setSelection(null); setComment('') }
  }

  function clearSel() {
    sendCmd({ t: 'clearSel' })
    setSelection(null)
    setComment('')
  }

  function addAnnotation() {
    if (!selection || !comment.trim() || !rel) return
    const ann = {
      rel: rel, selector: selection.selector || '', tag: selection.tag || '',
      snippet: selection.snippet || '', comment: comment.trim(),
      x: selection.x, y: selection.y, w: selection.w, h: selection.h,
      sx: selection.sx, sy: selection.sy, docX: selection.docX, docY: selection.docY,
      at: Date.now(), submitted: false
    }
    setBusy(true)
    api('add-annotation', { rel: rel, annotation: ann }).then(function (r) {
      setBusy(false)
      if (r && r.ok && Array.isArray(r.annotations)) {
        setAnnotations(r.annotations)
        clearSel()
      } else setStatus('添加批注失败: ' + (r && r.error))
    }).catch(function () { setBusy(false); setStatus('添加批注失败') })
  }

  function removeAnn(id) {
    if (!rel) return
    api('delete-annotation', { rel: rel, id: id }).then(function (r) {
      if (r && r.ok && Array.isArray(r.annotations)) {
        setAnnotations(r.annotations)
        sendCmd({ t: 'pins', pins: r.annotations.map(function (a) { return { x: a.docX, y: a.docY, comment: a.comment, selector: a.selector } }) })
      }
    }).catch(function () {})
  }

  function jumpTo(a) {
    sendCmd({ t: 'jump', x: a.sx || 0, y: a.sy || 0 })
  }

  function saveEdits() {
    if (!rel) return
    const win = frameEl && frameEl.contentWindow
    const live = (win && win.__dshPreview && win.__dshPreview.state && win.__dshPreview.state.edits) || []
    if (live.length === 0) { setStatus('没有待保存的修改'); return }
    setBusy(true)
    api('apply-text-edits', {
      root: wsRoot,
      rel: rel,
      edits: live.map(function (e) { return { path: e.path, original: e.original, current: e.current } })
    }).then(function (r) {
      setBusy(false)
      if (r && r.ok) {
        setStatus('已保存 ' + r.applied + ' 处文案修改' + (r.skipped && r.skipped.length ? '，跳过 ' + r.skipped.length + ' 处未匹配' : ''))
        if (r.applied > 0) {
          sendCmd({ t: 'clearEdits' })
          setEdits([])
          setFrameKey(function (k) { return k + 1 })
        }
      } else setStatus('保存失败: ' + (r && r.error ? r.error : '未知错误'))
    }).catch(function () { setBusy(false); setStatus('保存失败') })
  }

  function submitAnnotations() {
    if (!rel || annotations.length === 0) return
    setBusy(true)
    api('submit-annotations', { rel: rel, sessionId: currentSessionId, annotations: annotations }).then(function (r) {
      setBusy(false)
      if (r && r.ok) {
        if (r.delivered) {
          setAnnotations(function (prev) { return prev.map(function (a) { return Object.assign({}, a, { submitted: true }) }) })
          setStatus('✅ 已提交 ' + annotations.length + ' 条批注给 AI，等它在对话中处理')
        } else {
          setStatus('批注已记录（' + (r.reason || '') + '）')
        }
      } else setStatus('提交失败: ' + (r && r.error))
    }).catch(function () { setBusy(false); setStatus('提交失败') })
  }

  function ensureImportDir() {
    if (!workspaces || !wsRoot) return Promise.resolve()
    return workspaces.createDirectory(wsRoot, '.dsh').catch(function () {})
      .then(function () { return workspaces.createDirectory(wsRoot + '/.dsh', 'html-preview').catch(function () {}) })
  }

  function loadDir(path) {
    api('browse-dir', { path: path }).then(function (r) {
      if (r && r.ok) setBrowse({ path: r.path, entries: r.entries || [] })
      else setStatus('无法浏览: ' + (r && r.error))
    }).catch(function () { setStatus('无法浏览目录') })
  }

  function openBrowser() {
    let start = Promise.resolve(null)
    if (workspaces && typeof workspaces.pickDirectory === 'function') {
      start = workspaces.pickDirectory().catch(function () { return null })
    }
    start.then(function (dir) {
      loadDir(dir || wsRoot || '')
    })
  }

  function pickImport(path) {
    if (!/\.html?$/i.test(path)) { setStatus('请选择 .html 文件'); return }
    setBusy(true)
    ensureImportDir().catch(function () {}).then(function () {
      return api('import-file', { path: path, root: wsRoot })
    }).then(function (r) {
      setBusy(false)
      if (r && r.ok) {
        setBrowse(null)
        setListTick(function (t) { return t + 1 })
        openFile(r.rel)
        setStatus('已导入: ' + r.rel)
      } else setStatus('导入失败: ' + (r && r.error))
    }).catch(function () { setBusy(false); setStatus('导入失败') })
  }

  function renderBrowser() {
    if (!browse) return null
    return el('div', { className: 'dsh-pp-browse' },
      el('div', { className: 'dsh-pp-browse-card' },
        el('div', { className: 'dsh-pp-browse-head' },
          el('div', null, '导入 HTML 文件'),
          el('button', { onClick: function () { setBrowse(null) } }, '✕')),
        el('div', { className: 'dsh-pp-browse-path' }, browse.path),
        el('div', { className: 'dsh-pp-browse-list' },
          browse.entries.map(function (entry) {
            const isHtml = /\.html?$/i.test(entry.name)
            const isDir = entry.type === 'directory'
            return el('button', {
              key: entry.path,
              className: 'dsh-pp-browse-row' + (isHtml ? ' dsh-pp-browse-row-html' : ''),
              onClick: function () {
                if (isDir) loadDir(entry.path)
                else if (isHtml) pickImport(entry.path)
              }
            }, (isDir ? '📁 ' : '▤ ') + entry.name)
          }),
          browse.entries.length === 0 ? el('div', { className: 'dsh-pp-browse-empty' }, '此目录为空') : null)))
  }

  let modeChip = null
  if (bridgeInfo) {
    modeChip = el('div', { className: 'dsh-pp-bridge' + (bridgeInfo.ready ? '' : ' dsh-pp-bridge-err') },
      bridgeInfo.ready
        ? ('桥接正常 · 页面模式: ' + (bridgeInfo.mode === 'edit' ? '改文案' : bridgeInfo.mode === 'annotate' ? '批注' : '预览'))
        : ('桥接异常: ' + (bridgeInfo.lastError || '未知错误')))
  }

  return el('div', { className: 'dsh-pp' },
    floatOn ? null : el('div', { className: 'dsh-pp-colhandle', title: '拖动调整面板宽度（可拖到接近全屏）', onMouseDown: startDrag }),
    el('div', { className: 'dsh-pp-head' },
      el('div', { className: 'dsh-pp-title' }, '🖼 HTML 预览'),
      el('button', { className: 'dsh-pp-x', title: '关闭面板（恢复工具详情）', onClick: function () { toggle(false) } }, '✕')),
    el('div', { className: 'dsh-pp-toolbar' },
      el('select', {
        className: 'dsh-pp-select',
        value: rel || '',
        title: '选择工作区中的 HTML 文件',
        onChange: function (e) { if (e.target.value) openFile(e.target.value) }
      },
        el('option', { value: '' }, files.length ? '— 选择 HTML 文件 —' : '（工作区暂无 HTML 文件）'),
        files.map(function (f) { return el('option', { key: f.rel, value: f.rel }, f.rel) })),
      el('button', { title: '刷新文件列表', onClick: function () { setListTick(function (t) { return t + 1 }) } }, '⟳'),
      el('button', { title: '从本地目录导入 HTML 文件', onClick: openBrowser }, '导入…')),
    el('div', { className: 'dsh-pp-modes' },
      el('button', { className: 'dsh-pp-mode' + (mode === 'view' ? ' dsh-pp-mode-on' : ''), onClick: function () { changeMode('view') } }, '预览'),
      el('button', { className: 'dsh-pp-mode' + (mode === 'edit' ? ' dsh-pp-mode-on' : ''), title: '直接在页面上点击并修改文案', onClick: function () { changeMode('edit') } }, '改文案'),
      el('button', { className: 'dsh-pp-mode' + (mode === 'annotate' ? ' dsh-pp-mode-on' : ''), title: '拖拽框选页面区域后写批注', onClick: function () { changeMode('annotate') } }, '批注'),
      el('select', {
        className: 'dsh-pp-zoom',
        value: zoomSel,
        title: '页面缩放：适配宽度会把 PC 页面按桌面断点渲染后缩放至面板宽度',
        onChange: function (e) { changeZoom(e.target.value) }
      },
        el('option', { value: 'fit' }, '适配宽度'),
        el('option', { value: '0.5' }, '50%'),
        el('option', { value: '0.6' }, '60%'),
        el('option', { value: '0.75' }, '75%'),
        el('option', { value: '0.9' }, '90%'),
        el('option', { value: '1' }, '100%'),
        el('option', { value: '1.25' }, '125%'),
        el('option', { value: '1.5' }, '150%')),
      el('button', {
        className: 'dsh-pp-mode' + (floatOn ? ' dsh-pp-mode-on' : ''),
        title: floatOn ? '将会话区还原回中间列' : '将会话区分离为置顶悬浮窗，预览列即可占满宽度',
        onClick: toggleFloat
      }, floatOn ? '还原会话' : '悬浮会话'),
      el('button', { className: 'dsh-pp-save', disabled: !rel || edits.length === 0 || busy, title: '将文案修改写回文件', onClick: saveEdits }, '保存' + (edits.length ? ' (' + edits.length + ')' : '')),
      el('button', { className: 'dsh-pp-refresh', disabled: !rel, title: '重新加载预览', onClick: function () { setFrameKey(function (k) { return k + 1 }) } }, '⟲')),
    el('div', { className: 'dsh-pp-frame-wrap' },
      rel && src ? el('iframe', {
        key: 'f:' + rel + ':' + frameKey,
        ref: function (node) { frameEl = node },
        className: 'dsh-pp-frame',
        src: src,
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups',
        onLoad: handleLoad
      }) : el('div', { className: 'dsh-pp-empty' }, wsRoot ? '从上方选择或导入一个 HTML 文件开始预览\n\n模式说明：\n· 预览：普通浏览\n· 改文案：点击页面文字直接编辑，完成后点“保存”写回文件\n· 批注：拖拽框选区域，填写修改要求后提交给 AI\n\n提示：拖动面板左边缘可自由调整宽度（无 520px 上限），会话区会同步伸缩' : '无法获取当前会话的工作区路径，无法预览文件')),
    mode === 'annotate' && selection ? el('div', { className: 'dsh-pp-selform' },
      el('div', { className: 'dsh-pp-selform-title' }, '框选区域: ' + (selection.selector || selection.tag || '未知元素')),
      selection.snippet ? el('div', { className: 'dsh-pp-selform-snippet' }, '页面文案: "' + selection.snippet + '"') : null,
      el('textarea', {
        className: 'dsh-pp-selform-input',
        placeholder: '告诉 AI 这个区域要如何修改，例如：把这里的按钮文案改成“立即体验”，并加大字号…',
        value: comment,
        onChange: function (e) { setComment(e.target.value) }
      }),
      el('div', { className: 'dsh-pp-selform-actions' },
        el('button', { onClick: clearSel }, '取消'),
        el('button', { className: 'dsh-pp-primary', disabled: !comment.trim() || busy, onClick: addAnnotation }, '添加批注'))) : null,
    annotations.length ? el('div', { className: 'dsh-pp-anns' },
      el('div', { className: 'dsh-pp-anns-title' }, '批注（' + annotations.length + '）'),
      annotations.map(function (a, i) {
        return el('div', { key: a.id, className: 'dsh-pp-ann' },
          el('div', { className: 'dsh-pp-ann-top' },
            el('span', { className: 'dsh-pp-ann-num' }, String(i + 1)),
            el('span', { className: 'dsh-pp-ann-sel' }, a.selector || a.tag),
            el('span', { className: 'dsh-pp-ann-actions' },
              el('button', { title: '滚动到批注位置', onClick: function () { jumpTo(a) } }, '定位'),
              el('button', { title: '删除这条批注', onClick: function () { removeAnn(a.id) } }, '✕'))),
          a.snippet ? el('div', { className: 'dsh-pp-ann-snippet' }, '"' + a.snippet.slice(0, 60) + '"') : null,
          el('div', { className: 'dsh-pp-ann-comment' }, a.comment + (a.submitted ? '（已提交 ✓）' : '')))
      }),
      el('button', { className: 'dsh-pp-primary dsh-pp-submit', disabled: busy, onClick: submitAnnotations }, '提交批注给 AI'),
      el('div', { className: 'dsh-pp-anns-hint' }, '提交后 AI 会立即收到批注并修改文件；修改完成后点上方 ⟲ 重新加载查看')) : null,
    modeChip,
    status ? el('div', { className: 'dsh-pp-status' }, status) : null,
    renderBrowser())
}

const CSS = `
.dsh-pp { position: relative; width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; background: var(--dsh-panel-bg, #ffffff); color: var(--dsh-panel-text, #1c1c1e); font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.dsh-pp-colhandle { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; cursor: col-resize; z-index: 30; }
.dsh-pp-colhandle:hover { background: rgba(47,107,255,.22); }
.dsh-pp button { font: inherit; color: inherit; background: #f2f2f5; border: 1px solid rgba(127,127,127,.32); border-radius: 6px; padding: 4px 9px; cursor: pointer; }
.dsh-pp button:hover { background: #e8e8ee; }
.dsh-pp button:disabled { opacity: .45; cursor: not-allowed; }
.dsh-pp-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,.25); flex: 0 0 auto; }
.dsh-pp-title { font-weight: 650; font-size: 14px; }
.dsh-pp-x { padding: 2px 8px; }
.dsh-pp-toolbar { display: flex; gap: 6px; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.18); flex: 0 0 auto; }
.dsh-pp-select { flex: 1 1 200px; min-width: 0; font: inherit; padding: 4px 6px; border: 1px solid rgba(127,127,127,.32); border-radius: 6px; background: #fff; color: inherit; }
.dsh-pp-zoom { font: inherit; padding: 3px 4px; border: 1px solid rgba(127,127,127,.32); border-radius: 6px; background: #fff; color: inherit; }
.dsh-pp-modes { display: flex; gap: 6px; align-items: center; padding: 6px 12px; flex-wrap: wrap; border-bottom: 1px solid rgba(127,127,127,.18); flex: 0 0 auto; }
.dsh-pp-mode-on { background: #2f6bff !important; border-color: #2f6bff !important; color: #fff !important; }
.dsh-pp-primary { background: #2f6bff !important; border-color: #2f6bff !important; color: #fff !important; }
.dsh-pp-save { margin-left: auto; }
.dsh-pp-frame-wrap { flex: 1 1 auto; min-height: 120px; display: flex; background: #f7f7f9; overflow: hidden; }
.dsh-pp-frame { flex: 1; border: 0; width: 100%; height: 100%; background: #fff; }
.dsh-pp-empty { margin: auto; color: #8a8a90; padding: 24px; text-align: center; white-space: pre-line; }
.dsh-pp-selform { border-top: 2px solid #ff5f56; background: #fff7f6; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; max-height: 230px; }
.dsh-pp-selform-title { font-weight: 600; color: #b03a32; word-break: break-all; }
.dsh-pp-selform-snippet { color: #7a7a80; font-size: 12px; word-break: break-all; }
.dsh-pp-selform-input { font: inherit; min-height: 64px; border: 1px solid rgba(127,127,127,.35); border-radius: 6px; padding: 6px 8px; resize: vertical; }
.dsh-pp-selform-actions { display: flex; gap: 8px; justify-content: flex-end; }
.dsh-pp-anns { border-top: 1px solid rgba(127,127,127,.25); padding: 8px 12px; max-height: 250px; overflow: auto; display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; }
.dsh-pp-anns-title { font-weight: 650; }
.dsh-pp-ann { border: 1px solid rgba(127,127,127,.25); border-radius: 8px; padding: 6px 8px; }
.dsh-pp-ann-top { display: flex; align-items: center; gap: 6px; }
.dsh-pp-ann-num { background: #ff5f56; color: #fff; border-radius: 50%; width: 18px; height: 18px; text-align: center; font-size: 11px; line-height: 18px; flex: 0 0 auto; }
.dsh-pp-ann-sel { font-size: 11px; color: #6b6b72; word-break: break-all; flex: 1; min-width: 0; }
.dsh-pp-ann-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.dsh-pp-ann-actions button { padding: 1px 6px; font-size: 11px; }
.dsh-pp-ann-snippet { font-size: 11px; color: #8a8a90; margin-top: 2px; word-break: break-all; }
.dsh-pp-ann-comment { margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
.dsh-pp-submit { align-self: stretch; margin-top: 2px; padding: 7px; font-weight: 600; }
.dsh-pp-anns-hint { font-size: 11px; color: #8a8a90; }
.dsh-pp-status { padding: 6px 12px; font-size: 12px; color: #2f6bff; border-top: 1px solid rgba(127,127,127,.18); background: #f4f8ff; flex: 0 0 auto; }
.dsh-pp-bridge { padding: 3px 12px; font-size: 11px; color: #2f6bff; border-top: 1px solid rgba(127,127,127,.18); background: #f4f8ff; flex: 0 0 auto; }
.dsh-pp-bridge-err { color: #b03a32; background: #fff1ef; }
.dsh-pp-browse { position: absolute; inset: 0; background: rgba(15,15,20,.4); display: flex; align-items: center; justify-content: center; z-index: 90; }
.dsh-pp-browse-card { background: #fff; color: #1c1c1e; border-radius: 10px; width: 86%; height: 78%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.4); }
.dsh-pp-browse-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,.25); font-weight: 650; flex: 0 0 auto; }
.dsh-pp-browse-path { padding: 6px 12px; font-size: 11px; color: #6b6b72; word-break: break-all; border-bottom: 1px solid rgba(127,127,127,.15); flex: 0 0 auto; }
.dsh-pp-browse-list { flex: 1; overflow: auto; display: flex; flex-direction: column; padding: 4px; }
.dsh-pp-browse-row { display: block; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 6px; padding: 6px 8px; cursor: pointer; word-break: break-all; }
.dsh-pp-browse-row:hover { background: #eef2ff; }
.dsh-pp-browse-row-html { color: #2f6bff; }
.dsh-pp-browse-empty { margin: auto; color: #8a8a90; }
.dsh-pp-toggle { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; font-size: 12px; padding: 4px 8px; white-space: nowrap; line-height: 1.2; overflow: visible; }
.dsh-pp-toggle-label { white-space: nowrap; }
.dsh-pp-toggle-open { background: #e3ecff !important; border-color: #2f6bff !important; }
.dsh-pp-toggle-icon { font-size: 13px; line-height: 1; display: inline-flex; align-items: center; }
`

function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const layout = ctx.get('layout')
  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-plugin', 'dsh-html-preview')
  styleEl.textContent = CSS
  document.head.append(styleEl)
  const disposers = []
  disposers.push(function () { styleEl.remove() })
  disposers.push(slots.inject('sidebar.footer.action', function () {
    return slots.register(
      { name: 'sidebar.footer.action', id: 'html-preview', order: 5, label: 'HTML 预览' },
      function (props) { return el(SidebarToggle, { wide: props.wide }) }
    )
  }))
  const workspaces = ctx.get('workspaces')
  if (workspaces) installOpenPathHook(workspaces)

  let detailsRegistration = null
  let prevOpen = false
  disposers.push(ctx.effect(function () {
    return subscribe(function () {
      const p = store.pendingOpenPath
      if (p !== null) {
        store.pendingOpenPath = null
        toggle(true)
        setTimeout(function () { openPathInPanel(p) }, 120)
      }
      if (store.open === prevOpen) return
      prevOpen = store.open
      if (store.open) {
        if (!detailsRegistration) {
          detailsRegistration = slots.register(
            { name: 'details', priority: -10 },
            function (props) { return el(Panel, { ctx: ctx, useSessions: props.useSessions }) }
          )
        }
        if (layout && typeof layout.openDetails === 'function') {
          try { layout.openDetails() } catch (e) {}
        }
        setTimeout(function () { hideShellDetailsHandle() }, 60)
      } else {
        restoreShellDetailsHandle()
        if (floatStore.on) {
          try { disableFloat() } catch (e) {}
        }
        if (detailsRegistration) {
          try { detailsRegistration() } catch (e) {}
          detailsRegistration = null
        }
        if (layout && typeof layout.closeDetails === 'function') {
          try { layout.closeDetails() } catch (e) {}
        }
      }
    })
  }))

  ctx.effect(function () {
    return function () {
      disposers.forEach(function (d) { try { d() } catch (e) {} })
    }
  })
}

module.exports = { inject: ['timer'], apply }

return module.exports;
} });
