// Giriş isteğindeki device_name: "Windows 11 · MASAUSTU-PC" gibi, otomatik.
import { hostname, platform, version } from '@tauri-apps/plugin-os';
import { isTauri } from './http.js';

const PLATFORM_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux', ios: 'iOS', android: 'Android' };

export async function deviceName(location = '') {
  const label = String(location || '').trim();
  const withLabel = (name) => (label ? `${name} · ${label}` : name);

  if (!isTauri) {
    return withLabel('YTCoreNews Masaüstü (tarayıcı)');
  }

  try {
    const name = PLATFORM_NAMES[platform()] || platform();
    const major = String(version() || '').split('.')[0];
    const host = await hostname();

    return withLabel([`${name}${major ? ` ${major}` : ''}`, host].filter(Boolean).join(' · '));
  } catch {
    return withLabel('YTCoreNews Masaüstü');
  }
}
