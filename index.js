'use strict';

require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const db = require('./services/database');
const logger = require('./services/logger');
const settings = require('./settings');
const { handleCallback } = require('./handlers/callback');
const { handleText } = require('./handlers/text');
const { handleMyChatMember } = require('./handlers/group');
const startCmd = require('./commands/start');
const adminCmd = require('./commands/admin');
const panelCmd = require('./commands/panel');
const { rateLimit } = require('./middlewares/rateLimit');
const { checkMaintenance, checkBlacklist } = require('./middlewares/auth');
const { startScheduler } = require('./scheduler/cron');

if (!settings.botToken) {
  logger.error('BOT_TOKEN tidak diset. Tambahkan BOT_TOKEN ke .env atau environment variable.');
  process.exit(1);
}

const bot = new Telegraf(settings.botToken);

// ── Middleware ────────────────────────────────────────────────────────────────
bot.use(rateLimit);
bot.use(checkMaintenance);
bot.use(checkBlacklist);

// ── Ensure user registered ────────────────────────────────────────────────────
const { registerUser } = require('./middlewares/auth');
bot.use(registerUser);

// Load required channels into settings from DB at startup
(async () => {
  try {
    const groups = await db.read('required_groups');
    settings.requiredChannels = Array.isArray(groups)
      ? groups.filter(g => g.active !== false)
      : [];
    settings.requiredGroupCount = settings.requiredChannels.length;
  } catch (_) {
    settings.requiredChannels = [];
    settings.requiredGroupCount = 0;
  }
})();

// ── Commands ──────────────────────────────────────────────────────────────────
bot.command('start', ctx => startCmd.handleStart(ctx));
bot.command('help', ctx => startCmd.handleStart(ctx));
bot.command('menu', ctx => startCmd.handleStart(ctx));

// Admin panel server/user list commands (shortcut via text command)
bot.command('listserverpanel', async (ctx) => {
  const isAdmin = await db.isAdmin(ctx.from.id);
  const isOwner = settings.ownerIds.includes(ctx.from.id);
  if (!isAdmin && !isOwner) return ctx.reply('❌ Akses ditolak. Khusus Admin.');
  // Simulate inline context for shared function
  const fakeCtx = {
    ...ctx,
    answerCbQuery: () => Promise.resolve(),
    editMessageText: (text, opts) => ctx.reply(text, opts),
    from: ctx.from,
  };
  return adminCmd.showPanelServers(fakeCtx, 1);
});

bot.command('listuserpanel', async (ctx) => {
  const isAdmin = await db.isAdmin(ctx.from.id);
  const isOwner = settings.ownerIds.includes(ctx.from.id);
  if (!isAdmin && !isOwner) return ctx.reply('❌ Akses ditolak. Khusus Admin.');
  const fakeCtx = {
    ...ctx,
    answerCbQuery: () => Promise.resolve(),
    editMessageText: (text, opts) => ctx.reply(text, opts),
    from: ctx.from,
  };
  return adminCmd.showPanelUsers(fakeCtx, 1);
});

// ── Handlers ──────────────────────────────────────────────────────────────────
bot.on('callback_query', ctx => handleCallback(ctx));
bot.on('text', ctx => handleText(ctx));
bot.on('my_chat_member', ctx => handleMyChatMember(ctx));

// ── Error handler ─────────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  logger.error(`Bot error [${ctx?.updateType}]: ${err?.message || err}`);
  if (ctx?.reply) {
    ctx.reply('❌ Terjadi kesalahan internal. Silakan coba lagi.').catch(() => {});
  }
});

// ── Start polling ─────────────────────────────────────────────────────────────
async function start() {
  try {
    await bot.telegram.getMe().then(me => {
      logger.info(`Bot @${me.username} (${me.id}) started.`);
    });

    // Start cron jobs
    startScheduler(bot);

    // Start bot
    await bot.launch();
    logger.info('Bot is running...');
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
}

start();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.once('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  bot.stop('SIGTERM');
});
