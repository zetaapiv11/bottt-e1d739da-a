'use strict';

const db = require('../services/database');
const ptero = require('../services/pterodactyl');
const logger = require('../services/logger');
const settings = require('../settings');
const { esc, formatDate, formatMB, loadingMessage, panelCreatedMessage, errorMessage, DIVIDER } = require('../utils/format');
const { packageKeyboard, eggKeyboard, confirmKeyboard, serverControlKeyboard, backKeyboard, paginationKeyboard, nodeSelectKeyboard } = require('../utils/keyboard');
const { Markup } = require('telegraf');

// ── Verify user requirements before claim ────────────────────────────────────
async function verifyRequirements(ctx) {
  const userId = ctx.from.id;

  // 1. Blacklist
  const bl = await db.isBlacklisted(userId);
  if (bl) return { ok: false, type: 'blacklist', reason: bl.reason };

  // Admins and owners use this same flow from the admin panel. They should
  // not be blocked by end-user claim requirements (cooldown, panel quota,
  // required channels, or share count).
  const isAdmin = await db.isAdmin(userId);
  const isOwner = await db.isOwner(userId);
  if (isAdmin || isOwner) return { ok: true };

  // 2. Cooldown
  const cooldown = await db.getCooldown(userId, 'claim');
  if (cooldown > 0) return { ok: false, type: 'cooldown', seconds: cooldown };

  // 3. Max panel check
  const isPremium = await db.isPremium(userId);
  const userServers = await db.getUserServers(userId);
  const maxPanels = isPremium ? settings.maxPanelPremium : settings.maxPanelPerUser;
  if (maxPanels > 0 && userServers.length >= maxPanels) {
    return { ok: false, type: 'max_panel', count: userServers.length, max: maxPanels };
  }

  // 4. Required channel join check
  const activeGroups = settings.requiredChannels;
  const groupErrors = [];
  for (const group of activeGroups) {
    try {
      const chatId = group.username ? `@${String(group.username).replace(/^@/, '')}` : group.groupId;
      const member = await ctx.telegram.getChatMember(chatId, userId);
      const validStatuses = ['member', 'administrator', 'creator'];
      if (!validStatuses.includes(member.status)) {
        groupErrors.push(group);
      }
    } catch (_) {
      groupErrors.push(group);
    }
  }
  if (groupErrors.length > 0) return { ok: false, type: 'groups', groups: groupErrors };

  // 5. Share bot check (bot added to 3 groups; admin is not required)
  const shareLogs = await db.getShareLogs(userId);
  if (shareLogs.length < settings.requiredShareCount) {
    return { ok: false, type: 'share', count: shareLogs.length, required: settings.requiredShareCount };
  }

  return { ok: true };
}

// ── Start claim process ───────────────────────────────────────────────────────
async function startClaim(ctx) {
  const userId = ctx.from.id;
  const isAdmin = await db.isAdmin(userId);

  // Show loading
  await ctx.editMessageText(loadingMessage('Memeriksa persyaratan\\.\\.\\.'), { parse_mode: 'MarkdownV2' });

  const verify = await verifyRequirements(ctx);

  if (!verify.ok) {
    return sendVerifyError(ctx, verify);
  }

  // Clear old session
  await db.clearSession(userId);

  // Show packages
  const packages = await db.getPackages();
  // Filter unlimited - only admin/owner can see it
  const filteredPkgs = isAdmin 
    ? await db.read('packages') 
    : packages.filter(p => !p.ownerOnly);

  if (filteredPkgs.length === 0) {
    return ctx.editMessageText(errorMessage('Tidak ada paket tersedia saat ini\\.'), { parse_mode: 'MarkdownV2' });
  }

  const text = [
    `*📦 PILIH PAKET PANEL*`,
    ``,
    `${esc(DIVIDER)}`,
    `Pilih paket sesuai kebutuhan kamu:`,
    ``,
    ...filteredPkgs.map(p => `• *${esc(p.name)}* \\— RAM: ${esc(formatMB(p.ram))}, CPU: ${esc(String(p.cpu || 'Unlimited'))}%, Disk: ${esc(formatMB(p.disk))}`),
    ``,
    `${esc(DIVIDER)}`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: packageKeyboard(filteredPkgs).reply_markup,
  });
}

async function sendVerifyError(ctx, verify) {
  const { Markup } = require('telegraf');
  let text = '';
  let keyboard = null;

  if (verify.type === 'blacklist') {
    text = `⛔ *Akun Diblokir*\n\n*Alasan:* ${esc(verify.reason)}\n\nHubungi admin untuk informasi lebih lanjut\\.`;
    keyboard = backKeyboard('menu_home');
  } else if (verify.type === 'cooldown') {
    const h = Math.floor(verify.seconds / 3600);
    const m = Math.floor((verify.seconds % 3600) / 60);
    text = `⏰ *Cooldown Aktif*\n\nKamu baru saja claim panel\\.\n\n⌛ Tunggu *${h}j ${m}m* sebelum claim lagi\\.`;
    keyboard = backKeyboard('menu_home');
  } else if (verify.type === 'max_panel') {
    text = `📦 *Batas Panel Tercapai*\n\nKamu sudah memiliki *${verify.count}* panel \\(maks: ${verify.max}\\)\\.\n\nUpgrade ke Premium untuk mendapatkan lebih banyak slot\\.`;
    keyboard = backKeyboard('menu_home');
  } else if (verify.type === 'groups') {
    text = `❌ *Belum Join Semua Channel Wajib*\n\nKamu harus join semua channel berikut:`;
    const rows = verify.groups.map(g => [Markup.button.url(`➡️ Join ${g.name}`, g.inviteLink || `https://t.me/joinchat`)]);
    rows.push([Markup.button.callback('🔄 Cek Lagi', 'panel_check_groups'), Markup.button.callback('🏠 Home', 'menu_home')]);
    keyboard = Markup.inlineKeyboard(rows);
  } else if (verify.type === 'share') {
    text = [
      `❌ *Belum Cukup Share Bot*`,
      ``,
      `Kamu harus menambahkan bot ke minimal *${verify.required} grup*\\. Bot tidak perlu menjadi Admin\\.`,
      ``,
      `📊 Progress: *${verify.count}/${verify.required}* grup`,
      ``,
      `*Cara share:*`,
      `1\\. Tambahkan bot ke grupmu`,
      `2\\. Bot akan terdeteksi otomatis, meskipun bukan Administrator`,
    ].join('\n');
    keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Cek Share', 'panel_check_share'), Markup.button.callback('🏠 Home', 'menu_home')],
    ]);
  } else {
    text = `❌ *Persyaratan tidak terpenuhi\\. Silakan coba lagi\\.*`;
    keyboard = backKeyboard('menu_home');
  }

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
}

// ── Package selected ──────────────────────────────────────────────────────────
async function selectPackage(ctx, pkgId) {
  if (!Number.isInteger(Number(pkgId))) {
    return ctx.answerCbQuery('Paket tidak valid', { show_alert: true });
  }

  const pkg = await db.getPackage(pkgId);
  if (!pkg) return ctx.answerCbQuery('Paket tidak ditemukan', { show_alert: true });

  await db.setSession(ctx.from.id, { step: 'select_egg', packageId: pkgId });

  let eggs;
  try {
    eggs = await ptero.syncEggsFromPanel();
  } catch (err) {
    return ctx.editMessageText(errorMessage(`Gagal memuat egg dari panel: ${esc(err.message)}`), { parse_mode: 'MarkdownV2' });
  }
  if (eggs.length === 0) return ctx.editMessageText(errorMessage('Tidak ada egg tersedia\\.'), { parse_mode: 'MarkdownV2' });

  const nestSummary = [];
  for (const egg of eggs) {
    const existingNest = nestSummary.find(nest => nest.id === egg.nestId);
    if (existingNest) {
      existingNest.count += 1;
    } else {
      nestSummary.push({ id: egg.nestId, name: egg.nestName, count: 1 });
    }
  }

  const text = [
    `*🥚 PILIH EGG*`,
    ``,
    `Paket terpilih: *${esc(pkg.name)}*`,
    ``,
    `Pilih jenis server kamu dari *${eggs.length} egg* yang tersedia di panel:`,
    ``,
    ...nestSummary.map(nest => `• *${esc(nest.name)}* \\— ${nest.count} egg`),
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: eggKeyboard(eggs).reply_markup,
  });
}

// ── Egg selected ──────────────────────────────────────────────────────────────
async function selectEgg(ctx, eggKey) {
  const session = await db.getSession(ctx.from.id);
  if (!session) return ctx.editMessageText(errorMessage('Sesi habis\\. Mulai ulang claim\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });

  const eggParts = String(eggKey).split('_');
  if (eggParts.length !== 2 || eggParts.some(part => !/^\d+$/.test(part))) {
    return ctx.answerCbQuery('Egg tidak valid', { show_alert: true });
  }
  const [nestId, eggId] = eggParts.map(Number);
  let egg = null;
  try {
    const panelEggs = await ptero.syncEggsFromPanel();
    egg = panelEggs.find(e => e.nestId === nestId && e.eggId === eggId);
  } catch (err) {
    return ctx.answerCbQuery(`Gagal memuat egg: ${err.message}`, { show_alert: true });
  }
  if (!egg) return ctx.answerCbQuery('Egg tidak ditemukan', { show_alert: true });

  await db.setSession(ctx.from.id, {
    ...session,
    step: 'select_node',
    eggData: { nestId: egg.nestId, eggId: egg.eggId },
    eggName: egg.name,
  });

  return promptNodeSelection(ctx);
}

// ── Node selection (live, always synced from panel) ───────────────────────────
// Nodes are fetched directly from the panel every time so any node added on
// the panel side shows up immediately without needing a manual re-sync.
async function promptNodeSelection(ctx) {
  const session = await db.getSession(ctx.from.id);
  if (!session) return ctx.editMessageText(errorMessage('Sesi habis\\. Mulai ulang claim\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });

  let nodes;
  try {
    nodes = await ptero.listNodes();
  } catch (err) {
    return ctx.editMessageText(errorMessage(`Gagal memuat node dari panel: ${esc(err.message)}`), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });
  }

  const available = (nodes || []).filter(n => !n.maintenance_mode);
  if (available.length === 0) {
    return ctx.editMessageText(errorMessage('Semua node sedang maintenance\\. Coba lagi nanti atau hubungi admin\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });
  }

  // Only one node available — pick it automatically and skip straight to username.
  if (available.length === 1) {
    await db.setSession(ctx.from.id, { ...session, step: 'input_username', nodeId: available[0].id, nodeName: available[0].name });
    return promptUsernameInput(ctx);
  }

  const text = [
    `*🖧 PILIH NODE*`,
    ``,
    `Ada *${available.length} node* tersedia\\. Pilih node yang mau kamu pakai:`,
    ``,
    ...available.map(n => `• *${esc(n.name)}*`),
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: nodeSelectKeyboard(available).reply_markup,
  });
}

async function selectNode(ctx, nodeId) {
  const session = await db.getSession(ctx.from.id);
  if (!session || session.step !== 'select_node') return ctx.answerCbQuery('Sesi habis', { show_alert: true });

  let node;
  try {
    node = await ptero.getNodeById(nodeId);
  } catch (err) {
    return ctx.answerCbQuery(`Gagal memuat node: ${err.message}`, { show_alert: true });
  }
  if (!node) return ctx.answerCbQuery('Node tidak ditemukan', { show_alert: true });
  if (node.maintenance_mode) return ctx.answerCbQuery('Node sedang maintenance, pilih node lain', { show_alert: true });

  await db.setSession(ctx.from.id, { ...session, step: 'input_username', nodeId: node.id, nodeName: node.name });
  return promptUsernameInput(ctx);
}

async function promptUsernameInput(ctx) {
  await ctx.editMessageText(
    [
      `*👤 MASUKKAN USERNAME PANEL*`,
      ``,
      `Ketik username untuk panel kamu:`,
      ``,
      `✅ Minimal 4 karakter`,
      `✅ Maksimal 16 karakter`,
      `✅ Hanya huruf, angka, titik \\(\\.\\ \\), underscore \\(\\_\\)`,
      `✅ Tanpa spasi`,
      ``,
      `Ketik username kamu sekarang:`,
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan', 'panel_cancel')],
      ]).reply_markup,
    }
  );
}

// ── Username submitted (via text handler) ────────────────────────────────────
async function submitUsername(ctx, username) {
  const userId = ctx.from.id;
  const session = await db.getSession(userId);
  if (!session || session.step !== 'input_username') return;

  // Validate
  if (!/^[a-zA-Z0-9._]{4,16}$/.test(username)) {
    return ctx.reply(
      `❌ Username tidak valid\\!\n\nHarus 4\\-16 karakter, hanya huruf, angka, titik, dan underscore\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  // Check uniqueness
  const taken = await db.isUsernameUsed(username);
  if (taken) {
    return ctx.reply(`❌ Username \`${esc(username)}\` sudah digunakan\\. Pilih username lain\\.`, { parse_mode: 'MarkdownV2' });
  }

  await db.setSession(userId, { ...session, step: 'input_password', username });

  await ctx.reply(
    [
      `✅ Username *${esc(username)}* tersedia\\!`,
      ``,
      `*🔑 MASUKKAN PASSWORD*`,
      ``,
      `✅ Minimal 8 karakter`,
      `✅ Maksimal 64 karakter`,
      ``,
      `Ketik password sekarang:`,
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan', 'panel_cancel')]]).reply_markup,
    }
  );
}

// ── Password submitted ────────────────────────────────────────────────────────
async function submitPassword(ctx, password) {
  const userId = ctx.from.id;
  const session = await db.getSession(userId);
  if (!session || session.step !== 'input_password') return;

  // Validate
  if (password.length < 8 || password.length > 64) {
    return ctx.reply(`❌ Password harus 8\\-64 karakter\\.`, { parse_mode: 'MarkdownV2' });
  }

  await db.setSession(userId, { ...session, step: 'confirm', password });

  const pkg = await db.getPackage(session.packageId);
  const egg = { name: session.eggName, ...session.eggData };

  const text = [
    `*📋 KONFIRMASI PEMBUATAN PANEL*`,
    ``,
    `Periksa detail berikut:`,
    ``,
    `👤 *Username* : \`${esc(session.username)}\``,
    `📦 *Paket* : ${esc(pkg?.name || 'N/A')}`,
    `🥚 *Egg* : ${esc(egg?.name || 'N/A')}`,
    `🖧 *Node* : ${esc(session.nodeName || 'Auto')}`,
    `💾 *RAM* : ${esc(formatMB(pkg?.ram))}`,
    `💻 *CPU* : ${pkg?.cpu || 'Unlimited'}%`,
    `💿 *Disk* : ${esc(formatMB(pkg?.disk))}`,
    ``,
    `Apakah data sudah benar?`,
  ].join('\n');

  const sentMsg = await ctx.reply(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: confirmKeyboard('panel_confirm', 'panel_cancel').reply_markup,
  });

  await db.setSession(userId, { ...session, step: 'confirm', password, confirmMsgId: sentMsg.message_id });
}

// ── Confirm and create panel ──────────────────────────────────────────────────
async function confirmCreate(ctx) {
  const userId = ctx.from.id;
  const session = await db.getSession(userId);
  if (!session || session.step !== 'confirm') {
    return ctx.answerCbQuery('Sesi habis. Mulai ulang.', { show_alert: true });
  }

  await ctx.editMessageText(loadingMessage('Membuat panel\\.\\.\\. Mohon tunggu\\!'), { parse_mode: 'MarkdownV2' });

  const pkg = await db.getPackage(session.packageId);
  if (!pkg) {
    await db.clearSession(userId);
    return ctx.editMessageText(
      errorMessage('Paket yang dipilih sudah tidak tersedia\\. Silakan mulai claim lagi\\.'),
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup }
    );
  }

  const egg = { name: session.eggName, ...session.eggData };
  if (!Number.isInteger(egg.nestId) || !Number.isInteger(egg.eggId)) {
    await db.clearSession(userId);
    return ctx.editMessageText(
      errorMessage('Egg yang dipilih tidak valid\\. Silakan mulai claim lagi\\.'),
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup }
    );
  }
  const from = ctx.from;

  let pteroUser = null;
  let pteroServer = null;

  try {
    // Create Pterodactyl user — short email based on the chosen panel username
    // instead of the long Telegram-ID-based address used previously.
    const email = `${session.username}@${settings.panelEmailDomain}`;
    pteroUser = await ptero.createUser({
      username: session.username,
      email,
      firstName: from.first_name || 'User',
      lastName: from.last_name || String(userId),
      password: session.password,
    });

    // Resolve which node/allocation to deploy to. If the claim flow picked a
    // node, target it directly via a free allocation; otherwise fall back to
    // the default node/location (auto-deploy).
    let allocationId = null;
    const targetNodeId = session.nodeId || settings.defaultNodeId;
    if (targetNodeId) {
      try {
        const freeAlloc = await ptero.getFreeAllocation(targetNodeId);
        allocationId = freeAlloc.id;
      } catch (allocErr) {
        throw new Error(`Node "${session.nodeName || targetNodeId}" penuh: ${allocErr.message}`);
      }
    }

    // Create server
    pteroServer = await ptero.createServer({
      name: `${session.username}-${egg.name}`,
      userId: pteroUser.id,
      eggData: { nestId: egg.nestId, eggId: egg.eggId },
      pkg,
      nodeId: targetNodeId,
      locationId: settings.defaultLocationId,
      allocationId,
    });

    // Save to local DB
    const serverData = {
      telegramId: userId,
      telegramUsername: from.username || '',
      panelUsername: session.username,
      panelEmail: email,
      pteroUserId: pteroUser.id,
      serverId: pteroServer.id,
      identifier: pteroServer.identifier,
      uuid: pteroServer.uuid,
      serverName: pteroServer.name,
      eggId: `${egg.nestId}_${egg.eggId}`,
      eggName: egg.name,
      packageId: pkg.id,
      packageName: pkg.name,
      ram: pkg.ram,
      cpu: pkg.cpu,
      disk: pkg.disk,
      node: pteroServer.node,
      panelUrl: settings.panelUrl,
    };
    await db.saveServer(serverData);

    // Update user claim count
    const user = await db.getUser(userId);
    await db.updateUser(userId, { claimCount: (user?.claimCount || 0) + 1 });

    // Set cooldown
    const isPremium = await db.isPremium(userId);
    const cooldownSecs = isPremium ? Math.floor(settings.claimCooldown / 4) : settings.claimCooldown;
    await db.setCooldown(userId, 'claim', cooldownSecs);

    // Clear session
    await db.clearSession(userId);

    // Log activity
    await db.logActivity({ type: 'claim_panel', telegramId: userId, username: from.username, detail: `Created ${session.username} - ${egg.name} - ${pkg.name}` });
    await db.logAudit({ type: 'create_server', telegramId: userId, username: from.username, detail: `Server ${pteroServer.id} created` });

    // Success message
    const successText = panelCreatedMessage({
      username: session.username,
      password: session.password,
      email,
      panelUrl: settings.panelUrl,
      packageName: pkg.name,
      eggName: egg.name,
      nodeName: session.nodeName || (pteroServer.node ? `Node ${pteroServer.node}` : 'Auto'),
      serverId: pteroServer.id,
      createdAt: new Date().toISOString(),
    });

    await ctx.editMessageText(successText, {
      parse_mode: 'MarkdownV2',
      reply_markup: backKeyboard('menu_mypanel').reply_markup,
    });

    // Notify admin/log group
    if (settings.logGroupId) {
      try {
        await ctx.telegram.sendMessage(settings.logGroupId,
          `📦 *Panel Baru Dibuat*\n\n👤 User: @${esc(from.username || from.first_name)} \\(${from.id}\\)\n🥚 Egg: ${esc(egg.name)}\n📦 Paket: ${esc(pkg.name)}\n🆔 Server: ${esc(String(pteroServer.id))}`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (_) {}
    }

    logger.info(`Panel created: ${session.username} (TG: ${userId}) - ${egg.name} - ${pkg.name}`);

  } catch (err) {
    logger.error(`Panel creation failed for ${userId}: ${err.message}`);

    // Cleanup: delete ptero user if server creation failed
    if (pteroUser && !pteroServer) {
      try { await ptero.deleteUser(pteroUser.id); } catch (_) {}
    }

    await db.clearSession(userId);

    await ctx.editMessageText(
      `❌ *Gagal membuat panel\\!*\n\n\`${esc(err.message)}\`\n\nSilakan coba lagi atau hubungi admin\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup }
    );
  }
}

// ── My Panels ─────────────────────────────────────────────────────────────────
async function showMyPanels(ctx, page = 1) {
  const userId = ctx.from.id;
  const servers = await db.getUserServers(userId);

  if (servers.length === 0) {
    const text = [
      `*🖥 PANEL SAYA*`,
      ``,
      `Kamu belum memiliki panel\\.`,
      `Tekan tombol di bawah untuk membuat panel pertamamu\\!`,
    ].join('\n');
    return ctx.editMessageText(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📦 Claim Panel', 'menu_claim')],
        [Markup.button.callback('🏠 Home', 'menu_home')],
      ]).reply_markup,
    });
  }

  const perPage = 5;
  const total = Math.ceil(servers.length / perPage);
  const start = (page - 1) * perPage;
  const pageServers = servers.slice(start, start + perPage);

  const rows = pageServers.map(s => [Markup.button.callback(`🖥 ${s.serverName || s.panelUsername}`, `srv_info_${s.serverId}`)]);

  const navBtns = [];
  if (page > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `mypanel_page_${page - 1}`));
  if (total > 1) navBtns.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) navBtns.push(Markup.button.callback('Next ➡️', `mypanel_page_${page + 1}`));
  if (navBtns.length > 0) rows.push(navBtns);
  rows.push([Markup.button.callback('🏠 Home', 'menu_home'), Markup.button.callback('❌ Tutup', 'menu_close')]);

  const text = [
    `*🖥 PANEL SAYA*`,
    ``,
    `Total: *${servers.length}* panel`,
    ``,
    ...pageServers.map((s, i) => `${start + i + 1}\\. *${esc(s.serverName || s.panelUsername)}* \\— ${esc(s.eggName)} \\| ${esc(s.packageName)}`),
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: Markup.inlineKeyboard(rows).reply_markup,
  });
}

// ── Server info ───────────────────────────────────────────────────────────────
async function showServerInfo(ctx, serverId) {
  const userId = ctx.from.id;
  await ctx.editMessageText(loadingMessage('Memuat info server\\.\\.\\.'), { parse_mode: 'MarkdownV2' });

  const server = await db.getServerById(parseInt(serverId));
  if (!server) return ctx.editMessageText(errorMessage('Server tidak ditemukan\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_mypanel').reply_markup });

  const isAdmin = await db.isAdmin(userId);
  if (server.telegramId !== userId && !isAdmin) {
    return ctx.editMessageText(errorMessage('Bukan panel kamu\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_mypanel').reply_markup });
  }

  let status = null;
  try {
    status = await ptero.getServerStatus(server.identifier);
  } catch (_) {}

  const state = status?.current_state || 'unknown';
  const stateEmoji = { running: '🟢', stopped: '🔴', starting: '🟡', stopping: '🟠' }[state] || '⚪';
  const resources = status?.resources || {};

  const text = [
    `*🖥 INFO PANEL*`,
    ``,
    `📛 *Nama* : ${esc(server.serverName)}`,
    `🆔 *Server ID* : \`${esc(String(server.serverId))}\``,
    ``,
    `${stateEmoji} *Status* : ${esc(state.toUpperCase())}`,
    `🥚 *Egg* : ${esc(server.eggName)}`,
    `📦 *Paket* : ${esc(server.packageName)}`,
    ``,
    `💾 *RAM* : ${esc(resources.memory_bytes ? `${(resources.memory_bytes / 1024 / 1024).toFixed(0)}MB` : 'N/A')} / ${esc(formatMB(server.ram))}`,
    `💻 *CPU* : ${esc(String(resources.cpu_absolute?.toFixed(1) || 'N/A'))}%`,
    `💿 *Disk* : ${esc(resources.disk_bytes ? `${(resources.disk_bytes / 1024 / 1024).toFixed(0)}MB` : 'N/A')} / ${esc(formatMB(server.disk))}`,
    ``,
    `🌐 *Panel URL* : ${esc(server.panelUrl)}`,
    `📅 *Dibuat* : ${esc(formatDate(server.createdAt))}`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: serverControlKeyboard(server.serverId, server.identifier).reply_markup,
  });
}

// ── Power controls ────────────────────────────────────────────────────────────
async function powerControl(ctx, identifier, signal) {
  try {
    await ptero.sendPowerSignal(identifier, signal);
    await ctx.answerCbQuery(`✅ Sinyal ${signal} berhasil dikirim!`, { show_alert: true });
  } catch (err) {
    await ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
  }
}

// ── Voucher ───────────────────────────────────────────────────────────────────
async function showVoucherMenu(ctx) {
  const text = [
    `*🎟 VOUCHER*`,
    ``,
    `Punya kode voucher? Masukkan di sini untuk mendapatkan hadiah\\!`,
    ``,
    `*Jenis hadiah voucher:*`,
    `• 📦 Panel Gratis`,
    `• ⭐ Premium`,
    `• 🎁 Bonus Claim`,
    `• 💎 Bonus Poin`,
    ``,
    `Ketik kode voucher sekarang:`,
  ].join('\n');

  await db.setSession(ctx.from.id, { step: 'input_voucher' });

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: backKeyboard('menu_home').reply_markup,
  });
}

async function redeemVoucher(ctx, code) {
  const userId = ctx.from.id;

  const cooldown = await db.getCooldown(userId, 'redeem');
  if (cooldown > 0) {
    return ctx.reply(`⏰ Cooldown redeem aktif\\. Tunggu ${Math.ceil(cooldown / 60)} menit lagi\\.`, { parse_mode: 'MarkdownV2' });
  }

  const result = await db.useVoucher(code, userId);
  if (!result.ok) {
    return ctx.reply(`❌ ${esc(result.msg)}`, { parse_mode: 'MarkdownV2' });
  }

  await db.setCooldown(userId, 'redeem', settings.redeemCooldown);

  // Apply reward
  const reward = result.reward || {};
  let rewardMsg = '';

  if (result.type === 'premium' || reward.premium) {
    const days = reward.days || 30;
    const expiredAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await db.addPremium({ telegramId: userId, grantedBy: 'voucher', expiredAt });
    rewardMsg = `⭐ Premium aktif selama *${days} hari*`;
  } else if (result.type === 'panel' || reward.panel) {
    await db.updateUser(userId, { claimCount: 0 });
    await db.clearCooldown(userId, 'claim');
    rewardMsg = `📦 Claim panel gratis\\! Kamu bisa claim sekarang\\.`;
  } else if (reward.points) {
    const user = await db.getUser(userId);
    await db.updateUser(userId, { referralPoints: (user?.referralPoints || 0) + reward.points });
    rewardMsg = `💎 *+${reward.points} poin* ditambahkan\\!`;
  }

  await db.clearSession(userId);
  await db.logActivity({ type: 'redeem_voucher', telegramId: userId, detail: `Redeemed voucher ${code}` });

  await ctx.reply(
    `✅ *Voucher Berhasil Digunakan\\!*\n\n${rewardMsg}`,
    { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup }
  );
}

// ── Referral ──────────────────────────────────────────────────────────────────
async function showReferralMenu(ctx) {
  const userId = ctx.from.id;
  const user = await db.getUser(userId);
  const referral = await db.getReferral(userId);

  const botUsername = (await ctx.telegram.getMe()).username;
  const refLink = `https://t.me/${botUsername}?start=${user?.referralCode || 'REF' + userId}`;

  const text = [
    `*👥 REFERRAL*`,
    ``,
    `Ajak teman bergabung dan dapatkan poin\\!`,
    ``,
    `🔗 *Link Referral Kamu:*`,
    `\`${esc(refLink)}\``,
    ``,
    `💎 *Poin Kamu* : ${esc(String(user?.referralPoints || 0))}`,
    `👤 *Total Diundang* : ${esc(String(referral?.invitedUsers?.length || 0))}`,
    ``,
    `*Tukar Poin:*`,
    `• ${settings.referralPremiumThreshold} poin → ⭐ Premium \\(30 hari\\)`,
    `• ${settings.referralVoucherThreshold} poin → 🎟 Voucher Panel`,
  ].join('\n');

  const { Markup } = require('telegraf');
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`⭐ Tukar Premium (${settings.referralPremiumThreshold}p)`, 'ref_redeem_premium')],
    [Markup.button.callback(`🎟 Tukar Voucher (${settings.referralVoucherThreshold}p)`, 'ref_redeem_voucher')],
    [Markup.button.callback('⬅️ Kembali', 'menu_home')],
  ]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function showLeaderboard(ctx) {
  const users = await db.getAllUsers();
  const servers = await db.getAllServers();

  // Top by claim count
  const topClaim = [...users].sort((a, b) => (b.claimCount || 0) - (a.claimCount || 0)).slice(0, 5);
  const topShare = [...users].sort((a, b) => (b.shareCount || 0) - (a.shareCount || 0)).slice(0, 5);
  const topReferral = [...users].sort((a, b) => (b.referralPoints || 0) - (a.referralPoints || 0)).slice(0, 5);

  const formatEntry = (u, idx, key, suffix = '') => 
    `${idx + 1}\\. @${esc(u.username || u.firstName || 'Unknown')} \\- *${esc(String(u[key] || 0))}${suffix}*`;

  const text = [
    `*🏆 LEADERBOARD*`,
    ``,
    `*📦 Top Claim:*`,
    ...topClaim.map((u, i) => formatEntry(u, i, 'claimCount', ' panel')),
    ``,
    `*📢 Top Share:*`,
    ...topShare.map((u, i) => formatEntry(u, i, 'shareCount', ' grup')),
    ``,
    `*👥 Top Referral:*`,
    ...topReferral.map((u, i) => formatEntry(u, i, 'referralPoints', ' poin')),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });
}

// ── Share status ──────────────────────────────────────────────────────────────
async function showShareStatus(ctx) {
  const userId = ctx.from.id;
  const shareLogs = await db.getShareLogs(userId);
  const botUsername = (await ctx.telegram.getMe()).username;

  const text = [
    `*📢 SHARE BOT*`,
    ``,
    `Tambahkan bot ke ${settings.requiredShareCount} grup\\. Bot tidak perlu menjadi Admin\\.`,
    ``,
    `📊 *Progress* : ${esc(String(shareLogs.length))} / ${settings.requiredShareCount} grup`,
    ``,
    shareLogs.length > 0 ? `*Grup yang terdeteksi:*\n${shareLogs.map(l => `✅ ${esc(l.groupName)}`).join('\n')}` : `_Belum ada grup yang terdeteksi\\._`,
    ``,
    `*Cara Share:*`,
    `1\\. Tambahkan @${esc(botUsername)} ke grupmu`,
    `2\\. Bot otomatis terdeteksi, meskipun bukan Administrator`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('menu_home').reply_markup });
}

module.exports = {
  startClaim, selectPackage, selectEgg, selectNode, submitUsername, submitPassword, confirmCreate,
  showMyPanels, showServerInfo, powerControl, showVoucherMenu, redeemVoucher,
  showReferralMenu, showLeaderboard, showShareStatus,
};
