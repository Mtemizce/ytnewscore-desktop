// Kabuğun kullandığı /api/v1 uçları: giriş (+2FA), kilit için parola, panel giriş bağlantısı,
// bildirimler, Pano sayıları. Panelin ekranları API'den değil panelin kendisinden gelir.
import { request } from '../core/http.js';

export const api = {
  info: () => request('GET', ''),

  auth: {
    login: (login, password, deviceName) => request('POST', '/auth/login', { login, password, device_name: deviceName }),
    twoFactor: (challenge, code) => request('POST', '/auth/two-factor', { challenge, code }),
    logout: () => request('POST', '/auth/logout'),
    /** Panel penceresi için tek kullanımlık, 60 saniyelik giriş bağlantısı. */
    webSession: (path = '/admin') => request('POST', '/auth/web-session', { path }),
  },

  me: {
    show: () => request('GET', '/me'),
    verifyPassword: (password) => request('POST', '/me/verify-password', { password }),
  },

  notifications: {
    list: () => request('GET', '/notifications'),
  },

  /** Pano: sayılar, anlık ziyaretçi, servis durumu (widget, kilit ekranı, tepsi). */
  dashboard: () => request('GET', '/dashboard'),
};
