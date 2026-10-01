// Masaüstü widget penceresi: Pano verisinin küçük, her zaman üstte duran özeti.
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
      }
      // Ana pencerede giriş/çıkış olunca (localStorage ortak) widget kendini günceller.
      window.addEventListener('storage', () => {
        this.signedIn = Boolean(session.token);
        this.signedIn ? this.$store.stats.start() : this.$store.stats.stop();
      });
    },

    openApp() {
      showMainWindow();
    },

    close() {
      toggleWidget();
    },
  };
}
