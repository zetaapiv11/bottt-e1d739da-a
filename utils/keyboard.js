'use strict';

const { Markup } = require('telegraf');

// ── Generic back button ───────────────────────────────────────────────────────
function backKeyboard(action) {
  return Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', action)]]);
}

// ── Navigation row helper ─────────────────────────────────────────────────────
function navRow(page, total, prevAction, nextAction) {
  const row = [];
  if (page > 1) row.push(Markup.button.callback('⬅️ Prev', prevAction));
  row.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) row.push(Markup.button.callback('Next ➡️', nextAction));
  return row;
}

// ── Main menu ─────────────────────────────────────────────────────────────────
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🖥️ Claim Panel', 'menu_claim')],
    [Markup.button.callback('📋 Panel Saya', 'menu_mypanel')],
    [Markup.button.callback('🎟 Voucher', 'menu_voucher'), Markup.button.callback('👥 Referral', 'menu_referral')],
    [Markup.button.callback('🏆 Leaderboard', 'menu_leaderboard'), Markup.button.callback('📢 Share Bot', 'menu_share')],
    [Markup.button.callback('ℹ️ Info', 'menu_info')],
  ]);
}

// ── Package selection keyboard ────────────────────────────────────────────────
function packageKeyboard(packages) {
  const rows = packages.map(pkg => [
    Markup.button.callback(`📦 ${pkg.name}`, `pkg_select_${pkg.id}`),
  ]);
  rows.push([Markup.button.callback('❌ Batal', 'panel_cancel')]);
  return Markup.inlineKeyboard(rows);
}

// ── Egg selection keyboard ────────────────────────────────────────────────────
function eggKeyboard(eggs) {
  const rows = [];
  for (let i = 0; i < eggs.length; i += 2) {
    rows.push(
      eggs.slice(i, i + 2).map(egg =>
        Markup.button.callback(`🥚 ${egg.name}`, `egg_select_${egg.nestId}_${egg.eggId}`)
      )
    );
  }
  rows.push([Markup.button.callback('❌ Batal', 'panel_cancel')]);
  return Markup.inlineKeyboard(rows);
}

// ── Node selection keyboard (claim/create panel flow) ─────────────────────────
function nodeSelectKeyboard(nodes) {
  const rows = nodes.map(n => [
    Markup.button.callback(`🖧 ${n.name}`, `panel_node_${n.id}`),
  ]);
  rows.push([Markup.button.callback('❌ Batal', 'panel_cancel')]);
  return Markup.inlineKeyboard(rows);
}

// ── Confirm keyboard ──────────────────────────────────────────────────────────
function confirmKeyboard(confirmAction, cancelAction) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Ya, Buat!', confirmAction),
      Markup.button.callback('❌ Batal', cancelAction),
    ],
  ]);
}

// ── Server control keyboard ───────────────────────────────────────────────────
function serverControlKeyboard(serverId, identifier, suspended = false) {
  const rows = [
    [
      Markup.button.callback('▶️ Start', `srv_start_${identifier}`),
      Markup.button.callback('⏹ Stop', `srv_stop_${identifier}`),
      Markup.button.callback('🔄 Restart', `srv_restart_${identifier}`),
    ],
    [
      suspended
        ? Markup.button.callback('✅ Unsuspend', `srv_unsuspend_${serverId}`)
        : Markup.button.callback('⛔ Suspend', `srv_suspend_${serverId}`),
      Markup.button.callback('🔧 Reinstall', `srv_reinstall_${serverId}`),
    ],
    [Markup.button.callback('⬅️ Back', 'menu_mypanel')],
  ];
  return Markup.inlineKeyboard(rows);
}

// ── Pagination keyboard ───────────────────────────────────────────────────────
function paginationKeyboard(page, total, baseAction, backAction) {
  const rows = [];
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `${baseAction}_${page - 1}`));
  if (total > 1) nav.push(Markup.button.callback(`📄 ${page}/${total}`, 'noop'));
  if (page < total) nav.push(Markup.button.callback('Next ➡️', `${baseAction}_${page + 1}`));
  if (nav.length > 0) rows.push(nav);
  if (backAction) rows.push([Markup.button.callback('⬅️ Back', backAction)]);
  return Markup.inlineKeyboard(rows);
}

// ── Admin dashboard keyboard ──────────────────────────────────────────────────
function adminDashboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Users', 'adm_users'), Markup.button.callback('🖥️ Servers (Bot DB)', 'adm_servers')],
    [Markup.button.callback('🗄️ Server Panel', 'adm_panel_servers'), Markup.button.callback('👥 User Panel', 'adm_panel_users')],
    [Markup.button.callback('🎟 Voucher', 'adm_vouchers'), Markup.button.callback('📦 Paket', 'adm_packages')],
    [Markup.button.callback('🥚 Eggs', 'adm_eggs'), Markup.button.callback('🌍 Nodes', 'adm_nodes')],
    [Markup.button.callback('📢 Broadcast', 'adm_broadcast'), Markup.button.callback('📊 Statistik', 'adm_stats')],
    [Markup.button.callback('👥 Grup Wajib', 'adm_groups'), Markup.button.callback('⛔ Blacklist', 'adm_blacklist')],
    [Markup.button.callback('⭐ Premium', 'adm_premium'), Markup.button.callback('💼 Reseller', 'adm_resellers')],
    [Markup.button.callback('⚙️ Settings', 'adm_settings'), Markup.button.callback('💾 Backup', 'adm_backup')],
    [Markup.button.callback('📋 Activity Log', 'adm_actlog'), Markup.button.callback('🔒 Security Log', 'adm_seclog')],
    [Markup.button.callback('❌ Tutup', 'menu_close')],
  ]);
}

// ── User action keyboard ──────────────────────────────────────────────────────
function userActionsKeyboard(telegramId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⭐ Add Premium', `adm_addpremium_${telegramId}`),
      Markup.button.callback('🚫 Del Premium', `adm_rempremium_${telegramId}`),
    ],
    [
      Markup.button.callback('💼 Add Reseller', `adm_addres_${telegramId}`),
      Markup.button.callback('🚫 Del Reseller', `adm_remres_${telegramId}`),
    ],
    [
      Markup.button.callback('⛔ Blacklist', `adm_addbl_${telegramId}`),
      Markup.button.callback('✅ Unblacklist', `adm_rembl_${telegramId}`),
    ],
    [Markup.button.callback('⬅️ Back', 'adm_users')],
  ]);
}

// ── Server action keyboard ────────────────────────────────────────────────────
function serverActionsKeyboard(serverId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('▶️ Start', `adm_srv_start_${serverId}`),
      Markup.button.callback('⏹ Stop', `adm_srv_stop_${serverId}`),
      Markup.button.callback('🔄 Restart', `adm_srv_restart_${serverId}`),
    ],
    [
      Markup.button.callback('⛔ Suspend', `adm_srv_suspend_${serverId}`),
      Markup.button.callback('✅ Unsuspend', `adm_srv_unsuspend_${serverId}`),
    ],
    [
      Markup.button.callback('🔧 Reinstall', `adm_srv_reinstall_${serverId}`),
      Markup.button.callback('🗑️ Delete', `adm_srv_delete_${serverId}`),
    ],
    [Markup.button.callback('⬅️ Back', 'adm_servers')],
  ]);
}

// ── Broadcast keyboard ────────────────────────────────────────────────────────
function broadcastKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📢 Semua User', 'adm_bc_all'),
      Markup.button.callback('⭐ Premium', 'adm_bc_premium'),
    ],
    [
      Markup.button.callback('💼 Reseller', 'adm_bc_reseller'),
      Markup.button.callback('🛡️ Admin', 'adm_bc_admin'),
    ],
    [Markup.button.callback('⬅️ Back', 'adm_dashboard')],
  ]);
}

// ── Maintenance keyboard ──────────────────────────────────────────────────────
function maintenanceKeyboard(isActive) {
  return Markup.inlineKeyboard([
    [
      isActive
        ? Markup.button.callback('✅ Matikan Maintenance', 'adm_toggle_maintenance')
        : Markup.button.callback('⚠️ Aktifkan Maintenance', 'adm_toggle_maintenance'),
    ],
    [Markup.button.callback('⬅️ Back', 'adm_settings')],
  ]);
}

// ── Node list keyboard (admin) ─────────────────────────────────────────────────
function nodeListKeyboard(nodes) {
  const rows = nodes.map(n => [
    Markup.button.callback(`${n.maintenance_mode ? '🔧' : '🟢'} ${n.name}`, `adm_nodeview_${n.id}`),
  ]);
  rows.push([Markup.button.callback('⬅️ Back', 'adm_dashboard')]);
  return Markup.inlineKeyboard(rows);
}

// ── Node detail keyboard (admin) ────────────────────────────────────────────────
function nodeDetailKeyboard(nodeId, maintenanceMode) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      maintenanceMode ? '🟢 Matikan Maintenance' : '🔧 Aktifkan Maintenance',
      `adm_nodemt_${nodeId}`
    )],
    [Markup.button.callback('⬅️ Back', 'adm_nodes')],
  ]);
}

// ── Owner dashboard keyboard ──────────────────────────────────────────────────
function ownerDashboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Kelola Admin', 'own_admins'), Markup.button.callback('🔧 API Settings', 'own_api')],
    [Markup.button.callback('🛠 Owner Tools', 'own_tools'), Markup.button.callback('📋 Audit Log', 'own_auditlog')],
    [Markup.button.callback('📊 Statistik', 'adm_stats'), Markup.button.callback('⬅️ Back', 'menu_home')],
  ]);
}

// ── Reseller dashboard keyboard ───────────────────────────────────────────────
function resellerDashboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Buat Panel', 'res_create'), Markup.button.callback('📋 Daftar Panel', 'res_list')],
    [Markup.button.callback('📊 Info Kuota', 'res_quota'), Markup.button.callback('⬅️ Back', 'menu_home')],
  ]);
}

module.exports = {
  backKeyboard, navRow, mainMenu,
  packageKeyboard, eggKeyboard, confirmKeyboard,
  serverControlKeyboard, paginationKeyboard,
  nodeSelectKeyboard, nodeListKeyboard, nodeDetailKeyboard,
  adminDashboard, ownerDashboard, resellerDashboard,
  userActionsKeyboard, serverActionsKeyboard,
  broadcastKeyboard, maintenanceKeyboard,
};
