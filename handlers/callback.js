'use strict';

const db = require('../services/database');
const panelCmd = require('../commands/panel');
const adminCmd = require('../commands/admin');
const ownerCmd = require('../commands/owner');
const resellerCmd = require('../commands/reseller');
const startCmd = require('../commands/start');
const logger = require('../services/logger');
const { esc } = require('../utils/format');

async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const from = ctx.from;
  const isAdmin = await db.isAdmin(from.id);
  const isOwner = await db.isOwner(from.id);
  const isReseller = await db.isReseller(from.id);

  try {
    // ── Noop ──────────────────────────────────────────────────────────────────
    if (data === 'noop') return ctx.answerCbQuery();

    // ── Main menu navigation ──────────────────────────────────────────────────
    if (data === 'menu_home') {
      await ctx.answerCbQuery();
      return startCmd.sendMainMenu(ctx, true);
    }
    if (data === 'menu_close') {
      await ctx.answerCbQuery();
      try { await ctx.deleteMessage(); } catch (_) {}
      return;
    }
    if (data === 'menu_claim') {
      await ctx.answerCbQuery();
      return panelCmd.startClaim(ctx);
    }
    if (data === 'menu_mypanel') {
      await ctx.answerCbQuery();
      return panelCmd.showMyPanels(ctx);
    }
    if (data === 'menu_profile') {
      await ctx.answerCbQuery();
      return showProfile(ctx);
    }
    if (data === 'menu_voucher') {
      await ctx.answerCbQuery();
      return panelCmd.showVoucherMenu(ctx);
    }
    if (data === 'menu_referral') {
      await ctx.answerCbQuery();
      return panelCmd.showReferralMenu(ctx);
    }
    if (data === 'menu_leaderboard') {
      await ctx.answerCbQuery();
      return panelCmd.showLeaderboard(ctx);
    }
    if (data === 'menu_share') {
      await ctx.answerCbQuery();
      return panelCmd.showShareStatus(ctx);
    }
    if (data === 'menu_rules') {
      await ctx.answerCbQuery();
      return startCmd.handleRules(ctx);
    }
    if (data === 'menu_help') {
      await ctx.answerCbQuery();
      return startCmd.handleHelp(ctx);
    }
    if (data === 'menu_contact') {
      await ctx.answerCbQuery();
      return startCmd.handleContact(ctx);
    }
    if (data === 'menu_about') {
      await ctx.answerCbQuery();
      return startCmd.handleAbout(ctx);
    }
    if (data === 'menu_settings') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showSettings(ctx);
    }

    // ── Panel claim flow ──────────────────────────────────────────────────────
    if (data.startsWith('pkg_')) {
      // packageKeyboard emits pkg_select_<id>. Keep accepting pkg_<id> for
      // buttons created by older messages that may still be in a chat.
      const pkgId = parseInt(data.replace(/^pkg_(?:select_)?/, ''), 10);
      if (!Number.isInteger(pkgId)) {
        return ctx.answerCbQuery('Paket tidak valid', { show_alert: true });
      }
      await ctx.answerCbQuery();
      return panelCmd.selectPackage(ctx, pkgId);
    }
    if (data.startsWith('egg_')) {
      // eggKeyboard emits egg_select_<nestId>_<eggId>.
      const eggKey = data.replace(/^egg_(?:select_)?/, '');
      if (!/^\d+_\d+$/.test(eggKey)) {
        return ctx.answerCbQuery('Egg tidak valid', { show_alert: true });
      }
      await ctx.answerCbQuery();
      return panelCmd.selectEgg(ctx, eggKey);
    }
    if (data.startsWith('panel_node_')) {
      const nodeId = parseInt(data.replace('panel_node_', ''), 10);
      if (!Number.isInteger(nodeId)) {
        return ctx.answerCbQuery('Node tidak valid', { show_alert: true });
      }
      await ctx.answerCbQuery();
      return panelCmd.selectNode(ctx, nodeId);
    }
    if (data === 'panel_confirm') {
      await ctx.answerCbQuery();
      return panelCmd.confirmCreate(ctx);
    }
    if (data === 'panel_cancel') {
      await db.clearSession(from.id);
      await ctx.answerCbQuery('Claim dibatalkan');
      return startCmd.sendMainMenu(ctx, true);
    }
    if (data === 'panel_back_pkg') {
      await ctx.answerCbQuery();
      return panelCmd.startClaim(ctx);
    }
    if (data === 'panel_check_groups' || data === 'panel_check_share') {
      await ctx.answerCbQuery();
      return panelCmd.startClaim(ctx);
    }

    // ── My panel pagination ───────────────────────────────────────────────────
    if (data.startsWith('mypanel_page_')) {
      await ctx.answerCbQuery();
      const page = parseInt(data.split('_')[2]);
      return panelCmd.showMyPanels(ctx, page);
    }

    // ── Server info ───────────────────────────────────────────────────────────
    if (data.startsWith('srv_info_')) {
      await ctx.answerCbQuery();
      const serverId = data.replace('srv_info_', '');
      return panelCmd.showServerInfo(ctx, serverId);
    }
    if (data.startsWith('srv_start_')) {
      const identifier = data.replace('srv_start_', '');
      return panelCmd.powerControl(ctx, identifier, 'start');
    }
    if (data.startsWith('srv_stop_')) {
      const identifier = data.replace('srv_stop_', '');
      return panelCmd.powerControl(ctx, identifier, 'stop');
    }
    if (data.startsWith('srv_restart_')) {
      const identifier = data.replace('srv_restart_', '');
      return panelCmd.powerControl(ctx, identifier, 'restart');
    }
    if (data.startsWith('srv_refresh_')) {
      await ctx.answerCbQuery('Memuat ulang...');
      const identifier = data.replace('srv_refresh_', '');
      const allServers = await db.getAllServers();
      const server = allServers.find(s => s.identifier === identifier);
      if (server) return panelCmd.showServerInfo(ctx, server.serverId);
      return ctx.answerCbQuery('Server tidak ditemukan', { show_alert: true });
    }

    // ── Referral redeem ───────────────────────────────────────────────────────
    if (data === 'ref_redeem_premium') {
      const user = await db.getUser(from.id);
      const settings = require('../settings');
      if ((user?.referralPoints || 0) < settings.referralPremiumThreshold) {
        return ctx.answerCbQuery(`Poin kurang! Butuh ${settings.referralPremiumThreshold} poin.`, { show_alert: true });
      }
      await db.addPremium({ telegramId: from.id, grantedBy: 'referral', expiredAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
      await db.updateUser(from.id, { referralPoints: (user.referralPoints || 0) - settings.referralPremiumThreshold });
      await ctx.answerCbQuery('✅ Premium 30 hari diaktifkan!', { show_alert: true });
      return panelCmd.showReferralMenu(ctx);
    }
    if (data === 'ref_redeem_voucher') {
      const user = await db.getUser(from.id);
      const settings = require('../settings');
      if ((user?.referralPoints || 0) < settings.referralVoucherThreshold) {
        return ctx.answerCbQuery(`Poin kurang! Butuh ${settings.referralVoucherThreshold} poin.`, { show_alert: true });
      }
      const code = `REF${from.id}${Date.now().toString().slice(-4)}`;
      await db.createVoucher({ code, type: 'panel', reward: { panel: true }, maxUses: 1, createdBy: 'referral_system' });
      await db.updateUser(from.id, { referralPoints: (user.referralPoints || 0) - settings.referralVoucherThreshold });
      await ctx.answerCbQuery(`✅ Voucher ${code} dibuat!`, { show_alert: true });
      return ctx.editMessageText(`🎟 Voucher kamu: \`${code}\`\nGunakan dengan menu Voucher\\.`, { parse_mode: 'MarkdownV2' });
    }

    // ── Admin dashboard ───────────────────────────────────────────────────────
    if (data === 'adm_dashboard') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showDashboard(ctx);
    }
    if (data === 'adm_users') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showUsers(ctx);
    }
    if (data.startsWith('adm_users_page_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const page = parseInt(data.split('_')[3]);
      return adminCmd.showUsers(ctx, page);
    }
    if (data.startsWith('adm_user_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const telegramId = data.replace('adm_user_', '');
      return adminCmd.showUserInfo(ctx, telegramId);
    }
    if (data === 'adm_servers') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showServers(ctx);
    }
    if (data.startsWith('adm_servers_page_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const page = parseInt(data.split('_')[3]);
      return adminCmd.showServers(ctx, page);
    }
    if (data.startsWith('adm_srv_info_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const serverId = data.replace('adm_srv_info_', '');
      return adminCmd.showServerInfo(ctx, serverId);
    }
    // Server power actions (admin)
    for (const action of ['start', 'stop', 'restart', 'suspend', 'unsuspend', 'reinstall', 'delete']) {
      if (data.startsWith(`adm_srv_${action}_`)) {
        if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
        const serverId = data.replace(`adm_srv_${action}_`, '');
        return adminCmd.serverAction(ctx, serverId, action);
      }
    }

    if (data === 'adm_vouchers') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showVouchers(ctx);
    }
    if (data === 'adm_create_voucher') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_waiting_create_voucher' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `*🎟 BUAT VOUCHER*\n\nFormat:\n\`<KODE> <panel|premium|points> [maks\\_pakai] [value]\`\n\nContoh:\n\`GRATIS01 panel 5\`\n\`VIP30 premium 3 30\`\n\`BONUS10 points 10 50\``,
        { parse_mode: 'MarkdownV2', reply_markup: require('../utils/keyboard').backKeyboard('adm_vouchers').reply_markup }
      );
    }
    if (data === 'adm_resellers') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return showResellers(ctx);
    }
    if (data === 'adm_premium') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return showPremiums(ctx);
    }
    if (data === 'adm_blacklist') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showBlacklist(ctx);
    }
    if (data === 'adm_add_blacklist') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_waiting_add_blacklist' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `*⛔ TAMBAH BLACKLIST*\n\nFormat: \`<telegram\\_id> <alasan>\``,
        { parse_mode: 'MarkdownV2', reply_markup: require('../utils/keyboard').backKeyboard('adm_blacklist').reply_markup }
      );
    }
    if (data.startsWith('adm_addbl_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_addbl_', '');
      return adminCmd.addBlacklist(ctx, telegramId);
    }
    if (data.startsWith('adm_rembl_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_rembl_', '');
      return adminCmd.removeBlacklist(ctx, telegramId);
    }
    if (data.startsWith('adm_addpremium_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_addpremium_', '');
      return adminCmd.addPremium(ctx, telegramId);
    }
    if (data.startsWith('adm_rempremium_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_rempremium_', '');
      return adminCmd.removePremium(ctx, telegramId);
    }
    if (data.startsWith('adm_addres_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_addres_', '');
      return adminCmd.addReseller(ctx, telegramId);
    }
    if (data.startsWith('adm_remres_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const telegramId = data.replace('adm_remres_', '');
      return adminCmd.removeReseller(ctx, telegramId);
    }
    if (data === 'adm_groups') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showRequiredGroups(ctx);
    }
    if (data === 'adm_add_group') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_waiting_add_group' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `*➕ TAMBAH GRUP WAJIB*\n\nKirim Group ID \\(negatif\\) atau forward pesan dari grup\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: require('../utils/keyboard').backKeyboard('adm_groups').reply_markup }
      );
    }
    if (data.startsWith('adm_grp_toggle_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const groupId = parseInt(data.replace('adm_grp_toggle_', ''));
      const groups = await db.read('required_groups');
      const idx = groups.findIndex(g => g.groupId === groupId);
      if (idx !== -1) {
        groups[idx].active = !groups[idx].active;
        await db.write('required_groups', groups);
        await ctx.answerCbQuery(`Grup ${groups[idx].active ? 'diaktifkan' : 'dinonaktifkan'}!`, { show_alert: true });
        return adminCmd.showRequiredGroups(ctx);
      }
      return ctx.answerCbQuery('Grup tidak ditemukan', { show_alert: true });
    }
    if (data === 'adm_packages') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showPackages(ctx);
    }
    if (data.startsWith('adm_pkg_toggle_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const pkgId = parseInt(data.replace('adm_pkg_toggle_', ''));
      const packages = await db.read('packages');
      const idx = packages.findIndex(p => p.id === pkgId);
      if (idx !== -1) {
        packages[idx].active = !packages[idx].active;
        await db.write('packages', packages);
        await ctx.answerCbQuery(`Paket ${packages[idx].active ? 'diaktifkan' : 'dinonaktifkan'}!`, { show_alert: true });
        return adminCmd.showPackages(ctx);
      }
      return ctx.answerCbQuery('Paket tidak ditemukan', { show_alert: true });
    }
    if (data === 'adm_eggs') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showEggs(ctx);
    }
    if (data === 'adm_sync_eggs') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery('🔄 Syncing eggs dari panel...');
      return adminCmd.syncEggs(ctx);
    }
    if (data === 'adm_nodes') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showNodes(ctx);
    }
    if (data.startsWith('adm_nodeview_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const nodeId = parseInt(data.replace('adm_nodeview_', ''), 10);
      return adminCmd.showNodeDetail(ctx, nodeId);
    }
    if (data.startsWith('adm_nodemt_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const nodeId = parseInt(data.replace('adm_nodemt_', ''), 10);
      return adminCmd.toggleNodeMaintenance(ctx, nodeId);
    }
    if (data === 'adm_broadcast') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showBroadcast(ctx);
    }
    for (const target of ['all', 'premium', 'reseller', 'admin']) {
      if (data === `adm_bc_${target}`) {
        if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
        await ctx.answerCbQuery();
        return adminCmd.doBroadcast(ctx, target);
      }
    }
    if (data === 'adm_settings') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showSettings(ctx);
    }
    if (data === 'adm_toggle_maintenance') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      return adminCmd.toggleMaintenance(ctx);
    }
    if (data === 'adm_stats') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showStats(ctx);
    }
    if (data === 'adm_actlog') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showActivityLog(ctx);
    }
    if (data === 'adm_seclog') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showSecurityLog(ctx);
    }
    if (data === 'adm_backup') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return adminCmd.showBackup(ctx);
    }
    if (data === 'adm_do_backup') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      return adminCmd.doBackup(ctx);
    }
    if (data === 'adm_panel_servers') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      return adminCmd.showPanelServers(ctx, 1);
    }
    if (data.startsWith('adm_panelsrv_page_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const page = parseInt(data.replace('adm_panelsrv_page_', '')) || 1;
      return adminCmd.showPanelServers(ctx, page);
    }
    if (data === 'adm_panel_users') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      return adminCmd.showPanelUsers(ctx, 1);
    }
    if (data.startsWith('adm_panelusr_page_')) {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      const page = parseInt(data.replace('adm_panelusr_page_', '')) || 1;
      return adminCmd.showPanelUsers(ctx, page);
    }
    if (data === 'adm_search_user') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_search_user' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(`*🔍 CARI USER*\n\nKetik nama, username, atau Telegram ID:`, {
        parse_mode: 'MarkdownV2',
        reply_markup: require('../utils/keyboard').backKeyboard('adm_users').reply_markup,
      });
    }
    if (data === 'adm_search_server') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_search_server' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(`*🔍 CARI SERVER*\n\nKetik nama server, username, atau Server ID:`, {
        parse_mode: 'MarkdownV2',
        reply_markup: require('../utils/keyboard').backKeyboard('adm_servers').reply_markup,
      });
    }
    if (data === 'adm_create_server') {
      if (!isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return panelCmd.startClaim(ctx); // Admin uses same flow
    }
    if (data === 'adm_add_admin') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_waiting_add_admin' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(`*➕ TAMBAH ADMIN*\n\nKirim Telegram ID user:`, {
        parse_mode: 'MarkdownV2',
        reply_markup: require('../utils/keyboard').backKeyboard('own_admins').reply_markup,
      });
    }

    // ── Owner actions ─────────────────────────────────────────────────────────
    if (data === 'own_dashboard') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ownerCmd.showDashboard(ctx);
    }
    if (data === 'own_admins') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ownerCmd.showAdminManagement(ctx);
    }
    if (data === 'own_add_admin') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await db.setSession(from.id, { step: 'adm_waiting_add_admin' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(`*➕ TAMBAH ADMIN*\n\nKirim Telegram ID user:`, {
        parse_mode: 'MarkdownV2',
        reply_markup: require('../utils/keyboard').backKeyboard('own_admins').reply_markup,
      });
    }
    if (data.startsWith('own_rem_admin_')) {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      const telegramId = data.replace('own_rem_admin_', '');
      await ownerCmd.removeAdmin(ctx, telegramId);
      return;
    }
    if (data === 'own_tools') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ownerCmd.showOwnerTools(ctx);
    }
    if (data === 'own_emergency') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      return ownerCmd.toggleEmergency(ctx);
    }
    if (data === 'own_restart') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      return ownerCmd.restartBot(ctx);
    }
    if (data === 'own_shutdown') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      return ownerCmd.shutdownBot(ctx);
    }
    if (data === 'own_auditlog') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ownerCmd.showAuditLog(ctx);
    }
    if (data === 'own_api') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ownerCmd.showApiSettings(ctx);
    }
    if (data === 'own_reload') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery('⚙️ Config di-reload!', { show_alert: true });
      return;
    }
    if (data === 'own_multipanel') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      const settings = require('../settings');
      return ctx.editMessageText(
        `*🌍 MULTI PANEL INFO*\n\n🌐 *Panel URL* : \`${esc(settings.panelUrl)}\`\n\n_Multi panel belum dikonfigurasi\\._`,
        { parse_mode: 'MarkdownV2', reply_markup: require('../utils/keyboard').backKeyboard('own_dashboard').reply_markup }
      );
    }
    if (data === 'own_reset_db') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `⚠️ *RESET DATABASE*\n\nIni akan menghapus semua data\\! Apakah yakin?`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: require('../utils/keyboard').yesNoKeyboard('own_confirm_reset_db', 'own_tools').reply_markup,
        }
      );
    }
    if (data === 'own_confirm_reset_db') {
      if (!isOwner) return ctx.answerCbQuery('❌ Hanya Owner', { show_alert: true });
      await ctx.answerCbQuery('⚠️ Database direset!', { show_alert: true });
      await db.logAudit({ type: 'reset_database', telegramId: from.id, username: from.username, detail: 'Full database reset' });
      // Only reset users/servers, keep config
      await db.write('users', []);
      await db.write('servers', []);
      await db.write('claims', []);
      await db.write('blacklist', []);
      await db.write('sessions', {});
      await db.write('cooldown', {});
      await db.write('activity_logs', []);
      return ctx.editMessageText(`✅ *Database berhasil direset\\!*`, { parse_mode: 'MarkdownV2', reply_markup: require('../utils/keyboard').backKeyboard('own_tools').reply_markup });
    }

    // ── Reseller actions ──────────────────────────────────────────────────────
    if (data === 'res_dashboard') {
      if (!isReseller && !isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return resellerCmd.showDashboard(ctx);
    }
    if (data === 'res_create') {
      if (!isReseller && !isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return resellerCmd.startCreate(ctx);
    }
    if (data === 'res_mylist') {
      if (!isReseller && !isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return resellerCmd.showMyList(ctx);
    }
    if (data === 'res_quota') {
      if (!isReseller && !isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      return resellerCmd.showQuota(ctx);
    }
    if (data.startsWith('res_list_page_')) {
      if (!isReseller && !isAdmin) return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
      await ctx.answerCbQuery();
      const page = parseInt(data.split('_')[3]);
      return resellerCmd.showMyList(ctx, page);
    }

    // Fallback
    logger.debug(`Unhandled callback: ${data}`);
    await ctx.answerCbQuery();

  } catch (err) {
    logger.error(`Callback handler error [${data}]: ${err.message}`);
    try {
      await ctx.answerCbQuery('❌ Terjadi error. Coba lagi.', { show_alert: true });
    } catch (_) {}
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────
async function showProfile(ctx) {
  const from = ctx.from;
  const userId = from.id;
  const { esc, formatDate } = require('../utils/format');
  const { backKeyboard } = require('../utils/keyboard');

  const [user, servers, isOwner, isAdmin, isReseller, isPremium, bl, cooldownSecs] = await Promise.all([
    db.getUser(userId),
    db.getUserServers(userId),
    db.isOwner(userId),
    db.isAdmin(userId),
    db.isReseller(userId),
    db.isPremium(userId),
    db.isBlacklisted(userId),
    db.getCooldown(userId, 'claim'),
  ]);

  if (!user) return;

  const referral = await db.getReferral(userId);
  const roleLabel = isOwner ? '👑 Owner' : isAdmin ? '🛡️ Admin' : isReseller ? '💼 Reseller' : isPremium ? '⭐ Premium' : '👤 User';
  const settings = require('../settings');

  const text = [
    `*📊 PROFIL AKUN*`,
    ``,
    `📛 *Nama* : ${esc(user.firstName || '')} ${esc(user.lastName || '')}`,
    `🔖 *Username* : @${esc(user.username || 'N/A')}`,
    `🆔 *Telegram ID* : \`${esc(String(user.telegramId))}\``,
    `🏷 *Role* : ${esc(roleLabel)}`,
    `📅 *Bergabung* : ${esc(formatDate(user.joinedAt))}`,
    ``,
    `📦 *Total Claim* : ${esc(String(user.claimCount || 0))}`,
    `🖥 *Total Panel* : ${esc(String(servers.length))}`,
    `👥 *Total Referral* : ${esc(String(referral?.invitedUsers?.length || 0))}`,
    `📢 *Total Share* : ${esc(String(user.shareCount || 0))}`,
    `💎 *Poin Referral* : ${esc(String(user.referralPoints || 0))}`,
    ``,
    `⭐ *Premium* : ${isPremium ? '✅ Aktif' : '❌ Tidak'}`,
    `💼 *Reseller* : ${isReseller ? '✅ Aktif' : '❌ Tidak'}`,
    `⛔ *Blacklist* : ${bl ? `⛔ ${esc(bl.reason)}` : '✅ Tidak'}`,
    `⏰ *Cooldown* : ${cooldownSecs > 0 ? esc(`${Math.floor(cooldownSecs / 3600)}j ${Math.floor((cooldownSecs % 3600) / 60)}m`) : '✅ Siap'}`,
    ``,
    `🎟 *Kode Referral* : \`${esc(user.referralCode || 'REF' + userId)}\``,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });
}

// ── Helper for Reseller/Premium lists ────────────────────────────────────────
async function showResellers(ctx) {
  const { esc } = require('../utils/format');
  const { backKeyboard } = require('../utils/keyboard');
  const { Markup } = require('telegraf');

  const resellers = await db.read('reseller');
  if (resellers.length === 0) {
    return ctx.editMessageText('*💼 KELOLA RESELLER*\n\nBelum ada reseller\\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: backKeyboard('adm_dashboard').reply_markup,
    });
  }

  const text = [
    `*💼 DAFTAR RESELLER*`,
    ``,
    `Total: *${resellers.length}*`,
    ``,
    ...resellers.map(r => `• @${esc(r.username || 'N/A')} \\- \`${esc(String(r.telegramId))}\` \\- Kuota: ${r.used || 0}/${r.quota}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
}

async function showPremiums(ctx) {
  const { esc, formatDate } = require('../utils/format');
  const { backKeyboard } = require('../utils/keyboard');

  const premiums = await db.read('premium');
  if (premiums.length === 0) {
    return ctx.editMessageText('*⭐ KELOLA PREMIUM*\n\nBelum ada user premium\\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: backKeyboard('adm_dashboard').reply_markup,
    });
  }

  const text = [
    `*⭐ DAFTAR PREMIUM*`,
    ``,
    `Total: *${premiums.length}*`,
    ``,
    ...premiums.map(p => `• \`${esc(String(p.telegramId))}\` \\- Expired: ${esc(p.expiredAt ? formatDate(p.expiredAt) : 'Selamanya')}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
}

module.exports = { handleCallback };
