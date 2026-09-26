'use strict';

const db = require('../services/database');
const { esc, formatDate } = require('../utils/format');
const { mainMenu, navRow, backKeyboard } = require('../utils/keyboard');
const settings = require('../settings');
const { getMissingRequiredChannels, sendRequiredChannelsMessage } = require('../middlewares/auth');

async function handleStart(ctx) {
  const from = ctx.from;
  const text = ctx.message?.text || '';

  // Handle referral code in /start
  const args = text.split(' ');
  if (args[1] && args[1].startsWith('REF')) {
    const refCode = args[1];
    const referrer = (await db.getAllUsers()).find(u => u.referralCode === refCode);
    if (referrer && referrer.telegramId !== from.id) {
      const existing = await db.getUser(from.id);
      if (!existing || !existing.referredBy) {
        await db.updateUser(from.id, { referredBy: referrer.telegramId });
        await db.addReferralPoint(referrer.telegramId, from.id, settings.referralPointsPerInvite);
        await db.updateUser(referrer.telegramId, { referralPoints: (referrer.referralPoints || 0) + settings.referralPointsPerInvite });
        try {
          await ctx.telegram.sendMessage(referrer.telegramId, 
            `🎉 *Referral Baru\\!*\n\n[@${esc(from.username || from.first_name)}](tg://user?id=${from.id}) bergabung menggunakan kode referralmu\\!\n\n💎 *\\+${settings.referralPointsPerInvite} poin* ditambahkan ke akunmu\\.`,
            { parse_mode: 'MarkdownV2' }
          );
        } catch (_) {}
      }
    }
  }

  const missingChannels = await getMissingRequiredChannels(ctx);
  if (missingChannels.length > 0) {
    return sendRequiredChannelsMessage(ctx, missingChannels);
  }
  await sendMainMenu(ctx);
}

async function sendMainMenu(ctx, edit = false) {
  const from = ctx.from;
  const [isOwner, isAdmin, isReseller, isPremium] = await Promise.all([
    db.isOwner(from.id),
    db.isAdmin(from.id),
    db.isReseller(from.id),
    db.isPremium(from.id),
  ]);

  const roleEmoji = isOwner ? '👑' : isAdmin ? '🛡️' : isReseller ? '💼' : isPremium ? '⭐' : '👤';
  const roleName = isOwner ? 'Owner' : isAdmin ? 'Admin' : isReseller ? 'Reseller' : isPremium ? 'Premium' : 'User';

  const text = [
    `*Selamat datang di ${esc(settings.botName)}\\!* 🚀`,
    ``,
    `${roleEmoji} *${esc(from.first_name)}* \\| ${esc(roleName)}`,
    ``,
    `📦 Bot otomatis untuk membuat panel *Pterodactyl*\\.`,
    `Pilih menu di bawah untuk memulai\\.`,
    ``,
    `🕒 ${esc(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}`,
  ].join('\n');

  // Build keyboard based on role
  const { Markup } = require('telegraf');
  const rows = [
    [Markup.button.callback('📦 Claim Panel', 'menu_claim'), Markup.button.callback('🖥 Panel Saya', 'menu_mypanel')],
    [Markup.button.callback('📊 Profil', 'menu_profile'), Markup.button.callback('🎟 Voucher', 'menu_voucher')],
    [Markup.button.callback('👥 Referral', 'menu_referral'), Markup.button.callback('🏆 Leaderboard', 'menu_leaderboard')],
    [Markup.button.callback('📢 Share Bot', 'menu_share'), Markup.button.callback('📜 Rules', 'menu_rules')],
    [Markup.button.callback('❓ Bantuan', 'menu_help'), Markup.button.callback('📞 Contact Admin', 'menu_contact')],
  ];

  if (isAdmin || isOwner) {
    rows.push([Markup.button.callback('🛡️ Panel Admin', 'adm_dashboard'), Markup.button.callback('👑 Panel Owner', 'own_dashboard')]);
  } else if (isReseller) {
    rows.push([Markup.button.callback('💼 Panel Reseller', 'res_dashboard')]);
  }

  rows.push([Markup.button.callback('ℹ️ Tentang Bot', 'menu_about')]);

  const keyboard = Markup.inlineKeyboard(rows);

  try {
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
    } else {
      await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
    }
  } catch (_) {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
  }
}

async function handleAbout(ctx) {
  const text = [
    `*ℹ️ Tentang ${esc(settings.botName)}*`,
    ``,
    `🤖 *Versi* : ${esc(settings.botVersion)}`,
    `👑 *Owner* : @${esc(settings.ownerUsername)}`,
    `🛠 *Stack* : Node\\.js \\+ Telegraf`,
    `🖥 *Panel* : Pterodactyl`,
    ``,
    `📦 *Fitur Utama:*`,
    `• Auto create Pterodactyl panel`,
    `• Sistem role \\(Owner/Admin/Reseller/User\\)`,
    `• Sistem voucher & referral`,
    `• Anti\\-spam & blacklist`,
    `• Backup otomatis`,
    `• Multi\\-node support`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: backKeyboard('menu_home').reply_markup,
  });
}

async function handleRules(ctx) {
  const text = [
    `*📜 RULES & KETENTUAN*`,
    ``,
    `Dengan menggunakan bot ini, kamu menyetujui:`,
    ``,
    `1️⃣ *Dilarang spam* command atau button`,
    `2️⃣ *Dilarang menjual* panel tanpa izin admin`,
    `3️⃣ *Dilarang menyalahgunakan* panel untuk aktivitas ilegal`,
    `4️⃣ *Dilarang menggunakan* panel untuk mining, DDoS, atau aktivitas berbahaya`,
    `5️⃣ *Dilarang membuat* akun ganda untuk bypass sistem`,
    `6️⃣ *Wajib menjaga* panel dalam kondisi baik`,
    ``,
    `⚠️ *Pelanggaran* akan mengakibatkan:`,
    `• Suspend panel`,
    `• Blacklist permanen`,
    `• Laporan ke Telegram`,
    ``,
    `Admin berhak mengambil tindakan kapan saja tanpa pemberitahuan sebelumnya\\.`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: backKeyboard('menu_home').reply_markup,
  });
}

async function handleHelp(ctx) {
  const text = [
    `*❓ BANTUAN*`,
    ``,
    `*Cara Claim Panel:*`,
    `1\\. Join ${settings.requiredGroupCount} channel wajib`,
    `2\\. Tambahkan bot ke ${settings.requiredShareCount} grup \\(tidak perlu Admin\\)`,
    `3\\. Tekan 📦 Claim Panel`,
    `4\\. Pilih paket & egg`,
    `5\\. Masukkan username & password`,
    `6\\. Konfirmasi & selesai\\!`,
    ``,
    `*Cara Gunakan Voucher:*`,
    `1\\. Tekan 🎟 Voucher`,
    `2\\. Masukkan kode voucher`,
    `3\\. Tekan konfirmasi`,
    ``,
    `*Cara Referral:*`,
    `1\\. Tekan 👥 Referral`,
    `2\\. Salin link referralmu`,
    `3\\. Share ke teman`,
    `4\\. Kumpulkan poin & tukar hadiah`,
    ``,
    `*FAQ:*`,
    `❓ Panel tidak bisa dibuat?`,
    `→ Pastikan sudah join dua channel wajib & bot sudah ditambahkan ke ${settings.requiredShareCount} grup`,
    ``,
    `❓ Lupa password?`,
    `→ Hubungi admin untuk reset password`,
    ``,
    `❓ Panel suspend?`,
    `→ Hubungi admin untuk unsuspend`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: backKeyboard('menu_home').reply_markup,
  });
}

async function handleContact(ctx) {
  const { Markup } = require('telegraf');
  const text = [
    `*📞 HUBUNGI ADMIN*`,
    ``,
    `Jika ada masalah atau pertanyaan, kamu dapat menghubungi admin:`,
    ``,
    `👤 *Admin* : @${esc(settings.ownerUsername)}`,
    ``,
    `⚠️ _Harap sertakan:_`,
    `• Telegram ID kamu`,
    `• Screenshot masalah`,
    `• Deskripsi masalah`,
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url(`💬 Chat Admin`, `https://t.me/${settings.ownerUsername}`)],
    [Markup.button.callback('⬅️ Kembali', 'menu_home')],
  ]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
}

module.exports = { handleStart, sendMainMenu, handleAbout, handleRules, handleHelp, handleContact };
