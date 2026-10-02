// Uygulama ayarları (girişten bağımsız, bir kez tanımlanır, sonra değiştirilebilir): sunucu adresi,
// panel penceresinin varsayılan boyutu, çerçevesiz kullanım. localStorage'da durur.
const KEY = 'app_settings';

export const MIN_WIDTH = 960;
export const MIN_HEIGHT = 600;

const DEFAULTS = { serverUrl: '', width: 1360, height: 860, frameless: false };

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

/** "https://site.com/" → "https://site.com"; geçersizse null. */
export function normalizeServerUrl(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(text);

    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

export const appSettings = {
  get: read,

  update(patch) {
    const next = { ...read(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));

    return next;
  },

  /** Güncellemeden önce hesap eklemiş kullanıcı: o hesabın sunucusu ayar olur (yeniden sorulmaz). */
  adoptServerFrom(account) {
    if (!read().serverUrl && account?.baseUrl) {
      this.update({ serverUrl: account.baseUrl });
    }
  },
};
