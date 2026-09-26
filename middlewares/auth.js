'use strict';

const db = require('../services/database');
const { esc } = require('../utils/format');
const settings = require('../settings');
const { Markup } = require('telegraf');

const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];

async function getMissingRequiredChannels(ctx) {
  if (!ctx.from || !ctx.telegram) return [];
  const missing = [];
  for (const channel of settings.requiredChannels) {
    try {
      const chatId = channel.username
        ? `@${String(channel.username).replace(/^@/, '')}`
        : channel.groupId;
      const member = await ctx.telegram.getChatMember(chatId, ctx.from.id);
      if (!VALID_MEMBER_STATUSES.includes(member.status)) missing.push(channel);
    } catch (_) {
      missing.push(channel);
    }
  }
  return missing;
}

function requiredChannelsKeyboard(channels = settings.requiredChannels) {
  return Markup.inlineKeyboard([
    ...channels.map(channel => [Markup.button.url(`➡️ Join ${channel.name}`, channel.inviteLink)]),
    [Markup.button.callback('🔄 Cek Lagi', 'panel_check_groups')],
  ]);
}

async function sendRequiredChannelsMessage(ctx, channels) {
  const text = [
    `📢 *Wajib Join Channel*`,
    ``,
    `Untuk menggunakan bot, kamu harus join channel wajib berikut terlebih dahulu:`,
    ``,
    ...channels.map(channel => `• *${esc(channel.name)}*`),
    ``,
    `Setelah join, tekan tombol *Cek Lagi*\\.`,
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery('Join kedua channel terlebih dahulu.', { show_alert: true });
    return ctx.editMessageText(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: requiredChannelsKeyboard(channels).reply_markup,
    });
  }
  return ctx.reply(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: requiredChannelsKeyboard(channels).reply_markup,
  });
}

// Keep /start available so a new user can see the required-channel buttons.
// All other private-chat interactions are blocked until both channels are joined.
async function checkRequiredChannels(ctx, next) {
  if (!ctx.from || ctx.chat?.type !== 'private') return next();
  const messageText = ctx.message?.text || '';
  const callbackData = ctx.callbackQuery?.data || '';
  if (messageText.startsWith('/start')) return next();
  if (callbackData === 'panel_check_groups') return next();

  const missing = await getMissingRequiredChannels(ctx);
  if (missing.length === 0) return next();
  return sendRequiredChannelsMessage(ctx, missing);
}

// Auto-register user on every update
async function registerUser(ctx, next) {
  const from = ctx.from;
  if (!from || from.is_bot) return next();

  try {
    const user = await db.getUser(from.id);
    if (!user) {
      await db.createUser({
        telegramId: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
    } else {
      await db.updateUser(from.id, {
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
    }
  } catch (err) {
    // non-fatal
  }

  return next();
}

// Maintenance mode check
async function checkMaintenance(ctx, next) {
  if (!settings.maintenanceMode) return next();

  const from = ctx.from;
  if (!from) return;

  const isAdmin = await db.isAdmin(from.id);
  if (isAdmin) return next();

  const text = ctx.callbackQuery ? null : ctx.message?.text;
  if (text?.startsWith('/start')) {
    await ctx.reply('🔧 *Bot sedang dalam maintenance\\.*\n\nSilakan coba beberapa saat lagi\\.', {
      parse_mode: 'MarkdownV2',
    });
  } else if (ctx.callbackQuery) {
    await ctx.answerCbQuery('🔧 Bot sedang maintenance. Silakan coba lagi nanti.', { show_alert: true });
  }
}

// Blacklist check
async function checkBlacklist(ctx, next) {
  const from = ctx.from;
  if (!from) return next();

  const bl = await db.isBlacklisted(from.id);
  if (!bl) return next();

  const msg = `⛔ *Akun Diblokir*\n\n*Alasan:* ${esc(bl.reason)}\n\nHubungi admin jika ada pertanyaan\\.`;
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery('⛔ Akun kamu diblokir!', { show_alert: true });
  } else {
    await ctx.reply(msg, { parse_mode: 'MarkdownV2' });
  }
}

// Role middleware factories
function requireOwner() {
  return async (ctx, next) => {
    const isOwner = await db.isOwner(ctx.from?.id);
    if (isOwner) return next();
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Akses ditolak. Hanya Owner.', { show_alert: true });
    } else {
      await ctx.reply('❌ Akses ditolak\\. Hanya Owner yang dapat menggunakan fitur ini\\.', { parse_mode: 'MarkdownV2' });
    }
  };
}

function requireAdmin() {
  return async (ctx, next) => {
    const isAdmin = await db.isAdmin(ctx.from?.id);
    if (isAdmin) return next();
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Akses ditolak. Hanya Admin/Owner.', { show_alert: true });
    } else {
      await ctx.reply('❌ Akses ditolak\\. Hanya Admin yang dapat menggunakan fitur ini\\.', { parse_mode: 'MarkdownV2' });
    }
  };
}

function requireReseller() {
  return async (ctx, next) => {
    const isReseller = await db.isReseller(ctx.from?.id);
    const isAdmin = await db.isAdmin(ctx.from?.id);
    if (isReseller || isAdmin) return next();
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Akses ditolak. Hanya Reseller.', { show_alert: true });
    } else {
      await ctx.reply('❌ Akses ditolak\\. Hanya Reseller yang dapat menggunakan fitur ini\\.', { parse_mode: 'MarkdownV2' });
    }
  };
}

module.exports = {
  registerUser,
  checkMaintenance,
  checkBlacklist,
  checkRequiredChannels,
  getMissingRequiredChannels,
  sendRequiredChannelsMessage,
  requireOwner,
  requireAdmin,
  requireReseller,
};
