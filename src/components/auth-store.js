// Giriş yapan kullanıcı ve izinleri: menü ve düğmeler sitedeki yetkilerle aynı şekilde
// gösterilir/gizlenir. Bileşenlerden $store.auth.can('news.create') ile.
import { session } from '../core/session.js';

export const authStore = {
  user: session.user,

  set(user) {
    this.user = user;
    session.user = user;
  },

  clear() {
    this.user = null;
  },

  /** Tek izin ya da dizi (herhangi biri yeterli). Süper admin her şeyi görür. */
  can(permission) {
    if (!this.user) {
      return false;
    }
    if (this.user.is_super_admin) {
      return true;
    }
    const held = this.user.permissions || [];

    return [].concat(permission).some((name) => held.includes(name));
  },
};
