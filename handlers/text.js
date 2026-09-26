'use strict';

const db = require('../services/database');
const panelCmd = require('../commands/panel');
const adminCmd = require('../commands/admin');
const logger = require('../services/logger');

async function handleText(ctx) {
  const from = ctx.from;
  const text = ctx.message?.text;
  if (!text || text.startsWith('/')) return;

  const session = await db.getSession(from.id);
  if (!session) return;

  try {
    switch (session.step) {
      case 'input_username':
        await panelCmd.submitUsername(ctx, text.trim());
        break;

      case 'input_password':
        await panelCmd.submitPassword(ctx, text.trim());
        break;

      case 'input_voucher':
        await panelCmd.redeemVoucher(ctx, text.trim());
        break;

      case 'broadcast':
        await adminCmd.executeBroadcast(ctx, session);
        break;

      case 'adm_waiting_add_group': {
        // Expecting group ID or username
        const groupId = parseInt(text.trim());
        if (isNaN(groupId)) {
          await ctx.reply('❌ Masukkan Group ID yang valid \\(angka\\)\\.', { parse_mode: 'MarkdownV2' });
        } else {
          try {
            const chat = await ctx.telegram.getChat(groupId);
            await db.addRequiredGroup({ groupId, name: chat.title || String(groupId), username: chat.username, inviteLink: chat.invite_link });
            await db.clearSession(from.id);
            await ctx.reply(`✅ Grup *${chat.title}* berhasil ditambahkan\\!`, { parse_mode: 'MarkdownV2' });
          } catch (_) {
            await ctx.reply('❌ Grup tidak ditemukan atau bot bukan anggota grup tersebut\\.', { parse_mode: 'MarkdownV2' });
          }
        }
        break;
      }

      case 'adm_waiting_add_blacklist': {
        const parts = text.trim().split(' ');
        const userId = parseInt(parts[0]);
        const reason = parts.slice(1).join(' ') || 'Dilaporkan oleh admin';
        if (isNaN(userId)) {
          await ctx.reply('❌ Format: `<telegram_id> <alasan>`', { parse_mode: 'MarkdownV2' });
        } else {
          await db.addToBlacklist(userId, reason, from.id);
          await db.clearSession(from.id);
          await db.logAudit({ type: 'add_blacklist', telegramId: from.id, username: from.username, detail: `Blacklisted ${userId}: ${reason}` });
          await ctx.reply(`✅ User \`${userId}\` diblacklist: ${reason}`, { parse_mode: 'MarkdownV2' });
        }
        break;
      }

      case 'adm_waiting_add_admin': {
        const userId = parseInt(text.trim());
        if (isNaN(userId)) {
          await ctx.reply('❌ Masukkan Telegram ID yang valid\\.', { parse_mode: 'MarkdownV2' });
        } else {
          const user = await db.getUser(userId);
          if (!user) {
            await ctx.reply('❌ User tidak ditemukan di database bot\\. Minta user untuk /start terlebih dahulu\\.', { parse_mode: 'MarkdownV2' });
          } else {
            await db.addAdmin({ telegramId: userId, username: user.username, addedBy: from.id });
            await db.clearSession(from.id);
            await db.logAudit({ type: 'add_admin', telegramId: from.id, username: from.username, detail: `Added admin: ${userId}` });
            await ctx.reply(`✅ User \`${userId}\` dijadikan Admin\\!`, { parse_mode: 'MarkdownV2' });
            try { await ctx.telegram.sendMessage(userId, `🛡️ *Kamu diangkat menjadi Admin\\!*`, { parse_mode: 'MarkdownV2' }); } catch (_) {}
          }
        }
        break;
      }

      case 'adm_waiting_create_voucher': {
        // Format: CODE TYPE MAXUSES [DAYS]
        // TYPE: panel | premium | points
        const parts = text.trim().split(' ');
        if (parts.length < 2) {
          await ctx.reply('❌ Format: `<KODE> <panel|premium|points> [maks_pakai] [value]`', { parse_mode: 'MarkdownV2' });
        } else {
          const [code, type, maxUses, value] = parts;
          const reward = {};
          if (type === 'premium') reward.days = parseInt(value) || 30;
          if (type === 'points') reward.points = parseInt(value) || 10;
          if (type === 'panel') reward.panel = true;

          await db.createVoucher({
            code,
            type,
            reward,
            maxUses: parseInt(maxUses) || 1,
            createdBy: from.id,
          });
          await db.clearSession(from.id);
          await ctx.reply(`✅ Voucher \`${code.toUpperCase()}\` berhasil dibuat\\!`, { parse_mode: 'MarkdownV2' });
        }
        break;
      }

      case 'adm_search_user': {
        const query = text.trim();
        const users = await db.getAllUsers();
        const found = users.filter(u =>
          String(u.telegramId).includes(query) ||
          (u.username || '').toLowerCase().includes(query.toLowerCase()) ||
          (u.firstName || '').toLowerCase().includes(query.toLowerCase())
        );

        if (found.length === 0) {
          await ctx.reply('❌ User tidak ditemukan\\.', { parse_mode: 'MarkdownV2' });
        } else {
          const { Markup } = require('telegraf');
          const rows = found.slice(0, 10).map(u => [Markup.button.callback(`👤 ${u.firstName || u.username || u.telegramId}`, `adm_user_${u.telegramId}`)]);
          await db.clearSession(from.id);
          await ctx.reply(
            `🔍 *Hasil Pencarian* \\(${found.length} user\\)`,
            { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup }
          );
        }
        break;
      }

      case 'adm_search_server': {
        const query = text.trim();
        const servers = await db.getAllServers();
        const found = servers.filter(s =>
          String(s.serverId).includes(query) ||
          (s.serverName || '').toLowerCase().includes(query.toLowerCase()) ||
          (s.panelUsername || '').toLowerCase().includes(query.toLowerCase()) ||
          String(s.telegramId).includes(query)
        );

        if (found.length === 0) {
          await ctx.reply('❌ Server tidak ditemukan\\.', { parse_mode: 'MarkdownV2' });
        } else {
          const { Markup } = require('telegraf');
          const rows = found.slice(0, 10).map(s => [Markup.button.callback(`🖥 ${s.serverName || s.panelUsername}`, `adm_srv_info_${s.serverId}`)]);
          await db.clearSession(from.id);
          await ctx.reply(
            `🔍 *Hasil Pencarian* \\(${found.length} server\\)`,
            { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup }
          );
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    logger.error(`Text handler error: ${err.message}`);
  }
}

module.exports = { handleText };
