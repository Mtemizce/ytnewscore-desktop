// Tek istek noktası: Bearer token, JSON/FormData gövdesi, hata ayrıştırma.
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { session } from './session.js';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Tauri'de istek Rust tarafından gider (CORS yok); tarayıcıda (npm run dev) normal fetch.
const send = isTauri ? tauriFetch : window.fetch.bind(window);

export class ApiError extends Error {
  constructor(status, body = {}) {
    super(body?.message || `İstek başarısız (HTTP ${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.errors = body?.errors || {};
  }
}

/** 401 gelince oturumu kapatmak için uygulama bir dinleyici bağlar. */
let onUnauthorized = () => {};
export function whenUnauthorized(callback) {
  onUnauthorized = callback;
}

export async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const isForm = body instanceof FormData;

  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  let response;
  try {
    response = await send(`${session.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, { message: `Sunucuya ulaşılamadı: ${error?.message || error}` });
  }

  // Etkin hesabın token'ı geçersiz (bağlantı panelden kesildi vb.): kabuk hesabı "oturum kapalı" yapar.
  if (response.status === 401 && session.token && !session.override) {
    onUnauthorized();
  }
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 300) };
  }

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data;
}

/** Sorgu dizesi: boş değerler atlanır. */
export function query(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const text = search.toString();

  return text ? `?${text}` : '';
}
