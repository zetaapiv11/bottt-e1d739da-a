'use strict';

const db = require('../services/database');
const logger = require('../services/logger');
const settings = require('../settings');

const requestCounts = new Map(); // telegramId -> { count, windowStart, warnings }

async function rateLimit(ctx, next) {
  const from = ctx.from;
  if (!from || from.is_bot) return next();

  const now = Date.now();
  const windowMs = settings.rateLimitWindow * 1000;
  const max = settings.rateLimitMax;

  let data = requestCounts.get(from.id);
  if (!data || now - data.windowStart > windowMs) {
    data = { count: 0, windowStart: now, warnings: data?.warnings || 0 };
  }

  data.count++;
  requestCounts.set(from.id, data);

  if (data.count > max) {
    data.warnings++;
    requestCounts.set(from.id, data);

    await db.logSecurity({
      type: 'rate_limit',
      telegramId: from.id,
      username: from.username,
      detail: `Rate limit exceeded: ${data.count} requests in ${settings.rateLimitWindow}s`,
    });

    if (data.warnings >= settings.rateLimitWarnings && settings.autoBlacklist) {
      await db.addToBlacklist(from.id, 'Auto-blacklist: Spam detected', 'system', 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h temp ban
      );
      logger.warn(`Auto-blacklisted user ${from.id} for spam`);
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Kamu mengirim terlalu banyak request. Tunggu sebentar.', { show_alert: true });
    } else {
      await ctx.reply('⚠️ Terlalu banyak request\\. Tunggu beberapa saat sebelum melanjutkan\\.', { parse_mode: 'MarkdownV2' });
    }
    return; // Block request
  }

  return next();
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of requestCounts.entries()) {
    if (now - data.windowStart > settings.rateLimitWindow * 1000 * 2) {
      requestCounts.delete(id);
    }
  }
}, 60000);

module.exports = { rateLimit };
