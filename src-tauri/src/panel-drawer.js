// Panel penceresine (sitenin paneli) her sayfada eklenir: uygulamanın kendi çekmece menüsü, F11 ve
// indirme kartları. Web paneline dokunmaz; Shadow DOM içinde durur, panelin stilleriyle karışmaz.
// Uzak sayfa yalnız `panel_action` komutunu çağırabilir (capabilities/panel.json). İndirme durumu
// Rust'tan `window.__ytnDownload({...})` ile gelir (downloads.rs).
(function () {
  if (window.top !== window || window.__ytnDrawer) {
    return;
  }
  window.__ytnDrawer = true;

  function act(action) {
    var ipc = window.__TAURI_INTERNALS__;
    if (ipc) {
      ipc.invoke('panel_action', { action: action });
    }
  }

  // Panelin kendi adresleri içinde gezinme (geri/ileri düğmesi olmayan pencerede, ör. yetkisiz
  // sayfa ekranından çıkmak için) sayfada yapılır; geri kalanı uygulamaya gider.
  var LOCAL = {
    back: function () { window.history.length > 1 ? window.history.back() : window.location.assign('/admin'); },
    home: function () { window.location.assign('/admin'); },
    reload: function () { window.location.reload(); },
  };

  // WebView2 `target="_blank"` bağlantı tıklamalarını yeni pencere isteğine çevirmiyor (öz-test,
  // log 558); `window.open` çeviriyor. Rust tarafı (`on_new_window`) panel dışını tarayıcıda,
  // panelin kendi sayfalarını aynı pencerede açar. Panelin kendi tıklama işleyicileri önce çalışır.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey) {
      return;
    }
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.getAttribute('target') || '').toLowerCase() !== '_blank') {
      return;
    }
    if (!/^https?:/i.test(link.href)) {
      return;
    }
    event.preventDefault();
    window.open(link.href, '_blank');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'F11') {
      event.preventDefault();
      act('fullscreen');
    }
  }, true);

  var GROUPS = [
    [
      { action: 'back', label: 'Geri', hint: 'Alt+←', icon: 'M15 18l-6-6 6-6' },
      { action: 'home', label: 'Panel Ana Sayfası', icon: 'M3 11l9-7 9 7M5 10v10h14V10' },
      { action: 'reload', label: 'Sayfayı Yenile', hint: 'F5', icon: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7' },
    ],
    [
      { action: 'fullscreen', label: 'Tam Ekran', hint: 'F11', icon: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
      { action: 'lock', label: 'Kilitle', icon: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z' },
      { action: 'widget', label: "Masaüstü Widget'ı", icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
      { action: 'downloads', label: 'İndirilenler Klasörü', icon: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14' },
    ],
    [
      { action: 'switch', label: 'Hesap Değiştir', hint: 'oturumu kapatır', icon: 'M16 17l5-5-5-5M21 12H9M13 21H5V3h8' },
      { action: 'quit', label: 'Uygulamayı Kapat', icon: 'M6 6l12 12M18 6 6 18', danger: true },
    ],
  ];

  var CSS = [
    ':host { all: initial; }',
    '.handle { position: fixed; top: 50%; right: 0; z-index: 2147483000; transform: translateY(-50%); width: 14px; height: 56px; border: 0; border-radius: 8px 0 0 8px; background: rgb(79 70 229 / 85%); box-shadow: 0 2px 8px rgb(15 23 42 / 30%); cursor: pointer; opacity: .55; transition: opacity .15s, width .15s; }',
    '.handle:hover { width: 18px; opacity: 1; }',
    '.handle::before { content: ""; position: absolute; top: 50%; left: 50%; width: 2px; height: 18px; border-radius: 2px; background: #fff; transform: translate(-50%, -50%); box-shadow: -4px 0 0 rgb(255 255 255 / 70%); }',
    '.backdrop { position: fixed; inset: 0; z-index: 2147483001; background: rgb(15 23 42 / 25%); }',
    '.drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483002; display: flex; flex-direction: column; width: 250px; padding: 14px 10px; overflow-y: auto; background: #0f172a; color: #e2e8f0; font: 13px/1.4 system-ui, "Segoe UI", sans-serif; box-shadow: -12px 0 32px rgb(15 23 42 / 35%); transform: translateX(100%); transition: transform .18s ease-out; }',
    ':host(.open) .drawer { transform: none; }',
    '.head { display: flex; align-items: center; justify-content: space-between; padding: 0 6px 12px; color: #94a3b8; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; }',
    '.close { border: 0; background: none; color: #94a3b8; font-size: 16px; cursor: pointer; }',
    '.item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 8px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
    '.item:hover { background: #1e293b; color: #fff; }',
    '.item svg { width: 17px; height: 17px; flex: none; fill: none; stroke: #818cf8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }',
    '.item small { margin-left: auto; color: #64748b; font-size: 11px; }',
    '.item.danger svg { stroke: #f87171; }',
    '.sep { height: 1px; margin: 8px 6px; background: #1e293b; }',
    '.frame { position: fixed; top: 0; left: 0; right: 0; z-index: 2147482999; height: 0; }',
    '.frame[hidden] { display: none; }',
    '.grip { position: absolute; top: 0; left: 50%; width: 150px; height: 14px; transform: translateX(-50%); border-radius: 0 0 8px 8px; background: rgb(15 23 42 / 70%); cursor: grab; opacity: .45; transition: opacity .15s; }',
    '.grip:hover { opacity: 1; }',
    '.grip::before { content: ""; position: absolute; top: 5px; left: 50%; width: 40px; height: 3px; border-radius: 2px; background: #94a3b8; transform: translateX(-50%); }',
    '.wc { position: absolute; top: 0; right: 0; display: flex; }',
    '.wc button { width: 38px; height: 24px; border: 0; background: rgb(15 23 42 / 70%); color: #e2e8f0; font: 13px/1 system-ui, sans-serif; cursor: pointer; opacity: .6; }',
    '.wc button:hover { opacity: 1; background: #1e293b; }',
    '.wc button.x:hover { background: #dc2626; }',
    '.downloads { position: fixed; bottom: 20px; left: 50%; z-index: 2147483003; display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); transform: translateX(-50%); font: 13px/1.4 system-ui, "Segoe UI", sans-serif; }',
    '.dl { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; background: #0f172a; color: #e2e8f0; box-shadow: 0 10px 30px rgb(15 23 42 / 35%); }',
    '.dl-head { display: flex; align-items: center; gap: 8px; }',
    '.dl-head b { flex: 1; min-width: 0; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }',
    '.dl-state { color: #94a3b8; font-size: 11px; }',
    '.dl.is-done .dl-state { color: #34d399; }',
    '.dl.is-failed .dl-state { color: #f87171; }',
    '.dl-bar { height: 3px; overflow: hidden; border-radius: 2px; background: #1e293b; }',
    '.dl-bar::after { content: ""; display: block; width: 40%; height: 100%; background: #818cf8; animation: dl-move 1.1s ease-in-out infinite; }',
    '@keyframes dl-move { from { transform: translateX(-100%); } to { transform: translateX(250%); } }',
    '.dl-msg { color: #94a3b8; font-size: 12px; }',
    '.dl-actions { display: flex; gap: 6px; }',
    '.dl-actions button { padding: 4px 10px; border: 0; border-radius: 6px; background: #1e293b; color: #e2e8f0; font: inherit; font-size: 12px; cursor: pointer; }',
    '.dl-actions button:hover { background: #312e81; }',
    '.dl-close { border: 0; background: none; color: #64748b; cursor: pointer; }',
  ].join('\n');

  var downloads = null;
  var cards = {};

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** İndirme kartı: started → done (Aç / Klasörde göster) ya da failed; bitenler kendiliğinden kapanır. */
  window.__ytnDownload = function (info) {
    if (!downloads) {
      return;
    }
    var card = cards[info.id];
    if (!card) {
      card = document.createElement('div');
      cards[info.id] = card;
      downloads.appendChild(card);
    }
    var state = info.status === 'done' ? 'İndirildi' : info.status === 'failed' ? 'İndirilemedi' : 'İndiriliyor…';
    card.className = 'dl is-' + info.status;
    card.innerHTML = '<div class="dl-head"><b>' + escapeHtml(info.name || 'Dosya') + '</b><span class="dl-state">' + state + '</span>' +
      '<button class="dl-close" type="button" title="Kapat">✕</button></div>' +
      (info.status === 'started' ? '<div class="dl-bar"></div>' : '') +
      (info.message ? '<div class="dl-msg">' + escapeHtml(info.message) + '</div>' : '') +
      (info.status === 'done' ? '<div class="dl-actions"><button type="button" data-action="open-download">Aç</button><button type="button" data-action="reveal-download">Klasörde göster</button></div>' : '');
    function remove() {
      card.remove();
      delete cards[info.id];
    }
    card.querySelector('.dl-close').addEventListener('click', remove);
    card.querySelectorAll('[data-action]').forEach(function (button) {
      button.addEventListener('click', function () { act(button.getAttribute('data-action')); });
    });
    if (info.status !== 'started') {
      setTimeout(remove, 12000);
    }
  };

  function mount() {
    var host = document.createElement('ytn-desktop-drawer');
    var root = host.attachShadow({ mode: 'closed' });
    var html = '<style>' + CSS + '</style>' +
      '<button class="handle" type="button" title="Uygulama menüsü"></button>' +
      '<div class="backdrop" hidden></div>' +
      '<div class="downloads"></div>' +
      '<div class="frame" hidden><div class="grip" title="Pencereyi sürükle (çift tık: büyüt / geri al)"></div>' +
      '<div class="wc"><button type="button" data-win="minimize" title="Küçült">&#8211;</button><button type="button" data-win="maximize" title="Büyüt / geri al">&#9633;</button><button type="button" class="x" data-win="quit" title="Uygulamayı kapat">&#10005;</button></div></div>' +
      '<nav class="drawer" aria-label="Uygulama menüsü"><div class="head"><span>YTNewsCore Masaüstü</span><button class="close" type="button" title="Kapat">✕</button></div>';
    GROUPS.forEach(function (group, index) {
      if (index > 0) {
        html += '<div class="sep"></div>';
      }
      group.forEach(function (item) {
        html += '<button class="item' + (item.danger ? ' danger' : '') + '" type="button" data-action="' + item.action + '">' +
          '<svg viewBox="0 0 24 24"><path d="' + item.icon + '"/></svg><span>' + item.label + '</span>' +
          (item.hint ? '<small>' + item.hint + '</small>' : '') + '</button>';
      });
    });
    root.innerHTML = html + '</nav>';
    downloads = root.querySelector('.downloads');

    // Ayarlar › "Çerçevesiz": başlık çubuğu yokken sürükleme tutamacı ve pencere düğmeleri.
    var frame = root.querySelector('.frame');
    function applyFrame() {
      frame.hidden = !window.__ytnFrameless;
    }
    window.__ytnApplyFrame = applyFrame;
    applyFrame();
    root.querySelector('.grip').addEventListener('mousedown', function (event) {
      if (event.button === 0) {
        act(event.detail > 1 ? 'maximize' : 'drag');
      }
    });
    root.querySelectorAll('[data-win]').forEach(function (button) {
      button.addEventListener('click', function () { act(button.getAttribute('data-win')); });
    });

    var backdrop = root.querySelector('.backdrop');
    function toggle(open) {
      host.classList.toggle('open', open);
      backdrop.hidden = !open;
    }
    root.querySelector('.handle').addEventListener('click', function () { toggle(true); });
    root.querySelector('.close').addEventListener('click', function () { toggle(false); });
    backdrop.addEventListener('click', function () { toggle(false); });
    root.querySelectorAll('.item').forEach(function (button) {
      button.addEventListener('click', function () {
        var action = button.getAttribute('data-action');
        toggle(false);
        LOCAL[action] ? LOCAL[action]() : act(action);
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !backdrop.hidden) {
        toggle(false);
      }
    });
    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
