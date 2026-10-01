// Açılış: stiller, görünümler, Alpine bileşenleri. `#widget` ile açılan pencere yalnız widget'ı yükler.
import Alpine from 'alpinejs';
import './styles/index.css';
import { adsSection } from './components/ads-section.js';
import { appShell } from './components/app-shell.js';
import { authStore } from './components/auth-store.js';
import { commentsSection } from './components/comments-section.js';
import { contentSection } from './components/content-section.js';
import { dashboardSection } from './components/dashboard-section.js';
import { formsSection } from './components/forms-section.js';
import { inboxSection } from './components/inbox-section.js';
import { pagesSection } from './components/pages-section.js';
import { profileSection } from './components/profile-section.js';
import { socialSection } from './components/social-section.js';
import { statsStore } from './components/stats-store.js';
import { uiStore } from './components/ui-store.js';
import { usersSection } from './components/users-section.js';
import { widget } from './components/widget.js';
import { isWidgetWindow } from './core/desktop.js';
import { renderView } from './views/render.js';

Alpine.store('ui', uiStore);
Alpine.store('auth', authStore);
Alpine.store('stats', statsStore);

if (isWidgetWindow) {
  document.getElementById('app').innerHTML = renderView('widget');
  Alpine.data('widget', widget);
} else {
  document.getElementById('app').innerHTML = renderView('app');
  Alpine.data('appShell', appShell);
  Alpine.data('dashboardSection', dashboardSection);
  Alpine.data('contentSection', contentSection);
  Alpine.data('usersSection', usersSection);
  Alpine.data('commentsSection', commentsSection);
  Alpine.data('inboxSection', inboxSection);
  Alpine.data('formsSection', formsSection);
  Alpine.data('pagesSection', pagesSection);
  Alpine.data('adsSection', adsSection);
  Alpine.data('socialSection', socialSection);
  Alpine.data('profileSection', profileSection);
}

window.Alpine = Alpine;
Alpine.start();
