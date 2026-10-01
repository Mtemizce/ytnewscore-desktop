// Yorumlar: panelin Moderasyon Kuyruğu ile aynı düzen — durum kutuları, süzgeçler, tablo,
// satır menüsü (Onayla/Reddet/Spam/Onayı Geri Al/Geçmiş/Yasakla/Sil), ayrıntı ve geçmiş pencereleri.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { paginatedList } from './list.js';

export const COMMENT_STATUSES = [
  { key: 'pending', label: 'Bekleyen', tone: 'amber', icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { key: 'approved', label: 'Onaylanan', tone: 'green', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { key: 'rejected', label: 'Reddedilen', tone: 'red', icon: 'm9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { key: 'spam', label: 'Spam', tone: 'violet', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z' },
];

const STATUS_BADGE = { approved: 'badge-green', pending: 'badge-amber', rejected: 'badge-red', spam: 'badge-violet' };
const SOURCE_LABEL = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube' };

export function commentsSection() {
  return {
    ...paginatedList((params) => api.comments.list(params), { filters: { status: 'pending', type: '' } }),

    statuses: COMMENT_STATUSES,
    menuFor: null,
    detail: null,
    logs: null,
    logsFor: '',
    banTarget: null,
    ban: { ban_ip: true, ban_email: true, reason: '' },
    busy: false,

    formatDate,
    statusBadge: (status) => STATUS_BADGE[status] || 'badge-slate',
    sourceLabel: (source) => SOURCE_LABEL[source] || source,
    short: (text, length = 60) => (text && text.length > length ? `${text.slice(0, length)}…` : text || ''),

    init() {
      this.$watch('$store.ui.section', (section) => section === 'comments' && this.load(1));
      if (this.$store.ui.section === 'comments') {
        this.load(1);
      }
    },

    count(key) {
      return (this.meta.counts || {})[key] ?? 0;
    },

    setStatus(key) {
      this.filters.status = this.filters.status === key ? 'all' : key;
      this.refilter();
    },

    toggleMenu(id) {
      this.menuFor = this.menuFor === id ? null : id;
    },

    async moderate(comment, status, question = null) {
      this.menuFor = null;
      if (question && !(await this.$store.ui.confirm(question))) {
        return;
      }
      this.busy = true;
      try {
        this.$store.ui.notify('success', (await api.comments.moderate(comment.id, status)).message);
        this.detail = null;
        await this.reload();
        this.$store.stats.refresh();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.busy = false;
      }
    },

    approve(comment) {
      return this.moderate(comment, 'approved', 'Yorum onaylanacak ve yazarına bilgilendirme e-postası gönderilecek. Onaylıyor musunuz?');
    },

    unapprove(comment) {
      return this.moderate(comment, 'pending', 'Yorumun onayı geri alınacak, tekrar bekleyen duruma alınacak ve yayından kaldırılacak. Devam edilsin mi?');
    },

    async remove(comment) {
      this.menuFor = null;
      if (!(await this.$store.ui.confirm(`${comment.author_name} adlı okurun yorumu silinsin mi?`))) {
        return;
      }
      try {
        await api.comments.remove(comment.id);
        this.$store.ui.notify('success', 'Yorum silindi.');
        this.detail = null;
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async openLogs(comment) {
      this.menuFor = null;
      this.logsFor = comment.author_name;
      this.logs = [];
      try {
        this.logs = (await api.comments.logs(comment.id)).data;
      } catch (error) {
        this.logs = null;
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    openBan(comment) {
      this.menuFor = null;
      this.banTarget = comment;
      this.ban = { ban_ip: Boolean(comment.author_ip), ban_email: Boolean(comment.author_email), reason: '' };
    },

    async confirmBan() {
      this.busy = true;
      try {
        this.$store.ui.notify('success', (await api.comments.ban(this.banTarget.id, this.ban)).message);
        this.banTarget = null;
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.busy = false;
      }
    },

    copy(text) {
      navigator.clipboard?.writeText(text);
      this.$store.ui.notify('success', 'Adres kopyalandı.');
    },
  };
}
