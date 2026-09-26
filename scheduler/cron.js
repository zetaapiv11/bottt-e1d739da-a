'use strict';

const cron = require('node-cron');
const backup = require('../services/backup');
const db = require('../services/database');
const logger = require('../services/logger');
const settings = require('../settings');

function startScheduler(bot) {
  // Auto backup
  if (settings.autoBackup) {
    cron.schedule(settings.autoBackupInterval, async () => {
      try {
        const result = await backup.createBackup();
        logger.info(`Auto backup completed: ${result.filename}`);

        if (settings.logGroupId) {
          try {
            await bot.telegram.sendMessage(settings.logGroupId,
              `💾 *Auto Backup Selesai*\n\n📁 File: \`${result.filename}\`\n🕒 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
              { parse_mode: 'MarkdownV2' }
            );
          } catch (_) {}
        }
      } catch (err) {
        logger.error(`Auto backup failed: ${err.message}`);
      }
    });
    logger.info(`Auto backup scheduled: ${settings.autoBackupInterval}`);
  }

  // Cleanup expired cooldowns every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const cooldowns = await db.read('cooldown');
      const now = Date.now();
      let changed = false;
      for (const key of Object.keys(cooldowns)) {
        if (cooldowns[key] < now) {
          delete cooldowns[key];
          changed = true;
        }
      }
      if (changed) await db.write('cooldown', cooldowns);
    } catch (err) {
      logger.error(`Cooldown cleanup error: ${err.message}`);
    }
  });

  // Cleanup expired sessions every 30 min
  cron.schedule('*/30 * * * *', async () => {
    try {
      const sessions = await db.read('sessions');
      const cutoff = Date.now() - 30 * 60 * 1000;
      let changed = false;
      for (const [id, session] of Object.entries(sessions)) {
        if (new Date(session.updatedAt).getTime() < cutoff) {
          delete sessions[id];
          changed = true;
        }
      }
      if (changed) await db.write('sessions', sessions);
    } catch (err) {
      logger.error(`Session cleanup error: ${err.message}`);
    }
  });

  // Cleanup expired temp blacklists daily
  cron.schedule('0 0 * * *', async () => {
    try {
      const blacklist = await db.read('blacklist');
      const now = new Date();
      const filtered = blacklist.filter(b => !b.expiredAt || new Date(b.expiredAt) > now);
      if (filtered.length !== blacklist.length) {
        await db.write('blacklist', filtered);
        logger.info(`Removed ${blacklist.length - filtered.length} expired blacklist entries`);
      }
    } catch (err) {
      logger.error(`Blacklist cleanup error: ${err.message}`);
    }
  });

  logger.info('Scheduler started');
}

module.exports = { startScheduler };
