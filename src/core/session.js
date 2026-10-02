// Kayıtlı hesaplar (birden çok site/kullanıcı) ve etkin hesap; localStorage'da, tüm pencereler ortak.
// Bir hesap: { id, baseUrl, token, user: {id, name, email, avatar_url}, siteName }.

const KEYS = { accounts: 'accounts', active: 'active_account' };
import { appSettings } from './settings.js';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.accounts) || '[]');
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(KEYS.accounts, JSON.stringify(list));
}

export const accounts = {
  list: read,

  active() {
    const id = localStorage.getItem(KEYS.active);

    return read().find((a) => a.id === id) || null;
  },

  activate(id) {
    id ? localStorage.setItem(KEYS.active, id) : localStorage.removeItem(KEYS.active);
  },

  /** Aynı site + kullanıcı ikinci kez eklenirse günceller. */
  upsert(account) {
    const id = `${new URL(account.baseUrl).host}#${account.user.id}`;
    const list = read().filter((a) => a.id !== id);
    list.unshift({ ...account, id });
    write(list);

    return id;
  },

  update(id, changes) {
    write(read().map((a) => (a.id === id ? { ...a, ...changes } : a)));
  },

  remove(id) {
    write(read().filter((a) => a.id !== id));
    if (localStorage.getItem(KEYS.active) === id) {
      localStorage.removeItem(KEYS.active);
    }
  },
};

/**
 * İsteklerin gittiği adres ve token: etkin hesap; hesap eklerken (`withLogin`) girilen sunucu.
 */
export const session = {
  override: null,

  get baseUrl() {
    return this.override?.baseUrl ?? accounts.active()?.baseUrl ?? appSettings.get().serverUrl;
  },

  get token() {
    return this.override ? (this.override.token ?? null) : (accounts.active()?.token ?? null);
  },

  async withLogin(baseUrl, callback) {
    this.override = { baseUrl: String(baseUrl).trim().replace(/\/+$/, ''), token: null };
    try {
      return await callback();
    } finally {
      this.override = null;
    }
  },

};

/**
 * Düz http yalnız yerel geliştirme adreslerinde kabul edilir; şifre internette yalnız HTTPS ile
 * gitmeli (sunucu şifreyi bcrypt ile saklar; istemci hash'i şifrenin yerine geçeceği için koruma
 * sağlamaz).
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
