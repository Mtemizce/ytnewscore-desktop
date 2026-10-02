// Kabuk: hesap seçici (çok site/hesap, 2FA ya da Telegram onayıyla ekleme), hesap güvenliği, panel penceresini açma,
// yalnız kullanıcı kilitleyince çıkan kilit ekranı (parola ya da Telegram onayı), giriş onay soruları,
// arka planda sistem bildirimleri (Reverb + yoklama) ve tepsi ipucu. Panelin ekranları panelden gelir.
import { api } from '../api/index.js';
import { deviceName } from '../core/device.js';
import { applyWindowSettings, closePanel, onShellEvent, openPanel, setLocked, setShellVisible, toggleWindowFullscreen, windowControl } from '../core/desktop.js';
import { errorMessage, formatDate, initials } from '../core/format.js';
import { isTauri, whenUnauthorized } from '../core/http.js';
import { systemNotify } from '../core/notify.js';
import { connectRealtime, disconnectRealtime } from '../core/realtime.js';
import { accounts, isInsecureRemote, session } from '../core/session.js';
import { appSettings } from '../core/settings.js';

const POLL_MS = 60_000;
const LAST_SEEN_KEY = 'last_notification_id';
const LOCKED_KEY = 'app_locked';
const APPROVAL_POLL_MS = 20_000;
const TELEGRAM_WAIT_MS = 200_000;

function emptyReset() {
  return {
    active: false, step: 'verify', challenge: null, methods: [], method: 'totp',
    code: '', password: '', confirm: '', busy: false, error: '', telegram: { waiting: false, message: '' },
  };
}

function emptyTwoFactor() {
  return { challenge: null, code: '', methods: [], telegram: { waiting: false, message: '' } };
}

export function appShell() {
  return {
    view: 'accounts', // accounts | add
    list: accounts.list(),
    activeId: accounts.active()?.id ?? null,
    opening: null,

    // Sunucu adresi girişte sorulmaz: Ayarlar'da bir kez tanımlanır (hesapların kendi sunucusu kalır).
    settings: appSettings.get(),
    settingsOpen: false,
    form: { baseUrl: appSettings.get().serverUrl || accounts.active()?.baseUrl || '', login: '', password: '' },
    twoFactor: emptyTwoFactor(),
    reset: emptyReset(),
    resetTimer: null,
    telegramTimer: null,
    loginError: '',
    loggingIn: false,

    locked: localStorage.getItem(LOCKED_KEY) === '1',
    unlockPassword: '',
    unlockError: '',
    unlocking: false,
    unlockTelegram: { waiting: false, message: '' },
    unlockTimer: null,

    // Hesabın giriş/onay soruları (Telegram'a giden aynı soru); kendi kilit isteğimiz gösterilmez.
    approval: null,
    answering: false,
    approvalTimer: null,
    ownApprovals: new Set(),
    notifiedApprovals: new Set(),

    // Hesap güvenliği penceresi (iki adımlı doğrulama, Telegram ile giriş).
    securityOpen: false,

    pollTimer: null,
    panelOpen: false,
    readyTimer: null,
    signingOut: false,

    initials,
    formatDate,

    init() {
      whenUnauthorized(() => this.markSignedOut(this.activeId, 'Bu hesabın bağlantısı kesildi; yeniden giriş yapın.'));
      onShellEvent('panel://logout', () => this.signOutActive());
      onShellEvent('panel://session-expired', () => this.reconnectPanel());
      onShellEvent('panel://ready', () => this.panelReady());
      onShellEvent('app://accounts', () => this.switchAccount());
      onShellEvent('app://lock', () => this.lock());
      window.addEventListener('profile-updated', () => this.refreshList());
      window.addEventListener('settings-updated', () => this.reloadSettings());

      // Güncellemeden önce hesap eklemiş kullanıcı yeniden sunucu adresi girmez; ilk kurulumda Ayarlar açılır.
      appSettings.adoptServerFrom(accounts.active() ?? accounts.list()[0]);
      this.reloadSettings();
      applyWindowSettings(this.settings);
      if (!this.settings.serverUrl) {
        this.settingsOpen = true;
      }
      window.addEventListener('keydown', (event) => {
        if (event.key === 'F11') {
          event.preventDefault();
          toggleWindowFullscreen();
        }
      });

      // Kilit yalnız kullanıcı "Kilitle" deyince vardır; uygulama kapanıp bilgisayar yeniden başlasa
      // bile hatırlanan hesap şifresiz açılır (kilitliyse kilit ekranı gelir ve kilitli kalır).
      const active = accounts.active();
      if (active?.token) {
        this.startBackground();
        if (!this.locked) {
          this.open(active);
        }
      }
      if (!this.list.length) {
        this.view = 'add';
      }
    },

    reloadSettings() {
      this.settings = appSettings.get();
      if (this.view === 'add' && !this.twoFactor.challenge) {
        this.form.baseUrl = this.settings.serverUrl || this.form.baseUrl;
      }
    },

    openSettings() {
      this.settingsOpen = true;
    },

    closeSettings() {
      // Sunucu adresi tanımlanmadan kapanamaz (giriş için gerekli).
      if (this.settings.serverUrl) {
        this.settingsOpen = false;
      }
    },

    windowControl,

    /** Giriş formunda gösterilen sunucu (soru değil, bilgi). */
    get serverLabel() {
      try {
        return new URL(this.form.baseUrl).host;
      } catch {
        return '—';
      }
    },

    get active() {
      return this.list.find((a) => a.id === this.activeId) || null;
    },

    get user() {
      return this.active?.user ?? null;
    },

    get insecureUrl() {
      return isInsecureRemote(this.form.baseUrl);
    },

    refreshList() {
      this.list = accounts.list();
      this.activeId = accounts.active()?.id ?? null;
    },

    // --- Hesap seçici ----------------------------------------------------------------

    showAccounts() {
      this.refreshList();
      this.view = this.list.length ? 'accounts' : 'add';
      setShellVisible(true);
    },

    /** Hesabı etkinleştirir, kullanıcıyı tazeler ve paneli tek kullanımlık bağlantıyla açar. */
    async open(account) {
      if (!account.token) {
        this.startAdd(account);

        return;
      }
      this.opening = account.id;
      try {
        accounts.activate(account.id);
        this.refreshList();
        const [me, info, link] = await Promise.all([api.me.show(), api.info().catch(() => null), api.auth.webSession('/admin')]);
        accounts.update(account.id, { user: me.data, siteName: info?.name || account.siteName, lastOpenedAt: new Date().toISOString() });
        this.refreshList();
        await openPanel(link.url, `${this.active.siteName || 'Panel'} — YTNewsCore`);
        this.panelOpen = true;
        this.startBackground();
        // Panel penceresi ilk sayfası yüklenince kendini gösterir ve "panel://ready" yollar; o
        // zamana kadar kart "Açılıyor…" kalır. Tarayıcıda (npm run dev) olay gelmez.
        if (isTauri) {
          clearTimeout(this.readyTimer);
          this.readyTimer = setTimeout(() => this.panelReady(), 30_000);
        } else {
          this.panelReady();
        }
      } catch (error) {
        this.opening = null;
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    panelReady() {
      clearTimeout(this.readyTimer);
      if (this.opening === null) {
        return;
      }
      this.opening = null;
      if (!this.locked) {
        setShellVisible(false);
      }
    },

    /** Panel oturumu düştüğünde (ör. uzun süre açık kaldı) token ile yeniden bağlanır. */
    async reconnectPanel() {
      if (!this.active?.token || this.signingOut) {
        return;
      }
      try {
        const link = await api.auth.webSession('/admin');
        await openPanel(link.url, `${this.active.siteName || 'Panel'} — YTNewsCore`);
      } catch (error) {
        this.markSignedOut(this.activeId, errorMessage(error));
      }
    },

    async removeAccount(account) {
      if (!(await this.$store.ui.confirm(`${account.user?.name} (${account.siteName || account.baseUrl}) bu bilgisayardan kaldırılsın mı?`))) {
        return;
      }
      if (account.token) {
        const previous = accounts.active()?.id;
        accounts.activate(account.id);
        await api.auth.logout().catch(() => {});
        accounts.activate(previous !== account.id ? previous : null);
      }
      if (account.id === this.activeId) {
        await this.stopActive();
      }
      accounts.remove(account.id);
      this.showAccounts();
    },

    /**
     * "Hesap Değiştir" (çekmece, tepsi) ve panelden "Oturumu kapat": bu hesabın token'ı iptal
     * edilir, panel kapanır; hesap listede "oturum kapalı" kalır, yeniden girmek şifre ister.
     */
    async signOutActive() {
      if (this.signingOut) {
        return;
      }
      this.signingOut = true;
      try {
        const id = this.activeId;
        if (this.active?.token) {
          await api.auth.logout().catch(() => {});
        }
        await this.stopActive();
        this.markSignedOut(id);
      } finally {
        this.signingOut = false;
      }
    },

    switchAccount() {
      return this.active?.token ? this.signOutActive() : this.showAccounts();
    },

    markSignedOut(id, message = '') {
      if (!id) {
        return;
      }
      accounts.update(id, { token: null });
      if (id === this.activeId) {
        this.stopActive();
      }
      this.showAccounts();
      if (message) {
        this.$store.ui.notify('error', message);
      }
    },

    async stopActive() {
      clearInterval(this.pollTimer);
      clearInterval(this.approvalTimer);
      this.approval = null;
      disconnectRealtime();
      this.$store.stats.stop();
      this.setLockedState(false);
      this.panelOpen = false;
      await closePanel();
    },

    openSecurity() {
      if (this.active?.token) {
        this.securityOpen = true;
      }
    },

    closeSecurity() {
      this.securityOpen = false;
    },

    // --- Hesap ekleme -------------------------------------------------------------------

    startAdd(account = null) {
      this.form = { baseUrl: account?.baseUrl ?? this.settings.serverUrl, login: account?.user?.email ?? '', password: '' };
      clearInterval(this.telegramTimer);
      this.twoFactor = emptyTwoFactor();
      this.loginError = '';
      this.view = 'add';
      setShellVisible(true);
    },

    async doLogin() {
      await this.attempt(async () => {
        const response = await session.withLogin(this.form.baseUrl, async () => api.auth.login(this.form.login.trim(), this.form.password, await deviceName()));
        if (response.two_factor_required) {
          const methods = response.methods ?? ['totp'];
          this.twoFactor = { ...emptyTwoFactor(), challenge: response.challenge, methods };
          // Yalnız Telegram açıksa istek kendiliğinden gider.
          if (!methods.includes('totp') && methods.includes('telegram')) {
            this.startTelegramLogin();
          }

          return;
        }
        await this.finishLogin(response);
      });
    },

    // --- Şifremi unuttum -------------------------------------------------------------------
    // Hesap → Authenticator kodu ya da Telegram'da "Evet, Sıfırla" → yeni parola (mevcut parola sorulmaz).

    async startReset() {
      const login = this.form.login.trim();
      if (!login) {
        this.loginError = 'Önce e-posta ya da kullanıcı adınızı yazın.';

        return;
      }
      this.loggingIn = true;
      this.loginError = '';
      try {
        const response = await session.withLogin(this.form.baseUrl, async () => api.auth.passwordReset(login, await deviceName()));
        this.reset = { ...emptyReset(), active: true, step: 'verify', challenge: response.challenge, methods: response.methods, method: response.methods[0] };
      } catch (error) {
        this.loginError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      } finally {
        this.loggingIn = false;
      }
    },

    cancelReset() {
      clearInterval(this.resetTimer);
      this.reset = emptyReset();
      this.loginError = '';
    },

    async resetAskTelegram() {
      clearInterval(this.resetTimer);
      this.reset.error = '';
      this.reset.telegram = { waiting: true, message: "Telegram'a istek gönderiliyor…" };
      try {
        await session.withLogin(this.form.baseUrl, async () => api.auth.passwordResetTelegram(this.reset.challenge, await deviceName()));
        this.reset.telegram.message = 'Telegram\'da (ya da açık başka bir uygulamada) "Evet, Sıfırla" düğmesine dokunun; 3 dakika içinde.';
        const stopAt = Date.now() + TELEGRAM_WAIT_MS;
        this.resetTimer = setInterval(() => this.pollResetTelegram(stopAt), 2000);
      } catch (error) {
        this.reset.telegram = { waiting: false, message: '' };
        this.reset.error = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      }
    },

    async pollResetTelegram(stopAt) {
      const stop = (message) => {
        clearInterval(this.resetTimer);
        this.reset.telegram = { waiting: false, message: '' };
        this.reset.error = message;
      };
      if (Date.now() > stopAt) {
        stop('Süre doldu. Yeniden deneyebilirsiniz.');

        return;
      }
      try {
        const result = await session.withLogin(this.form.baseUrl, () => api.auth.passwordResetStatus(this.reset.challenge));
        if (result.status === 'pending') {
          return;
        }
        clearInterval(this.resetTimer);
        if (result.status === 'approved') {
          this.reset.telegram = { waiting: false, message: '' };
          this.reset.step = 'password';

          return;
        }
        stop({ rejected: 'İstek Telegram’da iptal edildi.', blocked: 'Bu IP adresi engellendi.' }[result.status] || 'İstek sona erdi. Yeniden deneyebilirsiniz.');
      } catch {
        // Ağ dalgalanması: sonraki tur dener.
      }
    },

    async resetVerifyCode() {
      this.reset.busy = true;
      this.reset.error = '';
      try {
        await session.withLogin(this.form.baseUrl, () => api.auth.passwordResetCode(this.reset.challenge, this.reset.code.trim()));
        this.reset.step = 'password';
      } catch (error) {
        const message = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
        if (error.errors?.challenge) {
          this.reset = emptyReset();
          this.loginError = message;
        } else {
          this.reset.error = message;
        }
      } finally {
        this.reset.busy = false;
      }
    },

    async resetComplete() {
      this.reset.busy = true;
      this.reset.error = '';
      try {
        const response = await session.withLogin(this.form.baseUrl, () => api.auth.passwordResetComplete(this.reset.challenge, this.reset.password, this.reset.confirm));
        this.reset = emptyReset();
        this.form.password = '';
        this.$store.ui.notify('success', response.message);
      } catch (error) {
        this.reset.error = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      } finally {
        this.reset.busy = false;
      }
    },

    async doTwoFactor() {
      await this.attempt(async () => {
        const response = await session.withLogin(this.form.baseUrl, () => api.auth.twoFactor(this.twoFactor.challenge, this.twoFactor.code.trim()));
        await this.finishLogin(response);
      }, (error) => {
        if (error.errors?.challenge) {
          this.twoFactor = emptyTwoFactor();
        }
      });
    },

    cancelTwoFactor() {
      clearInterval(this.telegramTimer);
      this.twoFactor = emptyTwoFactor();
      this.loginError = '';
    },

    /** Girişte "Telegram ile onayla": Telegram'a (ve açık başka bir uygulamaya) sorar, onayı yoklar. */
    async startTelegramLogin() {
      clearInterval(this.telegramTimer);
      this.loginError = '';
      this.twoFactor.telegram = { waiting: true, message: "Telegram'a istek gönderiliyor…" };
      try {
        await session.withLogin(this.form.baseUrl, () => api.auth.telegram(this.twoFactor.challenge));
        this.twoFactor.telegram.message = "Telegram'da (ya da açık başka bir uygulamada) gelen isteği onaylayın; 3 dakika içinde.";
        const stopAt = Date.now() + TELEGRAM_WAIT_MS;
        this.telegramTimer = setInterval(() => this.pollTelegramLogin(stopAt), 2000);
      } catch (error) {
        this.twoFactor.telegram = { waiting: false, message: '' };
        this.loginError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      }
    },

    async pollTelegramLogin(stopAt) {
      const stop = (message) => {
        clearInterval(this.telegramTimer);
        this.twoFactor.telegram = { waiting: false, message: '' };
        this.loginError = message;
      };
      if (Date.now() > stopAt) {
        stop('Süre doldu. Yeniden deneyebilirsiniz.');

        return;
      }
      try {
        const result = await session.withLogin(this.form.baseUrl, () => api.auth.telegramStatus(this.twoFactor.challenge));
        if (result.status === 'pending') {
          return;
        }
        clearInterval(this.telegramTimer);
        if (result.status === 'approved') {
          await this.finishLogin(result);

          return;
        }
        stop({ rejected: 'İstek Telegram’da reddedildi.', blocked: 'Bu giriş denemesi engellendi.' }[result.status] || 'İstek sona erdi. Yeniden deneyebilirsiniz.');
      } catch {
        // Ağ dalgalanması: sonraki tur dener.
      }
    },

    async attempt(action, onError = () => {}) {
      this.loggingIn = true;
      this.loginError = '';
      try {
        await action();
      } catch (error) {
        this.loginError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
        onError(error);
      } finally {
        this.loggingIn = false;
      }
    },

    async finishLogin(response) {
      const baseUrl = this.form.baseUrl.trim().replace(/\/+$/, '');
      const info = await session.withLogin(baseUrl, () => api.info()).catch(() => null);
      const id = accounts.upsert({ baseUrl, token: response.token, user: response.user, siteName: info?.name || new URL(baseUrl).host });
      this.form.password = '';
      clearInterval(this.telegramTimer);
      this.twoFactor = emptyTwoFactor();
      await this.stopActive();
      // Giriş formu açık kalmasın: hesap kartı "Açılıyor…" gösterirken panel açılır.
      this.view = 'accounts';
      this.refreshList();
      await this.open(this.list.find((a) => a.id === id));
    },

    // --- Kilit ekranı --------------------------------------------------------------------

    lock() {
      if (!this.active?.token) {
        return;
      }
      this.setLockedState(true);
      this.$nextTick(() => document.querySelector('[data-unlock-input]')?.focus());
    },

    setLockedState(value) {
      this.locked = value;
      this.unlockPassword = '';
      this.unlockError = '';
      clearInterval(this.unlockTimer);
      this.unlockTelegram = { waiting: false, message: '' };
      localStorage.setItem(LOCKED_KEY, value ? '1' : '0');
      setLocked(value);
    },

    async unlock() {
      this.unlocking = true;
      this.unlockError = '';
      try {
        await api.me.verifyPassword(this.unlockPassword);
        this.setLockedState(false);
        if (!this.panelOpen && this.active) {
          await this.open(this.active);
        }
      } catch (error) {
        this.unlockError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
        this.unlockPassword = '';
      } finally {
        this.unlocking = false;
      }
    },

    /** Kilit ekranında "Şifremi unuttum": bağlı Telegram'a onay sorusu gider. */
    get canTelegramUnlock() {
      return Boolean(this.user?.telegram_id && this.user?.telegram_login_enabled);
    },

    async unlockViaTelegram() {
      clearInterval(this.unlockTimer);
      this.unlockError = '';
      this.unlockTelegram = { waiting: true, message: "Telegram'a istek gönderiliyor…" };
      try {
        const started = await api.me.unlockTelegram(await deviceName());
        this.ownApprovals.add(started.approval_id);
        this.unlockTelegram.message = "Telegram'daki isteği onaylayın; 3 dakika içinde.";
        const stopAt = Date.now() + TELEGRAM_WAIT_MS;
        this.unlockTimer = setInterval(() => this.pollTelegramUnlock(started, stopAt), 2000);
      } catch (error) {
        this.unlockTelegram = { waiting: false, message: '' };
        this.unlockError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      }
    },

    async pollTelegramUnlock(started, stopAt) {
      const stop = (message) => {
        clearInterval(this.unlockTimer);
        this.unlockTelegram = { waiting: false, message: '' };
        this.unlockError = message;
      };
      if (Date.now() > stopAt) {
        stop('Süre doldu. Yeniden deneyebilirsiniz.');

        return;
      }
      try {
        const result = await api.me.unlockTelegramStatus(started.approval_id, started.secret);
        if (result.status === 'pending') {
          return;
        }
        if (result.status === 'approved') {
          clearInterval(this.unlockTimer);
          this.setLockedState(false);
          if (!this.panelOpen && this.active) {
            await this.open(this.active);
          }
          this.pollApprovals();

          return;
        }
        stop(result.status === 'rejected' ? 'İstek Telegram’da reddedildi.' : 'İstek sona erdi. Yeniden deneyebilirsiniz.');
      } catch {
        // Ağ dalgalanması: sonraki tur dener.
      }
    },

    cancelUnlockTelegram() {
      clearInterval(this.unlockTimer);
      this.unlockTelegram = { waiting: false, message: '' };
    },

    // --- Arka plan: bildirimler, Pano ---------------------------------------------------

    startBackground() {
      this.$store.stats.start();
      this.pollNotifications(true);
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.pollNotifications(), POLL_MS);
      this.pollApprovals();
      clearInterval(this.approvalTimer);
      this.approvalTimer = setInterval(() => this.pollApprovals(), APPROVAL_POLL_MS);
      this.startRealtime();
    },

    async startRealtime() {
      try {
        const connection = await connectRealtime();
        if (!connection) {
          return;
        }
        const { echo, channels } = connection;
        echo.private(channels.notifications).listen('.InAppNotificationCreated', (event) => this.onLiveNotification(event));
        echo.private(channels.notifications).listen('.LoginApprovalRequested', () => this.pollApprovals());
        echo.private(channels.dashboard).listen('.DashboardUpdated', () => this.$store.stats.refresh());
      } catch {
        // Reverb yoksa yoklama yeterli.
      }
    },

    /** Açık giriş/onay soruları: yeni olan sistem bildirimi olur; kilit açıkken soru penceresi çıkar. */
    async pollApprovals() {
      if (!this.active?.token) {
        return;
      }
      try {
        const response = await api.approvals.list();
        const now = Date.now();
        const items = (response.data ?? []).filter((a) => !this.ownApprovals.has(a.id) && new Date(a.expires_at).getTime() > now);
        items.filter((a) => !this.notifiedApprovals.has(a.id)).forEach((a) => {
          this.notifiedApprovals.add(a.id);
          systemNotify(this.active?.siteName || 'YTNewsCore', `Giriş onayı bekliyor — IP ${a.ip}`);
        });
        const next = this.locked ? null : (items[0] ?? null);
        if (next && !this.approval && this.panelOpen) {
          setShellVisible(true);
        }
        this.approval = next;
      } catch {
        // Bir sonraki turu bekler.
      }
    },

    async answerApproval(decision) {
      const current = this.approval;
      if (!current || this.answering) {
        return;
      }
      this.answering = true;
      try {
        const result = await api.approvals.answer(current.id, decision);
        this.$store.ui.notify('success', result.message);
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      } finally {
        this.answering = false;
        this.approval = null;
        if (this.panelOpen && !this.locked) {
          setShellVisible(false);
        }
        this.pollApprovals();
      }
    },

    seenKey() {
      return `${LAST_SEEN_KEY}:${this.activeId}`;
    },

    onLiveNotification(event) {
      const lastSeen = Number(localStorage.getItem(this.seenKey()) || 0);
      if (event.id <= lastSeen) {
        return;
      }
      localStorage.setItem(this.seenKey(), String(event.id));
      this.notify({ title: event.title, body: event.body });
      this.$store.stats.refresh();
    },

    /** Yeni okunmamış bildirimler sistem bildirimi olur; ilk açılışta yalnız işaret konur. */
    async pollNotifications(firstRun = false) {
      try {
        const response = await api.notifications.list();
        const items = response.data ?? [];
        const lastSeen = Number(localStorage.getItem(this.seenKey()) || 0);
        if (!firstRun || lastSeen) {
          items.filter((n) => n.id > lastSeen && !n.is_read).reverse().forEach((n) => this.notify(n));
        }
        localStorage.setItem(this.seenKey(), String(Math.max(lastSeen, ...items.map((n) => n.id))));
      } catch {
        // Bir sonraki turu bekler.
      }
    },

    /** Başlık: haber sitesinin adı; gövde: bildirimin başlığı ve metni. Sesli. */
    notify(n) {
      systemNotify(this.active?.siteName || 'YTNewsCore', [n.title, n.body].filter(Boolean).join(' — '));
    },

    testNotification() {
      systemNotify(this.active?.siteName || 'YTNewsCore', 'Sistem bildirimleri çalışıyor.');
    },
  };
}
