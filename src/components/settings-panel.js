// Uygulama ayarları penceresi: sunucu adresi (bir kez tanımlanır, sonra değiştirilebilir), panel
// penceresinin varsayılan boyutu ve çerçevesiz kullanım. Girişten bağımsızdır.
import { applyWindowSettings } from '../core/desktop.js';
import { isInsecureRemote } from '../core/session.js';
import { appSettings, MIN_HEIGHT, MIN_WIDTH, normalizeServerUrl } from '../core/settings.js';

const PRESETS = [
  { label: 'Küçük', width: 1100, height: 700 },
  { label: 'Varsayılan', width: 1360, height: 860 },
  { label: 'Geniş', width: 1600, height: 960 },
];

export function settingsPanel() {
  const saved = appSettings.get();

  return {
    form: { serverUrl: saved.serverUrl, width: saved.width, height: saved.height, frameless: saved.frameless },
    error: '',
    presets: PRESETS,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,

    get firstRun() {
      return !appSettings.get().serverUrl;
    },

    get insecure() {
      return Boolean(this.form.serverUrl) && isInsecureRemote(this.form.serverUrl);
    },

    isPreset(preset) {
      return Number(this.form.width) === preset.width && Number(this.form.height) === preset.height;
    },

    usePreset(preset) {
      this.form.width = preset.width;
      this.form.height = preset.height;
    },

    save() {
      this.error = '';
      const serverUrl = normalizeServerUrl(this.form.serverUrl);
      if (!serverUrl) {
        this.error = 'Geçerli bir sunucu adresi yazın (ör. https://site.com).';

        return;
      }
      const width = Math.round(Number(this.form.width));
      const height = Math.round(Number(this.form.height));
      if (!(width >= MIN_WIDTH && height >= MIN_HEIGHT)) {
        this.error = `Pencere en az ${MIN_WIDTH} × ${MIN_HEIGHT} olabilir.`;

        return;
      }
      const next = appSettings.update({ serverUrl, width, height, frameless: Boolean(this.form.frameless) });
      applyWindowSettings(next);
      window.dispatchEvent(new CustomEvent('settings-updated'));
      this.$store.ui.notify('success', 'Ayarlar kaydedildi.');
      this.$dispatch('close-settings');
    },
  };
}
