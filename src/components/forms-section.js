// İletişim Formları: formlar · gönderiler · gönderi ayrıntısı. Alanları düzenlemek panelde.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { openPanelPage } from '../core/panel.js';
import { paginatedList } from './list.js';

export function formsSection() {
  // Yükleyici seçili formu nesnenin kendisinden okur (Alpine aynı nesneyi sarar).
  const section = {
    ...paginatedList((params) => (section.formId ? api.forms.submissions(section.formId, params) : Promise.resolve({ data: [], meta: {} }))),

    forms: [],
    formId: null,
    selected: null,
    loadingItem: false,

    formatDate,

    init() {
      this.$watch('$store.ui.section', (section) => section === 'forms' && this.loadForms());
      if (this.$store.ui.section === 'forms') {
        this.loadForms();
      }
    },

    async loadForms() {
      try {
        this.forms = (await api.forms.list()).data;
        if (!this.formId && this.forms.length) {
          this.selectForm(this.forms[0].id);
        } else if (this.formId) {
          this.reload();
        }
      } catch (error) {
        this.listError = errorMessage(error);
      }
    },

    selectForm(id) {
      this.formId = id;
      this.selected = null;
      this.load(1);
    },

    get currentForm() {
      return this.forms.find((f) => f.id === this.formId);
    },

    async open(row) {
      this.loadingItem = true;
      try {
        this.selected = (await api.forms.submission(this.formId, row.id)).data;
        if (!row.is_read) {
          row.is_read = true;
          this.bumpUnread(-1);
        }
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.loadingItem = false;
      }
    },

    bumpUnread(delta) {
      const form = this.currentForm;
      if (form) {
        form.unread = Math.max(0, form.unread + delta);
      }
    },

    async markUnread() {
      try {
        await api.forms.unread(this.formId, this.selected.id);
        this.bumpUnread(1);
        this.selected = null;
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async remove() {
      if (!(await this.$store.ui.confirm('Bu gönderi silinsin mi?'))) {
        return;
      }
      try {
        await api.forms.remove(this.formId, this.selected.id);
        this.selected = null;
        this.$store.ui.notify('success', 'Gönderi silindi.');
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async editForm() {
      try {
        await openPanelPage(`/admin/forms/${this.formId}/fields`, this.currentForm?.name || 'Form');
        await this.loadForms();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    copy(text) {
      navigator.clipboard?.writeText(text);
      this.$store.ui.notify('success', 'Kopyalandı.');
    },

    display(value) {
      if (value === null || value === undefined || value === '') {
        return '—';
      }

      return Array.isArray(value) ? value.join(', ') : String(value);
    },
  };

  return section;
}
