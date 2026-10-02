// Hesap güvenliği penceresi: authenticator ile iki adımlı doğrulamayı kurma/kapatma ve "Telegram ile
// giriş doğrulaması"nı açma/kapatma. Etkin hesabın token'ıyla çalışır; her iki yöntemi de
// kapatmak için parola ister. Telegram'ı açmak, bağlı Telegram'da bir kez onay gerektirir.
import { api } from '../api/index.js';
import { deviceName } from '../core/device.js';
import { errorMessage } from '../core/format.js';
import { accounts } from '../core/session.js';

const TELEGRAM_WAIT_MS = 200_000;

const emptyTwoFactor = () => ({ step: 'idle', qr: '', secret: '', code: '', password: '', recovery: [], busy: false, error: '' });
const emptyTelegram = () => ({ password: '', waiting: false, message: '', busy: false, error: '' });

export function securityPanel() {
  return {
    me: accounts.active()?.user ?? null,
    twoFactor: emptyTwoFactor(),
    telegram: emptyTelegram(),
    timer: null,

    async init() {
      await this.reload();
    },

    /** Alpine, bileşen DOM'dan kalkınca çağırır. */
    destroy() {
      clearInterval(this.timer);
    },

    /** Sunucudaki gerçek durumu okur ve hesap kartındaki kullanıcıyı da tazeler. */
    async reload() {
      try {
        const response = await api.me.show();
        this.me = response.data;
        const active = accounts.active();
        if (active) {
          accounts.update(active.id, { user: response.data });
          window.dispatchEvent(new CustomEvent('profile-updated'));
        }
      } catch (error) {
        this.twoFactor.error = errorMessage(error);
      }
    },

    firstError(error) {
      return Object.values(error.errors || {}).flat()[0] || errorMessage(error);
    },

    // --- Authenticator (iki adımlı doğrulama) ----------------------------------------------

    async startTwoFactor() {
      this.twoFactor = { ...emptyTwoFactor(), busy: true };
      try {
        const setup = await api.me.twoFactorSetup();
        this.twoFactor = { ...emptyTwoFactor(), step: 'setup', qr: setup.qr_code, secret: setup.secret };
      } catch (error) {
        this.twoFactor = { ...emptyTwoFactor(), error: this.firstError(error) };
      }
    },

    async confirmTwoFactor() {
      this.twoFactor.busy = true;
      this.twoFactor.error = '';
      try {
        const result = await api.me.twoFactorConfirm(this.twoFactor.code.trim());
        this.twoFactor = { ...emptyTwoFactor(), step: 'codes', recovery: result.recovery_codes ?? [] };
        await this.reload();
      } catch (error) {
        this.twoFactor.error = this.firstError(error);
        this.twoFactor.busy = false;
      }
    },

    cancelTwoFactor() {
      this.twoFactor = emptyTwoFactor();
    },

    async copyRecoveryCodes() {
      try {
        await navigator.clipboard.writeText(this.twoFactor.recovery.join('\n'));
        this.$store.ui.notify('success', 'Kurtarma kodları panoya kopyalandı.');
      } catch {
        this.$store.ui.notify('error', 'Kopyalanamadı; kodları elle not alın.');
      }
    },

    async disableTwoFactor() {
      this.twoFactor.busy = true;
      this.twoFactor.error = '';
      try {
        await api.me.twoFactorDisable(this.twoFactor.password);
        this.twoFactor = emptyTwoFactor();
        this.$store.ui.notify('success', 'İki adımlı doğrulama kapatıldı.');
        await this.reload();
      } catch (error) {
        this.twoFactor.error = this.firstError(error);
        this.twoFactor.busy = false;
      }
    },

    // --- Telegram ile giriş doğrulaması ------------------------------------------------------

    get canEnableTelegram() {
      return Boolean(this.me?.telegram_id);
    },

    /** Parolayı doğrular ve bağlı Telegram'a onay sorusu gönderir; onay gelene kadar yoklar. */
    async enableTelegram() {
      clearInterval(this.timer);
      this.telegram.busy = true;
      this.telegram.error = '';
      try {
        const started = await api.me.telegramLoginStart(this.telegram.password, await deviceName());
        this.telegram = { ...emptyTelegram(), waiting: true, message: "Telegram'daki isteği onaylayın (yalnız Telegram'dan onaylanır); 3 dakika içinde." };
        const stopAt = Date.now() + TELEGRAM_WAIT_MS;
        this.timer = setInterval(() => this.pollTelegram(started, stopAt), 2000);
      } catch (error) {
        this.telegram.error = this.firstError(error);
        this.telegram.busy = false;
      }
    },

    async pollTelegram(started, stopAt) {
      const stop = (error) => {
        clearInterval(this.timer);
        this.telegram = { ...emptyTelegram(), error };
      };
      if (Date.now() > stopAt) {
        stop('Süre doldu. Yeniden deneyebilirsiniz.');

        return;
      }
      try {
        const result = await api.me.telegramLoginStatus(started.approval_id, started.secret);
        if (result.status === 'pending') {
          return;
        }
        if (result.status === 'enabled') {
          clearInterval(this.timer);
          this.telegram = emptyTelegram();
          this.$store.ui.notify('success', 'Telegram ile giriş doğrulaması açıldı.');
          await this.reload();

          return;
        }
        stop(result.status === 'rejected' ? 'İstek Telegram’da reddedildi.' : 'İstek sona erdi. Yeniden deneyebilirsiniz.');
      } catch {
        // Ağ dalgalanması: sonraki tur dener.
      }
    },

    cancelTelegram() {
      clearInterval(this.timer);
      this.telegram = emptyTelegram();
    },

    async disableTelegram() {
      this.telegram.busy = true;
      this.telegram.error = '';
      try {
        await api.me.telegramLoginDisable(this.telegram.password);
        this.telegram = emptyTelegram();
        this.$store.ui.notify('success', 'Telegram ile giriş doğrulaması kapatıldı.');
        await this.reload();
      } catch (error) {
        this.telegram.error = this.firstError(error);
        this.telegram.busy = false;
      }
    },
  };
}
