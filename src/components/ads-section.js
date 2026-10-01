// Reklamlar: reklam listesi (istatistik, aktif/ücretli, sıra) + ekle/düzenle formu; Alanlar sekmesi.
import { api } from '../api/index.js';
import { errorMessage, formatDate, toLocalInput } from '../core/format.js';
import { paginatedList } from './list.js';

export const TARGET_PAGES = [
  { key: 'all', label: 'Tüm sayfalar' },
  { key: 'homepage', label: 'Anasayfa' },
  { key: 'news', label: 'Haber detay' },
  { key: 'article', label: 'Köşe yazısı' },
  { key: 'pages', label: 'Sabit sayfalar' },
];

function emptyForm(zoneId = '') {
  return {
    ad_zone_id: zoneId, title: '', advertiser_name: '', is_paid: false, is_active: true, type: 'image',
    image_source: 'upload', image_url: '', html_content: '', target_url: '',
    starts_at: '', ends_at: '', impression_limit: '', click_limit: '', target_pages: ['all'],
  };
}

export function adsSection() {
  return {
    ...paginatedList((params) => api.ads.list(params), { filters: { ad_zone_id: '', state: '' } }),

    tab: 'creatives',
    zones: [],
    targetPages: TARGET_PAGES,

    modalOpen: false,
    editingId: null,
    form: emptyForm(),
    imageFile: null,
    imagePreview: null,
    formErrors: {},
    saving: false,

    zoneEdit: null,

    formatDate,

    init() {
      this.$watch('$store.ui.section', (section) => section === 'ads' && this.open());
      if (this.$store.ui.section === 'ads') {
        this.open();
      }
    },

    async open() {
      await Promise.all([this.loadZones(), this.load(1)]);
    },

    async loadZones() {
      try {
        this.zones = (await api.ads.zones()).data;
      } catch (error) {
        this.listError = errorMessage(error);
      }
    },

    can: function (action) {
      return this.$store.auth.can(`ads.${action}`);
    },

    period(ad) {
      if (!ad.starts_at && !ad.ends_at) {
        return 'Süresiz';
      }

      return `${ad.starts_at ? formatDate(ad.starts_at) : '…'} – ${ad.ends_at ? formatDate(ad.ends_at) : '…'}`;
    },

    // --- Form -----------------------------------------------------------------

    openCreate() {
      this.editingId = null;
      this.form = emptyForm(this.filters.ad_zone_id || this.zones[0]?.id || '');
      this.imageFile = null;
      this.imagePreview = null;
      this.formErrors = {};
      this.modalOpen = true;
    },

    openEdit(ad) {
      this.openCreate();
      this.editingId = ad.id;
      Object.keys(this.form).forEach((key) => {
        if (key in ad && ad[key] !== null) {
          this.form[key] = ad[key];
        }
      });
      this.form.starts_at = toLocalInput(ad.starts_at);
      this.form.ends_at = toLocalInput(ad.ends_at);
      this.form.image_source = ad.image_source || (ad.media_asset_id ? 'upload' : 'url');
      this.form.target_pages = ad.target_pages?.length ? [...ad.target_pages] : ['all'];
      this.imagePreview = ad.display_image_url;
    },

    pickImage(event) {
      const [file] = event.target.files;
      this.imageFile = file ?? null;
      if (file) {
        this.imagePreview = URL.createObjectURL(file);
      }
    },

    toggleTarget(key) {
      const pages = new Set(this.form.target_pages);
      if (key === 'all') {
        this.form.target_pages = ['all'];

        return;
      }
      pages.delete('all');
      pages.has(key) ? pages.delete(key) : pages.add(key);
      this.form.target_pages = pages.size ? [...pages] : ['all'];
    },

    payload() {
      const f = this.form;
      const payload = {
        title: f.title, advertiser_name: f.advertiser_name, is_paid: f.is_paid, is_active: f.is_active, type: f.type,
        target_url: f.target_url, starts_at: f.starts_at, ends_at: f.ends_at,
        impression_limit: f.impression_limit, click_limit: f.click_limit, target_pages: f.target_pages,
      };
      if (!this.editingId) {
        payload.ad_zone_id = f.ad_zone_id;
      }
      if (f.type === 'html') {
        payload.html_content = f.html_content;
      } else {
        payload.image_source = f.image_source;
        if (f.image_source === 'url') {
          payload.image_url = f.image_url;
        } else if (this.imageFile) {
          payload.image = this.imageFile;
        }
      }

      return payload;
    },

    async save() {
      this.saving = true;
      this.formErrors = {};
      try {
        if (this.editingId) {
          await api.ads.update(this.editingId, this.payload());
        } else {
          await api.ads.create(this.payload());
        }
        this.$store.ui.notify('success', 'Reklam kaydedildi.');
        this.modalOpen = false;
        await Promise.all([this.reload(), this.loadZones()]);
      } catch (error) {
        this.formErrors = error.errors || {};
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.saving = false;
      }
    },

    fieldError(field) {
      return (this.formErrors[field] || this.formErrors[`${field}.0`] || [])[0] || '';
    },

    // --- Satır işlemleri ---------------------------------------------------------

    async run(action, ...args) {
      try {
        await api.ads[action](...args);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async remove(ad) {
      if (await this.$store.ui.confirm(`"${ad.title}" reklamı silinsin mi?`)) {
        await this.run('remove', ad.id);
        await this.loadZones();
      }
    },

    // --- Alanlar ------------------------------------------------------------------

    editZone(zone) {
      this.zoneEdit = { id: zone.id, name: zone.name, description: zone.description || '', skeleton_text: zone.skeleton_text || '' };
    },

    async saveZone() {
      try {
        await api.ads.updateZone(this.zoneEdit.id, this.zoneEdit);
        this.zoneEdit = null;
        this.$store.ui.notify('success', 'Alan güncellendi.');
        await this.loadZones();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async toggleZone(zone) {
      try {
        await api.ads.toggleZone(zone.id);
        await this.loadZones();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },
  };
}
