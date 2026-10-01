// Haberler ve Köşe Yazıları: aynı tablo, farklı uç. Ekleme/düzenleme sitenin kendi formunda
// (editör, Smart Tag, etiket, yazar, haber tipi, slug birebir aynı) ayrı pencerede açılır.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { openPanelPage } from '../core/panel.js';
import { paginatedList } from './list.js';

const KINDS = {
  news: {
    api: api.news,
    singular: 'Haber',
    permissionPrefix: 'news',
    panelPath: '/admin/news',
    flags: [
      { key: 'is_breaking', label: 'Son Dakika' },
      { key: 'is_featured', label: 'Manşet' },
      { key: 'is_top_featured', label: 'Sürmanşet' },
    ],
  },
  articles: {
    api: api.articles,
    singular: 'Köşe Yazısı',
    permissionPrefix: 'article',
    panelPath: '/admin/articles',
    flags: [{ key: 'is_top_featured', label: 'Öne Çıkan' }],
  },
};

const STATUS_BADGE = { published: 'badge-green', pending_review: 'badge-amber', draft: 'badge-slate' };

export function contentSection(kind) {
  const config = KINDS[kind];

  return {
    ...paginatedList((params) => config.api.list(params), { filters: { status: '', category_id: '' } }),

    kind,
    singular: config.singular,
    flags: config.flags,
    categories: [],
    opening: false,

    init() {
      this.$watch('$store.ui.section', (section) => section === kind && !this.loaded && this.open());
      if (this.$store.ui.section === kind) {
        this.open();
      }
    },

    async open() {
      await Promise.all([this.load(1), this.loadCategories()]);
    },

    async loadCategories() {
      try {
        this.categories = (await config.api.categories())?.data ?? [];
      } catch {
        this.categories = [];
      }
    },

    statusBadge: (status) => STATUS_BADGE[status] || 'badge-slate',
    formatDate,

    /** can('create') → news.create / article.create */
    can(action) {
      return this.$store.auth.can(`${config.permissionPrefix}.${action}`);
    },

    openCreate() {
      return this.openPanel(`${config.panelPath}/create`, `Yeni ${this.singular}`);
    },

    openEdit(item) {
      return this.openPanel(`${config.panelPath}/${item.id}/edit`, item.title);
    },

    /** Pencere kapanınca liste yenilenir. */
    async openPanel(path, title) {
      this.opening = true;
      try {
        const closed = openPanelPage(path, title);
        this.opening = false;
        await closed;
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.opening = false;
      }
    },

    async reshare(item) {
      if (!(await this.$store.ui.confirm(`"${item.title}" bağlı platformlarda ve Telegram kanallarında yeniden paylaşılsın mı?`))) {
        return;
      }
      try {
        this.$store.ui.notify('success', (await config.api.reshare(item.id)).message);
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async remove(item) {
      if (!(await this.$store.ui.confirm(`"${item.title}" çöp kutusuna taşınsın mı?`))) {
        return;
      }
      try {
        await config.api.remove(item.id);
        this.$store.ui.notify('success', `${this.singular} silindi.`);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },
  };
}
