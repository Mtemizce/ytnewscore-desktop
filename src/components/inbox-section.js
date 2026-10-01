// Gelen Kutusu: hesaplar · liste · okuma bölmesi. Ekler ve "Habere Dönüştür" panelin detay sayfasında.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { openPanelPage } from '../core/panel.js';
import { paginatedList } from './list.js';

const STATUS_BADGE = { pending: 'badge-amber', reviewed: 'badge-green', converted: 'badge-indigo', rejected: 'badge-slate' };

export function inboxSection() {
  return {
    ...paginatedList((params) => api.inbox.list(params), { filters: { mail_account_id: '', status: '' } }),

    selected: null,
    loadingItem: false,

    formatDate,
    statusBadge: (status) => STATUS_BADGE[status] || 'badge-slate',
    formatSize: (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`),

    init() {
      this.$watch('$store.ui.section', (section) => section === 'inbox' && this.load(1));
      if (this.$store.ui.section === 'inbox') {
        this.load(1);
      }
    },

    selectAccount(id) {
      this.filters.mail_account_id = id;
      this.selected = null;
      this.refilter();
    },

    async open(item) {
      this.loadingItem = true;
      try {
        this.selected = (await api.inbox.show(item.id)).data;
        item.is_read = true;
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.loadingItem = false;
      }
    },

    async act(action, message = null) {
      const id = this.selected.id;
      try {
        const response = await api.inbox[action](id);
        this.$store.ui.notify('success', message || response?.message || 'Tamam.');
        if (action === 'remove') {
          this.selected = null;
        } else {
          this.selected = (await api.inbox.show(id)).data;
        }
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async remove() {
      if (await this.$store.ui.confirm(`"${this.selected.subject || '(Konusuz)'}" silinsin mi?`)) {
        await this.act('remove', 'Silindi.');
      }
    },

    async pollNow() {
      try {
        this.$store.ui.notify('success', (await api.inbox.pollNow()).message);
        setTimeout(() => this.reload(), 8000);
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async openInPanel() {
      try {
        await openPanelPage(`/admin/ingestion/${this.selected.id}`, this.selected.subject || 'Gelen Kutusu');
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },
  };
}
