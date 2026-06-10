/* 家族カレンダー Phase 1（PWA） */
'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycbzakKEwcFRNERInAYPbxvU_ZLRcCwDj8F4wpL6B49bc6lBolGulXfCXeUFaQsYWG6DhTw/exec';
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
  offline: false,
};

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
  localStorage.setItem(LS_CACHE, JSON.stringify({
    members: state.members, events: state.events, settings: state.settings,
  }));
}

async function loadAll() {
  try {
    applyData(await api('listAll'));
    state.offline = false;
  } catch (e) {
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

function isEventVisible(ev) {
  const ids = (ev['メンバー'] || '').split(',').filter(String);
  if (ids.length === 0) return true;
  return ids.some((id) => !state.hidden.has(id));
}

function eventColor(ev) {
  const ids = (ev['メンバー'] || '').split(',').filter(String);
  for (const id of ids) {
    const m = state.members.find((x) => x.id === id);
    if (m) return m['色'] || '#4a7cf0';
  }
  return '#9aa3af';
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
  const grid = $('monthGrid');
  grid.innerHTML = '';
  const first = new Date(state.year, state.month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = todayStr();
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dstr = ymd(d);
    const cell = document.createElement('div');
    const dow = d.getDay();
    cell.className = 'day-cell' +
      (d.getMonth() !== state.month ? ' other' : '') +
      (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') +
      (dstr === today ? ' today' : '');
    let html = `<div class="day-num">${d.getDate()}</div>`;
    const evs = eventsOnDay(dstr);
    evs.slice(0, 3).forEach((ev) => {
      const contL = ev['開始日'] < dstr ? ' cont-l' : '';
      const contR = (ev['終了日'] || ev['開始日']) > dstr ? ' cont-r' : '';
      html += `<div class="ev-chip${contL}${contR}" style="background:${eventColor(ev)}">${esc(ev['タイトル'])}</div>`;
    });
    if (evs.length > 3) html += `<div class="ev-more">+${evs.length - 3}件</div>`;
    cell.innerHTML = html;
    cell.onclick = () => openDaySheet(dstr);
    grid.appendChild(cell);
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
    item.innerHTML = `<div class="bar" style="background:${eventColor(ev)}"></div>
      <div class="info"><div class="t">${esc(ev['タイトル'])}</div>
      <div class="sub">${gcalMark}${esc(time)}${esc(period)}${ev['メモ'] ? ' ・ ' + esc(ev['メモ']) : ''}</div></div>
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
    item.onclick = () => { closeOverlay('daySheet'); openEventEditor(ev); };
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

function openEventEditor(ev) {
  state.editingEventId = ev ? ev.id : '';
  $('eventModalTitle').textContent = ev ? '予定を編集' : '予定を追加';
  $('evTitle').value = ev ? ev['タイトル'] : '';
  const base = state.selectedDate || todayStr();
  $('evStart').value = ev ? ev['開始日'] : base;
  $('evEnd').value = ev ? (ev['終了日'] || ev['開始日']) : base;
  $('evAllDay').checked = ev ? ev['終日'] === 'ON' : true;
  $('evTimeStart').value = ev ? ev['開始時刻'] : '';
  $('evTimeEnd').value = ev ? ev['終了時刻'] : '';
  $('evMemo').value = ev ? ev['メモ'] : '';
  $('evGmail').checked = ev ? ev['Gmail転記'] === 'ON' : false;
  $('evDelete').classList.toggle('hidden', !ev);
  state.evSelectedMembers = new Set((ev ? ev['メンバー'] : '').split(',').filter(String));
  renderEvMemberSelect();
  updateTimeRow();
  $('eventModal').classList.remove('hidden');
  if (ev && ev['取込元'] === 'gcal') {
    toast('Googleカレンダー取込予定です。編集・削除しても次回同期で元に戻ります');
  }
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
  };
  // Googleカレンダー取込予定の編集時はタグを引き継ぐ（次回同期で洗い替え対象に保つ）
  const orig = state.events.find((x) => x.id === state.editingEventId);
  if (orig && orig['取込元']) {
    ev['取込元'] = orig['取込元'];
    ev['取込キー'] = orig['取込キー'];
  }
  await busy(async () => {
    const data = await api('saveEvent', { event: ev });
    applyData(data);
    closeOverlay('eventModal');
    renderGrid();
    toast(data.mail ? `保存しました（Gmail: ${data.mail}）` : '保存しました');
  });
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
      },
    }));
    closeOverlay('settingsModal');
    toast('設定を保存しました（通知時刻を更新）');
  });
}

// ---------- 共通UI ----------

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function closeOverlay(id) {
  $(id).classList.add('hidden');
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
  $('addEventFromDay').onclick = () => { closeOverlay('daySheet'); openEventEditor(null); };
  $('evAllDay').onchange = updateTimeRow;
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
