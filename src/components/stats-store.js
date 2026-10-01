// Pano verisi: Pano ekranı, kilit ekranı ve tepsi aynı veriyi kullanır (dakikada bir yenilenir).
import { api } from '../api/index.js';
import { setTrayTooltip } from '../core/desktop.js';

export const STAT_CARDS = [
  { key: 'live_visitors', label: 'Anlık ziyaretçi', hint: 'son 5 dakika' },
  { key: 'news_published', label: 'Yayındaki haber' },
  { key: 'news_today', label: 'Bugün eklenen haber' },
  { key: 'articles_published', label: 'Köşe yazısı' },
  { key: 'comments_pending', label: 'Onay bekleyen yorum', alert: true },
  { key: 'comments_approved', label: 'Onaylı yorum' },
  { key: 'inbox_unread', label: 'Okunmamış e-posta', alert: true },
  { key: 'forms_unread', label: 'Okunmamış form', alert: true },
];

export const SERVICES = [
  { key: 'queue', label: 'Kuyruk' },
  { key: 'scheduler', label: 'Zamanlayıcı' },
  { key: 'redis', label: 'Redis' },
  { key: 'reverb', label: 'Anlık bildirim (Reverb)' },
];

export const statsStore = {
  counts: {},
  services: {},
  updatedAt: null,
  error: '',
  timer: null,

  start() {
    this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), 60_000);
  },

  stop() {
    clearInterval(this.timer);
  },

  async refresh() {
    try {
      const data = await api.dashboard();
      this.counts = { ...data.counts, live_visitors: data.live_visitors };
      this.services = data.services || {};
      this.updatedAt = data.generated_at;
      this.error = '';
      this.updateTray();
    } catch (error) {
      this.error = error?.message || 'Pano yüklenemedi.';
    }
  },

  value(key) {
    const value = this.counts[key];

    return value === null || value === undefined ? '—' : Number(value).toLocaleString('tr-TR');
  },

  get allServicesUp() {
    return Object.values(this.services).every(Boolean);
  },

  updateTray() {
    const parts = [];
    if (this.counts.comments_pending) {
      parts.push(`${this.counts.comments_pending} bekleyen yorum`);
    }
    if (this.counts.inbox_unread) {
      parts.push(`${this.counts.inbox_unread} okunmamış e-posta`);
    }
    if (this.counts.live_visitors !== null && this.counts.live_visitors !== undefined) {
      parts.push(`${this.counts.live_visitors} çevrimiçi`);
    }
    if (!this.allServicesUp) {
      parts.push('⚠ servis sorunu');
    }
    setTrayTooltip(parts.length ? `YTNewsCore — ${parts.join(' · ')}` : 'YTNewsCore');
  },
};
