// Reverb (Pusher protokolü) bağlantısı: kanal yetkilendirmesi Bearer token ile API üzerinden.
// Bağlantı ayarları sunucudan gelir (/api/v1/realtime); Reverb kapalıysa sessizce devre dışı kalır.
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { request } from './http.js';

let echo = null;

export async function connectRealtime() {
  disconnectRealtime();

  const config = await request('GET', '/realtime');
  if (!config?.enabled) {
    return null;
  }

  const tls = config.scheme === 'https';
  window.Pusher = Pusher;
  echo = new Echo({
    broadcaster: 'reverb',
    key: config.key,
    wsHost: config.host,
    wsPort: config.port,
    wssPort: config.port,
    forceTLS: tls,
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        request('POST', '/realtime/auth', { socket_id: socketId, channel_name: channel.name })
          .then((data) => callback(null, data))
          .catch((error) => callback(error, null));
      },
    }),
  });

  return { echo, channels: config.channels };
}

export function disconnectRealtime() {
  if (echo) {
    echo.disconnect();
    echo = null;
  }
}

/** Bağlantı durumu: "connected", "connecting", "unavailable"… */
export function realtimeState() {
  return echo?.connector?.pusher?.connection?.state ?? 'disconnected';
}
