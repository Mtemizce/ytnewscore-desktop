// Kabuğun kullandığı /api/v1 uçları: giriş (+2FA), kilit için parola, panel giriş bağlantısı,
// bildirimler, Pano sayıları. Panelin ekranları API'den değil panelin kendisinden gelir.
import { request } from '../core/http.js';

export const api = {
  info: () => request('GET', ''),

  auth: {
    login: (login, password, deviceName) => request('POST', '/auth/login', { login, password, device_name: deviceName }),
    twoFactor: (challenge, code) => request('POST', '/auth/two-factor', { challenge, code }),
    /**
     * "Şifremi unuttum": hesabı belirt → Authenticator kodu ya da Telegram'da "Evet, Sıfırla" ile doğrula
     * → yeni parola (mevcut parola sorulmaz). `challenge` her adımda taşınır.
     */
    passwordReset: (login, deviceName) => request('POST', '/auth/password-reset', { login, device_name: deviceName }),
    passwordResetTelegram: (challenge, deviceName) => request('POST', '/auth/password-reset/telegram', { challenge, device_name: deviceName }),
    passwordResetStatus: (challenge) => request('POST', '/auth/password-reset/status', { challenge }),
    passwordResetCode: (challenge, code) => request('POST', '/auth/password-reset/code', { challenge, code }),
    passwordResetComplete: (challenge, password, passwordConfirmation) =>
      request('POST', '/auth/password-reset/complete', { challenge, password, password_confirmation: passwordConfirmation }),
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
    /** Hesap güvenliği: authenticator ile iki adımlı doğrulama (kur, doğrula, parolayla kapat). */
    /** Girişte hangi ikinci faktör sorulsun (iki yöntem de açıksa): totp ya da telegram. */
    twoFactorMethod: (method) => request('PUT', '/me/two-factor-method', { method }),
    twoFactorSetup: () => request('POST', '/me/two-factor/setup'),
    twoFactorConfirm: (code) => request('POST', '/me/two-factor/confirm', { code }),
    twoFactorDisable: (password) => request('DELETE', '/me/two-factor', { password }),
    /** Telegram ile giriş doğrulaması: bağlı Telegram'da bir onayla açılır (parola gerekmez), parolayla kapanır. */
    telegramLoginStart: (deviceName) => request('POST', '/me/telegram-login', { device_name: deviceName }),
    telegramLoginStatus: (approvalId, secret) => request('POST', '/me/telegram-login/status', { approval_id: approvalId, secret }),
    telegramLoginDisable: (password) => request('DELETE', '/me/telegram-login', { password }),
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
