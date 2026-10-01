// Sayfalı tablo mantığı: arama, süzgeç, sayfa boyutu, toplam ve sayfa düğmeleri.
// Bölümler bunu kendi nesnelerine yayar: { ...paginatedList(fetcher), ... }.
import { errorMessage } from '../core/format.js';

export function paginatedList(fetcher, { filters = {}, perPage = 25 } = {}) {
  return {
    items: [],
    meta: { current_page: 1, last_page: 1, per_page: perPage, total: 0 },
    perPage,
    search: '',
    filters: { ...filters },
    loading: false,
    loaded: false,
    listError: '',
    searchTimer: null,

    async load(page = this.meta.current_page) {
      this.loading = true;
      this.listError = '';
      try {
        const response = await fetcher({ page, per_page: this.perPage, search: this.search.trim(), ...this.filters });
        this.items = response?.data ?? [];
        this.meta = { ...this.meta, ...(response?.meta ?? {}) };
        this.loaded = true;
      } catch (error) {
        this.listError = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },

    reload() {
      return this.load(this.meta.current_page);
    },

    /** Arama ve süzgeçler ilk sayfadan başlar; yazarken 300 ms bekler. */
    refilter(debounce = false) {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.load(1), debounce ? 300 : 0);
    },

    goTo(page) {
      if (page >= 1 && page <= this.meta.last_page && page !== this.meta.current_page) {
        this.load(page);
      }
    },

    /** 1 … 4 5 [6] 7 8 … 20 */
    pages() {
      const { current_page: current, last_page: last } = this.meta;
      const set = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
      const sorted = [...set].sort((a, b) => a - b);
      const result = [];
      sorted.forEach((page, index) => {
        if (index && page - sorted[index - 1] > 1) {
          result.push('…');
        }
        result.push(page);
      });

      return result;
    },

    rangeText() {
      const { current_page: page, per_page: size, total } = this.meta;
      if (!total) {
        return 'Kayıt yok';
      }
      const from = (page - 1) * size + 1;
      const to = Math.min(page * size, total);

      return `${total.toLocaleString('tr-TR')} kayıttan ${from}–${to} arası`;
    },
  };
}
