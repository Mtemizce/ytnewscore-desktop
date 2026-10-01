// Görüntü yardımcıları: tarih, hata mesajı, baş harfler.
import { ApiError } from './http.js';

const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDate(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/** ISO tarihini <input type="datetime-local"> değerine çevirir. */
export function toLocalInput(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

  return date.toISOString().slice(0, 16);
}

export function errorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Oturum sona erdi, lütfen yeniden giriş yapın.';
    }
    if (error.status === 403) {
      return 'Bu işlem için yetkiniz yok.';
    }
  }

  return error?.message || 'Beklenmeyen bir hata oluştu.';
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('tr-TR'))
    .join('');
}
