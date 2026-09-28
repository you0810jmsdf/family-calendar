/* 家族カレンダー Phase 1（PWA） */
'use strict';

// 端末でどの版が動いているか確認できるよう、設定画面の最下部に表示する
const APP_VERSION = 'v22';

const API_URL = 'https://script.google.com/macros/s/AKfycbyZ87FzDagftCc9Dcw-L-d_3uqjK1VqyLJsck3y2pToaeOyDJxdyvfd02NZl_cQBmU/exec';
const LS_KEY = 'famcal_key';
const LS_CACHE = 'famcal_cache';
const LS_HIDDEN = 'famcal_hidden';

const state = {
  key: localStorage.getItem(LS_KEY) || '',
  members: [],
  events: [],
  settings: {},
  year: 0,
  month: 0, // 0-11
  selectedDate: '',
  editingEventId: '',
  editingMemberId: '',
  evSelectedMembers: new Set(),
  memberPhoto: '',
  hidden: new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]')),
  showHolidays: localStorage.getItem('famcal_holidays') !== 'off',
  offline: false,
};

const HOLIDAY_MEMBER = '__holiday__';

const $ = (id) => document.getElementById(id);

// ---------- API ----------

async function api(action, payload = {}) {
  const body = JSON.stringify({ action, key: state.key, ...payload });
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '通信エラー');
  return data;
}

function applyData(data) {
  if (data.members) state.members = data.members;
  if (data.events) state.events = data.events;
  if (data.settings) state.settings = data.settings;
  // 端末の控えは読み込み失敗時の予備にすぎない。このサイト（github.io）は他のツールと
  // 保存領域を共有しているため、容量いっぱいで書き込めないことがある。
  // ここで例外を出すと、サーバーには保存できたのに「エラー」と表示されてしまう
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify({
      members: state.members, events: state.events, settings: state.settings,
    }));
  } catch (e) {
    // 古い控えが残ると、次にオフラインになったとき古い予定を見せてしまうため消しておく
    try { localStorage.removeItem(LS_CACHE); } catch (e2) { /* 消せなくても続行 */ }
  }
}

async function loadAll() {
  try {
    applyData(await api('listAll'));
    state.offline = false;
  } catch (e) {
    // 家族コード変更（認証エラー）時はキャッシュに逃がさず再入力へ誘導
    if (String(e.message).indexOf('認証エラー') >= 0) throw e;
    const cache = localStorage.getItem(LS_CACHE);
    if (cache) {
      applyData(JSON.parse(cache));
      state.offline = true;
    } else {
      throw e;
    }
  }
  $('offlineBanner').classList.toggle('hidden', !state.offline);
}

// ---------- 日付ユーティリティ ----------

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());

function eventsOnDay(dstr) {
  return state.events
    .filter((ev) => ev['開始日'] && ev['開始日'] <= dstr && dstr <= (ev['終了日'] || ev['開始日']))
    .filter(isEventVisible)
    .sort((a, b) => (a['終日'] === 'ON' ? '0' : '1' + a['開始時刻']).localeCompare(b['終日'] === 'ON' ? '0' : '1' + b['開始時刻']));
}

function isHoliday(ev) {
  return (ev['メンバー'] || '') === HOLIDAY_MEMBER;
}

function isEventVisible(ev) {
  if (isHoliday(ev)) return state.showHolidays;
  const ids = (ev['メンバー'] || '').split(',').filter(String);
  if (ids.length === 0) return true;
  return ids.some((id) => !state.hidden.has(id));
}

// 予定に関係する家族の色を表示順（設定の家族の並び）で返す。
// 以前は「メンバー欄に保存された順の先頭」だったため、誰の色になるかが分かりにくかった
function eventColors(ev) {
  if (isHoliday(ev)) return ['#d66'];
  const ids = (ev['メンバー'] || '').split(',').filter(String);
  const cols = ids
    .map((id) => memberById(id))
    .filter(Boolean)
    .sort((a, b) => Number(a['表示順'] || 99) - Number(b['表示順'] || 99))
    .map((m) => m['色'] || '#4a7cf0');
  return cols.length ? cols : ['#9aa3af'];
}

// 複数人に関係する予定は、関係する家族の色を並べた帯にして一目で分かるようにする
function eventBackground(ev, dir) {
  const cols = eventColors(ev);
  if (cols.length === 1) return cols[0];
  const step = 100 / cols.length;
  const stops = cols
    .map((c, i) => `${c} ${(i * step).toFixed(2)}%, ${c} ${((i + 1) * step).toFixed(2)}%`)
    .join(', ');
  return `linear-gradient(${dir || 'to right'}, ${stops})`;
}

function memberById(id) {
  return state.members.find((m) => m.id === id);
}

// ---------- 描画 ----------

function renderAll() {
  renderHeader();
  renderMemberBar();
  renderGrid();
}

function renderHeader() {
  $('monthTitle').textContent = `${state.year}年${state.month + 1}月`;
}

function avatarStyle(m) {
  if (m['写真']) return `background-image:url(${m['写真']});`;
  return `background-color:${m['色'] || '#4a7cf0'};`;
}

function avatarInitial(m) {
  return m['写真'] ? '' : (m['名前'] || '？').slice(0, 1);
}

function renderMemberBar() {
  const bar = $('memberBar');
  bar.innerHTML = '';
  const sorted = [...state.members].sort((a, b) => Number(a['表示順'] || 99) - Number(b['表示順'] || 99));
  sorted.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'member-chip' + (state.hidden.has(m.id) ? ' off' : '');
    btn.innerHTML = `<div class="avatar" style="${avatarStyle(m)};border-color:${m['色']}">${avatarInitial(m)}</div>
      <div class="chip-name">${esc(m['名前'])}</div>`;
    btn.onclick = () => toggleMember(m.id);
    bar.appendChild(btn);
  });
  const hol = document.createElement('button');
  hol.className = 'member-chip' + (state.showHolidays ? '' : ' off');
  hol.innerHTML = '<div class="avatar holiday-avatar">🎌</div><div class="chip-name">祝日</div>';
  hol.onclick = () => {
    state.showHolidays = !state.showHolidays;
    localStorage.setItem('famcal_holidays', state.showHolidays ? 'on' : 'off');
    renderMemberBar();
    renderGrid();
  };
  bar.appendChild(hol);
  const add = document.createElement('button');
  add.className = 'member-chip add-chip';
  add.innerHTML = '<div class="avatar">＋</div><div class="chip-name">追加</div>';
  add.onclick = () => openMemberEditor(null);
  bar.appendChild(add);
}

function toggleMember(id) {
  if (state.hidden.has(id)) state.hidden.delete(id);
  else state.hidden.add(id);
  localStorage.setItem(LS_HIDDEN, JSON.stringify([...state.hidden]));
  renderMemberBar();
  renderGrid();
}

function renderGrid() {
  // 予定が変わるたびに必ずここを通るので、やることの件数もあわせて出し直す
  renderTodoBadge();
  const grid = $('monthGrid');
  grid.innerHTML = '';
  const first = new Date(state.year, state.month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = todayStr();
  const LANES = 4;      // 1週あたりの帯の最大段数
  const LANE_H = 15;    // 帯1段の高さ(px)
  const LANE_TOP = 22;  // 日付数字の下からの開始位置(px)

  const spanDays = (ev) =>
    (new Date((ev['終了日'] || ev['開始日']) + 'T00:00:00') - new Date(ev['開始日'] + 'T00:00:00')) / 86400000;
  const timeKey = (ev) => (ev['終日'] === 'ON' ? '0' : '1' + (ev['開始時刻'] || ''));

  for (let w = 0; w < 6; w++) {
    const weekEl = document.createElement('div');
    weekEl.className = 'week-row';
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      dates.push(d);
    }
    const wStart = ymd(dates[0]);
    const wEnd = ymd(dates[6]);
    const colOf = (dstr) => {
      if (dstr <= wStart) return 0;
      if (dstr >= wEnd) return 6;
      return Math.round((new Date(dstr + 'T00:00:00') - dates[0]) / 86400000);
    };

    // 日セル（祝日は日付の下に赤文字で名称表示）
    dates.forEach((d) => {
      const dstr = ymd(d);
      const dow = d.getDay();
      const holidays = state.showHolidays
        ? state.events.filter((ev) => isHoliday(ev) && ev['開始日'] <= dstr && dstr <= (ev['終了日'] || ev['開始日']))
        : [];
      const cell = document.createElement('div');
      cell.className = 'day-cell' +
        (d.getMonth() !== state.month ? ' other' : '') +
        (dow === 0 || holidays.length ? ' sun' : dow === 6 ? ' sat' : '') +
        (dstr === today ? ' today' : '');
      cell.innerHTML = `<div class="day-num">${d.getDate()}</div>` +
        (holidays.length ? `<div class="holiday-name">${esc(holidays[0]['タイトル'])}</div>` : '');
      cell.onclick = () => openDaySheet(dstr);
      weekEl.appendChild(cell);
    });

    // 予定帯（期間予定は週ごとに1本の連結バー・タイトルをフル表示）
    const evs = state.events
      .filter((ev) => ev['開始日'] && !isHoliday(ev) &&
        ev['開始日'] <= wEnd && (ev['終了日'] || ev['開始日']) >= wStart)
      .filter(isEventVisible)
      .sort((a, b) => a['開始日'].localeCompare(b['開始日']) ||
        spanDays(b) - spanDays(a) || timeKey(a).localeCompare(timeKey(b)));

    const laneEnd = [];                 // 各段の占有済み最終列
    const overflow = new Array(7).fill(0);
    evs.forEach((ev) => {
      const c0 = colOf(ev['開始日']);
      const c1 = colOf(ev['終了日'] || ev['開始日']);
      let lane = 0;
      while (lane < laneEnd.length && laneEnd[lane] >= c0) lane++;
      if (lane >= LANES) {
        for (let c = c0; c <= c1; c++) overflow[c]++;
        return;
      }
      laneEnd[lane] = c1;
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'ev-bar' +
        (ev['開始日'] < wStart ? ' cont-l' : '') +
        ((ev['終了日'] || ev['開始日']) > wEnd ? ' cont-r' : '');
      bar.style.cssText =
        `left:calc(${c0} * 100% / 7 + 1px);` +
        `width:calc(${c1 - c0 + 1} * 100% / 7 - 3px);` +
        `top:${LANE_TOP + lane * LANE_H}px;` +
        `background:${eventBackground(ev)}`;
      bar.textContent = ev['タイトル'];
      bar.onclick = (e) => {
        e.stopPropagation();
        state.selectedDate = ev['開始日'];
        openEventEditor(ev);
      };
      weekEl.appendChild(bar);
    });
    overflow.forEach((n, i) => {
      if (!n) return;
      const m = document.createElement('div');
      m.className = 'ev-more-abs';
      m.style.left = `calc(${i} * 100% / 7 + 2px)`;
      m.textContent = '+' + n;
      weekEl.appendChild(m);
    });

    grid.appendChild(weekEl);
  }
}

// ---------- 日別シート ----------

function openDaySheet(dstr) {
  state.selectedDate = dstr;
  const d = new Date(dstr + 'T00:00:00');
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  $('daySheetTitle').textContent = `${d.getMonth() + 1}月${d.getDate()}日（${wd}）`;
  const list = $('daySheetList');
  list.innerHTML = '';
  const evs = eventsOnDay(dstr);
  if (evs.length === 0) {
    list.innerHTML = '<div class="empty-note">予定はありません</div>';
  }
  evs.forEach((ev) => {
    const item = document.createElement('div');
    item.className = 'day-event-item';
    const time = ev['終日'] === 'ON' ? '終日' :
      `${ev['開始時刻'] || ''}${ev['終了時刻'] ? '〜' + ev['終了時刻'] : ''}`;
    const period = ev['開始日'] !== (ev['終了日'] || ev['開始日']) ? `（${ev['開始日']}〜${ev['終了日']}）` : '';
    const faces = (ev['メンバー'] || '').split(',').filter(String).map((id) => {
      const m = memberById(id);
      if (!m) return '';
      return `<div class="mini" style="${avatarStyle(m)}">${avatarInitial(m)}</div>`;
    }).join('');
    const gcalMark = ev['取込元'] === 'gcal' ? '📅 ' : '';
    item.innerHTML = `<div class="bar" style="background:${eventBackground(ev, 'to bottom')}"></div>
      <div class="info"><div class="t">${esc(ev['タイトル'])}</div>
      <div class="sub">${gcalMark}${esc(time)}${esc(period)}${ev['メモ'] ? ' ・ ' + linkify(ev['メモ']) : ''}</div></div>
      <div class="faces">${faces}</div>`;
    const lineBtn = document.createElement('button');
    lineBtn.type = 'button';
    lineBtn.className = 'line-btn';
    lineBtn.textContent = 'LINE';
    lineBtn.onclick = (e) => {
      e.stopPropagation();
      shareEventToLine(ev);
    };
    item.appendChild(lineBtn);
    // メモ内リンクをタップしたときは編集画面を開かず、リンク先へ飛ばす
    item.onclick = (e) => {
      if (e.target.closest && e.target.closest('a.memo-link')) return;
      closeOverlay('daySheet');
      openEventEditor(ev);
    };
    list.appendChild(item);
  });
  $('daySheet').classList.remove('hidden');
}

// ---------- LINE共有 ----------

function fmtDateJP(dstr) {
  const d = new Date(dstr + 'T00:00:00');
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${wd})`;
}

function shareEventToLine(ev) {
  const end = ev['終了日'] || ev['開始日'];
  const period = ev['開始日'] === end ? fmtDateJP(ev['開始日']) : `${fmtDateJP(ev['開始日'])}〜${fmtDateJP(end)}`;
  const time = ev['終日'] === 'ON' ? '終日' : `${ev['開始時刻'] || ''}${ev['終了時刻'] ? '〜' + ev['終了時刻'] : ''}`;
  const names = (ev['メンバー'] || '').split(',').filter(String)
    .map((id) => (memberById(id) || {})['名前']).filter(Boolean).join('・');
  let text = `【家族カレンダー】\n■ ${ev['タイトル']}\n${period} ${time}`;
  if (names) text += `\n対象: ${names}`;
  if (ev['メモ']) text += `\nメモ: ${ev['メモ']}`;
  window.location.href = 'https://line.me/R/share?text=' + encodeURIComponent(text);
}

// ---------- 予定エディタ ----------

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openEventEditor(ev) {
  const isNew = !ev || !ev.id;
  // 新規予定はここでIDを確定させる。保存ボタンが多重タップされても
  // 同じIDで送信されるため、サーバー側は同じ行を上書きするだけになり重複行が生まれない
  state.editingEventId = isNew ? newId() : ev.id;
  $('eventModalTitle').textContent = ev ? '予定を編集' : '予定を追加';
  $('evTitle').value = ev ? ev['タイトル'] : '';
  const base = state.selectedDate || todayStr();
  $('evStart').value = ev ? ev['開始日'] : base;
  $('evEnd').value = ev ? (ev['終了日'] || ev['開始日']) : base;
  $('evAllDay').checked = ev ? ev['終日'] === 'ON' : true;
  $('evTimeStart').value = ev ? ev['開始時刻'] : '';
  $('evTimeEnd').value = ev ? ev['終了時刻'] : '';
  $('evMemo').value = ev ? ev['メモ'] : '';
  renderMemoLinks();
  $('evGmail').checked = ev ? ev['Gmail転記'] === 'ON' : false;
  $('evTodo').checked = ev ? ev['要対応'] === 'ON' : false;
  $('evDelete').classList.toggle('hidden', isNew);
  $('evSave').disabled = false;
  $('evSave').textContent = '保存';
  state.evSelectedMembers = new Set((ev ? ev['メンバー'] : '').split(',').filter(String));
  renderEvMemberSelect();
  updateTimeRow();
  applyGcalNotice(ev);
  $('eventModal').classList.remove('hidden');
}

// 編集画面のメモはtextareaでリンクにできないため、直下にタップできるリンクを並べる
function renderMemoLinks() {
  const box = $('evMemoLinks');
  const urls = [...new Set(extractUrls($('evMemo').value))];
  box.innerHTML = '';
  box.classList.toggle('hidden', urls.length === 0);
  if (!urls.length) return;
  const label = document.createElement('div');
  label.className = 'field-label';
  label.textContent = 'メモ内のリンク（タップで開きます）';
  box.appendChild(label);
  urls.forEach((u) => {
    const a = document.createElement('a');
    a.className = 'memo-link-chip';
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = u;
    box.appendChild(a);
  });
}

function renderEvMemberSelect() {
  const box = $('evMembers');
  box.innerHTML = '';
  state.members.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'member-chip' + (state.evSelectedMembers.has(m.id) ? ' sel' : '');
    btn.innerHTML = `<div class="avatar" style="${avatarStyle(m)};border-color:${m['色']}">${avatarInitial(m)}</div>
      <div class="chip-name">${esc(m['名前'])}</div>`;
    btn.onclick = () => {
      if (state.evSelectedMembers.has(m.id)) state.evSelectedMembers.delete(m.id);
      else state.evSelectedMembers.add(m.id);
      renderEvMemberSelect();
    };
    box.appendChild(btn);
  });
}

// 取込予定であることと、日付変更がGoogleカレンダー側へ書き戻される旨を出す
function applyGcalNotice(ev) {
  const isGcal = !!(ev && ev['取込元'] === 'gcal');
  $('evGcalNotice').classList.toggle('hidden', !isGcal);
  if (isGcal) {
    const d = String(ev['開始日'] || '').split('-');
    $('evGcalOpen').href = d.length === 3
      ? `https://calendar.google.com/calendar/u/0/r/day/${d[0]}/${Number(d[1])}/${Number(d[2])}`
      : 'https://calendar.google.com/calendar/u/0/r';
  }
}

// 取込予定の日付・時刻が変更されたか
function gcalTimeChanged(orig, ev) {
  if (!orig || orig['取込元'] !== 'gcal' || !orig['取込キー']) return false;
  return orig['開始日'] !== ev['開始日'] ||
    (orig['終了日'] || orig['開始日']) !== ev['終了日'] ||
    (orig['終日'] === 'ON' ? 'ON' : 'OFF') !== ev['終日'] ||
    (orig['開始時刻'] || '') !== ev['開始時刻'] ||
    (orig['終了時刻'] || '') !== ev['終了時刻'];
}

// 取込予定の日付変更は、Googleカレンダー側のその回を書き換えてから取り込み直す。
// 移動した回は取込キー（元の開始日時）が変わって別の行として入るため、
// 同期後に元の行を消して重複を残さない
async function moveGcalEvent(orig, ev) {
  try {
    await api('updateGcalTime', {
      gkey: orig['取込キー'],
      startDate: ev['開始日'],
      endDate: ev['終了日'],
      allDay: ev['終日'],
      startTime: ev['開始時刻'],
      endTime: ev['終了時刻'],
    });
  } catch (e) {
    // ここで失敗した場合、Googleカレンダーは変更されていない
    throw new Error(`①Googleカレンダーの更新に失敗（${e.message}）。予定は変更されていません`);
  }
  try {
    applyData(await api('syncNow'));
  } catch (e) {
    // Googleカレンダーは動いているので、取り込み直しだけやり直せば復旧する
    throw new Error(`②取り込み直しに失敗（${e.message}）。Googleカレンダー側は変更済みなので、⚙設定の「Googleカレンダーを今すぐ同期」を押してください`);
  }
  if (state.events.some((x) => x.id === orig.id)) {
    try {
      applyData(await api('deleteEvent', { id: orig.id }));
    } catch (e) {
      // 同期側が取込元に無くなった行を掃除している場合はここで落ちても問題ない
    }
  }
}

function updateTimeRow() {
  $('timeRow').style.display = $('evAllDay').checked ? 'none' : 'flex';
}

async function saveEvent() {
  const title = $('evTitle').value.trim();
  if (!title) return toast('タイトルを入力してください');
  if (!$('evStart').value) return toast('開始日を入力してください');
  let end = $('evEnd').value || $('evStart').value;
  if (end < $('evStart').value) end = $('evStart').value;
  const ev = {
    id: state.editingEventId,
    'タイトル': title,
    '開始日': $('evStart').value,
    '終了日': end,
    '終日': $('evAllDay').checked ? 'ON' : 'OFF',
    '開始時刻': $('evAllDay').checked ? '' : $('evTimeStart').value,
    '終了時刻': $('evAllDay').checked ? '' : $('evTimeEnd').value,
    'メンバー': [...state.evSelectedMembers].join(','),
    'メモ': $('evMemo').value.trim(),
    'Gmail転記': $('evGmail').checked ? 'ON' : 'OFF',
    '要対応': $('evTodo').checked ? 'ON' : 'OFF',
  };
  // Googleカレンダー取込予定の編集時はタグを引き継ぐ（次回同期で洗い替え対象に保つ）
  const orig = state.events.find((x) => x.id === state.editingEventId);
  if (orig && orig['取込元']) {
    ev['取込元'] = orig['取込元'];
    ev['取込キー'] = orig['取込キー'];
  }
  // disabledにするとブラウザは以降のクリックを無視するため、多重タップでも二重送信されない
  const saveBtn = $('evSave');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';
  await busy(async () => {
    if (gcalTimeChanged(orig, ev)) {
      await moveGcalEvent(orig, ev);
      closeOverlay('eventModal');
      renderGrid();
      toast('Googleカレンダーを更新して取り込み直しました');
      return;
    }
    let data;
    try {
      data = await api('saveEvent', { event: ev });
    } catch (e) {
      // 通信の途中で切れると、サーバー側は保存済みでも応答だけ受け取れないことがある。
      // IDは端末側で決めているので、読み直してその予定が届いているかを確かめる
      if (!(await confirmEventSaved(ev))) throw e;
      data = {};
    }
    applyData(data);
    closeOverlay('eventModal');
    renderGrid();
    toast(data.mail ? `保存しました（Gmail: ${data.mail}）` : '保存しました');
  });
  saveBtn.disabled = false;
  saveBtn.textContent = '保存';
}

// 保存時に通信エラーになった予定が、実際にはサーバーへ届いているかを確かめる
async function confirmEventSaved(ev) {
  try {
    applyData(await api('listAll'));
  } catch (e) {
    return false;
  }
  return state.events.some((x) => isSameSavedEvent(x, ev));
}

// サーバーに届いた行が、送った内容と一致するか。
// 時刻はスプレッドシート側で「8:30」のように先頭の0が落ちることがあるため比べない
function isSameSavedEvent(saved, sent) {
  if (!saved || !sent || saved.id !== sent.id) return false;
  return ['タイトル', '開始日', '終了日', 'メンバー', 'メモ']
    .every((k) => String(saved[k] || '') === String(sent[k] || ''));
}

async function deleteEvent() {
  if (!confirm('この予定を削除しますか？')) return;
  await busy(async () => {
    applyData(await api('deleteEvent', { id: state.editingEventId }));
    closeOverlay('eventModal');
    renderGrid();
    toast('削除しました');
  });
}

// ---------- メンバーエディタ ----------

function openMemberEditor(m) {
  state.editingMemberId = m ? m.id : '';
  state.memberPhoto = m ? m['写真'] : '';
  photoEdit.img = null;
  $('photoAdjust').classList.add('hidden');
  $('mPhoto').value = '';
  $('memberModalTitle').textContent = m ? '家族を編集' : '家族を追加';
  $('mName').value = m ? m['名前'] : '';
  $('mColor').value = m && /^#[0-9a-fA-F]{6}$/.test(m['色']) ? m['色'] : '#4a7cf0';
  $('mEmail').value = m ? m['メール'] : '';
  $('mPhone').value = m ? (m['電話番号'] || '') : '';
  $('mGcal').value = m ? (m['GoogleカレンダーID'] || '') : '';
  $('mNotify').checked = m ? m['通知'] === 'ON' : true;
  $('mDelete').classList.toggle('hidden', !m);
  updatePhotoPreview();
  $('memberModal').classList.remove('hidden');
}

function updatePhotoPreview() {
  const p = $('mPhotoPreview');
  if (state.memberPhoto) {
    p.style.backgroundImage = `url(${state.memberPhoto})`;
    p.textContent = '';
  } else {
    p.style.backgroundImage = '';
    p.style.backgroundColor = $('mColor').value;
    p.textContent = ($('mName').value || '？').slice(0, 1);
  }
}

// 写真トリミング編集（ドラッグ=位置 / スライダー=拡大率）
const photoEdit = { img: null, scale: 1, cx: 0.5, cy: 0.5 };

function handlePhoto(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      photoEdit.img = img;
      photoEdit.scale = 1;
      photoEdit.cx = 0.5;
      photoEdit.cy = 0.5;
      $('mZoom').value = '1';
      $('photoAdjust').classList.remove('hidden');
      renderPhotoCrop();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderPhotoCrop() {
  const img = photoEdit.img;
  if (!img) return;
  const crop = Math.min(img.width, img.height) / photoEdit.scale;
  // 切り抜き中心を画像内に収める
  const cx = Math.min(Math.max(photoEdit.cx * img.width, crop / 2), img.width - crop / 2);
  const cy = Math.min(Math.max(photoEdit.cy * img.height, crop / 2), img.height - crop / 2);
  photoEdit.cx = cx / img.width;
  photoEdit.cy = cy / img.height;
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(img, cx - crop / 2, cy - crop / 2, crop, crop, 0, 0, size, size);
  state.memberPhoto = canvas.toDataURL('image/jpeg', 0.75);
  updatePhotoPreview();
}

function bindPhotoAdjust() {
  const preview = $('mPhotoPreview');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let raf = 0;
  preview.addEventListener('pointerdown', (e) => {
    if (!photoEdit.img) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { preview.setPointerCapture(e.pointerId); } catch (err) {}
  });
  preview.addEventListener('pointermove', (e) => {
    if (!dragging || !photoEdit.img) return;
    const img = photoEdit.img;
    const crop = Math.min(img.width, img.height) / photoEdit.scale;
    const previewPx = preview.clientWidth;
    // 指の移動方向に画像が付いてくるよう中心を逆方向へ
    photoEdit.cx -= (e.clientX - lastX) * crop / (previewPx * img.width);
    photoEdit.cy -= (e.clientY - lastY) * crop / (previewPx * img.height);
    lastX = e.clientX;
    lastY = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderPhotoCrop(); });
  });
  const end = () => { dragging = false; };
  preview.addEventListener('pointerup', end);
  preview.addEventListener('pointercancel', end);
  $('mZoom').oninput = () => {
    photoEdit.scale = Number($('mZoom').value);
    renderPhotoCrop();
  };
}

async function saveMember() {
  const name = $('mName').value.trim();
  if (!name) return toast('名前を入力してください');
  const m = {
    id: state.editingMemberId,
    '名前': name,
    '色': $('mColor').value,
    '写真': state.memberPhoto,
    'メール': $('mEmail').value.trim(),
    '電話番号': $('mPhone').value.trim(),
    'GoogleカレンダーID': $('mGcal').value.trim(),
    '通知': $('mNotify').checked ? 'ON' : 'OFF',
    '表示順': state.editingMemberId
      ? (memberById(state.editingMemberId) || {})['表示順'] || String(state.members.length)
      : String(state.members.length + 1),
  };
  await busy(async () => {
    applyData(await api('saveMember', { member: m }));
    closeOverlay('memberModal');
    renderAll();
    renderSettingsMembers();
    toast('保存しました');
  });
}

async function deleteMember() {
  if (!confirm('この家族を削除しますか？（予定は残ります）')) return;
  await busy(async () => {
    applyData(await api('deleteMember', { id: state.editingMemberId }));
    closeOverlay('memberModal');
    renderAll();
    renderSettingsMembers();
    toast('削除しました');
  });
}

// ---------- 設定 ----------

function openSettings() {
  $('sFamilyName').value = state.settings.familyName || '';
  const sel = $('sNotifyHour');
  sel.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement('option');
    opt.value = String(h);
    opt.textContent = `${h}時台`;
    sel.appendChild(opt);
  }
  sel.value = state.settings.notifyHour || '17';
  $('sSound').checked = (state.settings.sound || 'ON') === 'ON';
  $('sFamilyCal').value = state.settings.familyCalendarId || '';
  renderSettingsMembers();
  $('settingsModal').classList.remove('hidden');
}

function renderSettingsMembers() {
  const list = $('sMemberList');
  list.innerHTML = '';
  state.members.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'settings-member-row';
    row.innerHTML = `<div class="avatar" style="${avatarStyle(m)};border-color:${m['色']}">${avatarInitial(m)}</div>
      <div class="nm">${esc(m['名前'])}</div>
      <div class="meta">${m['メール'] ? '📧' : ''}${m['通知'] === 'ON' ? '🔔' : ''}</div>`;
    if (m['電話番号']) {
      const tel = document.createElement('button');
      tel.type = 'button';
      tel.className = 'tel-btn';
      tel.textContent = '📞 電話';
      tel.onclick = (e) => {
        e.stopPropagation();
        window.location.href = 'tel:' + m['電話番号'].replace(/[^\d+]/g, '');
      };
      row.appendChild(tel);
    }
    row.onclick = () => openMemberEditor(m);
    list.appendChild(row);
  });
}

async function saveSettings() {
  await busy(async () => {
    applyData(await api('saveSettings', {
      settings: {
        familyName: $('sFamilyName').value.trim(),
        notifyHour: $('sNotifyHour').value,
        sound: $('sSound').checked ? 'ON' : 'OFF',
        familyCalendarId: $('sFamilyCal').value.trim(),
      },
    }));
    closeOverlay('settingsModal');
    toast('設定を保存しました（通知時刻を更新）');
  });
}

// ---------- AI予定作成 ----------

let aiImage = null; // { data: base64, mime }

function openAiModal() {
  $('aiText').value = '';
  $('aiUrl').value = '';
  aiImage = null;
  $('aiImage').value = '';
  $('aiImgPreview').classList.add('hidden');
  $('aiModal').classList.remove('hidden');
}

function handleAiImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // 読み取り精度と転送量のバランスで長辺1024pxに縮小
      const sc = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc);
      c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      aiImage = { data: dataUrl.split(',')[1], mime: 'image/jpeg' };
      const p = $('aiImgPreview');
      p.style.backgroundImage = `url(${dataUrl})`;
      p.classList.remove('hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// 文章欄にURLだけ貼られることが多い。URL欄が空ならそちらから拾って
// ページ取得に回す（拾ったURLは文章から外す。URLが予定名になってしまうため）
function splitUrlFromText(text, url) {
  if (url) return { text: text, url: url };
  const m = String(text || '').match(/https?:\/\/[^\s　]+/);
  if (!m) return { text: text, url: '' };
  return { text: String(text).replace(m[0], '').trim(), url: m[0] };
}

async function runAiParse() {
  const input = splitUrlFromText($('aiText').value.trim(), $('aiUrl').value.trim());
  const text = input.text;
  const url = input.url;
  if (!text && !url && !aiImage) return toast('文章・ホームページ・写真のどれかを入れてください');
  if (url && !/^https?:\/\//i.test(url)) return toast('ホームページのURLは http:// か https:// から入れてください');
  const btn = $('aiRun');
  btn.disabled = true;
  btn.textContent = url ? 'ホームページを読んでいます…' : 'AIが考えています…';
  try {
    const payload = { text, url };
    if (aiImage) {
      payload.image = aiImage.data;
      payload.mime = aiImage.mime;
    }
    const data = await api('aiExtract', payload);
    closeOverlay('aiModal');
    const events = data.events || [];
    if (events.length === 1) {
      // 1件だけなら選ぶ必要がないので、今までどおり確認用のエディタへ流し込む
      const ev = events[0];
      state.selectedDate = ev['開始日'];
      // openEventEditorがev.id未設定＝新規と判定し、IDの発行と削除ボタン非表示を行う
      openEventEditor(ev);
      $('eventModalTitle').textContent = '予定を追加（AI作成・内容を確認してください）';
    } else {
      openAiPickModal(events);
    }
  } catch (e) {
    toast('エラー: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'AIで作成';
  }
}

// ---------- やること（要対応の予定） ----------

// 期限が近い順。日付が過ぎたものを先頭に置き、取りこぼしに気づけるようにする
function todoEvents() {
  return state.events
    .filter((ev) => ev['要対応'] === 'ON')
    .sort((a, b) => String(a['開始日']).localeCompare(String(b['開始日'])));
}

function renderTodoBadge() {
  const n = todoEvents().length;
  const badge = $('todoBadge');
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
}

function openTodoModal() {
  renderTodoList();
  $('todoModal').classList.remove('hidden');
}

function renderTodoList() {
  const box = $('todoList');
  box.textContent = '';
  const list = todoEvents();
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'todo-empty';
    empty.textContent = 'やることはありません。予定の編集画面で「要対応」にチェックを入れると、ここに出ます。';
    box.appendChild(empty);
    return;
  }
  const today = todayStr();
  list.forEach((ev) => {
    const row = document.createElement('label');
    row.className = 'todo-item';
    if (ev['開始日'] < today) row.classList.add('todo-overdue');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.onchange = () => clearTodo(ev.id);
    row.appendChild(cb);

    const body = document.createElement('div');
    body.className = 'todo-body';
    // 取込予定のタイトルにはよそのサイトの文字が入ることがあるため、文字として入れる
    body.appendChild(aiPickLine('todo-title', ev['タイトル'] || '(タイトルなし)'));
    const when = aiPickLine('todo-when', aiPickWhenText(ev) + (ev['開始日'] < today ? '  期限切れ' : ''));
    body.appendChild(when);
    if (ev['メモ']) body.appendChild(aiPickLine('todo-memo', ev['メモ']));
    row.appendChild(body);

    box.appendChild(row);
  });
}

async function clearTodo(id) {
  await busy(async () => {
    const data = await api('setTodo', { id, value: 'OFF' });
    applyData(data);
    renderTodoList();
    renderTodoBadge();
    renderGrid();
    toast('やることから外しました');
  });
}

// ---------- AIが見つけた予定の選択 ----------

let aiFoundEvents = []; // 選択画面に表示している、AIが読み取った予定

function openAiPickModal(events) {
  aiFoundEvents = events || [];
  if (aiFoundEvents.length === 0) return toast('予定を見つけられませんでした');
  renderAiPickList();
  $('aiPickModal').classList.remove('hidden');
}

function renderAiPickList() {
  const box = $('aiPickList');
  box.textContent = '';
  aiFoundEvents.forEach((ev, i) => {
    const row = document.createElement('label');
    row.className = 'ai-pick-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.index = String(i);
    cb.onchange = updateAiPickCount;
    row.appendChild(cb);

    const body = document.createElement('div');
    body.className = 'ai-pick-body';
    // 読み取り結果にはよそのサイトの文字が入るため、HTMLとしてではなく文字として入れる
    body.appendChild(aiPickLine('ai-pick-title', ev['タイトル'] || '(タイトルなし)'));
    body.appendChild(aiPickLine('ai-pick-when', aiPickWhenText(ev)));

    const names = (ev['メンバー'] || '').split(',').filter(String)
      .map((id) => (memberById(id) || {})['名前']).filter(Boolean).join('・');
    if (names) body.appendChild(aiPickLine('ai-pick-who', names));
    if (ev['メモ']) body.appendChild(aiPickLine('ai-pick-memo', ev['メモ']));

    row.appendChild(body);
    box.appendChild(row);
  });
  updateAiPickCount();
}

function aiPickLine(cls, text) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return el;
}

function aiPickWhenText(ev) {
  const end = ev['終了日'] || ev['開始日'];
  const period = ev['開始日'] === end
    ? fmtDateJP(ev['開始日'])
    : `${fmtDateJP(ev['開始日'])}〜${fmtDateJP(end)}`;
  const time = ev['終日'] === 'ON' || !ev['開始時刻']
    ? '終日'
    : `${ev['開始時刻']}${ev['終了時刻'] ? '〜' + ev['終了時刻'] : ''}`;
  return `${period} ${time}`;
}

function aiPickCheckboxes() {
  return [...$('aiPickList').querySelectorAll('input[type=checkbox]')];
}

function aiPickChecked() {
  return aiPickCheckboxes().filter((c) => c.checked).map((c) => aiFoundEvents[Number(c.dataset.index)]);
}

function updateAiPickCount() {
  const n = aiPickChecked().length;
  $('aiPickCount').textContent = `${n} / ${aiFoundEvents.length}件を選択中`;
  $('aiPickSave').disabled = n === 0;
}

function setAiPickAll(checked) {
  aiPickCheckboxes().forEach((c) => { c.checked = checked; });
  updateAiPickCount();
}

async function saveAiPicked() {
  const picked = aiPickChecked();
  if (picked.length === 0) return toast('登録する予定を選んでください');
  const btn = $('aiPickSave');
  // disabledにするとブラウザは以降のクリックを無視するため、多重タップでも二重送信されない
  btn.disabled = true;
  btn.textContent = '登録中…';
  await busy(async () => {
    // 二重登録を防ぐため、送る前に端末側でIDを発行する
    const events = picked.map((ev) => ({
      id: newId(),
      'タイトル': ev['タイトル'],
      '開始日': ev['開始日'],
      '終了日': ev['終了日'] || ev['開始日'],
      '終日': ev['終日'] === 'OFF' ? 'OFF' : 'ON',
      '開始時刻': ev['終日'] === 'OFF' ? (ev['開始時刻'] || '') : '',
      '終了時刻': ev['終日'] === 'OFF' ? (ev['終了時刻'] || '') : '',
      'メンバー': ev['メンバー'] || '',
      'メモ': ev['メモ'] || '',
      'Gmail転記': 'OFF',
    }));
    const data = await api('saveEvents', { events });
    applyData(data);
    closeOverlay('aiPickModal');
    renderGrid();
    toast(`${data.saved}件の予定を登録しました`);
  });
  btn.disabled = false;
  btn.textContent = '選んだ予定を登録';
}

// ---------- 共通UI ----------

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// メモ欄に書いたURLを拾う。全角の括弧・句読点はURLの区切りとして扱い、
// 末尾に付いた句読点・閉じ括弧・ひらがな（「〜です」等の助詞）はURLに含めない
const URL_RE = /https?:\/\/[^\s<>"'　、。，．！？；：（）「」『』【】〈〉《》〔〕｛｝＜＞”’…・]+/g;
const URL_TAIL_RE = /(?:[.,:;!?)\]]|[ぁ-ん])+$/;

function extractUrls(s) {
  return (String(s || '').match(URL_RE) || [])
    .map((u) => u.replace(URL_TAIL_RE, ''))
    .filter(Boolean);
}

// メモ内のURLだけをリンクにする。URL以外はエスケープしたまま表示する
function linkify(s) {
  const str = String(s || '');
  let out = '';
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(str)) !== null) {
    const url = m[0].replace(URL_TAIL_RE, '');
    out += esc(str.slice(last, m.index));
    out += `<a href="${esc(url)}" class="memo-link" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    out += esc(m[0].slice(url.length));
    last = m.index + m[0].length;
  }
  out += esc(str.slice(last));
  return out;
}

function closeOverlay(id) {
  $(id).classList.add('hidden');
}

// 端末に古いアプリ本体が残ってしまったときの手段。保存済みのアプリ本体と
// Service Workerを消してから読み直す（予定データはサーバー側にあるので消えない）
async function hardReload() {
  if (!confirm('アプリを最新版にします。予定データは消えません。続けますか？')) return;
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    // 消せなくても読み直しは試す
  }
  location.reload();
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function busy(fn) {
  document.body.style.opacity = '0.6';
  try {
    await fn();
  } catch (e) {
    toast('エラー: ' + e.message);
  } finally {
    document.body.style.opacity = '';
  }
}

// ---------- 起動 ----------

function moveMonth(diff) {
  const d = new Date(state.year, state.month + diff, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  renderHeader();
  renderGrid();
}

async function start() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth();

  // QRコード等のURLに ?code=家族コード が付いていれば自動ログイン
  // （URLは書き換えない：このまま「ホーム画面に追加」するとPWA側にもコードが引き継がれる）
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode && !state.key) {
    state.key = urlCode;
    localStorage.setItem(LS_KEY, urlCode);
  }

  if (!state.key) {
    $('setupScreen').classList.remove('hidden');
    return;
  }
  $('mainScreen').classList.remove('hidden');
  renderAll();
  try {
    await loadAll();
    renderAll();
  } catch (e) {
    if (String(e.message).indexOf('認証エラー') >= 0) {
      // コードが変わった端末は入力画面へ戻す
      localStorage.removeItem(LS_KEY);
      state.key = '';
      $('mainScreen').classList.add('hidden');
      $('setupScreen').classList.remove('hidden');
      $('setupError').textContent = '家族コードが新しくなりました。新しいコードを入力してください';
      return;
    }
    toast('読み込みエラー: ' + e.message);
  }
}

async function connect() {
  const key = $('familyKeyInput').value.trim();
  if (!key) return;
  $('setupError').textContent = '';
  $('connectBtn').disabled = true;
  $('connectBtn').textContent = '接続中…';
  try {
    state.key = key;
    await api('listAll').then(applyData);
    localStorage.setItem(LS_KEY, key);
    $('setupScreen').classList.add('hidden');
    $('mainScreen').classList.remove('hidden');
    renderAll();
  } catch (e) {
    state.key = '';
    $('setupError').textContent = e.message;
  } finally {
    $('connectBtn').disabled = false;
    $('connectBtn').textContent = 'はじめる';
  }
}

function bindEvents() {
  $('connectBtn').onclick = connect;
  $('prevMonth').onclick = () => moveMonth(-1);
  $('nextMonth').onclick = () => moveMonth(1);
  $('todayBtn').onclick = () => {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    renderHeader();
    renderGrid();
  };
  $('settingsBtn').onclick = openSettings;
  $('fab').onclick = () => { state.selectedDate = todayStr(); openEventEditor(null); };
  $('aiFab').onclick = openAiModal;
  $('aiRun').onclick = runAiParse;
  $('aiImage').onchange = (e) => e.target.files[0] && handleAiImage(e.target.files[0]);
  $('todoBtn').onclick = openTodoModal;
  $('aiPickAll').onclick = () => setAiPickAll(true);
  $('aiPickNone').onclick = () => setAiPickAll(false);
  $('aiPickSave').onclick = saveAiPicked;
  $('addEventFromDay').onclick = () => { closeOverlay('daySheet'); openEventEditor(null); };
  $('evAllDay').onchange = updateTimeRow;
  $('evMemo').oninput = renderMemoLinks;
  $('evSave').onclick = saveEvent;
  $('evDelete').onclick = deleteEvent;
  $('mSave').onclick = saveMember;
  $('mDelete').onclick = deleteMember;
  $('mPhoto').onchange = (e) => e.target.files[0] && handlePhoto(e.target.files[0]);
  bindPhotoAdjust();
  $('mName').oninput = updatePhotoPreview;
  $('mColor').oninput = updatePhotoPreview;
  $('sAddMember').onclick = () => openMemberEditor(null);
  $('sSave').onclick = saveSettings;
  $('sReload').onclick = () => busy(async () => { await loadAll(); renderAll(); toast('再読み込みしました'); });
  $('sHardReload').onclick = hardReload;
  $('sVersion').textContent = '家族カレンダー ' + APP_VERSION + '（PWA版）';
  $('sSyncGcal').onclick = () => busy(async () => {
    const data = await api('syncNow');
    applyData(data);
    renderGrid();
    toast((data.sync || []).map((r) => `${r.member ? r.member + ': ' : ''}${r.status}`).join(' / '));
  });
  $('sNotifyTest').onclick = () => busy(async () => {
    const data = await api('notifyNow');
    toast(data.sent && data.sent.length ? `送信: ${data.sent.join('・')}` : '明日の予定がある通知対象者がいません');
  });
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.onclick = () => closeOverlay(el.dataset.close);
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

bindEvents();
start();
