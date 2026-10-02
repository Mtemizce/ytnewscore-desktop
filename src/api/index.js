// Kabuğun kullandığı /api/v1 uçları: giriş (+2FA), kilit için parola, panel giriş bağlantısı,
// bildirimler, Pano sayıları. Panelin ekranları API'den değil panelin kendisinden gelir.
import { request } from '../core/http.js';

export const api = {
  info: () => request('GET', ''),

  auth: {
    login: (login, password, deviceName) => request('POST', '/auth/login', { login, password, device_name: deviceName }),
    twoFactor: (challenge, code) => request('POST', '/auth/two-factor', { challenge, code }),
    /** Girişte Telegram onayı: iste, sonra aynı challenge ile durumu yokla (onaylanınca token gelir). */
    telegram: (challenge) => request('POST', '/auth/telegram', { challenge }),
    telegramStatus: (challenge) => request('POST', '/auth/telegram/status', { challenge }),
    logout: () => request('POST', '/auth/logout'),
    /** Panel penceresi için tek kullanımlık, 60 saniyelik giriş bağlantısı. */
    webSession: (path = '/admin') => request('POST', '/auth/web-session', { path }),
  },

  me: {
    show: () => request('GET', '/me'),
    verifyPassword: (password) => request('POST', '/me/verify-password', { password }),
    /** Kilit ekranında parola yerine Telegram onayı. */
    unlockTelegram: (deviceName) => request('POST', '/me/unlock/telegram', { device_name: deviceName }),
    unlockTelegramStatus: (approvalId, secret) => request('POST', '/me/unlock/telegram/status', { approval_id: approvalId, secret }),
  },

  notifications: {
    list: () => request('GET', '/notifications'),
  },

  /** Hesabın açık giriş/onay soruları (Telegram'a giden aynı soru): masaüstünden de cevaplanır. */
  approvals: {
    list: () => request('GET', '/login-approvals'),
    answer: (id, decision) => request('POST', `/login-approvals/${id}/${decision}`),
  },

  /** Pano: sayılar, anlık ziyaretçi, servis durumu (widget, kilit ekranı, tepsi). */
  dashboard: () => request('GET', '/dashboard'),
};
