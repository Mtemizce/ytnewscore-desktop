// Bölümler arası paylaşılan arayüz durumu: etkin bölüm, bildirim balonu, onay penceresi.
// Bileşenlerden $store.ui ile erişilir.

export const uiStore = {
  section: 'dashboard',

  toast: { visible: false, type: 'success', message: '' },
  toastTimer: null,

  confirmBox: { open: false, message: '', resolve: null },

  notify(type, message) {
    clearTimeout(this.toastTimer);
    this.toast = { visible: true, type, message };
    this.toastTimer = setTimeout(() => {
      this.toast.visible = false;
    }, 3500);
  },

  /** await $store.ui.confirm('Silinsin mi?') → true / false */
  confirm(message) {
    return new Promise((resolve) => {
      this.confirmBox = { open: true, message, resolve };
    });
  },

  answer(value) {
    this.confirmBox.resolve?.(value);
    this.confirmBox = { open: false, message: '', resolve: null };
  },
};
