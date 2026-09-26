'use strict';

// ── MarkdownV2 escape ─────────────────────────────────────────────────────────
function esc(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Visual divider ────────────────────────────────────────────────────────────
const DIVIDER = '─────────────────────';

// ── Date formatting ───────────────────────────────────────────────────────────
function formatDate(iso, locale = 'id-ID', tz = 'Asia/Jakarta') {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString(locale, { timeZone: tz });
  } catch {
    return String(iso);
  }
}

// ── MB / GB formatting ────────────────────────────────────────────────────────
function formatMB(mb) {
  if (mb === null || mb === undefined || mb === 0) return '0 MB';
  const num = Number(mb);
  if (isNaN(num)) return `${mb} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(1)} GB`;
  return `${num} MB`;
}

// ── Uptime formatting ─────────────────────────────────────────────────────────
function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Generic message templates ─────────────────────────────────────────────────
function loadingMessage(text) {
  return `⏳ *Loading\\.\\.\\.*\n\n${text}`;
}

function errorMessage(text) {
  return `❌ *Error*\n\n${text}`;
}

function successMessage(text) {
  return `✅ *Berhasil\\!*\n\n${text}`;
}

// ── Panel created message ─────────────────────────────────────────────────────
function panelCreatedMessage({ username, password, email, panelUrl, packageName, eggName, nodeName, serverId, createdAt }) {
  const date = formatDate(createdAt);
  return [
    `🎉 *Panel Berhasil Dibuat\\!*`,
    ``,
    `${esc(DIVIDER)}`,
    ``,
    `🌐 *URL Panel*`,
    `${esc(panelUrl)}`,
    ``,
    `👤 *Login*`,
    `• Email: \`${esc(email)}\``,
    `• Username: \`${esc(username)}\``,
    `• Password: \`${esc(password)}\``,
    ``,
    `${esc(DIVIDER)}`,
    ``,
    `📦 *Detail Server*`,
    `• Paket: *${esc(packageName)}*`,
    `• Egg: *${esc(eggName)}*`,
    `• Node: *${esc(nodeName)}*`,
    `• Server ID: \`${esc(String(serverId))}\``,
    `• Dibuat: ${esc(date)}`,
    ``,
    `${esc(DIVIDER)}`,
    ``,
    `⚠️ *Simpan data login diatas\\!*`,
    `Jangan bagikan ke siapapun\\.`,
  ].join('\n');
}

// ── Admin dashboard message ───────────────────────────────────────────────────
function adminDashboardMessage(stats = {}, ping = null, apiStatus = true, uptimeMs = 0) {
  const pingText = ping !== null ? `${esc(String(ping))}ms` : 'N/A';
  const apiText = apiStatus ? '✅ Online' : '❌ Offline';
  return [
    `🛡️ *ADMIN DASHBOARD*`,
    ``,
    `👥 *Users* : ${esc(String(stats.totalUsers || 0))}`,
    `⭐ *Premium* : ${esc(String(stats.premiumUsers || 0))}`,
    `💼 *Reseller* : ${esc(String(stats.resellerUsers || 0))}`,
    `🖥️ *Servers* : ${esc(String(stats.totalServers || 0))}`,
    `🎟 *Voucher* : ${esc(String(stats.totalVouchers || 0))}`,
    ``,
    `🔌 *Panel API* : ${apiText}`,
    `📶 *Ping Panel* : ${pingText}`,
    `⏱️ *Bot Uptime* : *${esc(formatUptime(uptimeMs))}*`,
  ].join('\n');
}

module.exports = {
  esc,
  DIVIDER,
  formatDate,
  formatMB,
  formatUptime,
  loadingMessage,
  errorMessage,
  successMessage,
  panelCreatedMessage,
  adminDashboardMessage,
};
