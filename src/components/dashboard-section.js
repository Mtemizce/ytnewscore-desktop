// Pano: içerik sayıları (stats deposu) + sunucu durumu ayrıntısı (izin varsa).
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { SERVICES, STAT_CARDS } from './stats-store.js';

export function dashboardSection() {
  return {
    cards: STAT_CARDS,
    services: SERVICES,
    server: null,
    serverError: '',

    formatDate,

    init() {
      this.$watch('$store.ui.section', (section) => section === 'dashboard' && this.refresh());
      // İzinler girişten sonra /me ile gelir; gelince sunucu ayrıntısı da yüklenir.
      this.$watch('$store.auth.user', () => this.$store.ui.section === 'dashboard' && this.loadServer());
      if (this.$store.ui.section === 'dashboard') {
        this.refresh();
      }
    },

    refresh() {
      this.$store.stats.refresh();
      this.loadServer();
    },

    async loadServer() {
      if (!this.$store.auth.can('backend.system-maintenance.view')) {
        return;
      }
      try {
        this.server = (await api.serverStatus()).data;
        this.serverError = '';
      } catch (error) {
        this.serverError = errorMessage(error);
      }
    },

    bytes(value) {
      if (value === null || value === undefined) {
        return '—';
      }
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = Number(value);
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
      }

      return `${size.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${units[unit]}`;
    },

    diskPercent() {
      const disk = this.server?.disk;

      return disk?.total ? Math.round(((disk.total - disk.free) / disk.total) * 100) : 0;
    },
  };
}
