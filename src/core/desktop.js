// Rust kabuğuyla köprü: panel penceresi, kilit, kabuk görünürlüğü, hareketsizlik, tepsi, widget.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './http.js';

// Widget penceresi kendini pencere etiketinden tanır (adres aynı index.html).
export const isWidgetWindow = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === 'widget' || window.location.hash === '#widget';

const call = (command, args) => (isTauri ? invoke(command, args) : Promise.resolve(null));

/** Paneli açar ya da var olan panel penceresini bu adrese götürür. Tarayıcıda yeni sekme. */
export function openPanel(url, title) {
  if (!isTauri) {
    window.open(url, 'ytnewscore-panel');

    return Promise.resolve();
  }

  return invoke('open_panel', { url, title });
}

export const closePanel = () => call('close_panel');
export const setLocked = (locked) => call('set_locked', { locked });
export const setShellVisible = (visible) => call('set_shell_visible', { visible });
export const systemIdleSeconds = () => call('system_idle_seconds').then((s) => Number(s) || 0);
export const toggleWidget = () => call('toggle_widget');
export const showMainWindow = () => call('show_main');
export const quitApp = () => call('quit_app');
export const setTrayTooltip = (text) => call('set_tray_tooltip', { text }).catch(() => {});

/**
 * Kabuk olayları: "panel://logout", "panel://session-expired" (panel penceresinden),
 * "app://accounts", "app://lock" (tepsi menüsünden).
 */
export function onShellEvent(name, callback) {
  if (isTauri) {
    listen(name, () => callback());
  }
}
