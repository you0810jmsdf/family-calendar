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
  pickFunction('fmtDateJP') + '\n' +
  pickFunction('aiPickWhenText') + '\n' +
  'return { fmtDateJP, aiPickWhenText };'
);
const { fmtDateJP, aiPickWhenText } = load();

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
