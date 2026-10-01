// Oturum bilgisi: sunucu adresi, token ve giriş yapan kullanıcı (localStorage).

const KEYS = { url: 'api_base_url', token: 'api_token', user: 'api_user' };
const DEFAULT_URL = 'http://ytnews.lv.local';

export const session = {
  get baseUrl() {
    return localStorage.getItem(KEYS.url) || DEFAULT_URL;
  },
  set baseUrl(value) {
    localStorage.setItem(KEYS.url, String(value).trim().replace(/\/+$/, ''));
  },

  get token() {
    return localStorage.getItem(KEYS.token);
  },
  set token(value) {
    value ? localStorage.setItem(KEYS.token, value) : localStorage.removeItem(KEYS.token);
  },

  get user() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.user) || 'null');
    } catch {
      return null;
    }
  },
  set user(value) {
    value ? localStorage.setItem(KEYS.user, JSON.stringify(value)) : localStorage.removeItem(KEYS.user);
  },

  clear() {
    this.token = null;
    this.user = null;
  },
};

/**
 * Düz http yalnız yerel geliştirme adreslerinde kabul edilir; şifre internette
 * yalnız HTTPS ile gitmeli (sunucu şifreyi zaten bcrypt ile saklar, istemci
 * hash'i ise şifrenin yerine geçeceği için koruma sağlamaz).
 */
export function isInsecureRemote(url) {
  try {
    const { protocol, hostname } = new URL(url);
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local') || hostname.endsWith('.test');

    return protocol === 'http:' && !local;
  } catch {
    return false;
  }
}
