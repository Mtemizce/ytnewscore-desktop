// Sitenin kendi panel sayfasını (haber formu vb.) ayrı bir pencerede açar: API'den tek kullanımlık,
// 60 saniyelik bir giriş bağlantısı alınır; şifre yeniden sorulmaz. Pencere kapanınca resolve olur.
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { request, isTauri } from './http.js';

export async function openPanelPage(path, title) {
  // embed: sayfa panelin kenar çubuğu, üst menüsü ve kullanıcı menüsü olmadan açılır.
  const { url } = await request('POST', '/auth/web-session', { path, embed: true });

  if (!isTauri) {
    window.open(url, '_blank');

    return;
  }

  const win = new WebviewWindow(`panel-${Date.now()}`, {
    url,
    title: `${title} — YTNewsCore`,
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    center: true,
  });

  await new Promise((resolve, reject) => {
    win.once('tauri://error', (event) => reject(new Error(String(event.payload || 'Pencere açılamadı.'))));
    win.once('tauri://destroyed', () => resolve());
  });
}
