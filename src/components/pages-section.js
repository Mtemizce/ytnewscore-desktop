// Sabit Sayfalar: liste, yayınla/kaldır, sil. Ekleme ve düzenleme panelin kendi formunda.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { openPanelPage } from '../core/panel.js';
import { paginatedList } from './list.js';

export function pagesSection() {
  return {
    ...paginatedList((params) => api.pages.list(params), { filters: { status: '' } }),

    formatDate,

    init() {
      this.$watch('$store.ui.section', (section) => section === 'pages' && !this.loaded && this.load(1));
      if (this.$store.ui.section === 'pages') {
        this.load(1);
      }
    },

    async openPanel(path, title) {
      try {
        await openPanelPage(path, title);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async toggle(page) {
      try {
        const response = page.status === 'published' ? await api.pages.unpublish(page.id) : await api.pages.publish(page.id);
        this.$store.ui.notify('success', response.message);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async remove(page) {
      if (!(await this.$store.ui.confirm(`"${page.title}" sayfası silinsin mi?`))) {
        return;
      }
      try {
        await api.pages.remove(page.id);
        this.$store.ui.notify('success', 'Sayfa silindi.');
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },
  };
}
