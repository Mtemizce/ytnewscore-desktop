// Masaüstü widget penceresi: Pano verisinin küçük, her zaman üstte duran özeti.
import { connectRealtime, disconnectRealtime } from '../core/realtime.js';
import { session } from '../core/session.js';
import { showMainWindow, toggleWidget } from '../core/desktop.js';
import { SERVICES, STAT_CARDS } from './stats-store.js';

export function widget() {
  return {
    cards: STAT_CARDS.filter((c) => c.key !== 'live_visitors'),
    services: SERVICES,
    signedIn: Boolean(session.token),

    init() {
      document.documentElement.classList.add('is-widget');
      window.addEventListener('keydown', (event) => event.key === 'Escape' && this.close());
      if (this.signedIn) {
        this.$store.stats.start();
        this.listen();
      }
      // Kabukta hesap değişince ya da çıkış olunca (localStorage ortak) widget etkin hesaba geçer.
      let token = session.token;
      window.addEventListener('storage', () => {
        if (session.token === token) {
          return;
        }
        token = session.token;
        this.signedIn = Boolean(token);
        if (this.signedIn) {
          this.$store.stats.start();
          this.listen();
        } else {
          this.$store.stats.stop();
          disconnectRealtime();
        }
      });
    },

    /** Dakikalık Pano sinyali ve yeni bildirimler widget'ı hemen yeniler. */
    async listen() {
      try {
        const connection = await connectRealtime();
        if (connection) {
          connection.echo.private(connection.channels.dashboard).listen('.DashboardUpdated', () => this.$store.stats.refresh());
          connection.echo.private(connection.channels.notifications).listen('.InAppNotificationCreated', () => this.$store.stats.refresh());
        }
      } catch {
        // Reverb yoksa dakikalık yoklama yeterli.
      }
    },

    openApp() {
      showMainWindow();
    },

    close() {
      toggleWidget();
    },
  };
}
