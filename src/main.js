// Açılış: stiller, görünümler, Alpine bileşenleri. Ana pencere hesap seçici + kilit kabuğudur
// (panelin kendisi ayrı pencerede sitenin paneli); "widget" etiketli pencere yalnız widget'ı yükler.
import Alpine from 'alpinejs';
import './styles/index.css';
import { appShell } from './components/app-shell.js';
import { securityPanel } from './components/security-panel.js';
import { settingsPanel } from './components/settings-panel.js';
import { statsStore } from './components/stats-store.js';
import { uiStore } from './components/ui-store.js';
import { widget } from './components/widget.js';
import { isWidgetWindow } from './core/desktop.js';
import { renderView } from './views/render.js';

Alpine.store('ui', uiStore);
Alpine.store('stats', statsStore);

if (isWidgetWindow) {
  document.getElementById('app').innerHTML = renderView('widget');
  Alpine.data('widget', widget);
} else {
  document.getElementById('app').innerHTML = renderView('app');
  Alpine.data('appShell', appShell);
  Alpine.data('securityPanel', securityPanel);
  Alpine.data('settingsPanel', settingsPanel);
}

window.Alpine = Alpine;
Alpine.start();
