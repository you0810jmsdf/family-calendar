// 画面表示のうち、ブラウザに触れない純粋な関数のテスト。
// 実行: node --test
//
// app.js はブラウザ用の1ファイルで、読み込んだ時点で localStorage や document を使うため、
// そのまま require できない。ここではソースから対象の関数だけを取り出して評価している。
// （app.js の起動処理を書き換えずに、実物のコードを検証するため）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function pickFunction(name) {
  // 関数宣言から、行頭の閉じ括弧までを取り出す
  const re = new RegExp('^function ' + name + '\\([\\s\\S]*?^\\}', 'm');
  const m = SRC.match(re);
  assert.ok(m, `app.js に function ${name} が見つかりません`);
  return m[0];
}

const load = new Function(
  'state', 'window',
  pickFunction('fmtDateJP') + '\n' +
  pickFunction('aiPickWhenText') + '\n' +
  pickFunction('splitUrlFromText') + '\n' +
  pickFunction('todoEvents') + '\n' +
  'const REPEAT_MAX = 20;\n' +
  pickFunction('newId') + '\n' +
  pickFunction('addDaysStr') + '\n' +
  pickFunction('addMonthsStr') + '\n' +
  pickFunction('daysBetweenStr') + '\n' +
  pickFunction('expandRepeat') + '\n' +
  "const REPEAT_LABELS = { daily: '毎日', weekly: '毎週', biweekly: '隔週', monthly: '毎月' };\n" +
  pickFunction('aiRepeatOf') + '\n' +
  pickFunction('aiRepeatText') + '\n' +
  'return { fmtDateJP, aiPickWhenText, splitUrlFromText, todoEvents, expandRepeat, aiRepeatOf, aiRepeatText };'
);

// todoEvents は state.events を見るため、テスト用の入れ物を渡す
const state = { events: [] };
const { fmtDateJP, aiPickWhenText, splitUrlFromText, todoEvents, expandRepeat, aiRepeatOf, aiRepeatText } = load(state, globalThis);

test('expandRepeat: 毎週×4回は7日ずつ、1件目だけ元のID', () => {
  const ev = { id: 'orig', '開始日': '2026-11-03', '終了日': '2026-11-03', 'タイトル': 'x' };
  const list = expandRepeat(ev, 'weekly', 4);
  assert.deepStrictEqual(list.map((e) => e['開始日']), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  assert.strictEqual(list[0].id, 'orig');
  assert.strictEqual(new Set(list.map((e) => e.id)).size, 4);
});

test('expandRepeat: 期間のある予定は日数を保ち、月またぎ・年またぎもずれない', () => {
  const ev = { id: 'a', '開始日': '2026-12-30', '終了日': '2027-01-01' };
  const list = expandRepeat(ev, 'biweekly', 2);
  assert.strictEqual(list[1]['開始日'], '2027-01-13');
  assert.strictEqual(list[1]['終了日'], '2027-01-15');
});

test('expandRepeat: 毎月31日は短い月で月末に寄せ、次の月で31日に戻る', () => {
  const ev = { id: 'a', '開始日': '2026-01-31', '終了日': '2026-01-31' };
  const days = expandRepeat(ev, 'monthly', 4).map((e) => e['開始日']);
  assert.deepStrictEqual(days, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('expandRepeat: しない・1回・上限超えの扱い', () => {
  const ev = { id: 'a', '開始日': '2026-11-03', '終了日': '2026-11-03' };
  assert.strictEqual(expandRepeat(ev, 'none', 5).length, 1);
  assert.strictEqual(expandRepeat(ev, 'daily', 1).length, 1);
  assert.strictEqual(expandRepeat(ev, 'daily', 99).length, 20);
});

test('fmtDateJP: 月日と曜日を出す', () => {
  assert.strictEqual(fmtDateJP('2026-09-01'), '9/1(火)');
  assert.strictEqual(fmtDateJP('2026-08-21'), '8/21(金)');
});

test('aiPickWhenText: 時刻ありの1日の予定', () => {
  // 印西市のページから読み取った実例
  const ev = {
    '開始日': '2026-09-01', '終了日': '2026-09-01',
    '終日': 'OFF', '開始時刻': '18:30', '終了時刻': '20:30',
  };
  assert.strictEqual(aiPickWhenText(ev), '9/1(火) 18:30〜20:30');
});

test('aiPickWhenText: 終日の予定は「終日」と出す', () => {
  const ev = { '開始日': '2026-08-21', '終了日': '2026-08-21', '終日': 'ON', '開始時刻': '', '終了時刻': '' };
  assert.strictEqual(aiPickWhenText(ev), '8/21(金) 終日');
});

test('aiPickWhenText: 複数日にまたがる予定は期間で出す', () => {
  const ev = { '開始日': '2026-09-01', '終了日': '2026-09-03', '終日': 'ON' };
  assert.strictEqual(aiPickWhenText(ev), '9/1(火)〜9/3(木) 終日');
});

test('aiPickWhenText: 終了時刻が無ければ開始時刻だけ出す', () => {
  const ev = { '開始日': '2026-09-01', '終日': 'OFF', '開始時刻': '18:30', '終了時刻': '' };
  assert.strictEqual(aiPickWhenText(ev), '9/1(火) 18:30');
});

test('aiPickWhenText: 終日OFFなのに時刻が無ければ「終日」と出す', () => {
  // AIの読み取り結果は欠けることがあるので、空の時間が表示されないこと
  const ev = { '開始日': '2026-09-01', '終日': 'OFF', '開始時刻': '', '終了時刻': '' };
  assert.strictEqual(aiPickWhenText(ev), '9/1(火) 終日');
});

test('aiPickWhenText: 終了日が無ければ開始日と同じ扱いにする', () => {
  const ev = { '開始日': '2026-09-01', '終日': 'ON' };
  assert.strictEqual(aiPickWhenText(ev), '9/1(火) 終日');
});

// --- 文章欄にURLを貼られたときの拾い上げ ---

const PAGE = 'https://www.city.inzai.lg.jp/0000022254.html';

test('splitUrlFromText: 文章欄にURLだけ貼られたら、URLとして扱う', () => {
  // URLを文章として渡すと、AIがURLをタイトルにして今日の日付を当ててしまう
  const r = splitUrlFromText(PAGE, '');
  assert.strictEqual(r.url, PAGE);
  assert.strictEqual(r.text, '');
});

test('splitUrlFromText: 文章とURLが混ざっていれば、両方を活かす', () => {
  const r = splitUrlFromText(`このお知らせを登録して ${PAGE}`, '');
  assert.strictEqual(r.url, PAGE);
  assert.strictEqual(r.text, 'このお知らせを登録して');
});

test('splitUrlFromText: URL欄が埋まっていれば文章には手を触れない', () => {
  const r = splitUrlFromText(`${PAGE} を見て`, 'https://example.com/a');
  assert.strictEqual(r.url, 'https://example.com/a');
  assert.strictEqual(r.text, `${PAGE} を見て`);
});

test('splitUrlFromText: URLが無ければそのまま返す', () => {
  const r = splitUrlFromText('来週金曜の10時から歯医者', '');
  assert.strictEqual(r.url, '');
  assert.strictEqual(r.text, '来週金曜の10時から歯医者');
});

test('splitUrlFromText: 全角スペースで区切られていてもURLを切り出す', () => {
  const r = splitUrlFromText(`${PAGE}　これを登録`, '');
  assert.strictEqual(r.url, PAGE);
  assert.strictEqual(r.text, 'これを登録');
});

test('splitUrlFromText: 空でも落ちない', () => {
  assert.deepStrictEqual(splitUrlFromText('', ''), { text: '', url: '' });
  assert.deepStrictEqual(splitUrlFromText(null, ''), { text: null, url: '' });
});

// --- やること（要対応の予定） ---

test('todoEvents: 印の付いた予定だけを拾う', () => {
  state.events = [
    { id: '1', 'タイトル': '申込', '開始日': '2026-09-01', '要対応': 'ON' },
    { id: '2', 'タイトル': 'ただの予定', '開始日': '2026-09-02', '要対応': 'OFF' },
    { id: '3', 'タイトル': '印なし', '開始日': '2026-09-03' },
  ];
  const out = todoEvents();
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, '1');
});

test('todoEvents: 期限が近い順に並べる', () => {
  // 締切が迫っているものほど上に来ないと、一覧の意味がない
  state.events = [
    { id: 'c', '開始日': '2026-12-01', '要対応': 'ON' },
    { id: 'a', '開始日': '2026-08-21', '要対応': 'ON' },
    { id: 'b', '開始日': '2026-09-08', '要対応': 'ON' },
  ];
  assert.deepStrictEqual(todoEvents().map((e) => e.id), ['a', 'b', 'c']);
});

test('todoEvents: 期限が過ぎたものは先頭に来る', () => {
  // 取りこぼしに気づけるよう、過ぎたものを隠さず一番上に置く
  state.events = [
    { id: 'future', '開始日': '2026-12-01', '要対応': 'ON' },
    { id: 'overdue', '開始日': '2026-07-01', '要対応': 'ON' },
  ];
  assert.strictEqual(todoEvents()[0].id, 'overdue');
});

test('todoEvents: 印が1つも無ければ空', () => {
  state.events = [{ id: '1', '開始日': '2026-09-01', '要対応': 'OFF' }];
  assert.deepStrictEqual(todoEvents(), []);
  state.events = [];
  assert.deepStrictEqual(todoEvents(), []);
});

test('todoEvents: 元の配列を並べ替えない', () => {
  // state.events の順番が変わると、カレンダーの表示に影響する
  state.events = [
    { id: 'c', '開始日': '2026-12-01', '要対応': 'ON' },
    { id: 'a', '開始日': '2026-08-21', '要対応': 'ON' },
  ];
  todoEvents();
  assert.deepStrictEqual(state.events.map((e) => e.id), ['c', 'a']);
});

// ---------- 保存まわり ----------
// サーバーには保存できたのに、端末側の都合で「エラー」と表示されていた不具合の再発防止

test('isSameSavedEvent: 送った内容と同じ行なら保存済みとみなす', () => {
  const { isSameSavedEvent } = new Function(pickFunction('isSameSavedEvent') + '\nreturn { isSameSavedEvent };')();
  const sent = {
    id: 'ca02', 'タイトル': 'CBIポスター作り', '開始日': '2026-10-04', '終了日': '2026-10-04',
    '開始時刻': '08:30', 'メンバー': 'b5b9', 'メモ': 'パレットII',
  };
  // スプレッドシートから返る時刻は先頭の0が落ちることがある
  const saved = { ...sent, '開始時刻': '8:30', '更新日時': '2026-09-28 22:58:44' };
  assert.strictEqual(isSameSavedEvent(saved, sent), true);
  assert.strictEqual(isSameSavedEvent({ ...saved, id: 'other' }, sent), false);
  // 編集前の行が残っているだけ（メモが古い）なら保存できていない
  assert.strictEqual(isSameSavedEvent({ ...saved, 'メモ': '' }, sent), false);
  assert.strictEqual(isSameSavedEvent(undefined, sent), false);
});

test('applyData: 端末の保存領域がいっぱいでも例外を出さず、データは反映する', () => {
  const removed = [];
  const fullStorage = {
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem(k) { removed.push(k); },
  };
  const st = { members: [], events: [], settings: {} };
  const { applyData } = new Function('state', 'localStorage', 'LS_CACHE',
    pickFunction('applyData') + '\nreturn { applyData };')(st, fullStorage, 'famcal_cache');
  assert.doesNotThrow(() => applyData({ events: [{ id: 'a' }] }));
  assert.deepStrictEqual(st.events, [{ id: 'a' }]);
  // 古い控えは消しておく
  assert.deepStrictEqual(removed, ['famcal_cache']);
});

test('aiRepeatOf: 使える繰り返しだけ通し、不正な値・1回・null は捨てる', () => {
  assert.deepStrictEqual(aiRepeatOf({ '繰り返し': { '種類': 'weekly', '回数': 8 } }), { kind: 'weekly', count: 8 });
  assert.deepStrictEqual(aiRepeatOf({ '繰り返し': { '種類': 'daily', '回数': '5' } }), { kind: 'daily', count: 5 });
  assert.strictEqual(aiRepeatOf({ '繰り返し': { '種類': 'weekly', '回数': 1 } }), null);
  assert.strictEqual(aiRepeatOf({ '繰り返し': { '種類': 'yearly', '回数': 4 } }), null);
  assert.strictEqual(aiRepeatOf({ '繰り返し': null }), null);
  assert.strictEqual(aiRepeatOf({}), null);
  assert.strictEqual(aiRepeatOf({ '繰り返し': { '種類': 'weekly', '回数': 99 } }).count, 20);
});

test('aiRepeatText: 種類・回数・最初と最後の日を出す', () => {
  const ev = { '開始日': '2026-11-10', '終了日': '2026-11-10', '繰り返し': { '種類': 'weekly', '回数': 8 } };
  assert.strictEqual(aiRepeatText(ev), '毎週・全8回（11/10(火)〜12/29(火)）');
  assert.strictEqual(aiRepeatText({ '開始日': '2026-11-10' }), '');
});
