// İşletim sisteminin kendi bildirimleri (Windows bildirim merkezi vb.).
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isTauri } from './http.js';

let granted = null;

async function ensurePermission() {
  if (granted !== null) {
    return granted;
  }
  if (!isTauri) {
    granted = 'Notification' in window && (Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted');

    return granted;
  }

  granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === 'granted';
  }

  return granted;
}

export async function systemNotify(title, body = '') {
  if (!(await ensurePermission())) {
    return false;
  }

  if (isTauri) {
    sendNotification({ title, body });
  } else {
    new Notification(title, { body });
  }

  return true;
}
