/* 家族カレンダー Service Worker（アプリシェルのキャッシュ） */
const CACHE = 'famcal-v19';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// アプリ本体はネットワーク優先。キャッシュ優先にしていたため、修正を配信しても
// 端末側が古いapp.jsを表示し続ける状態が起きていた。
// キャッシュはオフライン時の控えとして使う（毎回そのとき取れたものへ更新する）
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // APIは常にネットワーク（GAS側はキャッシュしない）
  if (url.origin !== self.location.origin) return;

  // ネットワーク優先にしても、ブラウザ自身のHTTPキャッシュに古い本体が残っていると
  // 古いapp.jsが返る（GitHub Pagesは10分間ブラウザに保持させるため）。
  // index.htmlだけ新しく、app.jsが古い、というちぐはぐな状態が実際に起きた。
  // アプリ本体にあたるファイルだけは、HTTPキャッシュを飛ばして取り直す。
  let req = e.request;
  if (/(\/|\.html|\.js|\.css)$/.test(url.pathname)) {
    try {
      req = new Request(e.request.url, { cache: 'reload', credentials: 'same-origin' });
    } catch (err) {
      // 作れない環境では元のリクエストのまま使う（従来どおりの動き）
    }
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

/* Phase 2: ここにWeb Push受信処理を追加予定 */
