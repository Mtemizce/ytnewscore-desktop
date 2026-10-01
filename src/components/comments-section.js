// Yorumlar: moderasyon kuyruğu (durum sekmeleri + sayılar), onayla/reddet/spam, sil, yasakla.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { paginatedList } from './list.js';

export const COMMENT_TABS = [
  { key: 'pending', label: 'Bekleyen' },
  { key: 'approved', label: 'Onaylı' },
  { key: 'rejected', label: 'Reddedilen' },
  { key: 'spam', label: 'Spam' },
  { key: 'all', label: 'Tümü' },
];

const STATUS_BADGE = { approved: 'badge-green', pending: 'badge-amber', rejected: 'badge-slate', spam: 'badge-red' };

export function commentsSection() {
  return {
    ...paginatedList((params) => api.comments.list(params), { filters: { status: 'pending' } }),

    tabs: COMMENT_TABS,
    busyId: null,
    expanded: {},
    banTarget: null,
    ban: { ban_ip: true, ban_email: true, reason: '' },
    banning: false,

    formatDate,
    statusBadge: (status) => STATUS_BADGE[status] || 'badge-slate',

    init() {
      this.$watch('$store.ui.section', (section) => section === 'comments' && this.load(1));
      if (this.$store.ui.section === 'comments') {
        this.load(1);
      }
    },

    count(tab) {
      const counts = this.meta.counts || {};

      return tab === 'all' ? Object.values(counts).reduce((sum, n) => sum + n, 0) : (counts[tab] ?? 0);
    },

    setTab(tab) {
      this.filters.status = tab;
      this.refilter();
    },

    async moderate(comment, status) {
      this.busyId = comment.id;
      try {
        const response = await api.comments.moderate(comment.id, status);
        this.$store.ui.notify('success', response.message);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.busyId = null;
      }
    },

    async remove(comment) {
      if (!(await this.$store.ui.confirm(`${comment.author_name} adlı okurun yorumu silinsin mi?`))) {
        return;
      }
      try {
        await api.comments.remove(comment.id);
        this.$store.ui.notify('success', 'Yorum silindi.');
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    openBan(comment) {
      this.banTarget = comment;
      this.ban = { ban_ip: Boolean(comment.author_ip), ban_email: Boolean(comment.author_email), reason: '' };
    },

    async confirmBan() {
      this.banning = true;
      try {
        const response = await api.comments.ban(this.banTarget.id, this.ban);
        this.$store.ui.notify('success', response.message);
        this.banTarget = null;
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.banning = false;
      }
    },

    copy(text) {
      navigator.clipboard?.writeText(text);
      this.$store.ui.notify('success', 'Adres kopyalandı.');
    },
  };
}
