'use strict';

/* ================= 상수 ================= */
const STORE_KEY = 'liftlog-v1';
const LIFTS = ['S', 'B', 'D', 'O'];
const LIFT_COLORS = { S: '#ef5350', B: '#42a5f5', D: '#66bb6a', O: '#ffa726' };
const LIFT_NAMES = { S: '스쿼트', B: '벤치', D: '데드', O: 'OHP' };
const EX_PALETTE = ['#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da', '#ec407a',
  '#d4e157', '#8d6e63', '#5c6bc0', '#ffca28', '#26a69a', '#ff7043', '#9ccc65', '#7e57c2', '#29b6f6'];
const ROUTINE_PALETTE = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];
const FREE_COLOR = '#64748b';
const RPE_OPTIONS = [];
for (let v = 5; v <= 10; v += 0.5) RPE_OPTIONS.push(v);

/* RPE 표 (RTS 방식): 실질 반복 수 n = 횟수 + (10 - RPE) 일 때 1RM 대비 % */
const PCT_TABLE = [null, 100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0];

/* ================= 유틸 ================= */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmtDate(new Date());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const kg = n => `${Math.round(n).toLocaleString('ko-KR')}kg`;
const round1 = n => Math.round(n * 10) / 10;
const fmtRest = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const shortDate = s => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function weekStart(dateStr) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일 시작
  return fmtDate(d);
}
function addDays(dateStr, n) { const d = parseDate(dateStr); d.setDate(d.getDate() + n); return fmtDate(d); }

function pctFor(n) {
  if (n <= 1) return 100;
  if (n >= 12) return Math.max(40, 68.0 - (n - 12) * 1.35);
  const lo = Math.floor(n), hi = Math.ceil(n);
  if (lo === hi) return PCT_TABLE[lo];
  return PCT_TABLE[lo] + (PCT_TABLE[hi] - PCT_TABLE[lo]) * (n - lo);
}
/* RPE를 입력하지 않았으면 @10으로 계산 */
function e1rm(w, r, rpe) {
  if (!(w > 0 && r > 0)) return null;
  const n = r + (10 - (rpe || 10));
  return w / (pctFor(n) / 100);
}

/* ================= 상태 ================= */
function defaultState() {
  const mk = (name, main, lift, rest, color, noVolume = false) =>
    ({ id: uid(), name, main, lift, rest, color, noVolume, archived: false, template: [] });
  const ex = [
    mk('스쿼트', true, 'S', 180, LIFT_COLORS.S),
    mk('벤치프레스', true, 'B', 180, LIFT_COLORS.B),
    mk('데드리프트', true, 'D', 180, LIFT_COLORS.D),
    mk('오버헤드프레스', true, 'O', 180, LIFT_COLORS.O),
    mk('풀업', true, '', 150, EX_PALETTE[4], true),
    mk('머신 로우', false, '', 120, EX_PALETTE[5]),
    mk('인클라인 컬', false, '', 90, EX_PALETTE[6]),
    mk('바벨 컬', false, '', 90, EX_PALETTE[7]),
    mk('오버헤드 트라이셉스 익스텐션', false, '', 90, EX_PALETTE[8]),
    mk('스컬 크러셔', false, '', 90, EX_PALETTE[9]),
    mk('케이블 푸시다운', false, '', 90, EX_PALETTE[10]),
    mk('해머 컬', false, '', 90, EX_PALETTE[11]),
  ];
  const id = n => ex.find(e => e.name === n).id;
  return {
    version: 1,
    exercises: ex,
    routines: [
      { id: uid(), name: 'A', color: ROUTINE_PALETTE[0], exerciseIds: [id('스쿼트'), id('벤치프레스'), id('풀업')] },
      { id: uid(), name: 'B', color: ROUTINE_PALETTE[1], exerciseIds: [id('데드리프트'), id('오버헤드프레스'), id('머신 로우')] },
    ],
    sessions: [],
    activeSessionId: null,
    calc: { S: {}, B: {}, D: {}, O: {} },
    timer: null,
  };
}

let S;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    S = raw ? JSON.parse(raw) : defaultState();
  } catch (e) { S = defaultState(); }
  migrate();
}
/* 예전 버전 데이터 보정 */
function migrate() {
  S.calc = S.calc || { S: {}, B: {}, D: {}, O: {} };
  for (const L of LIFTS) S.calc[L] = S.calc[L] || {};
  for (const e of S.exercises) if (!Array.isArray(e.template)) e.template = [];
  delete S.bodyweight;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { alert('저장에 실패했습니다: ' + e.message); }
}
/* 저장소가 자동으로 지워지지 않게 요청 (지원하는 브라우저만) */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const exById = id => S.exercises.find(e => e.id === id);
const routineById = id => S.routines.find(r => r.id === id);
const sessionById = id => S.sessions.find(s => s.id === id);
const activeExercises = () => S.exercises.filter(e => !e.archived);

function routineLabel(name) {
  const t = String(name || '').trim();
  if (!t) return '?';
  return t[0].toUpperCase();
}
function sessionMeta(s) {
  const r = s.routineId ? routineById(s.routineId) : null;
  return r ? { name: r.name, label: routineLabel(r.name), color: r.color }
    : { name: s.routineName || '자유', label: s.routineName ? routineLabel(s.routineName) : '자', color: FREE_COLOR };
}
function sortedSessions() {
  return [...S.sessions].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

/* ================= 계산 ================= */
function setVolume(st) { return st.done && st.w > 0 && st.r > 0 ? st.w * st.r : 0; }
function entryVolume(en) { return en.sets.reduce((a, st) => a + setVolume(st), 0); }
function entryBest(en) {
  let best = null, heavy = null;
  for (const st of en.sets) {
    if (!st.done || !(st.w > 0) || !(st.r > 0)) continue;
    const v = e1rm(st.w, st.r, st.rpe);
    if (best === null || v > best) best = v;
    if (heavy === null || st.w > heavy) heavy = st.w;
  }
  return { e1rm: best, heavy };
}
function sessionVolume(s) {
  return s.entries.reduce((a, en) => { const ex = exById(en.exerciseId); return a + (ex && !ex.noVolume ? entryVolume(en) : 0); }, 0);
}
function weeklyLiftVolume(ws) {
  const we = addDays(ws, 7);
  const out = { S: 0, B: 0, D: 0, O: 0 };
  for (const s of S.sessions) {
    if (s.date < ws || s.date >= we) continue;
    for (const en of s.entries) {
      const ex = exById(en.exerciseId);
      if (ex && ex.lift && out[ex.lift] !== undefined) out[ex.lift] += entryVolume(en);
    }
  }
  return out;
}
/* 메인 종목별 세션 기록: [{date, e1rm, heavy}] */
function liftSeries(lift) {
  const out = [];
  for (const s of sortedSessions()) {
    let best = null, heavy = null;
    for (const en of s.entries) {
      const ex = exById(en.exerciseId);
      if (!ex || ex.lift !== lift) continue;
      const b = entryBest(en);
      if (b.e1rm !== null && (best === null || b.e1rm > best)) best = b.e1rm;
      if (b.heavy !== null && (heavy === null || b.heavy > heavy)) heavy = b.heavy;
    }
    if (best !== null) out.push({ date: s.date, e1rm: best, heavy });
  }
  return out;
}

/* ================= 세션 ================= */
/* 이 종목을 마지막으로 한 기록 (완료 세트가 있는 것만) */
function lastRecordFor(exerciseId, excludeId) {
  const list = sortedSessions().reverse();
  for (const s of list) {
    if (s.id === excludeId) continue;
    const en = s.entries.find(e => e.exerciseId === exerciseId);
    if (en && en.sets.some(st => st.done)) return { date: s.date, sets: en.sets.filter(st => st.done) };
  }
  return null;
}
const blankSet = () => ({ w: null, r: null, rpe: null, done: false });
/* 기본 세트(설정) → 지난 기록 → 빈 3세트 순으로 채움 */
function initialSets(exerciseId, sessionId) {
  const ex = exById(exerciseId);
  if (ex && Array.isArray(ex.template) && ex.template.length) return ex.template.map(t => ({ w: t.w, r: t.r, rpe: null, done: false }));
  const prev = lastRecordFor(exerciseId, sessionId);
  if (prev) return prev.sets.map(st => ({ w: st.w, r: st.r, rpe: null, done: false }));
  return [blankSet(), blankSet(), blankSet()];
}
function newEntry(exerciseId, sessionId) {
  return { exerciseId, sets: initialSets(exerciseId, sessionId) };
}
const doneCount = s => s.entries.reduce((a, en) => a + en.sets.filter(st => st.done).length, 0);
const undoneCount = s => s.entries.reduce((a, en) => a + en.sets.filter(st => !st.done).length, 0);

async function requestStart(routineId) {
  const act = S.activeSessionId && sessionById(S.activeSessionId);
  if (act) {
    const m = sessionMeta(act);
    const v = await modal({
      title: '진행 중인 운동이 있습니다',
      body: `${esc(m.name)} (${shortDate(act.date)}) · 완료 ${doneCount(act)}세트`,
      buttons: [{ label: '그 운동 이어하기', val: 'resume', cls: 'primary' }, { label: '그 운동 종료하고 새로 시작', val: 'new' }, { label: '취소', val: null }],
    });
    if (v === 'resume') { go('session', { id: act.id }); return; }
    if (v !== 'new') return;
    if (!doneCount(act)) S.sessions = S.sessions.filter(x => x.id !== act.id);
    S.activeSessionId = null; stopTimer();
  }
  const td = today();
  const same = S.sessions.find(s => s.date === td && (s.routineId || null) === (routineId || null));
  if (same) {
    const m = sessionMeta(same);
    const v = await modal({
      title: '오늘 이미 기록이 있습니다',
      body: `오늘 ${esc(m.name)} 기록 (완료 ${doneCount(same)}세트)이 있습니다.`,
      buttons: [{ label: '기존 기록 열기', val: 'open', cls: 'primary' }, { label: '새로 하나 더 시작', val: 'new' }, { label: '취소', val: null }],
    });
    if (v === 'open') { S.activeSessionId = same.id; save(); go('session', { id: same.id }); return; }
    if (v !== 'new') return;
  }
  startSession(routineId);
}

async function requestEnd(s) {
  const done = doneCount(s), undone = undoneCount(s);
  let v;
  if (!done) {
    v = await modal({
      title: '완료한 세트가 없습니다',
      body: '체크(✓)한 세트가 하나도 없어서 볼륨과 그래프에 반영되지 않습니다.',
      buttons: [{ label: '기록 없이 삭제', val: 'delete', cls: 'danger' }, { label: '그래도 저장', val: 'keep' }, { label: '계속 운동', val: null, cls: 'primary' }],
    });
    if (!v) return;
    if (v === 'delete') S.sessions = S.sessions.filter(x => x.id !== s.id);
  } else {
    const buttons = undone
      ? [{ label: `미완료 ${undone}세트 지우고 저장`, val: 'trim', cls: 'primary' }, { label: '그대로 저장', val: 'keep' }, { label: '계속 운동', val: null }]
      : [{ label: '저장하고 종료', val: 'keep', cls: 'primary' }, { label: '계속 운동', val: null }];
    v = await modal({
      title: '운동을 마칠까요?',
      body: `완료 ${done}세트 · 총 볼륨 ${kg(sessionVolume(s))}` + (undone ? `<br><span class="muted">체크 안 한 세트 ${undone}개는 볼륨에 들어가지 않습니다.</span>` : ''),
      buttons,
    });
    if (!v) return;
    if (v === 'trim') {
      for (const en of s.entries) en.sets = en.sets.filter(st => st.done);
      s.entries = s.entries.filter(en => en.sets.length);
    }
  }
  if (S.activeSessionId === s.id) S.activeSessionId = null;
  stopTimer();
  save();
  go('home');
}

/* ================= 모달 ================= */
function modal({ title, body, buttons }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-box"><div class="modal-title">${title}</div><div class="modal-body">${body || ''}</div>
      <div class="modal-btns">${buttons.map((b, k) => `<button class="btn block ${b.cls || ''}" data-k="${k}">${b.label}</button>`).join('')}</div></div>`;
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (b) { e.stopPropagation(); wrap.remove(); resolve(buttons[+b.dataset.k].val); }
      else if (e.target === wrap) { wrap.remove(); resolve(null); }
    });
    document.body.appendChild(wrap);
  });
}

function startSession(routineId) {
  const s = { id: uid(), date: today(), createdAt: Date.now(), routineId: routineId || null, entries: [] };
  const r = routineId ? routineById(routineId) : null;
  if (r) {
    s.routineName = r.name;
    for (const exId of r.exerciseIds) if (exById(exId)) s.entries.push(newEntry(exId, s.id));
  }
  S.sessions.push(s);
  S.activeSessionId = s.id;
  save();
  go('session', { id: s.id });
}

/* ================= 화면 이동 ================= */
const view = { name: 'home', id: null, lift: 'ALL', mode: 'e1rm', calMonth: null, calSel: null, openRest: null, openEx: null };
function go(name, opts = {}) {
  view.name = name;
  if (opts.id !== undefined) view.id = opts.id;
  view.openRest = null;
  closeDrawer();
  render();
  window.scrollTo(0, 0);
}
function openDrawer() { const d = document.getElementById('drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); }
function closeDrawer() { const d = document.getElementById('drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

const TITLES = { home: 'LiftLog', session: '운동', records: '기록', calendar: '달력', calc: '1RM 계산기', settings: '설정' };
function render() {
  document.getElementById('title').textContent = TITLES[view.name] || 'LiftLog';
  document.querySelectorAll('.drawer-panel [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view.name));
  const app = document.getElementById('app');
  const fn = { home: renderHome, session: renderSession, records: renderRecords, calendar: renderCalendar, calc: renderCalc, settings: renderSettings }[view.name];
  app.innerHTML = fn ? fn() : '';
  if (view.name === 'records') drawChart();
  updateWakeLock();
}

/* ================= 홈 ================= */
function renderHome() {
  let h = '';
  const act = S.activeSessionId && sessionById(S.activeSessionId);
  if (act) {
    const m = sessionMeta(act);
    h += `<div class="card resume row">
      <span class="badge" style="background:${m.color}">${esc(m.label)}</span>
      <div class="grow"><b>진행 중인 운동</b><div class="small muted">${esc(m.name)} · ${shortDate(act.date)}</div></div>
      <button class="btn primary" data-act="open-session" data-id="${act.id}">이어하기</button></div>`;
  }
  if (backupDue()) {
    h += `<div class="card row warn"><div class="grow small">${S.lastBackup ? `마지막 백업이 ${shortDate(S.lastBackup)}입니다.` : '아직 백업한 적이 없습니다.'} 휴대폰을 바꾸거나 브라우저 데이터를 지우면 기록이 사라집니다.</div>
      <button class="btn sm" data-act="export">백업</button></div>`;
  }
  h += `<div class="section-title">운동 시작</div><div class="routine-grid">`;
  for (const r of S.routines) {
    const names = r.exerciseIds.map(id => exById(id)).filter(Boolean).map(e => e.name).slice(0, 3).join(' · ');
    h += `<button class="routine-btn" style="background:${r.color}" data-act="start" data-id="${r.id}">${esc(r.name)}<small>${esc(names)}</small></button>`;
  }
  h += `<button class="routine-btn free" data-act="start" data-id="">+ 자유 운동</button></div>`;

  const ws = weekStart(today());
  const cur = weeklyLiftVolume(ws), prev = weeklyLiftVolume(addDays(ws, -7));
  h += `<div class="section-title">이번 주 볼륨 (월~일)</div><div class="card vol-grid">`;
  for (const L of LIFTS) {
    h += `<div><div class="lbl" style="color:${LIFT_COLORS[L]}">${L}</div><div class="val">${kg(cur[L])}</div><div class="prev">지난주 ${kg(prev[L])}</div></div>`;
  }
  h += `</div>`;

  const recent = sortedSessions().reverse().slice(0, 6);
  h += `<div class="section-title">최근 운동</div><div class="card">`;
  if (!recent.length) h += `<div class="empty-note">아직 기록이 없습니다.</div>`;
  for (const s of recent) {
    const m = sessionMeta(s);
    const names = s.entries.map(en => exById(en.exerciseId)).filter(Boolean).map(e => e.name).join(', ');
    h += `<div class="list-item" data-act="open-session" data-id="${s.id}">
      <span class="badge" style="background:${m.color}">${esc(m.label)}</span>
      <div class="grow"><div>${shortDate(s.date)} (${DOW[parseDate(s.date).getDay()]}) · ${kg(sessionVolume(s))}</div>
      <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(names)}</div></div></div>`;
  }
  h += `</div>`;
  return h;
}

/* ================= 운동 세션 ================= */
function rpeSelect(v, attrs) {
  let o = `<select ${attrs}><option value="">@</option>`;
  for (const x of RPE_OPTIONS) o += `<option value="${x}"${v === x ? ' selected' : ''}>@${x}</option>`;
  return o + '</select>';
}
function entryMetaHtml(en, ex) {
  const parts = [];
  if (!ex.noVolume) parts.push(kg(entryVolume(en)));
  if (ex.lift) { const b = entryBest(en); if (b.e1rm) parts.push(`e1RM ${round1(b.e1rm)}`); }
  return parts.join('<br>');
}
function renderSession() {
  const s = sessionById(view.id);
  if (!s) return `<div class="empty-note">세션을 찾을 수 없습니다.</div>`;
  const m = sessionMeta(s);
  let h = `<div class="card session-head">
    <div class="row"><span class="badge" style="background:${m.color}">${esc(m.label)}</span>
      <b class="grow">${esc(m.name)}</b>
      <input type="date" class="date-input" value="${s.date}" data-act="session-date"></div>
    <div class="row" style="margin-top:8px"><span class="total grow">총 볼륨 <b id="total-vol">${kg(sessionVolume(s))}</b></span></div></div>`;

  s.entries.forEach((en, i) => {
    const ex = exById(en.exerciseId);
    if (!ex) return;
    h += `<div class="card ex" style="--c:${ex.color}">
      <div class="ex-head"><span class="dot" style="background:${ex.color}"></span>
        <span class="ex-name">${esc(ex.name)}</span>
        <span class="ex-meta" id="meta-${i}">${entryMetaHtml(en, ex)}</span>
        <button class="mini" data-act="rest-toggle" data-i="${i}">⏱ ${fmtRest(ex.rest)}</button>
        <button class="mini" data-act="entry-del" data-i="${i}">✕</button></div>
      <div class="rest-row${view.openRest === i ? '' : ' hidden'}">
        <span class="small muted">휴식</span>
        <input type="range" min="60" max="240" step="15" value="${ex.rest}" data-act="rest-range" data-ex="${ex.id}" data-i="${i}">
        <b class="small" id="rest-lbl-${i}">${fmtRest(ex.rest)}</b></div>
      ${prevLineHtml(ex, s, i)}
      <div class="set-grid"><span>세트</span><span>${ex.noVolume ? '+kg' : 'kg'}</span><span>회</span><span>RPE</span><span>완료</span></div>`;
    en.sets.forEach((st, j) => {
      h += `<div class="set-row${st.done ? ' done' : ''}">
        <button class="set-num" data-act="set-del" data-i="${i}" data-j="${j}">${j + 1}</button>
        <input inputmode="decimal" value="${st.w ?? ''}" placeholder="0" data-act="set-w" data-i="${i}" data-j="${j}">
        <input inputmode="numeric" value="${st.r ?? ''}" placeholder="0" data-act="set-r" data-i="${i}" data-j="${j}">
        ${rpeSelect(st.rpe, `data-act="set-rpe" data-i="${i}" data-j="${j}"`)}
        <button class="check" data-act="set-done" data-i="${i}" data-j="${j}">✓</button></div>`;
    });
    h += `<div class="set-btns"><button class="add-set" data-act="set-remove" data-i="${i}"${en.sets.length ? '' : ' disabled'}>− 세트</button>
      <button class="add-set" data-act="set-add" data-i="${i}">+ 세트</button></div></div>`;
  });

  const opts = activeExercises().map(e => `<option value="${e.id}">${esc(e.name)}${e.main ? '' : ' (보조)'}</option>`).join('');
  h += `<div class="add-ex"><select id="add-ex-sel"><option value="">종목 추가…</option>${opts}</select>
    <button class="btn" data-act="entry-add">추가</button></div>`;
  h += `<div class="row" style="margin-top:20px">
    <button class="btn danger" data-act="session-del">삭제</button>
    <span class="grow"></span>
    ${S.activeSessionId === s.id ? `<button class="btn primary" data-act="session-end">운동 종료</button>` : `<button class="btn" data-act="nav" data-view="home">홈으로</button>`}</div>`;
  return h;
}
function setsSummary(sets) {
  /* 같은 무게·횟수가 이어지면 "80×5 ×3"처럼 묶음 */
  const out = [];
  for (const st of sets) {
    const k = `${st.w ?? 0}×${st.r ?? 0}`;
    const last = out[out.length - 1];
    if (last && last.k === k) last.n++; else out.push({ k, n: 1 });
  }
  return out.map(o => (o.n > 1 ? `${o.k} ×${o.n}` : o.k)).join(', ');
}
function prevLineHtml(ex, s, i) {
  const prev = lastRecordFor(ex.id, s.id);
  if (!prev) return '';
  return `<div class="prev-line"><span class="grow">지난번 ${shortDate(prev.date)}: ${setsSummary(prev.sets)}</span>
    <button class="mini" data-act="load-prev" data-i="${i}">불러오기</button></div>`;
}
function refreshSessionNumbers(i) {
  const s = sessionById(view.id); if (!s) return;
  const en = s.entries[i], ex = en && exById(en.exerciseId);
  const meta = document.getElementById('meta-' + i);
  if (meta && ex) meta.innerHTML = entryMetaHtml(en, ex);
  const t = document.getElementById('total-vol');
  if (t) t.textContent = kg(sessionVolume(s));
}

/* ================= 휴식 타이머 ================= */
let timerInt = null;
function startTimer(label, seconds) {
  S.timer = { label, endAt: Date.now() + seconds * 1000 };
  save();
  tickTimer();
}
function stopTimer() { S.timer = null; save(); tickTimer(); }
function tickTimer() {
  const el = document.getElementById('timer');
  if (!S.timer) { el.classList.add('hidden'); clearInterval(timerInt); timerInt = null; return; }
  el.classList.remove('hidden');
  const left = Math.round((S.timer.endAt - Date.now()) / 1000);
  const a = Math.abs(left);
  document.getElementById('timer-time').textContent = `${left < 0 ? '-' : ''}${Math.floor(a / 60)}:${pad(a % 60)}`;
  const lbl = document.getElementById('timer-label');
  if (lbl.dataset.v !== S.timer.label) { lbl.textContent = `${S.timer.label} 휴식`; lbl.dataset.v = S.timer.label; }
  el.classList.toggle('over', left < 0);
  if (!timerInt) timerInt = setInterval(tickTimer, 250);
}

/* 운동 화면에서는 화면 꺼짐 방지 */
let wakeLock = null;
async function updateWakeLock() {
  const want = view.name === 'session' || !!S.timer;
  try {
    if (want && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tickTimer(); updateWakeLock(); } });

/* ================= 기록 ================= */
function renderRecords() {
  let h = `<div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div class="chips">
        <button class="chip${view.lift === 'ALL' ? ' on' : ''}" style="${view.lift === 'ALL' ? 'background:#4f8cff' : ''}" data-act="lift" data-l="ALL">전체</button>
        ${LIFTS.map(L => `<button class="chip${view.lift === L ? ' on' : ''}" style="${view.lift === L ? `background:${LIFT_COLORS[L]}` : `color:${LIFT_COLORS[L]}`}" data-act="lift" data-l="${L}">${L}</button>`).join('')}
      </div></div>
    <div class="seg" style="margin-bottom:10px">
      <button class="${view.mode === 'e1rm' ? 'on' : ''}" data-act="mode" data-m="e1rm">e1RM</button>
      <button class="${view.mode === 'heavy' ? 'on' : ''}" data-act="mode" data-m="heavy">최고 작업 무게</button></div>
    <div class="chart-wrap"><canvas id="chart"></canvas></div></div>`;

  if (view.lift !== 'ALL') {
    const ser = liftSeries(view.lift).reverse();
    h += `<div class="section-title">${LIFT_NAMES[view.lift]} 세션 기록</div><div class="card">`;
    if (!ser.length) h += `<div class="empty-note">기록이 없습니다.</div>`;
    else {
      h += `<table class="tbl"><tr><th>날짜</th><th>e1RM</th><th>최고 작업 무게</th></tr>`;
      for (const p of ser.slice(0, 20)) h += `<tr><td>${shortDate(p.date)}</td><td>${round1(p.e1rm)}</td><td>${p.heavy}</td></tr>`;
      h += `</table>`;
    }
    h += `</div>`;
  }

  h += `<div class="section-title">주간 볼륨 (월~일, kg)</div><div class="card"><table class="tbl">
    <tr><th>주</th>${LIFTS.map(L => `<th style="color:${LIFT_COLORS[L]}">${L}</th>`).join('')}</tr>`;
  let ws = weekStart(today());
  for (let k = 0; k < 8; k++) {
    const v = weeklyLiftVolume(ws);
    h += `<tr><td>${shortDate(ws)}~</td>${LIFTS.map(L => `<td>${v[L] ? Math.round(v[L]).toLocaleString('ko-KR') : '-'}</td>`).join('')}</tr>`;
    ws = addDays(ws, -7);
  }
  h += `</table></div>`;
  return h;
}

function drawChart() {
  const cv = document.getElementById('chart');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const lifts = view.lift === 'ALL' ? LIFTS : [view.lift];
  const key = view.mode;
  const series = lifts.map(L => ({ L, pts: liftSeries(L).map(p => ({ t: parseDate(p.date).getTime(), v: p[key] })) }));
  const all = series.flatMap(s => s.pts);

  ctx.font = '12px -apple-system, sans-serif';
  if (!all.length) {
    ctx.fillStyle = '#8b96a5'; ctx.textAlign = 'center';
    ctx.fillText('메인 종목 기록이 쌓이면 그래프가 나옵니다.', W / 2, H / 2);
    return;
  }

  let yMin, yMax;
  if (view.lift === 'ALL') { yMin = 40; yMax = 180; }
  else {
    const vs = all.map(p => p.v);
    yMin = Math.floor((Math.min(...vs) - 5) / 10) * 10;
    yMax = Math.ceil((Math.max(...vs) + 5) / 10) * 10;
    if (yMax - yMin < 20) { yMin -= 10; yMax += 10; }
    yMin = Math.max(0, yMin);
  }
  let tMin = Math.min(...all.map(p => p.t)), tMax = Math.max(...all.map(p => p.t));
  if (tMax - tMin < 6 * 864e5) { const mid = (tMin + tMax) / 2; tMin = mid - 3 * 864e5; tMax = mid + 3 * 864e5; }

  const pl = 36, pr = 12, pt = 10, pb = 26;
  const X = t => pl + (t - tMin) / (tMax - tMin) * (W - pl - pr);
  const Y = v => pt + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (H - pt - pb);

  // 가로 눈금
  const range = yMax - yMin;
  const step = range <= 40 ? 5 : range <= 80 ? 10 : 20;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    ctx.strokeStyle = '#2a313b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pl, Y(v)); ctx.lineTo(W - pr, Y(v)); ctx.stroke();
    ctx.fillStyle = '#8b96a5'; ctx.fillText(String(v), pl - 6, Y(v));
  }
  // 날짜 눈금
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const nTicks = Math.max(2, Math.min(5, Math.floor((W - pl - pr) / 70)));
  for (let k = 0; k <= nTicks; k++) {
    const t = tMin + (tMax - tMin) * k / nTicks;
    const d = new Date(t);
    ctx.fillStyle = '#8b96a5'; ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, X(t), H - pb + 8);
  }
  // 선
  for (const s of series) {
    if (!s.pts.length) continue;
    ctx.strokeStyle = LIFT_COLORS[s.L]; ctx.fillStyle = LIFT_COLORS[s.L]; ctx.lineWidth = 2.2;
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
    ctx.stroke();
    for (const p of s.pts) { ctx.beginPath(); ctx.arc(X(p.t), Y(p.v), 3.5, 0, Math.PI * 2); ctx.fill(); }
    if (view.lift !== 'ALL') {
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8ecf1';
      const every = Math.ceil(s.pts.length / 8);
      s.pts.forEach((p, i) => { if (i % every === 0 || i === s.pts.length - 1) ctx.fillText(String(Math.round(p.v)), X(p.t), Y(p.v) - 6); });
    }
  }
  // 범례
  if (view.lift === 'ALL') {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let x = pl + 6;
    for (const L of LIFTS) {
      ctx.fillStyle = LIFT_COLORS[L]; ctx.fillRect(x, pt + 4, 10, 10);
      ctx.fillStyle = '#e8ecf1'; ctx.fillText(L, x + 14, pt + 9); x += 34;
    }
  }
}
window.addEventListener('resize', () => { if (view.name === 'records') drawChart(); });

/* ================= 달력 ================= */
function renderCalendar() {
  if (!view.calMonth) { const d = new Date(); view.calMonth = fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)); }
  const first = parseDate(view.calMonth);
  const y = first.getFullYear(), mo = first.getMonth();
  const days = new Date(y, mo + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const byDate = {};
  for (const s of S.sessions) (byDate[s.date] = byDate[s.date] || []).push(s);
  const td = today();

  let h = `<div class="card"><div class="cal-head">
    <button class="icon-btn" data-act="cal-move" data-d="-1">‹</button>
    <b>${y}년 ${mo + 1}월</b>
    <button class="icon-btn" data-act="cal-move" data-d="1">›</button></div>
    <div class="cal-grid">${['월', '화', '수', '목', '금', '토', '일'].map(d => `<div class="cal-dow">${d}</div>`).join('')}`;
  for (let i = 0; i < lead; i++) h += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const list = byDate[ds] || [];
    h += `<div class="cal-cell${ds === td ? ' today' : ''}${ds === view.calSel ? ' sel' : ''}" data-act="cal-sel" data-d="${ds}">
      <span class="d">${d}</span><div class="cal-tags">${list.map(s => { const m = sessionMeta(s); return `<span class="cal-tag" style="background:${m.color}">${esc(m.label)}</span>`; }).join('')}</div></div>`;
  }
  h += `</div></div>`;

  if (view.calSel) {
    const list = byDate[view.calSel] || [];
    const d = parseDate(view.calSel);
    h += `<div class="section-title">${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})</div>`;
    if (!list.length) h += `<div class="card empty-note">이날은 기록이 없습니다.</div>`;
    for (const s of list) {
      const m = sessionMeta(s);
      h += `<div class="card"><div class="row" style="margin-bottom:8px">
        <span class="badge" style="background:${m.color}">${esc(m.label)}</span><b class="grow">${esc(m.name)}</b>
        <span class="small muted">${kg(sessionVolume(s))}</span></div><div>`;
      for (const en of s.entries) {
        const ex = exById(en.exerciseId); if (!ex) continue;
        const done = en.sets.filter(st => st.done && st.r > 0);
        const sum = done.length ? done.map(st => `${st.w ?? 0}×${st.r}`).join(', ') : '기록 없음';
        h += `<span class="ex-chip" style="--c:${ex.color}"><b style="color:${ex.color}">●</b> ${esc(ex.name)} <span class="muted">${sum}</span></span>`;
      }
      h += `</div><div class="row" style="margin-top:8px"><span class="grow"></span>
        <button class="btn sm" data-act="open-session" data-id="${s.id}">열기·수정</button></div></div>`;
    }
  }
  return h;
}

/* ================= 1RM 계산기 ================= */
function renderCalc() {
  let h = `<div class="card"><div class="calc-row small muted" style="margin-bottom:4px"><span></span><span style="text-align:center">kg</span><span style="text-align:center">회</span><span style="text-align:center">RPE</span></div>`;
  for (const L of LIFTS) {
    const c = S.calc[L] || {};
    h += `<div class="calc-row"><b style="color:${LIFT_COLORS[L]};font-size:18px;text-align:center">${L}</b>
      <input inputmode="decimal" value="${c.w ?? ''}" placeholder="0" data-act="calc" data-l="${L}" data-f="w">
      <input inputmode="numeric" value="${c.r ?? ''}" placeholder="0" data-act="calc" data-l="${L}" data-f="r">
      ${rpeSelect(c.rpe ?? null, `data-act="calc" data-l="${L}" data-f="rpe"`)}
      <div class="calc-out" id="calc-${L}">${calcOut(L)}</div></div>`;
  }
  h += `<div class="small muted">RPE를 비워 두면 @10(한계까지)으로 계산합니다.</div></div>`;
  return h;
}
function calcOut(L) {
  const c = S.calc[L] || {};
  const v = e1rm(c.w, c.r, c.rpe);
  return v ? `예상 1RM <b>${round1(v)}</b>kg` : '<span class="muted">—</span>';
}

/* ================= 설정 ================= */
function renderSettings() {
  let h = `<div class="section-title">루틴</div>`;
  const exOpts = activeExercises().map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  for (const r of S.routines) {
    h += `<div class="card"><div class="row" style="margin-bottom:8px">
      <span class="badge" style="background:${r.color}">${esc(routineLabel(r.name))}</span>
      <input class="inp grow" value="${esc(r.name)}" data-act="routine-name" data-id="${r.id}" placeholder="루틴 이름">
      <button class="btn sm danger" data-act="routine-del" data-id="${r.id}">삭제</button></div>`;
    r.exerciseIds.forEach((id, k) => {
      const e = exById(id); if (!e) return;
      h += `<div class="rex"><span class="dot" style="background:${e.color}"></span><span class="grow">${esc(e.name)}</span>
        <button class="mini" data-act="rex-up" data-id="${r.id}" data-k="${k}">▲</button>
        <button class="mini" data-act="rex-down" data-id="${r.id}" data-k="${k}">▼</button>
        <button class="mini" data-act="rex-del" data-id="${r.id}" data-k="${k}">✕</button></div>`;
    });
    h += `<div class="add-ex" style="margin-top:8px"><select id="rex-sel-${r.id}"><option value="">종목 추가…</option>${exOpts}</select>
      <button class="btn sm" data-act="rex-add" data-id="${r.id}">추가</button></div></div>`;
  }
  h += `<button class="btn block" data-act="routine-add">+ 루틴 추가</button>`;

  h += `<div class="section-title">종목 · 기본 세팅 <span class="muted">(눌러서 펼치기)</span></div>`;
  for (const e of activeExercises()) {
    const open = view.openEx === e.id;
    h += `<div class="card ex-set${open ? ' open' : ''}" id="exs-${e.id}">
      <button class="ex-set-head" data-act="ex-toggle" data-id="${e.id}">
        <span class="dot" style="background:${e.color}"></span>
        <span class="grow" style="text-align:left"><b>${esc(e.name)}</b><br><span class="small muted" id="exsum-${e.id}">${exSummary(e)}</span></span>
        <span class="muted">${open ? '▴' : '▾'}</span></button>`;
    if (open) {
      const tpl = e.template || [];
      h += `<div class="ex-set-body">
        <div class="row" style="margin-top:10px"><input class="inp grow" value="${esc(e.name)}" data-act="ex-name" data-id="${e.id}" placeholder="종목 이름">
          <button class="btn sm danger" data-act="ex-del" data-id="${e.id}">삭제</button></div>
        <div class="rest-row" style="padding-bottom:0"><span class="small muted">휴식</span>
          <input type="range" min="60" max="240" step="15" value="${e.rest}" data-act="ex-rest" data-id="${e.id}">
          <b class="small" id="exrest-${e.id}">${fmtRest(e.rest)}</b></div>
        <div class="sub-title">기본 세트 <span class="muted small">— 운동 시작할 때 이대로 채워집니다</span></div>
        <div class="quick-row">
          <input inputmode="numeric" placeholder="세트" id="q-n-${e.id}" value="${tpl.length || ''}"><span>세트</span>
          <input inputmode="decimal" placeholder="kg" id="q-w-${e.id}" value="${tpl[0]?.w ?? ''}"><span>kg</span>
          <input inputmode="numeric" placeholder="회" id="q-r-${e.id}" value="${tpl[0]?.r ?? ''}"><span>회</span>
          <button class="btn sm primary" data-act="tpl-apply" data-id="${e.id}">일괄 적용</button></div>`;
      if (tpl.length) {
        h += `<div class="tpl-grid muted small"><span>세트</span><span>kg</span><span>회</span><span></span></div>`;
        tpl.forEach((t, k) => {
          h += `<div class="tpl-grid"><b class="muted" style="text-align:center">${k + 1}</b>
            <input inputmode="decimal" value="${t.w ?? ''}" placeholder="0" data-act="tpl-w" data-id="${e.id}" data-k="${k}">
            <input inputmode="numeric" value="${t.r ?? ''}" placeholder="0" data-act="tpl-r" data-id="${e.id}" data-k="${k}">
            <button class="mini" data-act="tpl-del" data-id="${e.id}" data-k="${k}">✕</button></div>`;
        });
      } else {
        h += `<div class="small muted" style="padding:6px 2px">기본 세트가 없으면 지난번 기록으로 채웁니다.</div>`;
      }
      h += `<div class="set-btns"><button class="add-set" data-act="tpl-add" data-id="${e.id}">+ 세트</button>
          ${tpl.length ? `<button class="add-set" data-act="tpl-clear" data-id="${e.id}">기본 세트 비우기</button>` : ''}</div>
        <div class="set-ex-opts">
          <select data-act="ex-main" data-id="${e.id}"><option value="1"${e.main ? ' selected' : ''}>메인</option><option value="0"${e.main ? '' : ' selected'}>보조</option></select>
          <select data-act="ex-lift" data-id="${e.id}"><option value="">기록 연결 없음</option>${LIFTS.map(L => `<option value="${L}"${e.lift === L ? ' selected' : ''}>${L} (${LIFT_NAMES[L]})</option>`).join('')}</select>
          <label><input type="checkbox" data-act="ex-novol" data-id="${e.id}"${e.noVolume ? ' checked' : ''}> 볼륨 제외</label>
        </div></div>`;
    }
    h += `</div>`;
  }
  h += `<button class="btn block" data-act="ex-add">+ 종목 추가</button>`;

  h += `<div class="section-title">백업</div><div class="card">
    <div class="small muted" style="margin-bottom:10px">기록은 이 휴대폰의 브라우저에만 저장됩니다. 가끔 내보내기로 백업 파일을 받아 두세요.<br>
    마지막 백업: ${S.lastBackup ? shortDate(S.lastBackup) : '없음'}</div>
    <div class="row"><button class="btn grow" data-act="export">내보내기</button><button class="btn grow" data-act="import">불러오기</button></div></div>`;
  h += `<div class="small muted" style="text-align:center;margin:20px 0">LiftLog v2</div>`;
  return h;
}
function exSummary(e) {
  const tpl = e.template || [];
  const parts = [];
  parts.push(tpl.length ? `기본 ${setsSummary(tpl)}` : '기본 세트 없음(지난 기록 사용)');
  parts.push(`휴식 ${fmtRest(e.rest)}`);
  return esc(parts.join(' · '));
}
function refreshExSummary(id) {
  const el = document.getElementById('exsum-' + id);
  if (el) el.innerHTML = exSummary(exById(id));
}

/* ================= 백업 ================= */
async function exportData() {
  const name = `liftlog-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      markBackup(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  markBackup();
}
function markBackup() { S.lastBackup = today(); save(); if (view.name === 'settings' || view.name === 'home') render(); }
function backupDue() {
  if (S.sessions.length < 5) return false;
  if (!S.lastBackup) return true;
  return (parseDate(today()) - parseDate(S.lastBackup)) / 864e5 >= 30;
}
document.getElementById('import-file').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.exercises) || !Array.isArray(data.sessions) || !Array.isArray(data.routines)) throw new Error('형식이 맞지 않습니다');
    if (!confirm(`세션 ${data.sessions.length}개가 든 백업입니다. 지금 기록을 이 백업으로 바꿀까요?`)) return;
    S = data; migrate();
    save(); go('home');
  } catch (e) { alert('불러오기 실패: ' + e.message); }
});

/* ================= 이벤트 ================= */
function curSession() { return sessionById(view.id); }

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act, d = t.dataset;
  const s = curSession();
  switch (a) {
    case 'menu': openDrawer(); break;
    case 'menu-close': closeDrawer(); break;
    case 'nav': go(d.view); break;
    case 'start': requestStart(d.id || null); break;
    case 'open-session': go('session', { id: d.id }); break;
    case 'timer-close': stopTimer(); updateWakeLock(); break;
    case 'timer-plus': if (S.timer) { S.timer.endAt += 30000; save(); tickTimer(); } break;

    case 'set-done': {
      const en = s.entries[+d.i], st = en.sets[+d.j];
      st.done = !st.done;
      /* 다음 세트가 비어 있으면 방금 값으로 채움 */
      const next = en.sets[+d.j + 1];
      let refill = false;
      if (st.done && next && !next.done && next.w == null && next.r == null) { next.w = st.w; next.r = st.r; refill = true; }
      save();
      if (refill) render();
      else { t.closest('.set-row').classList.toggle('done', st.done); refreshSessionNumbers(+d.i); }
      if (st.done) { const ex = exById(en.exerciseId); startTimer(ex.name, ex.rest); updateWakeLock(); }
      break;
    }
    case 'set-add': {
      const en = s.entries[+d.i];
      const last = en.sets[en.sets.length - 1];
      en.sets.push({ w: last ? last.w : null, r: last ? last.r : null, rpe: null, done: false });
      save(); render(); break;
    }
    case 'set-remove': {
      const en = s.entries[+d.i];
      if (!en.sets.length) break;
      const last = en.sets[en.sets.length - 1];
      if (last.done && !confirm('마지막 세트는 완료 체크된 세트입니다. 지울까요?')) break;
      en.sets.pop(); save(); render(); break;
    }
    case 'load-prev': {
      const en = s.entries[+d.i];
      const prev = lastRecordFor(en.exerciseId, s.id);
      if (!prev) break;
      if (en.sets.some(st => st.done) && !confirm('완료한 세트가 있습니다. 지난 기록으로 덮어쓸까요?')) break;
      en.sets = prev.sets.map(st => ({ w: st.w, r: st.r, rpe: null, done: false }));
      save(); render(); break;
    }
    case 'ex-toggle': view.openEx = view.openEx === d.id ? null : d.id; render();
      if (view.openEx) document.getElementById('exs-' + d.id)?.scrollIntoView({ block: 'nearest' });
      break;
    case 'tpl-apply': {
      const e = exById(d.id);
      const n = Math.round(num(document.getElementById('q-n-' + d.id).value) || 0);
      const w = num(document.getElementById('q-w-' + d.id).value);
      const r = num(document.getElementById('q-r-' + d.id).value);
      if (n < 1 || n > 20) { alert('세트 수는 1~20 사이로 넣어 주세요.'); break; }
      e.template = Array.from({ length: n }, () => ({ w, r: r == null ? null : Math.round(r) }));
      save(); render(); break;
    }
    case 'tpl-add': {
      const e = exById(d.id); e.template = e.template || [];
      const last = e.template[e.template.length - 1];
      e.template.push({ w: last ? last.w : null, r: last ? last.r : null });
      save(); render(); break;
    }
    case 'tpl-del': exById(d.id).template.splice(+d.k, 1); save(); render(); break;
    case 'tpl-clear': exById(d.id).template = []; save(); render(); break;
    case 'set-del': {
      if (!confirm(`${+d.j + 1}세트를 지울까요?`)) break;
      s.entries[+d.i].sets.splice(+d.j, 1); save(); render(); break;
    }
    case 'entry-del': {
      const ex = exById(s.entries[+d.i].exerciseId);
      if (!confirm(`${ex ? ex.name : '이 종목'}을(를) 이번 운동에서 뺄까요?`)) break;
      s.entries.splice(+d.i, 1); save(); render(); break;
    }
    case 'entry-add': {
      const id = document.getElementById('add-ex-sel').value;
      if (!id) break;
      s.entries.push(newEntry(id, s.id)); save(); render();
      window.scrollTo(0, document.body.scrollHeight); break;
    }
    case 'rest-toggle': view.openRest = view.openRest === +d.i ? null : +d.i; render(); break;
    case 'session-end': requestEnd(s); break;
    case 'session-del': {
      if (!confirm('이 운동 기록을 통째로 지울까요?')) break;
      S.sessions = S.sessions.filter(x => x.id !== s.id);
      if (S.activeSessionId === s.id) { S.activeSessionId = null; stopTimer(); }
      save(); go('home'); break;
    }

    case 'lift': view.lift = d.l; render(); break;
    case 'mode': view.mode = d.m; render(); break;
    case 'cal-move': { const f = parseDate(view.calMonth); view.calMonth = fmtDate(new Date(f.getFullYear(), f.getMonth() + +d.d, 1)); render(); break; }
    case 'cal-sel': view.calSel = d.d; render(); break;

    case 'routine-add': {
      const used = S.routines.map(r => r.color);
      const color = ROUTINE_PALETTE.find(c => !used.includes(c)) || ROUTINE_PALETTE[S.routines.length % ROUTINE_PALETTE.length];
      S.routines.push({ id: uid(), name: '새 루틴', color, exerciseIds: [] }); save(); render(); break;
    }
    case 'routine-del': {
      const r = routineById(d.id);
      if (!confirm(`루틴 '${r.name}'을(를) 지울까요? 지난 기록은 남습니다.`)) break;
      S.routines = S.routines.filter(x => x.id !== d.id); save(); render(); break;
    }
    case 'rex-add': {
      const id = document.getElementById('rex-sel-' + d.id).value;
      if (!id) break;
      routineById(d.id).exerciseIds.push(id); save(); render(); break;
    }
    case 'rex-del': routineById(d.id).exerciseIds.splice(+d.k, 1); save(); render(); break;
    case 'rex-up': case 'rex-down': {
      const arr = routineById(d.id).exerciseIds, k = +d.k, k2 = a === 'rex-up' ? k - 1 : k + 1;
      if (k2 < 0 || k2 >= arr.length) break;
      [arr[k], arr[k2]] = [arr[k2], arr[k]]; save(); render(); break;
    }
    case 'ex-add': {
      const used = S.exercises.map(e => e.color);
      const color = EX_PALETTE.find(c => !used.includes(c)) || EX_PALETTE[S.exercises.length % EX_PALETTE.length];
      const ne = { id: uid(), name: '새 종목', main: false, lift: '', rest: 90, color, noVolume: false, archived: false, template: [] };
      S.exercises.push(ne); view.openEx = ne.id;
      save(); render(); document.getElementById('exs-' + ne.id)?.scrollIntoView({ block: 'center' }); break;
    }
    case 'ex-del': {
      const e = exById(d.id);
      if (!confirm(`종목 '${e.name}'을(를) 목록에서 지울까요? 지난 기록은 남습니다.`)) break;
      e.archived = true;
      for (const r of S.routines) r.exerciseIds = r.exerciseIds.filter(x => x !== d.id);
      save(); render(); break;
    }
    case 'export': exportData(); break;
    case 'import': document.getElementById('import-file').click(); break;
  }
});

document.addEventListener('input', ev => {
  const t = ev.target, d = t.dataset, a = d.act;
  if (!a) return;
  const s = curSession();
  switch (a) {
    case 'set-w': case 'set-r': {
      const st = s.entries[+d.i].sets[+d.j];
      st[a === 'set-w' ? 'w' : 'r'] = num(t.value);
      save(); refreshSessionNumbers(+d.i); break;
    }
    case 'rest-range': {
      const e = exById(d.ex); e.rest = +t.value; save();
      document.getElementById('rest-lbl-' + d.i).textContent = fmtRest(e.rest);
      break;
    }
    case 'calc': if (d.f !== 'rpe') { S.calc[d.l][d.f] = num(t.value); save(); document.getElementById('calc-' + d.l).innerHTML = calcOut(d.l); } break;
    case 'routine-name': routineById(d.id).name = t.value; save(); break;
    case 'ex-name': exById(d.id).name = t.value; save(); break;
    case 'ex-rest': { const e = exById(d.id); e.rest = +t.value; save(); document.getElementById('exrest-' + d.id).textContent = fmtRest(e.rest); refreshExSummary(d.id); break; }
    case 'tpl-w': case 'tpl-r': {
      const v = num(t.value);
      exById(d.id).template[+d.k][a === 'tpl-w' ? 'w' : 'r'] = a === 'tpl-r' && v != null ? Math.round(v) : v;
      save(); refreshExSummary(d.id); break;
    }
  }
});

/* 숫자 칸을 누르면 기존 값 전체 선택 → 바로 덮어쓰기 */
document.addEventListener('focusin', ev => {
  const t = ev.target;
  if (t.tagName === 'INPUT' && t.getAttribute('inputmode')) setTimeout(() => { try { t.select(); } catch (e) {} }, 0);
});

document.addEventListener('change', ev => {
  const t = ev.target, d = t.dataset, a = d.act;
  if (!a) return;
  const s = curSession();
  switch (a) {
    case 'set-rpe': s.entries[+d.i].sets[+d.j].rpe = num(t.value); save(); refreshSessionNumbers(+d.i); break;
    case 'session-date': if (t.value) { s.date = t.value; save(); } break;
    case 'rest-range': render(); break;
    case 'calc': if (d.f === 'rpe') { S.calc[d.l].rpe = num(t.value); save(); document.getElementById('calc-' + d.l).innerHTML = calcOut(d.l); } break;
    case 'routine-name': render(); break;
    case 'ex-main': exById(d.id).main = t.value === '1'; save(); break;
    case 'ex-lift': exById(d.id).lift = t.value; save(); break;
    case 'ex-novol': exById(d.id).noVolume = t.checked; save(); break;
  }
});

/* ================= 시작 ================= */
load();
render();
tickTimer();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
