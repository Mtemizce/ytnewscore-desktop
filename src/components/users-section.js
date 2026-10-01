// Kullanıcılar: liste, ekle/düzenle, aktif/pasif, profil resmi.
import { api } from '../api/index.js';
import { errorMessage, formatDate, initials } from '../core/format.js';
import { paginatedList } from './list.js';

const emptyForm = () => ({ name: '', username: '', email: '', phone: '', telegram_id: '' });

export function usersSection() {
  return {
    ...paginatedList((params) => api.users.list(params)),

    modalOpen: false,
    editingId: null,
    form: emptyForm(),
    avatarFile: null,
    avatarPreview: null,
    newPassword: '',
    newPasswordConfirm: '',
    formErrors: {},
    saving: false,

    initials,
    formatDate,

    init() {
      this.$watch('$store.ui.section', (section) => section === 'users' && !this.loaded && this.load(1));
      if (this.$store.ui.section === 'users') {
        this.load(1);
      }
    },

    openCreate() {
      this.editingId = null;
      this.form = emptyForm();
      this.avatarFile = null;
      this.avatarPreview = null;
      this.newPassword = '';
      this.newPasswordConfirm = '';
      this.formErrors = {};
      this.modalOpen = true;
    },

    openEdit(user) {
      this.openCreate();
      this.editingId = user.id;
      Object.keys(this.form).forEach((key) => { this.form[key] = user[key] ?? ''; });
      this.avatarPreview = user.avatar_url;
    },

    pickAvatar(event) {
      const [file] = event.target.files;
      this.avatarFile = file ?? null;
      if (file) {
        this.avatarPreview = URL.createObjectURL(file);
      }
    },

    async save() {
      this.saving = true;
      this.formErrors = {};
      try {
        const response = this.editingId
          ? await api.users.update(this.editingId, this.form)
          : await api.users.create(this.form);
        const userId = response?.data?.id ?? this.editingId;
        if (this.avatarFile && userId) {
          await api.users.avatar(userId, this.avatarFile);
        }
        // Yönetici başka birinin şifresini belirler; kişi ilk girişte değiştirir.
        if (this.editingId && this.newPassword) {
          await api.users.setPassword(this.editingId, this.newPassword, this.newPasswordConfirm);
        }
        this.$store.ui.notify('success', this.editingId ? 'Kullanıcı güncellendi.' : 'Kullanıcı oluşturuldu; geçici şifre panelde Kullanıcılar sayfasında görünür.');
        this.modalOpen = false;
        await this.reload();
      } catch (error) {
        this.formErrors = error.errors || {};
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.saving = false;
      }
    },

    async toggleActive(user) {
      const question = user.deactivated
        ? `${user.name} yeniden etkinleştirilsin mi?`
        : `${user.name} pasifleştirilsin mi? Panele ve API'ye giriş yapamaz.`;
      if (!(await this.$store.ui.confirm(question))) {
        return;
      }
      try {
        await (user.deactivated ? api.users.activate(user.id) : api.users.deactivate(user.id));
        this.$store.ui.notify('success', 'Kullanıcı durumu güncellendi.');
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    fieldError(field) {
      return (this.formErrors[field] || [])[0] || '';
    },
  };
}
