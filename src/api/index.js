// /api/v1 uçları. Yeni bir modül = buraya bir nesne + components/ altında bir bileşen.
import { request, query } from '../core/http.js';
import { toFormData } from './form-data.js';

/** Liste/göster/oluştur/güncelle/sil uçları aynı biçimdeki kaynaklar için. */
function resource(path, { multipart = false } = {}) {
  return {
    list: (params = {}) => request('GET', `${path}${query(params)}`),
    show: (id) => request('GET', `${path}/${id}`),
    create: (payload) => request('POST', path, multipart ? toFormData(payload) : payload),
    update: (id, payload) => (multipart
      ? request('POST', `${path}/${id}`, toFormData(payload, 'PUT'))
      : request('PUT', `${path}/${id}`, payload)),
    remove: (id) => request('DELETE', `${path}/${id}`),
  };
}

export const api = {
  info: () => request('GET', ''),

  auth: {
    login: (login, password, deviceName) => request('POST', '/auth/login', { login, password, device_name: deviceName }),
    twoFactor: (challenge, code) => request('POST', '/auth/two-factor', { challenge, code }),
    logout: () => request('POST', '/auth/logout'),
  },

  /** Giriş yapan kullanıcının kendisi: profil, parola, kilit ekranı, 2FA. */
  me: {
    show: () => request('GET', '/me'),
    update: (payload) => request('PUT', '/me', payload),
    password: (payload) => request('PUT', '/me/password', payload),
    verifyPassword: (password) => request('POST', '/me/verify-password', { password }),
    twoFactorSetup: () => request('POST', '/me/two-factor/setup'),
    twoFactorConfirm: (code) => request('POST', '/me/two-factor/confirm', { code }),
    twoFactorDisable: (password) => request('DELETE', '/me/two-factor', { password }),
  },

  news: { ...resource('/news', { multipart: true }), categories: () => request('GET', '/news/categories'), reshare: (id) => request('POST', `/news/${id}/reshare`) },
  articles: { ...resource('/articles', { multipart: true }), categories: () => request('GET', '/articles/categories'), reshare: (id) => request('POST', `/articles/${id}/reshare`) },

  users: {
    ...resource('/users'),
    activate: (id) => request('POST', `/users/${id}/activate`),
    deactivate: (id) => request('POST', `/users/${id}/deactivate`),
    avatar: (id, file) => request('POST', `/users/${id}/avatar`, toFormData({ avatar: file })),
    setPassword: (id, password, confirmation) => request('PUT', `/users/${id}/password`, { password, password_confirmation: confirmation }),
  },

  comments: {
    list: (params = {}) => request('GET', `/comments${query(params)}`),
    logs: (id) => request('GET', `/comments/${id}/logs`),
    moderate: (id, status, reason = '') => request('POST', `/comments/${id}/moderate`, { status, reason }),
    ban: (id, payload) => request('POST', `/comments/${id}/ban`, payload),
    remove: (id) => request('DELETE', `/comments/${id}`),
  },

  inbox: {
    list: (params = {}) => request('GET', `/inbox${query(params)}`),
    show: (id) => request('GET', `/inbox/${id}`),
    reviewed: (id) => request('POST', `/inbox/${id}/reviewed`),
    unread: (id) => request('POST', `/inbox/${id}/unread`),
    reject: (id) => request('POST', `/inbox/${id}/reject`),
    remove: (id) => request('DELETE', `/inbox/${id}`),
    pollNow: () => request('POST', '/inbox/poll-now'),
  },

  forms: {
    list: () => request('GET', '/forms'),
    submissions: (formId, params = {}) => request('GET', `/forms/${formId}/submissions${query(params)}`),
    submission: (formId, id) => request('GET', `/forms/${formId}/submissions/${id}`),
    read: (formId, id) => request('POST', `/forms/${formId}/submissions/${id}/read`),
    unread: (formId, id) => request('POST', `/forms/${formId}/submissions/${id}/unread`),
    remove: (formId, id) => request('DELETE', `/forms/${formId}/submissions/${id}`),
  },

  pages: {
    list: (params = {}) => request('GET', `/pages${query(params)}`),
    publish: (id) => request('POST', `/pages/${id}/publish`),
    unpublish: (id) => request('POST', `/pages/${id}/unpublish`),
    remove: (id) => request('DELETE', `/pages/${id}`),
  },

  ads: {
    zones: () => request('GET', '/ads/zones'),
    updateZone: (id, payload) => request('PUT', `/ads/zones/${id}`, payload),
    toggleZone: (id) => request('POST', `/ads/zones/${id}/toggle`),
    list: (params = {}) => request('GET', `/ads/creatives${query(params)}`),
    show: (id) => request('GET', `/ads/creatives/${id}`),
    create: (payload) => request('POST', '/ads/creatives', toFormData(payload)),
    update: (id, payload) => request('POST', `/ads/creatives/${id}`, toFormData(payload, 'PUT')),
    remove: (id) => request('DELETE', `/ads/creatives/${id}`),
    toggleActive: (id) => request('POST', `/ads/creatives/${id}/toggle-active`),
    togglePaid: (id) => request('POST', `/ads/creatives/${id}/toggle-paid`),
    move: (id, direction) => request('POST', `/ads/creatives/${id}/move`, { direction }),
  },

  social: {
    shares: (params = {}) => request('GET', `/social/shares${query(params)}`),
    removeShare: (id) => request('DELETE', `/social/shares/${id}`),
    platforms: () => request('GET', '/social/platforms'),
    channels: () => request('GET', '/telegram/channels'),
    createChannel: (payload) => request('POST', '/telegram/channels', payload),
    updateChannel: (id, payload) => request('PUT', `/telegram/channels/${id}`, payload),
    removeChannel: (id) => request('DELETE', `/telegram/channels/${id}`),
  },

  /** Pano: içerik sayıları, anlık ziyaretçi ve temel servis durumu; ayrıntılı sunucu durumu izinle. */
  dashboard: () => request('GET', '/dashboard'),
  serverStatus: () => request('GET', '/server-status'),

  notifications: {
    list: () => request('GET', '/notifications'),
    read: (id) => request('POST', `/notifications/${id}/read`),
    readAll: () => request('POST', '/notifications/read-all'),
  },
};
