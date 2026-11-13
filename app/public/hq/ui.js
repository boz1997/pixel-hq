import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js'

import { modelName, prefs, resetsIn, savePrefs, store, TROUBLE_MS, usageRows } from './data.js'
import { WALL_H } from './plan.js'
import { arrived, PANIC_BOSS } from './sim.js'
import { ago, clip, esc } from './util.js'

const $ = (sel, root = document) => root.querySelector(sel)
const h = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

/** A label in the scene: an outer element the renderer places, an inner one that scales with the zoom. */
function label(className, center = [0.5, 1]) {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  inner.className = className
  outer.appendChild(inner)
  const obj = new CSS2DObject(outer)
  obj.center.set(center[0], center[1])
  obj.inner = inner
  obj.last = ''
  return obj
}
const setHtml = (obj, className, html) => {
  const key = `${className}|${html}`
  if (obj.last === key) return
  obj.last = key
  obj.inner.className = className
  obj.inner.innerHTML = html
}

const STATE_WORDS = { working: 'working', waiting: 'waiting for you', idle: 'idle', done: 'done', failed: 'failed', away: 'away' }
const baseName = path => String(path ?? '').split('/').filter(Boolean).pop() ?? ''
const time = at => new Date(at).toTimeString().slice(0, 5)

export function createUi(world, sim, actions) {
  const hud = document.getElementById('hud')
  hud.innerHTML = `
    <div id="brand" class="card"><b>PIXEL HQ</b><div class="sub" id="counts">loading…</div></div>
    <div id="banner"><span>⚠</span><span id="banner-text"></span><a id="banner-link" href="https://status.claude.com" target="_blank" rel="noopener">status.claude.com</a></div>
    <div id="controls">
      <button class="btn" id="help-toggle" title="How to move around">?</button>
      <button class="btn hide-sm" id="fit" title="See the whole office">⤢</button>
      <button class="btn" id="tour">▶ Tour</button>
      <div class="seg hide-sm" title="calm: everyone stays at their desk · lively: people move around"><button id="mode-calm">Calm</button><button id="mode-lively">Lively</button></div>
      <div class="seg"><a class="on">3D</a><a href="./pixel.html" id="to-pixel">Pixel</a></div>
    </div>
    <div id="usage" class="card"></div>
    <div id="card" class="card"></div>
    <div id="taskbar" class="card">
      <textarea id="task-text" rows="2" placeholder="Give your team a task… e.g. “Summarize yesterday's errors and open an issue”"></textarea>
      <div class="foot">
        <label for="task-to">To</label><select id="task-to"></select>
        <span class="why" id="task-why"></span>
        <span class="hint">Ctrl + Enter</span>
        <button class="btn primary" id="task-send">Assign →</button>
      </div>
      <div id="ticker"></div>
    </div>
    <div id="help" class="card">
      <b>Moving around</b>
      <div class="rows">
        <span class="k">Drag</span><span>move over the office</span>
        <span class="k">Right-drag</span><span>turn and tilt, or double-click and drag</span>
        <span class="k">Scroll · pinch</span><span>zoom toward the pointer</span>
        <span class="k">Two fingers</span><span>slide on a trackpad</span>
        <span class="k">Double-click</span><span>zoom in there, or on a person: their card</span>
        <span class="k">Arrows · WASD</span><span>walk</span>
        <span class="k">Q E · R F</span><span>turn · tilt</span>
        <span class="k">+ −</span><span>zoom</span>
        <span class="k">⤢</span><span>the whole office again</span>
      </div>
    </div>
    <div id="folded"></div>
    <div id="toasts"></div>
    <div id="gate"><form class="card" id="gate-form"><b>This office is behind a password.</b><input id="gate-pw" type="password" placeholder="password" autocomplete="current-password"><div class="err" id="gate-err"></div><button class="btn primary" type="submit">Enter</button></form></div>`

  const labelGroup = new THREE.Group()
  labelGroup.name = 'labels'
  world.scene.add(labelGroup)
  const ui = { world, sim, labelGroup, statics: [], pills: new Map(), results: new Map(), bubbles: new Map(), selected: null, tour: null, pending: new Map(), seenTasks: new Map(), sessions: [], departments: [], plan: null, scale: 1 }

  // ---------------------------------------------------------------- controls
  const modeButtons = () => {
    $('#mode-calm').classList.toggle('on', prefs.mode === 'calm')
    $('#mode-lively').classList.toggle('on', prefs.mode === 'lively')
  }
  modeButtons()
  for (const mode of ['calm', 'lively']) {
    $(`#mode-${mode}`).addEventListener('click', () => {
      prefs.mode = mode
      savePrefs()
      modeButtons()
      actions.onModeChange()
    })
  }
  $('#fit').addEventListener('click', () => actions.fit())
  const help = $('#help')
  $('#help-toggle').addEventListener('click', () => help.classList.toggle('open'))
  help.addEventListener('click', () => help.classList.remove('open'))
  if (!localStorage.getItem('pixel-hq-help-seen')) {
    help.classList.add('open')
    localStorage.setItem('pixel-hq-help-seen', '1')
    setTimeout(() => help.classList.remove('open'), 12_000)
  }
  $('#tour').addEventListener('click', () => (ui.tour ? stopTour(ui) : startTour(ui)))
  $('#task-send').addEventListener('click', () => sendTask(ui))
  $('#task-text').addEventListener('input', e => e.target.classList.toggle('has-text', e.target.value.trim() !== ''))
  $('#task-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      sendTask(ui)
    }
  })
  $('#gate-form').addEventListener('submit', async e => {
    e.preventDefault()
    prefs.password = $('#gate-pw').value
    sessionStorage.setItem('pixel-hq-password', prefs.password)
    $('#gate-err').textContent = ''
    const result = await actions.poll()
    if (result === 'locked') $('#gate-err').textContent = 'wrong password'
  })
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (ui.tour) stopTour(ui)
      else select(ui, null)
    }
  })
  ui.toast = (text, tone = '') => toast(text, tone)
  return ui
}

export function showGate(isOpen) {
  $('#gate').classList.toggle('open', isOpen)
}

function toast(text, tone = '') {
  const el = h(`<div class="toast ${tone}">${esc(text)}</div>`)
  $('#toasts').appendChild(el)
  setTimeout(() => el.remove(), 5200)
}

// ------------------------------------------------------------------ labels that stand still

/** Department chips, room names, desk pills: made again for a new plan. */
export function buildStaticLabels(ui, plan, departments) {
  for (const obj of [...ui.statics, ...ui.pills.values(), ...ui.results.values()]) obj.removeFromParent()
  ui.statics = []
  ui.pills.clear()
  ui.results.clear()
  ui.plan = plan
  for (const room of plan.rooms) {
    if (room.kind === 'dept') {
      const dept = room.dept
      const obj = label('dept', [0, 1])
      obj.position.set(room.x + 0.15, WALL_H + 0.12, room.z + 0.05)
      obj.inner.addEventListener('click', e => {
        if (e.target.closest('.fold')) {
          prefs.folded.add(dept.id)
          savePrefs()
          ui.onFold?.()
          return
        }
        ui.focusRoom?.(room)
      })
      obj.deptId = dept.id
      ui.labelGroup.add(obj)
      ui.statics.push(obj)
    } else {
      const obj = label('room-name', [0, 1])
      obj.position.set(room.x + 0.2, room.walls ? WALL_H + 0.12 : 0.3, room.z + (room.walls ? 0.05 : 0.2))
      setHtml(obj, 'room-name', esc(room.name))
      ui.labelGroup.add(obj)
      ui.statics.push(obj)
    }
  }
  for (const desk of plan.desks.values()) {
    const pill = label('pill')
    pill.position.set(desk.pill.x, desk.pill.y, desk.pill.z)
    pill.inner.addEventListener('click', () => select(ui, desk.sessionId))
    ui.labelGroup.add(pill)
    ui.pills.set(desk.sessionId, pill)
    const result = label('result', [0.5, 0])
    result.position.set(desk.laptop.x, 0.66, desk.laptop.z)
    result.inner.addEventListener('click', () => select(ui, desk.sessionId))
    result.visible = false
    ui.labelGroup.add(result)
    ui.results.set(desk.sessionId, result)
  }
  updateStaticLabels(ui, departments, Date.now())
}

const tagOf = s => {
  if (s.pr) return `PR #${s.pr.number}`
  const model = modelName(s.live?.model)
  return model ? model.replace(/^Claude /, '') : ''
}

/** What the pills say: state, title, model; the result of a finished turn; the department counts. */
export function updateStaticLabels(ui, departments, now) {
  ui.departments = departments
  const byId = new Map(departments.flatMap(d => d.members.map(s => [s.id, s])))
  for (const obj of ui.statics) {
    if (!obj.deptId) continue
    const dept = departments.find(d => d.id === obj.deptId)
    if (!dept) continue
    const present = dept.members.filter(s => s.state !== 'away').length
    setHtml(obj, 'dept', `<i style="background:${dept.color}"></i>${esc(dept.name)}<span class="n">${present}/${dept.members.length + dept.more}</span><span class="fold" title="fold this room">–</span>`)
  }
  for (const [id, pill] of ui.pills) {
    const s = byId.get(id)
    if (!s) continue
    const tag = tagOf(s)
    setHtml(pill, `pill ${s.state}${ui.selected === id ? ' on' : ''}`, `<i></i><span class="t">${esc(clip(s.title, 26))}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}`)
  }
  for (const [id, chip] of ui.results) {
    const s = byId.get(id)
    const r = s?.live?.result
    const isShown = Boolean(r) && s.state !== 'working' && s.state !== 'away' && now - r.at < 6 * 3600_000 && (r.files?.length > 0)
    chip.visible = isShown
    if (!isShown) continue
    const w = ui.sim.workers.get(id)
    setHtml(chip, `result${w?.resultUntil > now ? ' fresh' : ''}`, `📄 ${esc(clip(r.files[r.files.length - 1], 22))}${r.files.length > 1 ? ` +${r.files.length - 1}` : ''}`)
  }
}

// ------------------------------------------------------------------ labels that move

function bubbleOf(ui, e, now) {
  if (e.kind === 'manager') {
    const workers = [...ui.sim.workers.values()]
    const waiting = workers.filter(w => w.session.state === 'waiting').length
    const busy = workers.filter(w => w.session.state === 'working').length
    if (ui.sim.outage?.level === 'down') return { tone: 'panic', text: PANIC_BOSS[Math.floor(now / 2200) % PANIC_BOSS.length] }
    const says = waiting > 0 ? `${waiting} need${waiting === 1 ? 's' : ''} you` : busy > 0 ? `${busy} at work` : workers.length > 0 ? 'all quiet' : 'nobody in yet'
    return { tone: waiting > 0 ? 'wait' : 'boss', text: `👑 ${says}` }
  }
  if (e.kind === 'dog') return ui.sim.outage?.level === 'down' && Math.floor(now / 900 + (e.id === 'dog' ? 0 : 1.5)) % 3 === 0 ? { tone: 'work', text: 'woof!' } : null
  if (e.kind === 'helper') {
    if (e.dest === 'panic') return { tone: 'panic', text: Math.floor(now / 700) % 2 ? '!!' : '?!' }
    if (e.phase === 'delivering' && arrived(e)) return { tone: 'done', text: 'here you go' }
    if (e.phase === 'working' && arrived(e) && e.helper?.verb) return { tone: 'work', text: clip(`${e.helper.verb} ${e.helper.detail ?? ''}`.trim(), 22) }
    return null
  }
  const s = e.session
  const live = s.live
  const name = e.dest !== 'desk' && !e.walking ? clip(s.title, 18) : ''
  if (e.bubble && now < e.bubble.until) return { tone: e.bubble.tone === 'chat' ? 'work' : e.bubble.tone, text: e.bubble.text, name }
  if (e.walking) return null
  if (ui.sim.outage?.level === 'down' && prefs.mode === 'calm') return { tone: 'panic', text: '!!', name }
  if (e.resultUntil > now && live?.result) {
    const file = live.result.files?.[live.result.files.length - 1]
    return { tone: 'done', text: file ? `Done ✓ ${clip(file, 20)}` : `Done ✓ ${clip(live.result.summary ?? '', 22)}`, name }
  }
  switch (s.state) {
    case 'working': {
      const line = live?.detail ? `${live.verb} ${live.detail}` : live?.verb ?? ''
      return line ? { tone: 'work', text: clip(line, 26), name } : null
    }
    case 'waiting':
      return { tone: 'wait', text: clip(`! ${live?.detail || 'needs you'}`, 26), name }
    case 'done':
      return { tone: 'done', text: clip(`✓ ${live?.detail || 'done'}`, 26), name }
    case 'failed': {
      const why = live?.trouble && now - live.trouble.at < TROUBLE_MS ? live.trouble.error.replace(/_/g, ' ') : live?.detail
      return { tone: 'fail', text: clip(`✗ ${why || 'failed'}`, 26), name }
    }
    default:
      return name ? { tone: 'name', text: name } : null
  }
}

/** Every frame: the bubbles follow the people, the labels scale with the zoom. */
export function updateMovingLabels(ui, now) {
  const all = [...ui.sim.workers.values(), ...ui.sim.helpers.values(), ui.sim.manager, ...ui.sim.dogs].filter(Boolean)
  const alive = new Set()
  for (const e of all) {
    alive.add(e.id)
    let obj = ui.bubbles.get(e.id)
    const b = e.hidden ? null : bubbleOf(ui, e, now)
    if (!b) {
      if (obj) obj.visible = false
      continue
    }
    if (!obj) {
      obj = label('bubble')
      obj.inner.addEventListener('click', () => e.session && select(ui, e.id))
      ui.labelGroup.add(obj)
      ui.bubbles.set(e.id, obj)
    }
    obj.visible = true
    const atDesk = e.kind === 'worker' && e.dest === 'desk' && arrived(e)
    const height = e.kind === 'helper' ? 1.05 : e.kind === 'dog' ? 0.8 : e.kind === 'manager' ? 1.0 : atDesk ? 2.02 : 1.42
    obj.position.set(e.x, height, e.z)
    const name = b.name && b.tone !== 'name' ? `<span class="who">${esc(b.name)}</span>` : ''
    setHtml(obj, `bubble ${b.tone}`, `${name}${esc(b.text)}`)
  }
  for (const [id, obj] of ui.bubbles) {
    if (!alive.has(id)) {
      obj.removeFromParent()
      ui.bubbles.delete(id)
    }
  }
  const dist = ui.world.camera.position.distanceTo(ui.world.controls.target)
  const scale = Math.max(0.55, Math.min(1.08, 26 / dist))
  if (Math.abs(scale - ui.scale) > 0.01) {
    ui.scale = scale
    ui.world.labels.domElement.style.setProperty('--s', scale.toFixed(3))
  }
}

// ------------------------------------------------------------------ the HUD

export function updateHud(ui, sessions, now, outage) {
  ui.sessions = sessions
  const shownIds = new Set(ui.departments.flatMap(d => d.members.map(s => s.id)))
  const present = sessions.filter(s => s.state !== 'away').length
  const working = sessions.filter(s => s.state === 'working').length
  const waiting = sessions.filter(s => s.state === 'waiting').length
  const age = store.fetchedAt ? Math.round((now - store.fetchedAt) / 1000) : null
  $('#counts').innerHTML = `<b>${sessions.length}</b> desks · <b>${present}</b> in · <b>${working}</b> working · <b>${waiting}</b> waiting for you${store.data.isDemo ? ' · demo' : ''}${age !== null && age > 6 ? ` · ${age}s old` : ''}`

  const banner = $('#banner')
  banner.className = outage ? outage.level : ''
  if (outage) {
    $('#banner-text').textContent = `${outage.level === 'down' ? 'ALARM' : 'Heads up'} · ${outage.title}`
    $('#banner-link').style.display = outage.link ? '' : 'none'
  }
  document.body.classList.toggle('is-down', outage?.level === 'down')
  document.body.classList.toggle('has-banner', Boolean(outage))
  document.title = outage?.level === 'down' ? '🚨 Pixel HQ' : 'Pixel HQ'

  const focus = ui.selected ? sessions.find(s => s.id === ui.selected) : [...sessions].filter(s => s.live).sort((a, b) => b.live.at - a.live.at)[0]
  const rows = usageRows(now)
  $('#usage').innerHTML = `
    <h4>Context</h4>
    <div class="ctx"><b>${focus?.live?.context ?? '—'}${focus?.live?.context !== undefined ? '%' : ''}</b><span>${esc(clip(focus?.title ?? 'no session', 24))}</span></div>
    <div class="sep"></div>
    <h4>Usage</h4>
    ${rows.length === 0 ? '<div class="note">no reading yet</div>' : rows.slice(0, 4).map(r => `
      <div class="row ${r.percentUsed >= 90 ? 'high' : ''}">
        <div class="top"><span>${esc(r.name)}</span><span class="p">${r.percentUsed}%</span></div>
        <div class="bar"><span style="width:${Math.min(100, r.percentUsed)}%"></span></div>
        ${r.percentUsed >= 90 && r.resetsAt ? `<div class="note">resets ${esc(resetsIn(r.resetsAt, now))}</div>` : ''}
      </div>`).join('')}`

  const folded = ui.folded ?? []
  $('#folded').innerHTML = folded.map(d => `<div class="dept" data-id="${esc(d.id)}" title="unfold"><i style="background:${d.color}"></i>${esc(d.name)}<span class="fold">+</span></div>`).join('')
  for (const el of document.querySelectorAll('#folded .dept')) {
    el.onclick = () => {
      prefs.folded.delete(el.dataset.id)
      savePrefs()
      ui.onFold?.()
    }
  }

  // The task bar: who can be asked, whether this browser may ask.
  const select = $('#task-to')
  const options = `<option value="auto">✨ Let Claude decide</option>${ui.departments.map(d => `<optgroup label="${esc(d.name)}">${d.members.map(s => `<option value="${esc(s.ccdId || `local_${s.id}`)}">${s.state === 'away' ? '○' : '●'} ${esc(clip(s.title, 40))}</option>`).join('')}</optgroup>`).join('')}`
  if (select.dataset.key !== options) {
    const was = select.value
    select.innerHTML = options
    select.dataset.key = options
    if ([...select.options].some(o => o.value === was)) select.value = was
  }
  const canTask = Boolean(store.data.canTask) && !store.data.isDemo
  $('#taskbar').classList.toggle('off', !canTask)
  $('#task-why').textContent = canTask ? '' : store.data.isDemo ? 'the demo office takes no tasks' : 'tasks go out from this computer, or with --password'
  const last = sessions.flatMap(s => (s.live?.log ?? []).map(entry => ({ ...entry, title: s.title }))).sort((a, b) => b.at - a.at)[0]
  $('#ticker').innerHTML = last ? `${time(last.at)} · <b>${esc(clip(last.title, 28))}</b> ${esc(last.verb)} ${esc(clip(last.detail, 50))}` : ''

  trackTasks(ui, now)
  if (ui.selected) renderCard(ui, now)
  void shownIds
}

// ------------------------------------------------------------------ the card

export function select(ui, id) {
  ui.selected = id && ui.selected === id && !ui.tour ? null : id
  for (const [sid, pill] of ui.pills) pill.inner.classList.toggle('on', sid === ui.selected)
  const card = $('#card')
  card.classList.toggle('open', Boolean(ui.selected))
  $('#usage').style.display = ui.selected ? 'none' : ''
  if (ui.selected) renderCard(ui, Date.now())
  ui.onSelect?.(ui.selected)
}

function renderCard(ui, now) {
  const s = ui.sessions.find(one => one.id === ui.selected)
  const card = $('#card')
  if (!s) {
    card.classList.remove('open')
    return
  }
  const dept = ui.departments.find(d => d.members.some(m => m.id === s.id))
  const live = s.live
  const what = (() => {
    if (s.state === 'away') return `away · last active ${ago(now - s.lastActivityAt)} ago`
    if (s.state === 'working') return `${live?.verb ?? 'working'} ${live?.detail ?? ''}`
    if (s.state === 'waiting') return `needs you: ${live?.detail || 'an answer'}`
    if (s.state === 'done') return `✓ ${live?.detail || 'done'}`
    if (s.state === 'failed') return `✗ ${live?.trouble ? live.trouble.error.replace(/_/g, ' ') : live?.detail || 'failed'}`
    return `idle for ${ago(now - (live?.since ?? now))}`
  })()
  const model = modelName(live?.model)
  const result = live?.result
  const helpers = live?.helpers ?? []
  const log = [...(live?.log ?? [])].reverse().slice(0, 12)
  const tour = ui.tour
  const keepInput = $('#card-msg')?.value ?? ''
  const isMessaging = card.dataset.messaging === s.id
  card.innerHTML = `
    <button class="close" id="card-close" title="close">×</button>
    <div class="dept-line"><i style="background:${dept?.color ?? '#9aa0b5'}"></i>${esc(dept?.name ?? '')}${tour ? `<span class="count">${tour.i + 1} / ${tour.list.length}</span>` : ''}</div>
    <h2>${esc(s.title)}</h2>
    <div class="what">${esc(clip(what, 120))}</div>
    <div class="chips">
      <span class="chip state-${s.state}">${STATE_WORDS[s.state] ?? s.state}</span>
      ${model ? `<span class="chip">${esc(model)}</span>` : ''}
      ${s.pr ? `<span class="chip grey">PR #${s.pr.number} ${esc(String(s.pr.state).toLowerCase())}</span>` : ''}
      ${live?.context !== undefined ? `<span class="chip grey">context ${live.context}%</span>` : ''}
      ${s.cwd ? `<span class="chip grey">${esc(baseName(s.cwd))}</span>` : ''}
    </div>
    ${result && (result.files?.length || result.summary) ? `<div class="result-box"><b>Last result · ${esc(time(result.at))}</b>${result.files?.length ? `📄 ${result.files.map(f => esc(f)).join(', ')}<br>` : ''}${esc(clip(result.summary ?? '', 160))}</div>` : ''}
    ${helpers.length ? `<h3>Subagents</h3><ul>${helpers.map(x => `<li>${x.isFailed ? '✗' : x.isDone ? '✓' : '●'} ${esc(x.label)}${x.verb && !x.isDone ? ` · ${esc(x.verb)} ${esc(x.detail ?? '')}` : ''}</li>`).join('')}</ul>` : ''}
    <h3>Latest calls</h3>
    ${log.length ? `<ul>${log.map(e => `<li><span class="tm">${time(e.at)}</span>${e.who ? `<span class="who">${esc(e.who)}</span> · ` : ''}${esc(e.verb)} ${esc(e.detail)}</li>`).join('')}</ul>` : '<div class="what">nothing logged yet</div>'}
    <div class="actions">
      ${s.link ? `<a class="btn primary" href="${esc(s.link)}">Open in Claude</a>` : ''}
      <button class="btn" id="card-message" ${store.data.canTask && !store.data.isDemo ? '' : 'disabled title="tasks go out from this computer, or with --password"'}>Message</button>
    </div>
    ${isMessaging ? `<div class="msg"><input id="card-msg" placeholder="Message to ${esc(clip(s.title, 24))}"><button class="btn primary" id="card-send">Send</button></div>` : ''}
    ${tour ? `<div class="tourbar"><button class="btn" id="tour-prev">‹</button><button class="btn" id="tour-pause">${tour.paused ? '▶' : '❚❚'}</button><button class="btn" id="tour-next">›</button><div class="progress"><span style="width:${Math.round(((tour.i + 1) / tour.list.length) * 100)}%"></span></div><button class="btn" id="tour-stop">×</button></div>` : ''}`
  $('#card-close').onclick = () => (ui.tour ? stopTour(ui) : select(ui, null))
  $('#card-message').onclick = () => {
    card.dataset.messaging = isMessaging ? '' : s.id
    renderCard(ui, Date.now())
    $('#card-msg')?.focus()
  }
  if (isMessaging) {
    const input = $('#card-msg')
    input.value = keepInput
    const go = () => {
      const text = input.value.trim()
      if (!text) return
      submitTask(ui, text, s.ccdId || `local_${s.id}`, s.title)
      card.dataset.messaging = ''
      renderCard(ui, Date.now())
    }
    $('#card-send').onclick = go
    input.onkeydown = e => {
      if (e.key === 'Enter') go()
    }
  }
  if (tour) {
    $('#tour-prev').onclick = () => tourStep(ui, -1)
    $('#tour-next').onclick = () => tourStep(ui, 1)
    $('#tour-stop').onclick = () => stopTour(ui)
    $('#tour-pause').onclick = () => {
      tour.paused = !tour.paused
      tour.nextAt = Date.now() + 4500
      renderCard(ui, Date.now())
    }
  }
}

// ------------------------------------------------------------------ the tour

const TOUR_MS = 4800

function startTour(ui) {
  const list = ui.departments.flatMap(d => d.members.filter(s => s.state !== 'away').sort((a, b) => a.slot - b.slot).map(s => s.id))
  if (list.length === 0) {
    toast('Nobody is in to show around.')
    return
  }
  ui.tour = { list, i: 0, paused: false, nextAt: Date.now() + TOUR_MS }
  $('#tour').textContent = '■ Stop'
  showTourStop(ui)
}

function showTourStop(ui) {
  const id = ui.tour.list[ui.tour.i]
  ui.selected = null
  select(ui, id)
  ui.flyToSession?.(id)
}

function tourStep(ui, by) {
  const t = ui.tour
  if (!t) return
  t.i = (t.i + by + t.list.length) % t.list.length
  t.nextAt = Date.now() + TOUR_MS
  showTourStop(ui)
}

export function stopTour(ui, keepView = false) {
  if (!ui.tour) return
  ui.tour = null
  $('#tour').textContent = '▶ Tour'
  select(ui, null)
  if (!keepView) ui.onTourEnd?.()
}

export function tickTour(ui, now) {
  if (ui.tour && !ui.tour.paused && now > ui.tour.nextAt) tourStep(ui, 1)
}

// ------------------------------------------------------------------ tasks

function sendTask(ui) {
  const box = $('#task-text')
  const text = box.value.trim()
  if (!text) return
  const select = $('#task-to')
  const to = select.value
  const title = to === 'auto' ? null : select.options[select.selectedIndex]?.textContent?.replace(/^[●○]\s*/, '')
  submitTask(ui, text, to, title)
  box.value = ''
}

async function submitTask(ui, text, to, title) {
  try {
    const res = await fetch('/api/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pixel-hq-task': '1', ...(prefs.password ? { 'x-pixel-hq-password': prefs.password } : {}) },
      body: JSON.stringify({ text, to }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(`Not sent: ${out.error ?? res.status}`, 'bad')
      return
    }
    ui.pending.set(out.id, { at: Date.now(), to, title })
    toast(to === 'auto' ? 'Handed to Claude to pick who does it…' : `On its way to ${clip(title ?? 'the session', 30)}…`)
  } catch (error) {
    toast(`Not sent: ${error.message}`, 'bad')
  }
}

function trackTasks(ui, now) {
  const tasks = store.data.tasks ?? {}
  for (const [id, mine] of ui.pending) {
    const t = tasks[id]
    const seen = ui.seenTasks.get(id)
    if (t && t.status !== seen) {
      ui.seenTasks.set(id, t.status)
      if (t.status === 'sent') {
        toast(`Delivered to ${clip(t.toTitle ?? mine.title ?? 'the session', 34)}${mine.to === 'auto' ? ', Claude picked it' : ''}`, 'ok')
        ui.pending.delete(id)
        const target = ui.sessions.find(s => (s.ccdId || `local_${s.id}`) === t.to)
        if (target) ui.flyToSession?.(target.id, true)
      } else if (t.status === 'failed') {
        toast(`Not delivered: ${t.error ?? 'unknown error'}`, 'bad')
        ui.pending.delete(id)
      }
    } else if (!t && now - mine.at > 30_000) {
      toast('No session took the task: keep a Claude session with the mod open.', 'bad')
      ui.pending.delete(id)
    }
  }
}
