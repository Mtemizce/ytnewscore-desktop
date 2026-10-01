// Pencere: tam ekran (F11).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './http.js';

export async function toggleFullscreen() {
  if (isTauri) {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);

    return next;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();

    return false;
  }
  await document.documentElement.requestFullscreen();

  return true;
}
