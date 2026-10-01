// Uygulama kabuğu: giriş (+2FA), menü (yetkiye göre), kilit ekranı, tam ekran, bildirim yoklaması.
import { api } from '../api/index.js';
import { deviceName } from '../core/device.js';
import { errorMessage, initials } from '../core/format.js';
import { whenUnauthorized } from '../core/http.js';
import { systemNotify } from '../core/notify.js';
import { isInsecureRemote, session } from '../core/session.js';
import { onLockRequested, toggleWidget } from '../core/desktop.js';
import { toggleFullscreen } from '../core/window.js';

const POLL_MS = 60_000;
const LAST_SEEN_KEY = 'last_notification_id';
const LOCKED_KEY = 'app_locked';
const IDLE_LOCK_MS = 15 * 60_000;

// permission: bölümü görmek için gereken izinlerden biri (null = herkes).
export const SECTIONS = [
  { key: 'dashboard', label: 'Pano', permission: null, icon: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z' },
  { key: 'news', label: 'Haberler', permission: ['news.create', 'news.edit-own', 'news.edit-published', 'news.approve'], icon: 'M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8Z' },
  { key: 'articles', label: 'Köşe Yazıları', permission: ['article.create', 'article.edit-own', 'article.edit-published', 'article.approve'], icon: 'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z' },
  { key: 'inbox', label: 'Gelen Kutusu', permission: ['ingestion.manage'], icon: 'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z' },
  { key: 'comments', label: 'Yorumlar', permission: ['comments.moderate'], icon: 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z' },
  { key: 'forms', label: 'İletişim Formları', permission: ['forms.view'], icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z' },
  { key: 'pages', label: 'Sabit Sayfalar', permission: null, icon: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z' },
  { key: 'ads', label: 'Reklamlar', permission: ['ads.view'], icon: 'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46' },
  { key: 'social', label: 'Paylaşımlar', permission: ['social.manage', 'notifications.settings.manage'], icon: 'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' },
  { key: 'users', label: 'Kullanıcılar', permission: ['settings.users.view'], icon: 'M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  { key: 'profile', label: 'Profilim', permission: null, icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z' },
];

export function appShell() {
  return {
    authenticated: Boolean(session.token),
    login: { baseUrl: session.baseUrl, login: '', password: '' },
    twoFactor: { challenge: null, code: '' },
    loginError: '',
    loggingIn: false,
    serverName: '',

    locked: localStorage.getItem(LOCKED_KEY) === '1',
    unlockPassword: '',
    unlockError: '',
    unlocking: false,
    idleTimer: null,

    fullscreen: false,

    forced: { current_password: '', password: '', password_confirmation: '' },
    forcedError: '',
    forcedSaving: false,

    notifications: [],
    unreadCount: 0,
    bellOpen: false,
    pollTimer: null,

    initials,

    init() {
      whenUnauthorized(() => this.endSession('Oturum sona erdi, lütfen yeniden giriş yapın.'));
      window.addEventListener('keydown', (event) => this.shortcut(event));
      onLockRequested(() => this.authenticated && this.lock());
      ['mousemove', 'keydown', 'click'].forEach((name) => window.addEventListener(name, () => this.resetIdle(), { passive: true }));
      if (this.authenticated) {
        this.startSession();
      }
    },

    get user() {
      return this.$store.auth.user;
    },

    get sections() {
      return SECTIONS.filter((s) => s.permission === null || this.$store.auth.can(s.permission));
    },

    get insecureUrl() {
      return isInsecureRemote(this.login.baseUrl);
    },

    get title() {
      return SECTIONS.find((s) => s.key === this.$store.ui.section)?.label ?? '';
    },

    // --- Giriş ---------------------------------------------------------------

    async doLogin() {
      await this.attempt(async () => {
        session.baseUrl = this.login.baseUrl;
        const response = await api.auth.login(this.login.login.trim(), this.login.password, await deviceName());
        if (response.two_factor_required) {
          this.twoFactor = { challenge: response.challenge, code: '' };

          return;
        }
        this.finishLogin(response);
      });
    },

    async doTwoFactor() {
      await this.attempt(async () => {
        this.finishLogin(await api.auth.twoFactor(this.twoFactor.challenge, this.twoFactor.code.trim()));
      }, (error) => {
        if (error.errors?.challenge) {
          this.twoFactor = { challenge: null, code: '' }; // süre doldu ya da çok hatalı kod: başa dön
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

    finishLogin(response) {
      session.token = response.token;
      this.$store.auth.set(response.user);
      this.login.password = '';
      this.twoFactor = { challenge: null, code: '' };
      this.authenticated = true;
      this.setLocked(false);
      this.startSession();
    },

    async logout() {
      try {
        await api.auth.logout();
      } catch {
        // Token zaten geçersizse yerel oturumu kapatmak yeterli.
      }
      this.endSession();
    },

    startSession() {
      api.info().then((info) => { this.serverName = info?.name ?? ''; }).catch(() => {});
      api.me.show().then((response) => this.$store.auth.set(response.data)).then(() => this.ensureVisibleSection()).catch(() => {});
      this.ensureVisibleSection();
      this.$store.stats.start();
      this.pollNotifications(true);
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.pollNotifications(), POLL_MS);
      this.resetIdle();
    },

    endSession(message = '') {
      clearInterval(this.pollTimer);
      clearTimeout(this.idleTimer);
      this.$store.stats.stop();
      session.clear();
      this.$store.auth.clear();
      this.authenticated = false;
      this.setLocked(false);
      this.notifications = [];
      this.unreadCount = 0;
      if (message) {
        this.loginError = message;
      }
    },

    /** Yetkisi olmayan bir bölümde kalınmasın. */
    ensureVisibleSection() {
      if (!this.sections.some((s) => s.key === this.$store.ui.section)) {
        this.$store.ui.section = this.sections[0]?.key ?? 'profile';
      }
    },

    go(section) {
      this.$store.ui.section = section;
    },

    /** Yöneticinin belirlediği şifre ilk girişte değiştirilir (panelle aynı kural). */
    async changeForcedPassword() {
      this.forcedSaving = true;
      this.forcedError = '';
      try {
        await api.me.password(this.forced);
        this.forced = { current_password: '', password: '', password_confirmation: '' };
        this.$store.auth.set((await api.me.show()).data);
        this.$store.ui.notify('success', 'Şifreniz güncellendi.');
      } catch (error) {
        this.forcedError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
      } finally {
        this.forcedSaving = false;
      }
    },

    // --- Kilit ekranı -------------------------------------------------------------

    lock() {
      this.setLocked(true);
      this.$nextTick(() => document.querySelector('[data-unlock-input]')?.focus());
    },

    setLocked(value) {
      this.locked = value;
      this.unlockPassword = '';
      this.unlockError = '';
      localStorage.setItem(LOCKED_KEY, value ? '1' : '0');
    },

    async unlock() {
      this.unlocking = true;
      this.unlockError = '';
      try {
        await api.me.verifyPassword(this.unlockPassword);
        this.setLocked(false);
        this.resetIdle();
      } catch (error) {
        this.unlockError = Object.values(error.errors || {}).flat()[0] || errorMessage(error);
        this.unlockPassword = '';
      } finally {
        this.unlocking = false;
      }
    },

    resetIdle() {
      if (!this.authenticated || this.locked) {
        return;
      }
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.lock(), IDLE_LOCK_MS);
    },

    // --- Kısayollar ve pencere -----------------------------------------------------

    shortcut(event) {
      if (event.key === 'F11') {
        event.preventDefault();
        this.toggleFullscreen();
      } else if (this.authenticated && !this.locked && event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        this.lock();
      }
    },

    toggleWidget() {
      toggleWidget();
    },

    async toggleFullscreen() {
      try {
        this.fullscreen = await toggleFullscreen();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    // --- Bildirimler ---------------------------------------------------------------

    /** Son görülen id'den yeni olanlar sistem bildirimi olarak gösterilir; ilk açılışta yalnız işaret konur. */
    async pollNotifications(firstRun = false) {
      try {
        const response = await api.notifications.list();
        this.notifications = response.data ?? [];
        this.unreadCount = response.unread_count ?? 0;

        const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
        const newest = Math.max(lastSeen, ...this.notifications.map((n) => n.id));
        if (!firstRun || lastSeen) {
          this.notifications
            .filter((n) => n.id > lastSeen && !n.is_read)
            .reverse()
            .forEach((n) => systemNotify(n.title, n.body || ''));
        }
        localStorage.setItem(LAST_SEEN_KEY, String(newest));
      } catch {
        // Yoklama sessizce bir sonraki turu bekler.
      }
    },

    async markRead(notification) {
      if (notification.is_read) {
        return;
      }
      const response = await api.notifications.read(notification.id);
      notification.is_read = true;
      this.unreadCount = response?.unread_count ?? Math.max(0, this.unreadCount - 1);
    },

    async markAllRead() {
      await api.notifications.readAll();
      this.notifications.forEach((n) => { n.is_read = true; });
      this.unreadCount = 0;
    },

    testNotification() {
      systemNotify('YTNewsCore', 'Sistem bildirimleri çalışıyor.').then((ok) => {
        if (!ok) {
          this.$store.ui.notify('error', 'Bildirim izni verilmedi (Windows: Ayarlar › Sistem › Bildirimler).');
        }
      });
    },
  };
}
