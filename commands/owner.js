'use strict';

const db = require('../services/database');
const ptero = require('../services/pterodactyl');
const logger = require('../services/logger');
const settings = require('../settings');
const { esc, loadingMessage, errorMessage, successMessage, formatDate, formatMB, formatUptime } = require('../utils/format');
const { ownerDashboard, backKeyboard } = require('../utils/keyboard');
const { Markup } = require('telegraf');

async function showDashboard(ctx) {
  await ctx.editMessageText(loadingMessage('Memuat dashboard owner\\.\\.\\.'), { parse_mode: 'MarkdownV2' });

  const [stats, ping, apiStatus] = await Promise.all([
    db.getStats(),
    ptero.pingPanel(),
    ptero.getApiStatus(),
  ]);

  let nodes = [];
  try { nodes = await ptero.listNodes(); } catch (_) {}

  const text = [
    `*👑 DASHBOARD OWNER*`,
    ``,
    `👤 *Total User* : ${esc(String(stats.totalUsers || 0))}`,
    `⭐ *Premium* : ${esc(String(stats.totalPremium || 0))}`,
    `💼 *Reseller* : ${esc(String(stats.totalResellers || 0))}`,
    `🛡️ *Admin* : ${esc(String(stats.totalAdmins || 0))}`,
    `🖥 *Total Server* : ${esc(String(stats.totalServers || 0))}`,
    `🎟 *Voucher* : ${esc(String(stats.totalVouchers || 0))}`,
    `⛔ *Blacklist* : ${esc(String(stats.totalBlacklist || 0))}`,
    ``,
    `📊 *Claim Hari Ini* : ${esc(String(stats.todayClaims || 0))}`,
    `📊 *Claim Minggu Ini* : ${esc(String(stats.weekClaims || 0))}`,
    `📊 *Claim Bulan Ini* : ${esc(String(stats.monthClaims || 0))}`,
    ``,
    `🖧 *Node* : ${esc(String(nodes.length))} node`,
    `📡 *API Status* : ${apiStatus ? '🟢 Online' : '🔴 Offline'}`,
    `📡 *API Ping* : ${esc(String(ping >= 0 ? ping + 'ms' : 'N/A'))}`,
    ``,
    `🤖 *Bot Uptime* : ${esc(formatUptime(process.uptime() * 1000))}`,
    `💾 *DB Size* : ${esc(stats.dbSize)}`,
    `🔢 *Versi* : ${esc(settings.botVersion)}`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: ownerDashboard().reply_markup });
}

async function showAdminManagement(ctx) {
  const admins = await db.read('admins');
  const text = [
    `*🛡️ KELOLA ADMIN*`,
    ``,
    `Total: *${admins.length}* admin`,
    ``,
    ...admins.map(a => `• @${esc(a.username || 'N/A')} \\- \`${esc(String(a.telegramId))}\``),
  ].join('\n');

  const rows = admins.map(a => [Markup.button.callback(`❌ Hapus ${a.username || a.telegramId}`, `own_rem_admin_${a.telegramId}`)]);
  rows.push([Markup.button.callback('➕ Tambah Admin', 'own_add_admin'), Markup.button.callback('⬅️ Back', 'own_dashboard')]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function addAdmin(ctx, telegramId) {
  const userId = parseInt(telegramId);
  const user = await db.getUser(userId);
  if (!user) return ctx.answerCbQuery('User tidak ditemukan', { show_alert: true });

  await db.addAdmin({ telegramId: userId, username: user.username, addedBy: ctx.from.id });
  await db.logAudit({ type: 'add_admin', telegramId: ctx.from.id, username: ctx.from.username, detail: `Added admin: ${userId}` });

  try { await ctx.telegram.sendMessage(userId, `🛡️ *Kamu diangkat menjadi Admin\\!*`, { parse_mode: 'MarkdownV2' }); } catch (_) {}
  await ctx.answerCbQuery('✅ Admin ditambahkan!', { show_alert: true });
}

async function removeAdmin(ctx, telegramId) {
  await db.removeAdmin(parseInt(telegramId));
  await db.logAudit({ type: 'remove_admin', telegramId: ctx.from.id, username: ctx.from.username, detail: `Removed admin: ${telegramId}` });
  await ctx.answerCbQuery('✅ Admin dihapus!', { show_alert: true });
  await showAdminManagement(ctx);
}

async function showOwnerTools(ctx) {
  const text = `*👑 OWNER TOOLS*\n\nPilih aksi:`;
  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Restart Bot', 'own_restart'), Markup.button.callback('⚡ Shutdown Bot', 'own_shutdown')],
      [Markup.button.callback('🚨 Mode Darurat', 'own_emergency'), Markup.button.callback('🔧 Reload Config', 'own_reload')],
      [Markup.button.callback('🗑️ Reset Database', 'own_reset_db'), Markup.button.callback('📋 Audit Log', 'own_auditlog')],
      [Markup.button.callback('⬅️ Back', 'own_dashboard')],
    ]).reply_markup,
  });
}

async function toggleEmergency(ctx) {
  settings.emergencyMode = !settings.emergencyMode;
  settings.maintenanceMode = settings.emergencyMode;
  await db.logAudit({ type: 'toggle_emergency', telegramId: ctx.from.id, username: ctx.from.username, detail: `Emergency: ${settings.emergencyMode}` });
  await ctx.answerCbQuery(`🚨 Mode Darurat: ${settings.emergencyMode ? 'AKTIF' : 'MATI'}`, { show_alert: true });
}

async function restartBot(ctx) {
  await ctx.answerCbQuery('🔄 Bot akan restart dalam 3 detik...', { show_alert: true });
  await db.logAudit({ type: 'restart_bot', telegramId: ctx.from.id, username: ctx.from.username, detail: 'Bot restarted by owner' });
  setTimeout(() => process.exit(0), 3000);
}

async function shutdownBot(ctx) {
  await ctx.answerCbQuery('⚡ Bot shutdown...', { show_alert: true });
  await db.logAudit({ type: 'shutdown_bot', telegramId: ctx.from.id, username: ctx.from.username, detail: 'Bot shut down by owner' });
  setTimeout(() => process.exit(1), 2000);
}

async function showAuditLog(ctx) {
  const logs = await db.read('audit_logs');
  const recent = logs.slice(-15).reverse();
  const text = [
    `*📋 AUDIT LOG \\(15 Terbaru\\)*`,
    ``,
    ...recent.map(l => `• \\[${esc((l.timestamp || '').slice(11, 19))}\\] *${esc(l.type)}* \\- @${esc(l.username || 'N/A')} \\- ${esc(l.detail || '')}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('own_tools').reply_markup });
}

async function showApiSettings(ctx) {
  const text = [
    `*🔧 API SETTINGS*`,
    ``,
    `🌐 *Panel URL* : \`${esc(settings.panelUrl)}\``,
    `🔑 *App Key* : \`${esc(settings.appApiKey.slice(0, 10))}\\.\\.\\.\``,
    `🔑 *Client Key* : \`${esc(settings.clientApiKey.slice(0, 10))}\\.\\.\\.\``,
    `🖧 *Default Node* : ${esc(String(settings.defaultNodeId))}`,
    `📍 *Default Location* : ${esc(String(settings.defaultLocationId))}`,
    ``,
    `_Untuk mengubah API, edit file \\.env dan restart bot\\._`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('own_dashboard').reply_markup });
}

module.exports = { showDashboard, showAdminManagement, addAdmin, removeAdmin, showOwnerTools, toggleEmergency, restartBot, shutdownBot, showAuditLog, showApiSettings };
