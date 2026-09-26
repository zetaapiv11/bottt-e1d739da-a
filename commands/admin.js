'use strict';

const db = require('../services/database');
const ptero = require('../services/pterodactyl');
const logger = require('../services/logger');
const settings = require('../settings');
const { esc, loadingMessage, errorMessage, successMessage, formatDate, formatMB, adminDashboardMessage, formatUptime } = require('../utils/format');
const { adminDashboard, userActionsKeyboard, serverActionsKeyboard, backKeyboard, paginationKeyboard, broadcastKeyboard, maintenanceKeyboard, nodeListKeyboard, nodeDetailKeyboard } = require('../utils/keyboard');
const { Markup } = require('telegraf');

async function showDashboard(ctx) {
  await ctx.editMessageText(loadingMessage('Memuat dashboard\\.\\.\\.'), { parse_mode: 'MarkdownV2' });

  const [stats, ping, apiStatus] = await Promise.all([
    db.getStats(),
    ptero.pingPanel(),
    ptero.getApiStatus(),
  ]);

  const text = adminDashboardMessage(stats, ping, apiStatus, process.uptime() * 1000);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: adminDashboard().reply_markup });
}

// ── User Management ───────────────────────────────────────────────────────────
async function showUsers(ctx, page = 1) {
  const users = await db.getAllUsers();
  const perPage = 10;
  const total = Math.ceil(users.length / perPage);
  const start = (page - 1) * perPage;
  const pageUsers = users.slice(start, start + perPage);

  const rows = pageUsers.map(u => [Markup.button.callback(`👤 ${u.firstName || u.username || u.telegramId}`, `adm_user_${u.telegramId}`)]);

  const navBtns = [];
  if (page > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `adm_users_page_${page - 1}`));
  if (total > 1) navBtns.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) navBtns.push(Markup.button.callback('Next ➡️', `adm_users_page_${page + 1}`));
  if (navBtns.length > 0) rows.push(navBtns);

  rows.push([Markup.button.callback('🔍 Cari User', 'adm_search_user'), Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  const text = [
    `*👤 DAFTAR USER*`,
    ``,
    `Total: *${users.length}* user`,
    ``,
    ...pageUsers.map((u, i) => `${start + i + 1}\\. *${esc(u.firstName || u.username || String(u.telegramId))}* \\(@${esc(u.username || 'N/A')}\\) \\- ${esc(String(u.telegramId))}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function showUserInfo(ctx, telegramId) {
  const userId = parseInt(telegramId);
  const [user, servers, isAdmin, isOwner, isReseller, isPremium, bl] = await Promise.all([
    db.getUser(userId),
    db.getUserServers(userId),
    db.isAdmin(userId),
    db.isOwner(userId),
    db.isReseller(userId),
    db.isPremium(userId),
    db.isBlacklisted(userId),
  ]);

  if (!user) return ctx.editMessageText(errorMessage('User tidak ditemukan\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_users').reply_markup });

  const roleLabel = isOwner ? '👑 Owner' : isAdmin ? '🛡️ Admin' : isReseller ? '💼 Reseller' : isPremium ? '⭐ Premium' : '👤 User';

  const text = [
    `*👤 INFO USER*`,
    ``,
    `📛 *Nama* : ${esc(user.firstName || '')} ${esc(user.lastName || '')}`,
    `🔖 *Username* : @${esc(user.username || 'N/A')}`,
    `🆔 *ID* : \`${esc(String(user.telegramId))}\``,
    `🏷 *Role* : ${esc(roleLabel)}`,
    `📅 *Joined* : ${esc(formatDate(user.joinedAt))}`,
    ``,
    `📦 *Total Panel* : ${esc(String(servers.length))}`,
    `📊 *Total Claim* : ${esc(String(user.claimCount || 0))}`,
    `💎 *Ref Points* : ${esc(String(user.referralPoints || 0))}`,
    `⭐ *Premium* : ${isPremium ? '✅' : '❌'}`,
    `💼 *Reseller* : ${isReseller ? '✅' : '❌'}`,
    `⛔ *Blacklist* : ${bl ? `⛔ ${esc(bl.reason)}` : '✅ Tidak'}`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: userActionsKeyboard(telegramId).reply_markup });
}

// ── Server Management ─────────────────────────────────────────────────────────
async function showServers(ctx, page = 1) {
  const servers = await db.getAllServers();
  const perPage = 10;
  const total = Math.ceil(servers.length / perPage);
  const start = (page - 1) * perPage;
  const pageServers = servers.slice(start, start + perPage);

  const rows = pageServers.map(s => [Markup.button.callback(`🖥 ${s.serverName || s.panelUsername}`, `adm_srv_info_${s.serverId}`)]);

  const navBtns = [];
  if (page > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `adm_servers_page_${page - 1}`));
  if (total > 1) navBtns.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) navBtns.push(Markup.button.callback('Next ➡️', `adm_servers_page_${page + 1}`));
  if (navBtns.length > 0) rows.push(navBtns);

  rows.push([Markup.button.callback('🔍 Cari Server', 'adm_search_server'), Markup.button.callback('➕ Create Server', 'adm_create_server')]);
  rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  const text = [
    `*🖥 DAFTAR SERVER*`,
    ``,
    `Total: *${servers.length}* server`,
    ``,
    ...pageServers.map((s, i) => `${start + i + 1}\\. *${esc(s.serverName || s.panelUsername)}* \\- ${esc(s.eggName)} \\| ${esc(s.packageName)}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function showServerInfo(ctx, serverId) {
  await ctx.editMessageText(loadingMessage('Memuat info server\\.\\.\\.'), { parse_mode: 'MarkdownV2' });

  const server = await db.getServerById(parseInt(serverId));
  if (!server) return ctx.editMessageText(errorMessage('Server tidak ditemukan\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_servers').reply_markup });

  let status = null;
  try { status = await ptero.getServerStatus(server.identifier); } catch (_) {}

  const state = status?.current_state || 'unknown';
  const stateEmoji = { running: '🟢', stopped: '🔴', starting: '🟡', stopping: '🟠' }[state] || '⚪';

  const text = [
    `*🖥 INFO SERVER \\(ADMIN\\)*`,
    ``,
    `📛 *Nama* : ${esc(server.serverName)}`,
    `🆔 *Server ID* : \`${esc(String(server.serverId))}\``,
    `🔑 *Identifier* : \`${esc(server.identifier)}\``,
    ``,
    `${stateEmoji} *Status* : ${esc(state.toUpperCase())}`,
    `🥚 *Egg* : ${esc(server.eggName)}`,
    `📦 *Paket* : ${esc(server.packageName)}`,
    `💾 *RAM* : ${esc(formatMB(server.ram))}`,
    `💻 *CPU* : ${server.cpu || 'Unlimited'}%`,
    `💿 *Disk* : ${esc(formatMB(server.disk))}`,
    ``,
    `👤 *Owner TG* : \`${esc(String(server.telegramId))}\``,
    `📅 *Dibuat* : ${esc(formatDate(server.createdAt))}`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: serverActionsKeyboard(serverId).reply_markup });
}

// ── Server Power Actions ──────────────────────────────────────────────────────
async function serverAction(ctx, serverId, action) {
  const server = await db.getServerById(parseInt(serverId));
  if (!server) return ctx.answerCbQuery('Server tidak ditemukan', { show_alert: true });

  try {
    if (action === 'start') await ptero.sendPowerSignal(server.identifier, 'start');
    else if (action === 'stop') await ptero.sendPowerSignal(server.identifier, 'stop');
    else if (action === 'restart') await ptero.sendPowerSignal(server.identifier, 'restart');
    else if (action === 'suspend') await ptero.suspendServer(serverId);
    else if (action === 'unsuspend') await ptero.unsuspendServer(serverId);
    else if (action === 'reinstall') await ptero.reinstallServer(serverId);
    else if (action === 'delete') {
      await ctx.answerCbQuery(`Menghapus server...`);
      await ptero.deleteServer(serverId);
      if (server.pteroUserId) { try { await ptero.deleteUser(server.pteroUserId); } catch (_) {} }
      await db.deleteServer(parseInt(serverId));
      await db.logAudit({ type: 'delete_server', telegramId: ctx.from.id, username: ctx.from.username, detail: `Deleted server ${serverId}` });
      return ctx.editMessageText(successMessage(`Server \`${esc(String(serverId))}\` berhasil dihapus\\.`), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_servers').reply_markup });
    }

    await db.logAudit({ type: `server_${action}`, telegramId: ctx.from.id, username: ctx.from.username, detail: `Action ${action} on server ${serverId}` });
    await ctx.answerCbQuery(`✅ ${action} berhasil!`, { show_alert: true });

  } catch (err) {
    logger.error(`Server action ${action} failed: ${err.message}`);
    await ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
  }
}

// ── Voucher Management ────────────────────────────────────────────────────────
async function showVouchers(ctx) {
  const vouchers = await db.read('voucher');
  const active = vouchers.filter(v => v.active);

  if (vouchers.length === 0) {
    return ctx.editMessageText('*🎟 KELOLA VOUCHER*\n\nBelum ada voucher\\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('➕ Buat Voucher', 'adm_create_voucher')],
        [Markup.button.callback('⬅️ Back', 'adm_dashboard')],
      ]).reply_markup,
    });
  }

  const text = [
    `*🎟 KELOLA VOUCHER*`,
    ``,
    `Total: *${vouchers.length}* voucher \\(${active.length} aktif\\)`,
    ``,
    ...vouchers.slice(0, 10).map(v => `• \`${esc(v.code)}\` \\- ${esc(v.type)} \\- ${v.usedCount}/${v.maxUses} \\- ${v.active ? '✅' : '❌'}`),
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('➕ Buat Voucher', 'adm_create_voucher')],
      [Markup.button.callback('⬅️ Back', 'adm_dashboard')],
    ]).reply_markup,
  });
}

// ── Required Groups ───────────────────────────────────────────────────────────
async function showRequiredGroups(ctx) {
  const groups = settings.requiredChannels;

  const rows = groups.map(g => [Markup.button.url(`➡️ ${g.name}`, g.inviteLink)]);
  rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  const text = [
    `*📢 CHANNEL WAJIB*`,
    ``,
    `Total: *${groups.length}* channel`,
    ``,
    ...groups.map(g => `• ✅ *${esc(g.name)}* \\- ${esc(g.inviteLink)}`),
    ``,
    `_User harus join semua channel untuk claim panel\\._`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

// ── Packages Management ───────────────────────────────────────────────────────
async function showPackages(ctx) {
  const packages = await db.read('packages');
  const text = [
    `*📦 KELOLA PAKET*`,
    ``,
    ...packages.map(p => `• *${esc(p.name)}* \\- RAM: ${esc(formatMB(p.ram))}, CPU: ${p.cpu || 'Ulm'}%, Disk: ${esc(formatMB(p.disk))} \\- ${p.active ? '✅' : '❌'}`),
  ].join('\n');

  const rows = packages.map(p => [Markup.button.callback(`${p.active ? '✅' : '❌'} ${p.name}`, `adm_pkg_toggle_${p.id}`)]);
  rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

// ── Eggs Management ───────────────────────────────────────────────────────────
async function showEggs(ctx) {
  let eggs = [];
  let loadError = null;
  try {
    eggs = await ptero.syncEggsFromPanel();
  } catch (err) {
    loadError = err;
  }
  const text = [
    `*🥚 KELOLA EGG*`,
    ``,
    loadError
      ? `❌ ${esc(loadError.message)}`
      : eggs.length > 0
        ? eggs.map(e => `• *${esc(e.name)}* \\- ${esc(e.nestName)} \\- Egg ID: ${esc(String(e.eggId))}`).join('\n')
        : '_Belum ada egg di panel\\._',
    ``,
    `💡 _Daftar ini selalu dibaca langsung dari panel\\. Tidak ada egg lokal yang disimpan\\._`,
  ].join('\n');

  const rows = [[Markup.button.callback('🔄 Baca Ulang dari Panel', 'adm_sync_eggs')]];
  rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function syncEggs(ctx) {
  await ctx.editMessageText(loadingMessage('Mengambil egg dari panel Pterodactyl\\.\\.\\.'), { parse_mode: 'MarkdownV2' });
  try {
    const panelEggs = await ptero.syncEggsFromPanel();
    await db.logAudit({ type: 'sync_eggs', telegramId: ctx.from.id, username: ctx.from.username, detail: `Read ${panelEggs.length} eggs directly from panel` });
    await ctx.editMessageText(
      successMessage(`Panel mengembalikan *${esc(String(panelEggs.length))}* egg\\. Daftar sudah diperbarui dari sumber panel langsung\\.`),
      { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🥚 Lihat Egg', 'adm_eggs'), Markup.button.callback('⬅️ Back', 'adm_dashboard')]]).reply_markup }
    );
  } catch (err) {
    logger.error(`Sync eggs failed: ${err.message}`);
    await ctx.editMessageText(
      errorMessage(`Gagal sync egg: \`${esc(err.message)}\``),
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_eggs').reply_markup }
    );
  }
}

// ── Nodes List ────────────────────────────────────────────────────────────────
async function showNodes(ctx) {
  await ctx.editMessageText(loadingMessage('Memuat daftar node\\.\\.\\.'), { parse_mode: 'MarkdownV2' });
  try {
    const nodes = await ptero.listNodes();
    if (nodes.length === 0) {
      return ctx.editMessageText(errorMessage('Belum ada node di panel\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
    }

    const text = [
      `*🖧 DAFTAR NODE*`,
      ``,
      `Total: *${nodes.length}* node`,
      ``,
      `Tap salah satu node untuk lihat detail dan kelola maintenance mode:`,
      ``,
      ...nodes.map(n => `• *${esc(n.name)}* \\- ${n.maintenance_mode ? '🔧 Maintenance' : '🟢 Online'}`),
    ].join('\n');

    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: nodeListKeyboard(nodes).reply_markup });
  } catch (err) {
    await ctx.editMessageText(errorMessage(`Gagal memuat node: ${esc(err.message)}`), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
  }
}

// ── Node Detail ───────────────────────────────────────────────────────────────
async function showNodeDetail(ctx, nodeId) {
  await ctx.editMessageText(loadingMessage('Memuat detail node\\.\\.\\.'), { parse_mode: 'MarkdownV2' });
  try {
    const node = await ptero.getNodeById(nodeId);
    if (!node) {
      return ctx.editMessageText(errorMessage('Node tidak ditemukan\\.'), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_nodes').reply_markup });
    }

    let allocSummary = 'N/A';
    try {
      const allocations = await ptero.listNodeAllocations(node.id);
      const total = allocations.length;
      const used = allocations.filter(a => a.assigned).length;
      allocSummary = `${used}/${total} terpakai`;
    } catch (_) {}

    const allocatedMem = node.allocated_resources?.memory || 0;
    const allocatedDisk = node.allocated_resources?.disk || 0;

    const text = [
      `*🖧 DETAIL NODE*`,
      ``,
      `📛 *Nama* : ${esc(node.name)}`,
      `🌐 *FQDN* : \`${esc(node.fqdn)}\``,
      `🔌 *Scheme* : ${esc(node.scheme)}`,
      `${node.maintenance_mode ? '🔧' : '🟢'} *Status* : ${node.maintenance_mode ? 'Maintenance' : 'Online'}`,
      ``,
      `💾 *Memory* : ${esc(formatMB(allocatedMem))} \/ ${esc(formatMB(node.memory))}`,
      `💿 *Disk* : ${esc(formatMB(allocatedDisk))} \/ ${esc(formatMB(node.disk))}`,
      `🔢 *Allocation* : ${esc(allocSummary)}`,
      ``,
      `📅 *Dibuat* : ${esc(formatDate(node.created_at))}`,
    ].join('\n');

    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: nodeDetailKeyboard(node.id, node.maintenance_mode).reply_markup });
  } catch (err) {
    await ctx.editMessageText(errorMessage(`Gagal memuat detail node: ${esc(err.message)}`), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_nodes').reply_markup });
  }
}

// ── Toggle Node Maintenance ─────────────────────────────────────────────────────
async function toggleNodeMaintenance(ctx, nodeId) {
  try {
    const node = await ptero.getNodeById(nodeId);
    if (!node) return ctx.answerCbQuery('Node tidak ditemukan', { show_alert: true });

    const updated = await ptero.toggleNodeMaintenance(nodeId, !node.maintenance_mode);
    await db.logAudit({
      type: 'toggle_node_maintenance',
      telegramId: ctx.from.id,
      username: ctx.from.username,
      detail: `Node ${updated.name} maintenance -> ${updated.maintenance_mode}`,
    });
    await ctx.answerCbQuery(updated.maintenance_mode ? '🔧 Maintenance mode diaktifkan' : '🟢 Node kembali online', { show_alert: true });
    return showNodeDetail(ctx, nodeId);
  } catch (err) {
    logger.error(`Toggle node maintenance failed: ${err.message}`);
    return ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
  }
}

// ── Blacklist Management ──────────────────────────────────────────────────────
async function showBlacklist(ctx) {
  const blacklist = await db.read('blacklist');
  const text = [
    `*⛔ KELOLA BLACKLIST*`,
    ``,
    `Total: *${blacklist.length}* user`,
    ``,
    ...blacklist.slice(0, 10).map(b => `• \`${esc(String(b.telegramId))}\` \\- ${esc(b.reason)}`),
  ].join('\n');

  const rows = blacklist.slice(0, 5).map(b => [Markup.button.callback(`✅ Unbl ${b.telegramId}`, `adm_rembl_${b.telegramId}`)]);
  rows.push([Markup.button.callback('➕ Tambah', 'adm_add_blacklist'), Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function showSettings(ctx) {
  const text = [
    `*⚙️ SETTINGS BOT*`,
    ``,
    `🔧 *Maintenance* : ${settings.maintenanceMode ? '✅ Aktif' : '❌ Mati'}`,
    `⏰ *Cooldown Claim* : ${Math.floor(settings.claimCooldown / 3600)}h`,
    `📦 *Max Panel/User* : ${settings.maxPanelPerUser || 'Unlimited'}`,
    `👥 *Grup Wajib* : ${settings.requiredGroupCount}`,
    `📢 *Share Wajib* : ${settings.requiredShareCount}`,
    `💾 *Auto Backup* : ${settings.autoBackup ? '✅' : '❌'}`,
    `🛡️ *Auto Security* : ${settings.autoSecurity ? '✅' : '❌'}`,
    `⛔ *Auto Blacklist* : ${settings.autoBlacklist ? '✅' : '❌'}`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(settings.maintenanceMode ? '✅ Matikan Maintenance' : '⚠️ Aktifkan Maintenance', 'adm_toggle_maintenance')],
      [Markup.button.callback('⬅️ Back', 'adm_dashboard')],
    ]).reply_markup,
  });
}

async function toggleMaintenance(ctx) {
  settings.maintenanceMode = !settings.maintenanceMode;
  await db.logAudit({ type: 'toggle_maintenance', telegramId: ctx.from.id, username: ctx.from.username, detail: `Maintenance: ${settings.maintenanceMode}` });
  await ctx.answerCbQuery(`Maintenance: ${settings.maintenanceMode ? 'AKTIF' : 'MATI'}`, { show_alert: true });
  await showSettings(ctx);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function showStats(ctx) {
  const stats = await db.getStats();
  const text = [
    `*📊 STATISTIK BOT*`,
    ``,
    `👤 User: *${stats.totalUsers}*`,
    `🖥 Server: *${stats.totalServers}*`,
    `⭐ Premium: *${stats.totalPremium}*`,
    `💼 Reseller: *${stats.totalResellers}*`,
    `🛡️ Admin: *${stats.totalAdmins}*`,
    `🎟 Voucher: *${stats.totalVouchers}*`,
    `⛔ Blacklist: *${stats.totalBlacklist}*`,
    ``,
    `📊 Claim Hari Ini: *${stats.todayClaims}*`,
    `📊 Claim Minggu Ini: *${stats.weekClaims}*`,
    `📊 Claim Bulan Ini: *${stats.monthClaims}*`,
    ``,
    `💾 DB Size: *${esc(stats.dbSize)}*`,
    `🕒 Uptime: *${esc(formatUptime(process.uptime() * 1000))}*`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
}

// ── Activity & Security Logs ──────────────────────────────────────────────────
async function showActivityLog(ctx) {
  const logs = await db.read('activity_logs');
  const recent = logs.slice(-10).reverse();
  const text = [
    `*📋 ACTIVITY LOG \\(10 Terbaru\\)*`,
    ``,
    ...recent.map(l => `• \\[${esc(l.timestamp?.slice(11, 19) || 'N/A')}\\] *${esc(l.type)}* \\- ${esc(l.username || l.telegramId || '')} \\- ${esc(l.detail || '')}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
}

async function showSecurityLog(ctx) {
  const logs = await db.read('security_logs');
  const recent = logs.slice(-10).reverse();
  const text = [
    `*🔒 SECURITY LOG \\(10 Terbaru\\)*`,
    ``,
    ...recent.map(l => `• \\[${esc(l.timestamp?.slice(11, 19) || 'N/A')}\\] *${esc(l.type)}* \\- ${esc(String(l.telegramId || ''))} \\- ${esc(l.detail || '')}`),
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup });
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
async function showBroadcast(ctx) {
  await ctx.editMessageText(
    `*📢 BROADCAST*\n\nPilih target broadcast:`,
    { parse_mode: 'MarkdownV2', reply_markup: broadcastKeyboard().reply_markup }
  );
}

async function doBroadcast(ctx, target) {
  await db.setSession(ctx.from.id, { step: 'broadcast', target });
  await ctx.editMessageText(
    `*📢 BROADCAST ke ${esc(target.toUpperCase())}*\n\nKirim pesan yang ingin di\\-broadcast \\(teks, foto, video, dll\\):`,
    { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_broadcast').reply_markup }
  );
}

async function executeBroadcast(ctx, session) {
  const from = ctx.from;
  let targets = [];
  const users = await db.getAllUsers();

  if (session.target === 'all') targets = users;
  else if (session.target === 'premium') {
    const premiums = await db.read('premium');
    targets = users.filter(u => premiums.some(p => p.telegramId === u.telegramId));
  } else if (session.target === 'reseller') {
    const resellers = await db.read('reseller');
    targets = users.filter(u => resellers.some(r => r.telegramId === u.telegramId));
  } else if (session.target === 'admin') {
    const admins = await db.read('admins');
    targets = users.filter(u => admins.some(a => a.telegramId === u.telegramId));
  }

  let sent = 0, failed = 0;
  await db.clearSession(from.id);

  const loadMsg = await ctx.reply(loadingMessage(`Mengirim ke ${targets.length} user\\.\\.\\.`), { parse_mode: 'MarkdownV2' });

  for (const target of targets) {
    try {
      await ctx.telegram.copyMessage(target.telegramId, from.id, ctx.message.message_id);
      sent++;
    } catch (_) { failed++; }
    await new Promise(r => setTimeout(r, 50)); // rate limit
  }

  await ctx.telegram.editMessageText(from.id, loadMsg.message_id, null,
    `✅ *Broadcast Selesai\\!*\n\n✅ Terkirim: *${sent}*\n❌ Gagal: *${failed}*`,
    { parse_mode: 'MarkdownV2' }
  );

  await db.logAudit({ type: 'broadcast', telegramId: from.id, username: from.username, detail: `Target: ${session.target}, Sent: ${sent}, Failed: ${failed}` });
}

// ── Role Actions ──────────────────────────────────────────────────────────────
async function addPremium(ctx, telegramId) {
  const userId = parseInt(telegramId);
  const user = await db.getUser(userId);
  if (!user) return ctx.answerCbQuery('User tidak ditemukan', { show_alert: true });
  await db.addPremium({ telegramId: userId, grantedBy: ctx.from.id, expiredAt: null });
  await db.logAudit({ type: 'add_premium', telegramId: ctx.from.id, username: ctx.from.username, detail: `Added premium to ${userId}` });
  try { await ctx.telegram.sendMessage(userId, `⭐ *Kamu mendapatkan akses Premium\\!* Selamat\\!`, { parse_mode: 'MarkdownV2' }); } catch (_) {}
  await ctx.answerCbQuery('✅ Premium ditambahkan!', { show_alert: true });
}

async function removePremium(ctx, telegramId) {
  await db.removePremium(parseInt(telegramId));
  await ctx.answerCbQuery('✅ Premium dihapus!', { show_alert: true });
}

async function addBlacklist(ctx, telegramId, reason = 'Dilaporkan oleh admin') {
  const userId = parseInt(telegramId);
  await db.addToBlacklist(userId, reason, ctx.from.id);
  await db.logAudit({ type: 'add_blacklist', telegramId: ctx.from.id, username: ctx.from.username, detail: `Blacklisted ${userId}: ${reason}` });
  await ctx.answerCbQuery('✅ User diblacklist!', { show_alert: true });
}

async function removeBlacklist(ctx, telegramId) {
  await db.removeFromBlacklist(parseInt(telegramId));
  await db.logAudit({ type: 'remove_blacklist', telegramId: ctx.from.id, username: ctx.from.username, detail: `Unblacklisted ${telegramId}` });
  await ctx.answerCbQuery('✅ User di-unblacklist!', { show_alert: true });
}

async function addReseller(ctx, telegramId) {
  const userId = parseInt(telegramId);
  const user = await db.getUser(userId);
  if (!user) return ctx.answerCbQuery('User tidak ditemukan', { show_alert: true });
  await db.addReseller({ telegramId: userId, username: user.username, quota: 10, addedBy: ctx.from.id });
  await db.logAudit({ type: 'add_reseller', telegramId: ctx.from.id, username: ctx.from.username, detail: `Added reseller ${userId}` });
  try { await ctx.telegram.sendMessage(userId, `💼 *Kamu mendapatkan akses Reseller\\!* Selamat\\!`, { parse_mode: 'MarkdownV2' }); } catch (_) {}
  await ctx.answerCbQuery('✅ Reseller ditambahkan!', { show_alert: true });
}

async function removeReseller(ctx, telegramId) {
  await db.removeReseller(parseInt(telegramId));
  await ctx.answerCbQuery('✅ Reseller dihapus!', { show_alert: true });
}

// ── Backup ────────────────────────────────────────────────────────────────────
async function showBackup(ctx) {
  const backup = require('../services/backup');
  const text = [
    `*💾 BACKUP DATABASE*`,
    ``,
    `Pilih aksi backup:`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('💾 Backup Sekarang', 'adm_do_backup')],
      [Markup.button.callback('📋 List Backup', 'adm_list_backup')],
      [Markup.button.callback('⬅️ Back', 'adm_dashboard')],
    ]).reply_markup,
  });
}

async function doBackup(ctx) {
  await ctx.answerCbQuery('Membuat backup...');
  try {
    const backup = require('../services/backup');
    const result = await backup.createBackup();
    await ctx.editMessageText(successMessage(`Backup berhasil dibuat\\!\n\n📁 File: \`${esc(result.filename)}\``), {
      parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_backup').reply_markup,
    });
    await db.logAudit({ type: 'manual_backup', telegramId: ctx.from.id, username: ctx.from.username, detail: result.filename });
  } catch (err) {
    await ctx.editMessageText(errorMessage(`Backup gagal: ${esc(err.message)}`), { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_backup').reply_markup });
  }
}

// ── Panel Server List (from Pterodactyl API) ──────────────────────────────────
async function showPanelServers(ctx, page = 1) {
  await ctx.answerCbQuery();
  await ctx.editMessageText(loadingMessage(`Memuat daftar server panel \\(halaman ${page}\\)\\.\\.\\.`), { parse_mode: 'MarkdownV2' });

  try {
    const data = await ptero.listServers(page);
    if (!data || !data.data || data.data.length === 0) {
      return ctx.editMessageText(
        `*🖥️ SERVER PANEL*\n\nTidak ada server ditemukan di halaman ${page}\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup }
      );
    }

    const servers = data.data;
    const pagination = data.meta?.pagination;
    const totalPages = pagination?.total_pages || 1;
    const totalCount = pagination?.total || servers.length;
    const currentPage = pagination?.current_page || page;

    const lines = servers.map((s, i) => {
      const a = s.attributes;
      const status = a.suspended ? '⛔' : '✅';
      return `${status} *${esc(a.name)}*\n   ID: \`${a.id}\` \\| UUID: \`${esc(a.uuid.slice(0, 8))}\\.\\.\\.\`\n   RAM: ${esc(formatMB(a.limits?.memory))} \\| CPU: ${a.limits?.cpu || 0}% \\| Disk: ${esc(formatMB(a.limits?.disk))}`;
    });

    const text = [
      `*🖥️ SERVER PANEL PTERODACTYL*`,
      ``,
      `📊 Total: *${esc(String(totalCount))}* server \\| Halaman *${esc(String(currentPage))}/${esc(String(totalPages))}*`,
      ``,
      ...lines,
    ].join('\n');

    const navBtns = [];
    if (currentPage > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `adm_panelsrv_page_${currentPage - 1}`));
    if (totalPages > 1) navBtns.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) navBtns.push(Markup.button.callback('Next ➡️', `adm_panelsrv_page_${currentPage + 1}`));

    const rows = [];
    if (navBtns.length > 0) rows.push(navBtns);
    rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

    await ctx.editMessageText(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard(rows).reply_markup,
    });
  } catch (err) {
    logger.error(`showPanelServers failed: ${err.message}`);
    await ctx.editMessageText(
      errorMessage(`Gagal memuat server panel:\n\`${esc(err.message)}\``),
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup }
    );
  }
}

// ── Panel User List (from Pterodactyl API) ────────────────────────────────────
async function showPanelUsers(ctx, page = 1) {
  await ctx.answerCbQuery();
  await ctx.editMessageText(loadingMessage(`Memuat daftar user panel \\(halaman ${page}\\)\\.\\.\\.`), { parse_mode: 'MarkdownV2' });

  try {
    const data = await ptero.listUsers(page);
    if (!data || !data.data || data.data.length === 0) {
      return ctx.editMessageText(
        `*👥 USER PANEL*\n\nTidak ada user ditemukan di halaman ${page}\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup }
      );
    }

    const users = data.data;
    const pagination = data.meta?.pagination;
    const totalPages = pagination?.total_pages || 1;
    const totalCount = pagination?.total || users.length;
    const currentPage = pagination?.current_page || page;

    const lines = users.map((u) => {
      const a = u.attributes;
      const role = a.root_admin ? '👑 Admin' : '👤 User';
      return `${role} *${esc(a.username)}*\n   ID: \`${a.id}\` \\| Email: \`${esc(a.email)}\``;
    });

    const text = [
      `*👥 USER PANEL PTERODACTYL*`,
      ``,
      `📊 Total: *${esc(String(totalCount))}* user \\| Halaman *${esc(String(currentPage))}/${esc(String(totalPages))}*`,
      ``,
      ...lines,
    ].join('\n');

    const navBtns = [];
    if (currentPage > 1) navBtns.push(Markup.button.callback('⬅️ Prev', `adm_panelusr_page_${currentPage - 1}`));
    if (totalPages > 1) navBtns.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) navBtns.push(Markup.button.callback('Next ➡️', `adm_panelusr_page_${currentPage + 1}`));

    const rows = [];
    if (navBtns.length > 0) rows.push(navBtns);
    rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);

    await ctx.editMessageText(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard(rows).reply_markup,
    });
  } catch (err) {
    logger.error(`showPanelUsers failed: ${err.message}`);
    await ctx.editMessageText(
      errorMessage(`Gagal memuat user panel:\n\`${esc(err.message)}\``),
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard('adm_dashboard').reply_markup }
    );
  }
}

module.exports = {
  showDashboard, showUsers, showUserInfo, showServers, showServerInfo, serverAction,
  showVouchers, showRequiredGroups, showPackages, showEggs, syncEggs, showNodes, showNodeDetail, toggleNodeMaintenance, showBlacklist,
  showSettings, toggleMaintenance, showStats, showActivityLog, showSecurityLog,
  showBroadcast, doBroadcast, executeBroadcast,
  addPremium, removePremium, addBlacklist, removeBlacklist, addReseller, removeReseller,
  showBackup, doBackup,
  showPanelServers, showPanelUsers,
};
