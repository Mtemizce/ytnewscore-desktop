// Panel penceresine (sitenin paneli) her sayfada eklenir: uygulamanın kendi çekmece menüsü ve F11.
// Web paneline dokunmaz; Shadow DOM içinde durur, panelin stilleriyle karışmaz. Uzak sayfa yalnız
// `panel_action` komutunu çağırabilir (capabilities/panel.json).
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

  document.addEventListener('keydown', function (event) {
    if (event.key === 'F11') {
      event.preventDefault();
      act('fullscreen');
    }
  }, true);

  var ITEMS = [
    { action: 'fullscreen', label: 'Tam Ekran', hint: 'F11', icon: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
    { action: 'lock', label: 'Kilitle', icon: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z' },
    { action: 'widget', label: "Masaüstü Widget'ı", icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    { action: 'downloads', label: 'İndirilenler Klasörü', icon: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14' },
    { action: 'switch', label: 'Hesap Değiştir', hint: 'oturumu kapatır', icon: 'M16 17l5-5-5-5M21 12H9M13 21H5V3h8' },
    { action: 'quit', label: 'Uygulamayı Kapat', icon: 'M6 6l12 12M18 6 6 18', danger: true },
  ];

  var CSS = [
    ':host { all: initial; }',
    '.handle { position: fixed; top: 50%; right: 0; z-index: 2147483000; transform: translateY(-50%); width: 14px; height: 56px; border: 0; border-radius: 8px 0 0 8px; background: rgb(79 70 229 / 85%); box-shadow: 0 2px 8px rgb(15 23 42 / 30%); cursor: pointer; opacity: .55; transition: opacity .15s, width .15s; }',
    '.handle:hover { width: 18px; opacity: 1; }',
    '.handle::before { content: ""; position: absolute; top: 50%; left: 50%; width: 2px; height: 18px; border-radius: 2px; background: #fff; transform: translate(-50%, -50%); box-shadow: -4px 0 0 rgb(255 255 255 / 70%); }',
    '.backdrop { position: fixed; inset: 0; z-index: 2147483001; background: rgb(15 23 42 / 25%); }',
    '.drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483002; display: flex; flex-direction: column; width: 250px; padding: 14px 10px; background: #0f172a; color: #e2e8f0; font: 13px/1.4 system-ui, "Segoe UI", sans-serif; box-shadow: -12px 0 32px rgb(15 23 42 / 35%); transform: translateX(100%); transition: transform .18s ease-out; }',
    ':host(.open) .drawer { transform: none; }',
    '.head { display: flex; align-items: center; justify-content: space-between; padding: 0 6px 12px; color: #94a3b8; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; }',
    '.close { border: 0; background: none; color: #94a3b8; font-size: 16px; cursor: pointer; }',
    '.item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 8px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
    '.item:hover { background: #1e293b; color: #fff; }',
    '.item svg { width: 17px; height: 17px; flex: none; fill: none; stroke: #818cf8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }',
    '.item small { margin-left: auto; color: #64748b; font-size: 11px; }',
    '.item.danger svg { stroke: #f87171; }',
    '.sep { height: 1px; margin: 8px 6px; background: #1e293b; }',
  ].join('\n');

  function mount() {
    var host = document.createElement('ytn-desktop-drawer');
    var root = host.attachShadow({ mode: 'closed' });
    var html = '<style>' + CSS + '</style>' +
      '<button class="handle" type="button" title="Uygulama menüsü"></button>' +
      '<div class="backdrop" hidden></div>' +
      '<nav class="drawer" aria-label="Uygulama menüsü"><div class="head"><span>YTNewsCore Masaüstü</span><button class="close" type="button" title="Kapat">✕</button></div>';
    ITEMS.forEach(function (item, index) {
      if (index === 4) {
        html += '<div class="sep"></div>';
      }
      html += '<button class="item' + (item.danger ? ' danger' : '') + '" type="button" data-action="' + item.action + '">' +
        '<svg viewBox="0 0 24 24"><path d="' + item.icon + '"/></svg><span>' + item.label + '</span>' +
        (item.hint ? '<small>' + item.hint + '</small>' : '') + '</button>';
    });
    root.innerHTML = html + '</nav>';

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
        toggle(false);
        act(button.getAttribute('data-action'));
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
