// Kabuk: hesap seçici (çok site/hesap, 2FA ile ekleme), panel penceresini açma, kilit ekranı,
// arka planda sistem bildirimleri (Reverb + yoklama) ve tepsi ipucu. Panelin ekranları panelden gelir.
import { api } from '../api/index.js';
import { deviceName } from '../core/device.js';
import { closePanel, onShellEvent, openPanel, setLocked, setShellVisible, systemIdleSeconds, toggleWindowFullscreen } from '../core/desktop.js';
import { errorMessage, formatDate, initials } from '../core/format.js';
import { isTauri, whenUnauthorized } from '../core/http.js';
import { systemNotify } from '../core/notify.js';
import { connectRealtime, disconnectRealtime } from '../core/realtime.js';
import { accounts, isInsecureRemote, session } from '../core/session.js';

const POLL_MS = 60_000;
const LAST_SEEN_KEY = 'last_notification_id';
const LOCKED_KEY = 'app_locked';
const IDLE_LOCK_SECONDS = 15 * 60;

export function appShell() {
  return {
    view: 'accounts', // accounts | add
    list: accounts.list(),
    activeId: accounts.active()?.id ?? null,
    opening: null,

    form: { baseUrl: accounts.active()?.baseUrl ?? session.defaultUrl, login: '', password: '' },
    twoFactor: { challenge: null, code: '' },
    loginError: '',
    loggingIn: false,

    locked: localStorage.getItem(LOCKED_KEY) === '1',
    unlockPassword: '',
    unlockError: '',
    unlocking: false,

    pollTimer: null,
    idleTimer: null,
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
      window.addEventListener('keydown', (event) => {
        if (event.key === 'F11') {
          event.preventDefault();
          toggleWindowFullscreen();
        }
      });

      clearInterval(this.idleTimer);
      this.idleTimer = setInterval(() => this.checkIdle(), 30_000);

      // Uygulama açılırken hatırlanan hesap kendiliğinden açılmaz: kilit ekranı o hesabın şifresini
      // ister (aynı bilgisayarı kullanan biri başkasının paneline giremesin).
      const active = accounts.active();
      if (active?.token) {
        this.setLockedState(true);
        this.startBackground();
      }
      if (!this.list.length) {
        this.view = 'add';
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
      disconnectRealtime();
      this.$store.stats.stop();
      this.setLockedState(false);
      this.panelOpen = false;
      await closePanel();
    },

    // --- Hesap ekleme -------------------------------------------------------------------

    startAdd(account = null) {
      this.form = { baseUrl: account?.baseUrl ?? this.active?.baseUrl ?? session.defaultUrl, login: account?.user?.email ?? '', password: '' };
      this.twoFactor = { challenge: null, code: '' };
      this.loginError = '';
      this.view = 'add';
      setShellVisible(true);
    },

    async doLogin() {
      await this.attempt(async () => {
        const response = await session.withLogin(this.form.baseUrl, async () => api.auth.login(this.form.login.trim(), this.form.password, await deviceName()));
        if (response.two_factor_required) {
          this.twoFactor = { challenge: response.challenge, code: '' };

          return;
        }
        await this.finishLogin(response);
      });
    },

    async doTwoFactor() {
      await this.attempt(async () => {
        const response = await session.withLogin(this.form.baseUrl, () => api.auth.twoFactor(this.twoFactor.challenge, this.twoFactor.code.trim()));
        await this.finishLogin(response);
      }, (error) => {
        if (error.errors?.challenge) {
          this.twoFactor = { challenge: null, code: '' };
        }
      });
    },

    cancelTwoFactor() {
      this.twoFactor = { challenge: null, code: '' };
      this.loginError = '';
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
      this.twoFactor = { challenge: null, code: '' };
      await this.stopActive();
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

    async checkIdle() {
      if (!this.locked && this.active?.token && (await systemIdleSeconds()) >= IDLE_LOCK_SECONDS) {
        this.lock();
      }
    },

    // --- Arka plan: bildirimler, Pano ---------------------------------------------------

    startBackground() {
      this.$store.stats.start();
      this.pollNotifications(true);
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.pollNotifications(), POLL_MS);
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
        echo.private(channels.dashboard).listen('.DashboardUpdated', () => this.$store.stats.refresh());
      } catch {
        // Reverb yoksa yoklama yeterli.
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
