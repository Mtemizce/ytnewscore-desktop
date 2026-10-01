// Paylaşımlar: geçmiş (tüm platformlar + Telegram), platform bağlantıları, Telegram kanalları.
import { api } from '../api/index.js';
import { errorMessage, formatDate } from '../core/format.js';
import { openPanelPage } from '../core/panel.js';
import { paginatedList } from './list.js';

const STATUS_BADGE = { success: 'badge-green', failed: 'badge-red', skipped: 'badge-slate', deleted: 'badge-slate' };

const emptyChannel = () => ({ id: null, name: '', chat_id: '', public_url: '', is_active: true });

export function socialSection() {
  return {
    ...paginatedList((params) => api.social.shares(params), { filters: { platform: '', status: '' } }),

    tab: 'history',
    platforms: [],
    channels: [],
    channel: null,
    channelErrors: {},

    formatDate,
    statusBadge: (status) => STATUS_BADGE[status] || 'badge-slate',

    init() {
      this.$watch('$store.ui.section', (section) => section === 'social' && this.open());
      if (this.$store.ui.section === 'social') {
        this.open();
      }
    },

    async open() {
      const jobs = [];
      if (this.$store.auth.can('social.manage')) {
        jobs.push(this.load(1), this.loadPlatforms());
      } else {
        this.tab = 'channels';
      }
      if (this.$store.auth.can('notifications.settings.manage')) {
        jobs.push(this.loadChannels());
      }
      await Promise.all(jobs);
    },

    async loadPlatforms() {
      try {
        this.platforms = (await api.social.platforms()).data;
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async loadChannels() {
      try {
        this.channels = (await api.social.channels()).data;
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async removeShare(log) {
      if (!(await this.$store.ui.confirm('Bu paylaşım kaydı silinsin mi? (Gönderinin kendisi platformda kalır.)'))) {
        return;
      }
      try {
        await api.social.removeShare(log.id);
        await this.reload();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    openSocialSettings() {
      openPanelPage('/admin/settings/social/settings', 'Sosyal Paylaşım').then(() => this.loadPlatforms()).catch((error) => this.$store.ui.notify('error', errorMessage(error)));
    },

    // --- Telegram kanalları ---------------------------------------------------------

    newChannel() {
      this.channel = emptyChannel();
      this.channelErrors = {};
    },

    editChannel(row) {
      this.channel = { ...row, public_url: row.public_url || '' };
      this.channelErrors = {};
    },

    async saveChannel() {
      const { id, ...payload } = this.channel;
      try {
        if (id) {
          await api.social.updateChannel(id, payload);
        } else {
          await api.social.createChannel(payload);
        }
        this.channel = null;
        this.$store.ui.notify('success', 'Telegram kanalı kaydedildi.');
        await this.loadChannels();
      } catch (error) {
        this.channelErrors = error.errors || {};
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async toggleChannel(row) {
      try {
        await api.social.updateChannel(row.id, { name: row.name, chat_id: row.chat_id, public_url: row.public_url || '', is_active: !row.is_active });
        await this.loadChannels();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    async removeChannel(row) {
      if (!(await this.$store.ui.confirm(`"${row.name}" kanalı silinsin mi? Bu kanala artık paylaşım yapılmaz.`))) {
        return;
      }
      try {
        await api.social.removeChannel(row.id);
        await this.loadChannels();
      } catch (error) {
        this.$store.ui.notify('error', errorMessage(error));
      }
    },

    channelError(field) {
      return (this.channelErrors[field] || [])[0] || '';
    },
  };
}
