'use strict';

const db = require('../services/database');
const logger = require('../services/logger');

// Called when bot is added to a group or member status changes
async function handleMyChatMember(ctx) {
  try {
    const chat = ctx.chat;
    const update = ctx.myChatMember;
    if (!update) return;

    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;
    const addedBy = update.from;

    if (!chat || !addedBy) return;
    if (chat.type === 'private') return;

    const isAdmin = ['administrator', 'creator'].includes(newStatus);
    const wasMember = ['member', 'administrator', 'creator'].includes(oldStatus);
    const isMember = ['member', 'administrator', 'creator'].includes(newStatus);

    if (isMember) {
      // Bot added to group
      await db.addShareLog({
        telegramId: addedBy.id,
        username: addedBy.username || '',
        groupId: chat.id,
        groupName: chat.title || '',
        groupType: chat.type,
        isAdmin,
        isMember: true,
        status: newStatus,
      });

      logger.info(`Bot added to group ${chat.id} (${chat.title}) by user ${addedBy.id} as ${newStatus}`);

      try {
        await ctx.telegram.sendMessage(addedBy.id,
          `✅ Bot sudah ditambahkan ke *${escapeMarkdown(chat.title)}*\\.\n\nGrup ini dihitung sebagai share\\. Bot tidak perlu menjadi admin\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (_) {}

      const user = await db.getUser(addedBy.id);
      if (user) {
        const shareLogs = await db.getShareLogs(addedBy.id);
        await db.updateUser(addedBy.id, { shareCount: shareLogs.length });
      }
    } else if (!isMember && wasMember) {
      // Bot removed from group - update share log
      await db.updateShareLog(addedBy.id, chat.id, { status: newStatus, isAdmin: false, isMember: false, removedAt: new Date().toISOString() });
      logger.info(`Bot removed from group ${chat.id} by ${addedBy.id}`);
    }

    // If status changed to admin in existing group
    if (isAdmin && !['administrator', 'creator'].includes(oldStatus) && wasMember) {
      await db.updateShareLog(addedBy.id, chat.id, { isAdmin: true, isMember: true, status: newStatus, promotedAt: new Date().toISOString() });
      
      const shareLogs = await db.getShareLogs(addedBy.id);
      await db.updateUser(addedBy.id, { shareCount: shareLogs.length });

      // Promotion is not required; this branch only refreshes the existing log.
    }

  } catch (err) {
    logger.error(`Group handler error: ${err.message}`);
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = { handleMyChatMember };
