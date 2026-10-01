// Profilim: kişisel bilgiler, profil resmi, parola ve iki adımlı doğrulama (sitedeki Profil ile aynı kurallar).
import { api } from '../api/index.js';
import { errorMessage, initials } from '../core/format.js';

export function profileSection() {
  return {
    form: { name: '', username: '', email: '', phone: '', telegram_id: '' },
    formErrors: {},
    saving: false,
    avatarUploading: false,

    password: { current_password: '', password: '', password_confirmation: '' },
    passwordErrors: {},
    passwordSaving: false,

    twoFactorSetup: null, // { secret, qr_code }
    twoFactorCode: '',
    recoveryCodes: [],
    disablePassword: '',
    twoFactorError: '',
    twoFactorBusy: false,

    initials,

    init() {
      this.$watch('$store.auth.user', () => this.fill());
      this.fill();
    },

    get user() {
      return this.$store.auth.user;
    },

    fill() {
      Object.keys(this.form).forEach((key) => { this.form[key] = this.user?.[key] ?? ''; });
    },

    async save() {
      this.saving = true;
      this.formErrors = {};
      try {
        const response = await api.me.update(this.form);
        this.$store.auth.set(response.data);
        this.$store.ui.notify('success', 'Profil güncellendi.');
      } catch (error) {
        this.formErrors = error.errors || {};
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.saving = false;
      }
    },

    async uploadAvatar(event) {
      const [file] = event.target.files;
      event.target.value = '';
      if (!file) {
        return;
      }
      this.avatarUploading = true;
      try {
        await api.users.avatar(this.user.id, file);
        this.$store.auth.set((await api.me.show()).data);
        this.$store.ui.notify('success', 'Profil resmi güncellendi.');
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.avatarUploading = false;
      }
    },

    async changePassword() {
      this.passwordSaving = true;
      this.passwordErrors = {};
      try {
        await api.me.password(this.password);
        this.password = { current_password: '', password: '', password_confirmation: '' };
        this.$store.ui.notify('success', 'Parolanız güncellendi.');
      } catch (error) {
        this.passwordErrors = error.errors || {};
      } finally {
        this.passwordSaving = false;
      }
    },

    async startTwoFactor() {
      await this.twoFactorStep(async () => {
        this.twoFactorSetup = await api.me.twoFactorSetup();
        this.twoFactorCode = '';
      });
    },

    async confirmTwoFactor() {
      await this.twoFactorStep(async () => {
        const response = await api.me.twoFactorConfirm(this.twoFactorCode.trim());
        this.recoveryCodes = response.recovery_codes;
        this.twoFactorSetup = null;
        this.$store.auth.set(response.data);
        this.$store.ui.notify('success', 'İki adımlı doğrulama açıldı.');
      });
    },

    async disableTwoFactor() {
      await this.twoFactorStep(async () => {
        const response = await api.me.twoFactorDisable(this.disablePassword);
        this.disablePassword = '';
        this.recoveryCodes = [];
        this.$store.auth.set(response.data);
        this.$store.ui.notify('success', 'İki adımlı doğrulama kapatıldı.');
      });
    },

    async twoFactorStep(action) {
      this.twoFactorBusy = true;
      this.twoFactorError = '';
      try {
        await action();
      } catch (error) {
        this.twoFactorError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      } finally {
        this.twoFactorBusy = false;
      }
    },

    copyRecoveryCodes() {
      navigator.clipboard?.writeText(this.recoveryCodes.join('\n'));
      this.$store.ui.notify('success', 'Kurtarma kodları kopyalandı.');
    },

    fieldError(errors, field) {
      return (errors[field] || [])[0] || '';
    },
  };
}
