import { defineTool } from '@deepseek-ai/dsh-tools'

export const inject = ['fs', 'webServer', 'agents', 'tools']

const BRIDGE = `(function () {
  if (window.__dshPreview) return
  var api = { state: { version: 3, mode: 'view', edits: [], selection: null, zoom: { kind: 'none', scale: 1 } }, ready: true, lastError: '' }
  window.__dshPreview = api
  window.__dshPreviewCmd = null
  try {
    var editEnabled = false
    var annotateEnabled = false
    var snapshot = []
    var selBox = null
    var pinEls = []
    var selStart = null
    var collectTimer = null
    var modeBadge = null

    function elementPath(el) {
      var parts = []
      var node = el
      var depth = 0
      while (node && node.nodeType === 1 && depth < 10) {
        var part = node.tagName ? node.tagName.toLowerCase() : '*'
        if (node.id) part += '#' + node.id
        else {
          var cn = typeof node.className === 'string' ? node.className : ''
          var cls = cn.split(/\\s+/).filter(function (s) { return s }).slice(0, 2).join('.')
          if (cls) part += '.' + cls
        }
        var parent = node.parentElement
        if (parent) {
          var sibs = parent.children
          if (sibs.length > 1) {
            var idx = Array.prototype.indexOf.call(sibs, node)
            part += ':nth-child(' + (idx + 1) + ')'
          }
        }
        parts.unshift(part)
        node = parent
        depth += 1
      }
      return parts.join(' > ')
    }

    function collectTexts() {
      var out = []
      if (!document.body) return out
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
      var node
      var counters = {}
      while (node = walker.nextNode()) {
        var p = node.parentElement
        if (!p) continue
        var tag = p.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue
        var v = node.nodeValue
        if (v === null || v.replace(/\\s/g, '') === '') continue
        var key = elementPath(p)
        var idx = counters[key] || 0
        counters[key] = idx + 1
        out.push({ path: key + '::text[' + idx + ']', text: v })
      }
      return out
    }

    function enableEdit() {
      if (editEnabled) return
      editEnabled = true
      if (document.body) document.body.setAttribute('contenteditable', 'true')
      snapshot = collectTexts()
      document.addEventListener('input', debouncedCollect, true)
    }

    function disableEdit() {
      if (!editEnabled) return
      editEnabled = false
      document.removeEventListener('input', debouncedCollect, true)
      if (document.body) document.body.removeAttribute('contenteditable')
    }

    function debouncedCollect() {
      if (collectTimer) clearTimeout(collectTimer)
      collectTimer = setTimeout(function () {
        collectTimer = null
        var now = collectTexts()
        var edits = []
        var n = Math.max(snapshot.length, now.length)
        for (var i = 0; i < n; i++) {
          var a = snapshot[i]
          var b = now[i]
          if (!a || !b) continue
          if (a.path !== b.path) continue
          if (a.text !== b.text) edits.push({ path: a.path, original: a.text, current: b.text })
        }
        api.state.edits = edits
      }, 150)
    }

    function clearEdits() {
      snapshot = collectTexts()
      api.state.edits = []
    }

    function ensureSelBox() {
      if (selBox) return selBox
      selBox = document.createElement('div')
      selBox.style.cssText = 'position:absolute;z-index:2147483000;border:2px solid #ff5f56;background:rgba(255,95,86,0.16);display:none;pointer-events:none'
      document.documentElement.appendChild(selBox)
      return selBox
    }

    function clearSelection() {
      api.state.selection = null
      if (selBox) selBox.style.display = 'none'
    }

    function enableAnnotate() {
      if (annotateEnabled) return
      annotateEnabled = true
      document.addEventListener('mousedown', onMouseDown, true)
      document.addEventListener('mousemove', onMouseMove, true)
      document.addEventListener('mouseup', onMouseUp, true)
      if (document.body) {
        document.body.style.cursor = 'crosshair'
        document.body.style.userSelect = 'none'
      }
    }

    function disableAnnotate() {
      if (!annotateEnabled) return
      annotateEnabled = false
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      if (document.body) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    function onMouseDown(e) {
      if (e.button !== 0) return
      e.preventDefault()
      selStart = { x: e.clientX, y: e.clientY }
      ensureSelBox().style.display = 'block'
      updateBox(e)
    }

    function updateBox(e) {
      if (!selStart || !selBox) return
      var x1 = selStart.x
      var y1 = selStart.y
      var x2 = e.clientX
      var y2 = e.clientY
      selBox.style.left = (Math.min(x1, x2) + (window.scrollX || 0)) + 'px'
      selBox.style.top = (Math.min(y1, y2) + (window.scrollY || 0)) + 'px'
      selBox.style.width = Math.abs(x2 - x1) + 'px'
      selBox.style.height = Math.abs(y2 - y1) + 'px'
    }

    function onMouseMove(e) {
      if (selStart) updateBox(e)
    }

    function onMouseUp(e) {
      if (!selStart || !selBox) return
      var x1 = selStart.x
      var y1 = selStart.y
      var x2 = e.clientX
      var y2 = e.clientY
      var w = Math.abs(x2 - x1)
      var h = Math.abs(y2 - y1)
      selStart = null
      if (w < 6 && h < 6) { clearSelection(); return }
      var cx = Math.min(x1, x2) + w / 2
      var cy = Math.min(y1, y2) + h / 2
      var target = document.elementFromPoint(cx, cy)
      var selector = target ? elementPath(target) : ''
      var tag = target && target.tagName ? target.tagName.toLowerCase() : ''
      var snippet = ''
      if (target) {
        var t = target.innerText !== undefined ? target.innerText : target.textContent
        if (t) snippet = String(t).replace(/\\s+/g, ' ').trim().slice(0, 120)
      }
      api.state.selection = {
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: w, h: h,
        sx: window.scrollX || 0, sy: window.scrollY || 0,
        docX: Math.min(x1, x2) + (window.scrollX || 0),
        docY: Math.min(y1, y2) + (window.scrollY || 0),
        selector: selector, tag: tag, snippet: snippet, at: Date.now()
      }
    }

    function clearPins() {
      pinEls.forEach(function (d) { if (d.parentNode) d.parentNode.removeChild(d) })
      pinEls = []
    }

    function renderPins(pins) {
      clearPins()
      ;(pins || []).forEach(function (pin, i) {
        var d = document.createElement('div')
        d.style.cssText = 'position:absolute;left:' + (pin.x || 0) + 'px;top:' + (pin.y || 0) + 'px;z-index:2147483001;width:22px;height:22px;border-radius:50%;background:#ff5f56;color:#fff;font:600 12px/22px Helvetica,Arial,sans-serif;text-align:center;cursor:default;box-shadow:0 1px 5px rgba(0,0,0,0.35)'
        d.textContent = String(i + 1)
        d.title = (pin.comment || '') + (pin.selector ? '\\n' + pin.selector : '')
        document.documentElement.appendChild(d)
        pinEls.push(d)
      })
    }

    function showBadge(text) {
      if (!modeBadge) {
        modeBadge = document.createElement('div')
        modeBadge.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483002;background:rgba(47,107,255,0.95);color:#fff;padding:6px 12px;border-radius:8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none'
        document.documentElement.appendChild(modeBadge)
      }
      modeBadge.textContent = text
      modeBadge.style.display = text ? 'block' : 'none'
    }

    function setMode(v) {
      api.state.mode = v
      if (v === 'edit') { disableAnnotate(); enableEdit() }
      else disableEdit()
      if (v === 'annotate') enableAnnotate()
      else disableAnnotate()
      if (v === 'view') clearSelection()
      if (v === 'edit') showBadge('✏️ 编辑模式：点击页面文字直接修改')
      else if (v === 'annotate') showBadge('🎯 批注模式：拖拽框选页面区域')
      else showBadge('')
    }

    var zoomKind = null

    function clearZoom() {
      var docEl = document.documentElement
      docEl.style.width = ''
      docEl.style.height = ''
      docEl.style.transform = ''
      docEl.style.transformOrigin = ''
    }

    function applyZoomScale(s) {
      var docEl = document.documentElement
      docEl.style.width = (100 / s) + '%'
      docEl.style.height = (100 / s) + '%'
      docEl.style.transformOrigin = '0 0'
      docEl.style.transform = 'scale(' + s + ')'
      api.state.zoom = { kind: 'fixed', scale: s }
    }

    function applyFitZoom() {
      if (!document.body) return
      clearZoom()
      var natural = document.body.scrollWidth || 320
      var vw = window.innerWidth || 320
      var s = Math.min(1, vw / natural)
      if (s < 0.2) s = 0.2
      applyZoomScale(s)
      api.state.zoom = { kind: 'fit', scale: s, natural: natural }
    }

    function setZoom(v) {
      if (v === 'fit') { zoomKind = 'fit'; applyFitZoom() }
      else if (typeof v === 'number' && v > 0 && v <= 3) { zoomKind = v; applyZoomScale(v) }
      else if (v === 'none' || v === 1) { zoomKind = null; clearZoom(); api.state.zoom = { kind: 'none', scale: 1 } }
    }

    window.addEventListener('resize', function () {
      if (zoomKind === 'fit') applyFitZoom()
    })

    function handleCmd(cmd) {
      if (!cmd || typeof cmd !== 'object') return
      if (cmd.t === 'mode') setMode(cmd.v)
      else if (cmd.t === 'pins') renderPins(cmd.pins)
      else if (cmd.t === 'clearSel') clearSelection()
      else if (cmd.t === 'clearEdits') clearEdits()
      else if (cmd.t === 'jump') window.scrollTo(cmd.x || 0, cmd.y || 0)
      else if (cmd.t === 'zoom') setZoom(cmd.v)
    }

    api.handleCmd = handleCmd
    api.setMode = setMode
    api.setZoom = setZoom
    api.renderPins = renderPins
    api.clearSelection = clearSelection
    api.clearEdits = clearEdits

    setInterval(function () {
      var cmd = window.__dshPreviewCmd
      if (cmd) { window.__dshPreviewCmd = null; handleCmd(cmd) }
    }, 120)
  } catch (err) {
    api.ready = false
    api.lastError = String((err && err.message) || err)
  }
})();`

const store = { annotations: {}, submitted: [], pending: [] }
const authorizedKeys = new Set()

const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/csv',
  '.pdf': 'application/pdf'
}

const dec = (s) => {
  try { return decodeURIComponent(s) } catch (e) { return s }
}

const extOf = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '')
  return m ? '.' + m[1].toLowerCase() : ''
}

const ok = (value) => Object.assign({ ok: true }, value || {})
const fail = (err) => ({ ok: false, error: String((err && err.message) || err) })

function listFor(rel) { return store.annotations[rel] || [] }

export function apply(ctx) {
  const fs = ctx.fs
  const webServer = ctx.webServer
  const agents = ctx.agents
  const disposers = []

  const policy = ctx.get('sandboxPolicy')
  const fallbackRoot = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : ''

  const rootOf = (input) => {
    const r = typeof (input && input.root) === 'string' && input.root !== '' ? input.root : fallbackRoot
    if (r === '') throw new Error('缺少工作区路径')
    return r
  }

  async function resolveInRoot(root, rel) {
    const rootTarget = await fs.resolve(root)
    const target = await fs.resolve(rel, { cwd: root })
    if (!fs.contains(rootTarget, target)) throw new Error('路径超出工作区范围')
    return target
  }

  async function authorizeRoot(input) {
    const root = rootOf(input)
    const target = await fs.resolve(root)
    const info = await fs.stat(target)
    if (!info || info.type !== 'directory') throw new Error('不是目录: ' + root)
    authorizedKeys.add(target.targetKey)
    return { authorized: true }
  }

  async function listHtmlFiles(input) {
    const root = rootOf(input)
    const rootTarget = await fs.resolve(root)
    const out = []
    const counter = { hits: 0 }
    async function walk(dirTarget, rel, depth) {
      if (counter.hits >= 200 || depth > 7) return
      let entries
      try { entries = await fs.listDir(dirTarget) } catch (e) { return }
      for (const entry of entries) {
        if (counter.hits >= 200) break
        const name = entry.name
        if (name === '.git' || name === 'node_modules') continue
        const childRel = rel ? rel + '/' + name : name
        if (entry.type === 'directory') {
          await walk(entry.target, childRel, depth + 1)
        } else if (entry.type === 'file' && /\.html?$/i.test(name)) {
          out.push({ rel: childRel, name: name, size: entry.size })
          counter.hits += 1
        }
      }
    }
    await walk(rootTarget, '', 0)
    out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    return { files: out, truncated: counter.hits >= 200, root: root }
  }

  async function browseDir(input) {
    const path = typeof (input && input.path) === 'string' && input.path !== '' ? input.path : fallbackRoot
    if (path === '') throw new Error('缺少目录路径')
    const target = await fs.resolve(path)
    const info = await fs.stat(target)
    if (!info || info.type !== 'directory') throw new Error('不是目录: ' + path)
    const entries = await fs.listDir(target)
    const rows = entries.slice(0, 300).map((entry) => ({
      name: entry.name,
      path: path.replace(/\/+$/, '') + '/' + entry.name,
      type: entry.type,
      size: entry.size
    }))
    rows.sort((a, b) => (a.type === 'directory' && b.type !== 'directory' ? -1 : a.type !== 'directory' && b.type === 'directory' ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return { path: path, entries: rows, truncated: entries.length > 300 }
  }

  async function importFile(input) {
    const root = rootOf(input)
    const absPath = String((input && input.path) || '')
    if (!/\.html?$/i.test(absPath)) throw new Error('请选择 .html/.htm 文件')
    const source = await fs.resolve(absPath)
    const info = await fs.stat(source)
    if (!info || info.type !== 'file') throw new Error('文件不存在: ' + absPath)
    if (info.size && info.size > 4 * 1024 * 1024) throw new Error('文件过大（>4MB）')
    const text = await fs.readText(source)
    const rawBase = absPath.split('/').pop() || 'imported.html'
    const base = String(rawBase).replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').slice(0, 80) || 'imported.html'
    const importDir = '.dsh/html-preview'
    let rel = importDir + '/' + base
    let n = 1
    for (;;) {
      let exists = false
      try {
        const t = await fs.resolve(rel, { cwd: root })
        exists = !!(await fs.stat(t))
      } catch (e) { exists = false }
      if (!exists) break
      n += 1
      rel = importDir + '/' + base.replace(/\.html?$/i, '') + '-' + n + '.html'
    }
    try {
      await fs.writeText(await fs.resolve(rel, { cwd: root }), text)
    } catch (e) {
      const fallback = 'html-preview-' + base
      await fs.writeText(await fs.resolve(fallback, { cwd: root }), text)
      rel = fallback
    }
    return { rel: rel }
  }

  async function applyTextEdits(input) {
    const root = rootOf(input)
    const rel = String((input && input.rel) || '')
    if (rel === '') throw new Error('缺少文件路径')
    const edits = Array.isArray(input && input.edits) ? input.edits : []
    const target = await resolveInRoot(root, rel)
    let text = await fs.readText(target)
    let applied = 0
    const skipped = []
    for (const edit of edits) {
      const o = String((edit && edit.original) || '')
      const c = String((edit && edit.current) || '')
      if (o === '' || o === c) continue
      const idx = text.indexOf(o)
      if (idx < 0) { skipped.push(String((edit && edit.path) || o.slice(0, 40))); continue }
      text = text.slice(0, idx) + c + text.slice(idx + o.length)
      applied += 1
    }
    if (applied > 0) await fs.writeText(target, text)
    return { applied: applied, skipped: skipped }
  }

  async function addAnnotation(input) {
    const rel = String((input && input.rel) || '')
    const ann = (input && input.annotation) || {}
    if (rel === '') throw new Error('缺少文件路径')
    const comment = String(ann.comment || '').slice(0, 2000)
    if (comment.trim() === '') throw new Error('批注内容为空')
    const item = {
      id: 'a' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      rel: rel,
      selector: String(ann.selector || ''),
      tag: String(ann.tag || ''),
      snippet: String(ann.snippet || '').slice(0, 200),
      comment: comment,
      x: Number(ann.x) || 0, y: Number(ann.y) || 0,
      w: Number(ann.w) || 0, h: Number(ann.h) || 0,
      sx: Number(ann.sx) || 0, sy: Number(ann.sy) || 0,
      docX: Number(ann.docX) || 0, docY: Number(ann.docY) || 0,
      at: Date.now()
    }
    const list = listFor(rel)
    list.push(item)
    while (list.length > 100) list.shift()
    return { annotations: list }
  }

  async function deleteAnnotation(input) {
    const rel = String((input && input.rel) || '')
    const id = String((input && input.id) || '')
    const list = listFor(rel)
    const next = list.filter((a) => a.id !== id)
    store.annotations[rel] = next
    return { annotations: next }
  }

  function makeUserMessage(text, summary) {
    return {
      id: 'hpp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10),
      role: 'user',
      content: [{ type: 'text', text: text }],
      source: { kind: 'plugin', plugin: 'dsh-html-preview', form: 'notice', summary: String(summary).slice(0, 120) }
    }
  }

  async function submitAnnotations(input) {
    const rel = String((input && input.rel) || '')
    const list = Array.isArray(input && input.annotations) ? input.annotations.slice(0, 20) : []
    if (list.length === 0) throw new Error('没有可提交的批注')
    const lines = []
    lines.push('【HTML 预览批注】目标文件: ' + rel)
    list.forEach((a, i) => {
      lines.push('')
      lines.push((i + 1) + ') 区域: ' + (a.selector || a.tag || '未识别'))
      if (a.snippet) lines.push('   页面当前文案: "' + a.snippet + '"')
      lines.push('   用户批注: ' + a.comment)
    })
    lines.push('')
    lines.push('请按照以上批注修改文件 ' + rel + ' 中对应区域的内容，修改后告知用户可在预览面板重新加载查看效果。')
    const text = lines.join('\n')
    const batch = { rel: rel, annotations: list, at: Date.now() }
    store.submitted.push(batch)
    while (store.submitted.length > 20) store.submitted.shift()
    const sessionId = input && input.sessionId
    let agent
    if (typeof sessionId === 'string' && sessionId !== '') {
      try { agent = agents.get(sessionId) } catch (e) { agent = undefined }
    }
    if (!agent && typeof sessionId === 'string' && sessionId !== '') {
      try { agent = agents.roots().find((a) => a && a.id === sessionId) } catch (e) { agent = undefined }
    }
    if (agent) {
      const message = makeUserMessage(text, 'HTML 预览批注（' + list.length + ' 条，文件 ' + rel + '）')
      try {
        agent.steer(message)
        return { delivered: true, messageId: message.id, count: list.length }
      } catch (e) {
        store.pending.push(batch)
        return { delivered: false, reason: '投递失败: ' + ((e && e.message) || e) }
      }
    }
    store.pending.push(batch)
    return { delivered: false, reason: '未找到当前会话 Agent；批注已暂存，AI 可通过 html_preview_annotations 工具读取' }
  }

  const api = {
    'authorize-root': (a) => authorizeRoot(a),
    'list-files': (a) => listHtmlFiles(a),
    'browse-dir': (a) => browseDir(a),
    'import-file': (a) => importFile(a),
    'apply-text-edits': (a) => applyTextEdits(a),
    'list-annotations': (a) => ({ annotations: listFor(String((a && a.rel) || '')) }),
    'add-annotation': (a) => addAnnotation(a),
    'delete-annotation': (a) => deleteAnnotation(a),
    'submit-annotations': (a) => submitAnnotations(a)
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return }
        chunks.push(c)
      })
      req.on('end', () => {
        if (chunks.length === 0) return resolve({})
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(new Error('无效 JSON')) }
      })
      req.on('error', reject)
    })
  }

  function sendJson(res, status, value) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end(JSON.stringify(value))
  }

  disposers.push(webServer.register({
    kind: 'prefix',
    path: '/dsh-preview-api',
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.end()
        return
      }
      if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return }
      const pathname = String(req.url || '').split('?')[0]
      const method = pathname.slice('/dsh-preview-api'.length).replace(/^\/+/, '').replace(/\/+$/, '')
      try {
        const args = await readJsonBody(req)
        const fn = api[method]
        if (typeof fn !== 'function') { sendJson(res, 404, { ok: false, error: 'unknown api: ' + method }); return }
        const out = await fn(args || {})
        sendJson(res, 200, typeof out === 'object' && out !== null ? Object.assign({ ok: true }, out) : { ok: true })
      } catch (e) {
        sendJson(res, 400, fail(e))
      }
    }
  }))

  disposers.push(webServer.register({
    kind: 'prefix',
    path: '/dsh-preview',
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('method not allowed')
          return
        }
        const pathname = String(req.url || '').split('?')[0]
        const rest = pathname.slice('/dsh-preview'.length).replace(/^\/+/, '')
        const parts = rest.split('/')
        const wsEnc = parts[0] || ''
        if (wsEnc === '' || parts.length < 2) {
          res.statusCode = 400
          res.end('missing workspace segment')
          return
        }
        const root = dec(wsEnc)
        const segments = parts.slice(1).map(dec)
        if (segments.some((s) => s === '' || s === '.' || s === '..' || s.indexOf('\\') >= 0)) {
          res.statusCode = 400
          res.end('bad path')
          return
        }
        const rel = segments.join('/')
        const rootTarget = await fs.resolve(root)
        if (!authorizedKeys.has(rootTarget.targetKey)) {
          res.statusCode = 403
          res.end('workspace not authorized')
          return
        }
        const target = await fs.resolve(rel, { cwd: root })
        if (!fs.contains(rootTarget, target)) {
          res.statusCode = 403
          res.end('outside workspace')
          return
        }
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') {
          res.statusCode = 404
          res.end('not found')
          return
        }
        const bytes = await fs.readBytes(target, undefined, 8 * 1024 * 1024)
        const ext = extOf(rel)
        let body = bytes
        const ct = MIME[ext] || 'application/octet-stream'
        if (ext === '.html' || ext === '.htm') {
          let text = new TextDecoder().decode(bytes)
          if (text.indexOf('<script data-dsh-preview-bridge>') < 0) {
            const tag = '<script data-dsh-preview-bridge>' + BRIDGE + '</' + 'script>'
            const m = /<\/body\s*>/i.exec(text)
            if (m) text = text.slice(0, m.index) + tag + text.slice(m.index)
            else text = text + tag
            body = new TextEncoder().encode(text)
          }
        }
        res.statusCode = 200
        const texty = ext === '.html' || ext === '.htm' || ext === '.css' || ext === '.js' || ext === '.mjs' || ext === '.json' || ext === '.svg' || ext === '.txt' || ext === '.md' || ext === '.csv'
        res.setHeader('Content-Type', ct + (texty ? '; charset=utf-8' : ''))
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (req.method === 'HEAD') res.end()
        else res.end(body)
      } catch (e) {
        try {
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('preview error: ' + ((e && e.message) || e))
        } catch (e2) {}
      }
    }
  }))

  const tool = defineTool({
    name: 'html_preview_annotations',
    description: '读取用户在 HTML 预览面板中提交的页面批注（区域框选批注）以及尚未投递的批次。当用户提到在预览面板里标注了内容、要求按批注修改页面、或询问批注状态时调用。返回的每条批注包含 CSS 选择器路径与页面文案片段，用于定位并修改对应的 HTML 文件。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          pending: { type: 'json', description: '尚未被模型读取的批注批次（每次读取后清空）' },
          submitted: { type: 'json', description: '最近已提交的批注批次（最多 20 条）' },
          hint: { type: 'string', description: '处理提示' }
        },
        additionalProperties: false
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
      }
    },
    execute: async (args, exec) => {
      const pending = store.pending.slice()
      store.pending = []
      return {
        pending: pending,
        submitted: store.submitted.slice(-5),
        hint: '根据批注中的 selector 与页面文案定位页面区域，用编辑/写入工具修改对应 HTML 文件。修改完成后提醒用户在预览面板点击重新加载查看效果。'
      }
    }
  })
  disposers.push(ctx.tools.register(tool))

  ctx.effect(() => () => {
    disposers.forEach((d) => { try { d() } catch (e) {} })
  })
}
