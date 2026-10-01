// İşletim sisteminin kendi bildirimleri (Windows bildirim merkezi vb.), sesli.
// Not: bildirimin üstündeki uygulama adı geliştirme modunda "Windows PowerShell" görünür; kurulu
// uygulamada (npm run tauri build) tauri.conf.json'daki productName görünür.
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
    sendNotification({ title, body, sound: 'Default' });
  } else {
    new Notification(title, { body, silent: false });
  }

  return true;
}
