// Masaüstü kabuğuyla köprü: tepsi ipucu, widget penceresi, tepsiden gelen "Kilitle".
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './http.js';

// Widget penceresi kendini pencere etiketinden tanır (adres aynı index.html).
export const isWidgetWindow = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === 'widget' || window.location.hash === '#widget';

export function toggleWidget() {
  return isTauri ? invoke('toggle_widget') : Promise.resolve(false);
}

export function setTrayTooltip(text) {
  return isTauri ? invoke('set_tray_tooltip', { text }).catch(() => {}) : Promise.resolve();
}

export function showMainWindow() {
  return isTauri ? invoke('show_main') : Promise.resolve();
}

export function quitApp() {
  return isTauri ? invoke('quit_app') : Promise.resolve();
}

/** Tepsi menüsündeki "Kilitle". */
export function onLockRequested(callback) {
  if (isTauri) {
    listen('app://lock', () => callback());
  }
}
