'use strict';

const db = require('../services/database');
const ptero = require('../services/pterodactyl');
const logger = require('../services/logger');
const settings = require('../settings');
const { esc, loadingMessage, errorMessage, successMessage, formatDate, formatMB } = require('../utils/format');
const { resellerDashboard, backKeyboard, packageKeyboard, eggKeyboard, confirmKeyboard } = require('../utils/keyboard');
const { Markup } = require('telegraf');

async function showDashboard(ctx) {
  const reseller = await db.getReseller(ctx.from.id);
  if (!reseller) return ctx.editMessageText(errorMessage('Akses reseller tidak ditemukan\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });

  const text = [
    `*💼 DASHBOARD RESELLER*`,
    ``,
    `👤 *Nama* : ${esc(ctx.from.first_name)}`,
    `📦 *Kuota* : ${esc(String(reseller.used || 0))} \/ ${esc(String(reseller.quota))}`,
    `📊 *Sisa Kuota* : *${esc(String(reseller.quota - (reseller.used || 0)))}*`,
    `📅 *Bergabung* : ${esc(formatDate(reseller.addedAt))}`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: resellerDashboard().reply_markup });
}

async function startCreate(ctx) {
  const reseller = await db.getReseller(ctx.from.id);
  if (!reseller) return ctx.answerCbQuery('Akses ditolak', { show_alert: true });

  if ((reseller.used || 0) >= reseller.quota) {
    return ctx.editMessageText(errorMessage(`Kuota habis\\! Kamu sudah membuat *${reseller.used}/${reseller.quota}* panel\\.`), {
      parse_mode: 'MarkdownV2', reply_markup: backKeyboard('res_dashboard').reply_markup,
    });
  }

  const packages = await db.getPackages();
  await db.setSession(ctx.from.id, { step: 'res_select_pkg', isReseller: true });

  await ctx.editMessageText(
    `*📦 RESELLER \\- PILIH PAKET*\n\nKuota sisa: *${reseller.quota - (reseller.used || 0)}*\n\nPilih paket:`,
    { parse_mode: 'MarkdownV2', reply_markup: packageKeyboard(packages).reply_markup }
  );
}

async function showMyList(ctx, page = 1) {
  const userId = ctx.from.id;
  const allServers = await db.getAllServers();
  const myServers = allServers.filter(s => s.createdByReseller === userId);

  if (myServers.length === 0) {
    return ctx.editMessageText('*📋 PANEL RESELLER*\n\nBelum ada panel yang dibuat\\.', {
      parse_mode: 'MarkdownV2', reply_markup: backKeyboard('res_dashboard').reply_markup,
    });
  }

  const perPage = 5;
  const total = Math.ceil(myServers.length / perPage);
  const start = (page - 1) * perPage;
  const pageServers = myServers.slice(start, start + perPage);

  const text = [
    `*📋 PANEL RESELLER SAYA*`,
    ``,
    `Total: *${esc(String(myServers.length))}* panel`,
    ``,
    ...pageServers.map((s, i) => `${start + i + 1}\\. *${esc(s.serverName || s.panelUsername)}* \\- ${esc(s.eggName)}`),
  ].join('\n');

  const rows = pageServers.map(s => [Markup.button.callback(`🖥 ${s.serverName || s.panelUsername}`, `res_srv_${s.serverId}`)]);
  const navBtns = [];
  if (page > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `res_list_page_${page - 1}`));
  if (total > 1) navBtns.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) navBtns.push(Markup.button.callback('Next ➡️', `res_list_page_${page + 1}`));
  if (navBtns.length > 0) rows.push(navBtns);
  rows.push([Markup.button.callback('⬅️ Back', 'res_dashboard')]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function showQuota(ctx) {
  const reseller = await db.getReseller(ctx.from.id);
  const text = [
    `*📊 KUOTA RESELLER*`,
    ``,
    `📦 *Total Kuota* : ${esc(String(reseller.quota))}`,
    `✅ *Terpakai* : ${esc(String(reseller.used || 0))}`,
    `🔄 *Sisa* : ${esc(String(reseller.quota - (reseller.used || 0)))}`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('res_dashboard').reply_markup });
}

module.exports = { showDashboard, startCreate, showMyList, showQuota };
