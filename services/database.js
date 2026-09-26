'use strict';

const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

const DB_DIR = path.join(__dirname, '..', 'database');

const DB_FILES = {
  users: 'users.json',
  admins: 'admins.json',
  owner: 'owner.json',
  reseller: 'reseller.json',
  premium: 'premium.json',
  blacklist: 'blacklist.json',
  claims: 'claims.json',
  servers: 'servers.json',
  groups: 'groups.json',
  required_groups: 'required_groups.json',
  share_logs: 'share_logs.json',
  voucher: 'voucher.json',
  referral: 'referral.json',
  leaderboard: 'leaderboard.json',
  cooldown: 'cooldown.json',
  sessions: 'sessions.json',
  activity_logs: 'activity_logs.json',
  audit_logs: 'audit_logs.json',
  security_logs: 'security_logs.json',
  packages: 'packages.json',
  settings: 'settings.json',
};

const DEFAULT_DATA = {
  users: [],
  admins: [],
  owner: [],
  reseller: [],
  premium: [],
  blacklist: [],
  claims: [],
  servers: [],
  groups: [],
  required_groups: [],
  share_logs: [],
  voucher: [],
  referral: [],
  leaderboard: [],
  cooldown: {},
  sessions: {},
  activity_logs: [],
  audit_logs: [],
  security_logs: [],
  packages: [
    { id: 1, name: '1 GB', ram: 1024, cpu: 50, disk: 1024, swap: 0, io: 500, oomKiller: true, active: true },
    { id: 2, name: '2 GB', ram: 2048, cpu: 75, disk: 2048, swap: 0, io: 500, oomKiller: true, active: true },
    { id: 3, name: '3 GB', ram: 3072, cpu: 100, disk: 3072, swap: 0, io: 500, oomKiller: true, active: true },
    { id: 4, name: '4 GB', ram: 4096, cpu: 150, disk: 4096, swap: 0, io: 500, oomKiller: true, active: true },
    { id: 5, name: '5 GB', ram: 5120, cpu: 200, disk: 5120, swap: 0, io: 500, oomKiller: true, active: true },
    { id: 6, name: 'Unlimited', ram: 0, cpu: 0, disk: 0, swap: 0, io: 500, oomKiller: true, active: false, ownerOnly: true },
  ],
  settings: {},
};

async function ensureDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch (e) {}
}

async function read(collection) {
  await ensureDir();
  const filePath = path.join(DB_DIR, DB_FILES[collection]);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const defaultData = DEFAULT_DATA[collection] ?? [];
      await write(collection, defaultData);
      return defaultData;
    }
    // File corrupted - backup and reset
    logger.error(`DB read error [${collection}]: ${err.message}`);
    try {
      const backupPath = filePath + '.bak.' + Date.now();
      await fs.copyFile(filePath, backupPath);
    } catch (_) {}
    const defaultData = DEFAULT_DATA[collection] ?? [];
    await write(collection, defaultData);
    return defaultData;
  }
}

async function write(collection, data) {
  await ensureDir();
  const filePath = path.join(DB_DIR, DB_FILES[collection]);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize all DB files
async function init() {
  await ensureDir();
  for (const [key] of Object.entries(DB_FILES)) {
    await read(key); // triggers auto-create if missing
  }
  logger.info('Database initialized successfully');
}

// User operations
async function getUser(telegramId) {
  const users = await read('users');
  return users.find(u => u.telegramId === telegramId) || null;
}

async function createUser(data) {
  const users = await read('users');
  const existing = users.find(u => u.telegramId === data.telegramId);
  if (existing) return existing;
  const user = {
    telegramId: data.telegramId,
    username: data.username || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    role: 'user',
    joinedAt: new Date().toISOString(),
    claimCount: 0,
    referralCode: `REF${data.telegramId}`,
    referredBy: data.referredBy || null,
    referralPoints: 0,
    shareCount: 0,
    lastActive: new Date().toISOString(),
  };
  users.push(user);
  await write('users', users);
  return user;
}

async function updateUser(telegramId, updates) {
  const users = await read('users');
  const idx = users.findIndex(u => u.telegramId === telegramId);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates, lastActive: new Date().toISOString() };
  await write('users', users);
  return users[idx];
}

async function getAllUsers() {
  return await read('users');
}

// Role checks
async function isOwner(telegramId) {
  const settings = require('../settings');
  if (settings.ownerIds.includes(telegramId)) return true;
  const owners = await read('owner');
  return owners.some(o => o.telegramId === telegramId);
}

async function isAdmin(telegramId) {
  if (await isOwner(telegramId)) return true;
  const admins = await read('admins');
  return admins.some(a => a.telegramId === telegramId);
}

async function isReseller(telegramId) {
  const resellers = await read('reseller');
  return resellers.some(r => r.telegramId === telegramId);
}

async function isPremium(telegramId) {
  const premiums = await read('premium');
  const p = premiums.find(p => p.telegramId === telegramId);
  if (!p) return false;
  if (p.expiredAt && new Date(p.expiredAt) < new Date()) return false;
  return true;
}

async function isBlacklisted(telegramId) {
  const blacklist = await read('blacklist');
  const b = blacklist.find(b => b.telegramId === telegramId);
  if (!b) return false;
  if (b.expiredAt && new Date(b.expiredAt) < new Date()) {
    await removeFromBlacklist(telegramId);
    return false;
  }
  return { reason: b.reason, addedBy: b.addedBy, addedAt: b.addedAt };
}

async function addToBlacklist(telegramId, reason, addedBy, expiredAt = null) {
  const blacklist = await read('blacklist');
  const existing = blacklist.findIndex(b => b.telegramId === telegramId);
  const entry = { telegramId, reason, addedBy, addedAt: new Date().toISOString(), expiredAt };
  if (existing !== -1) blacklist[existing] = entry;
  else blacklist.push(entry);
  await write('blacklist', blacklist);
}

async function removeFromBlacklist(telegramId) {
  const blacklist = await read('blacklist');
  await write('blacklist', blacklist.filter(b => b.telegramId !== telegramId));
}

// Role management
async function addAdmin(data) {
  const admins = await read('admins');
  if (!admins.find(a => a.telegramId === data.telegramId)) admins.push({ ...data, addedAt: new Date().toISOString() });
  await write('admins', admins);
}

async function removeAdmin(telegramId) {
  const admins = await read('admins');
  await write('admins', admins.filter(a => a.telegramId !== telegramId));
}

async function addReseller(data) {
  const resellers = await read('reseller');
  const idx = resellers.findIndex(r => r.telegramId === data.telegramId);
  if (idx !== -1) resellers[idx] = { ...resellers[idx], ...data };
  else resellers.push({ ...data, quota: data.quota || 10, used: 0, addedAt: new Date().toISOString() });
  await write('reseller', resellers);
}

async function removeReseller(telegramId) {
  const resellers = await read('reseller');
  await write('reseller', resellers.filter(r => r.telegramId !== telegramId));
}

async function getReseller(telegramId) {
  const resellers = await read('reseller');
  return resellers.find(r => r.telegramId === telegramId) || null;
}

async function addPremium(data) {
  const premiums = await read('premium');
  const idx = premiums.findIndex(p => p.telegramId === data.telegramId);
  if (idx !== -1) premiums[idx] = { ...premiums[idx], ...data };
  else premiums.push({ ...data, addedAt: new Date().toISOString() });
  await write('premium', premiums);
}

async function removePremium(telegramId) {
  const premiums = await read('premium');
  await write('premium', premiums.filter(p => p.telegramId !== telegramId));
}

// Server operations
async function saveServer(data) {
  const servers = await read('servers');
  servers.push({ ...data, createdAt: new Date().toISOString(), status: 'active' });
  await write('servers', servers);
}

async function getUserServers(telegramId) {
  const servers = await read('servers');
  return servers.filter(s => s.telegramId === telegramId);
}

async function getAllServers() {
  return await read('servers');
}

async function getServerById(serverId) {
  const servers = await read('servers');
  return servers.find(s => s.serverId === serverId || s.identifier === serverId) || null;
}

async function updateServer(serverId, updates) {
  const servers = await read('servers');
  const idx = servers.findIndex(s => s.serverId === serverId);
  if (idx === -1) return null;
  servers[idx] = { ...servers[idx], ...updates };
  await write('servers', servers);
  return servers[idx];
}

async function deleteServer(serverId) {
  const servers = await read('servers');
  await write('servers', servers.filter(s => s.serverId !== serverId));
}

// Cooldown
async function getCooldown(telegramId, type) {
  const cooldowns = await read('cooldown');
  const key = `${telegramId}_${type}`;
  if (!cooldowns[key]) return 0;
  const remaining = cooldowns[key] - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

async function setCooldown(telegramId, type, seconds) {
  const cooldowns = await read('cooldown');
  const key = `${telegramId}_${type}`;
  cooldowns[key] = Date.now() + seconds * 1000;
  await write('cooldown', cooldowns);
}

async function clearCooldown(telegramId, type) {
  const cooldowns = await read('cooldown');
  const key = `${telegramId}_${type}`;
  delete cooldowns[key];
  await write('cooldown', cooldowns);
}

// Session
async function getSession(telegramId) {
  const sessions = await read('sessions');
  return sessions[telegramId] || null;
}

async function setSession(telegramId, data) {
  const sessions = await read('sessions');
  sessions[telegramId] = { ...data, updatedAt: new Date().toISOString() };
  await write('sessions', sessions);
}

async function clearSession(telegramId) {
  const sessions = await read('sessions');
  delete sessions[telegramId];
  await write('sessions', sessions);
}

// Share logs
async function getShareLogs(telegramId) {
  const logs = await read('share_logs');
  const validStatuses = ['member', 'administrator', 'creator'];
  return logs.filter(l =>
    l.telegramId === telegramId &&
    l.isMember !== false &&
    validStatuses.includes(l.status)
  );
}

async function addShareLog(data) {
  const logs = await read('share_logs');
  const existing = logs.findIndex(l => l.telegramId === data.telegramId && l.groupId === data.groupId);
  if (existing !== -1) {
    logs[existing] = { ...logs[existing], ...data, updatedAt: new Date().toISOString() };
  } else {
    logs.push({ ...data, addedAt: new Date().toISOString() });
  }
  await write('share_logs', logs);
}

async function updateShareLog(telegramId, groupId, updates) {
  const logs = await read('share_logs');
  const idx = logs.findIndex(l => l.telegramId === telegramId && l.groupId === groupId);
  if (idx !== -1) logs[idx] = { ...logs[idx], ...updates, updatedAt: new Date().toISOString() };
  await write('share_logs', logs);
}

// Required groups
async function getRequiredGroups() {
  return await read('required_groups');
}

async function addRequiredGroup(data) {
  const groups = await read('required_groups');
  if (!groups.find(g => g.groupId === data.groupId)) groups.push({ ...data, addedAt: new Date().toISOString(), active: true });
  await write('required_groups', groups);
}

async function removeRequiredGroup(groupId) {
  const groups = await read('required_groups');
  await write('required_groups', groups.filter(g => g.groupId !== groupId));
}

// Activity log
async function logActivity(data) {
  const logs = await read('activity_logs');
  logs.push({ ...data, timestamp: new Date().toISOString() });
  if (logs.length > 10000) logs.splice(0, logs.length - 10000);
  await write('activity_logs', logs);
}

async function logAudit(data) {
  const logs = await read('audit_logs');
  logs.push({ ...data, timestamp: new Date().toISOString() });
  if (logs.length > 5000) logs.splice(0, logs.length - 5000);
  await write('audit_logs', logs);
}

async function logSecurity(data) {
  const logs = await read('security_logs');
  logs.push({ ...data, timestamp: new Date().toISOString() });
  if (logs.length > 5000) logs.splice(0, logs.length - 5000);
  await write('security_logs', logs);
}

// Voucher
async function getVoucher(code) {
  const vouchers = await read('voucher');
  return vouchers.find(v => v.code === code.toUpperCase()) || null;
}

async function createVoucher(data) {
  const vouchers = await read('voucher');
  const v = {
    code: data.code.toUpperCase(),
    type: data.type || 'panel',
    reward: data.reward || {},
    maxUses: data.maxUses || 1,
    usedCount: 0,
    usedBy: [],
    expiredAt: data.expiredAt || null,
    createdBy: data.createdBy,
    createdAt: new Date().toISOString(),
    active: true,
  };
  vouchers.push(v);
  await write('voucher', vouchers);
  return v;
}

async function useVoucher(code, telegramId) {
  const vouchers = await read('voucher');
  const idx = vouchers.findIndex(v => v.code === code.toUpperCase());
  if (idx === -1) return { ok: false, msg: 'Voucher tidak ditemukan.' };
  const v = vouchers[idx];
  if (!v.active) return { ok: false, msg: 'Voucher tidak aktif.' };
  if (v.expiredAt && new Date(v.expiredAt) < new Date()) return { ok: false, msg: 'Voucher sudah expired.' };
  if (v.usedBy.includes(telegramId)) return { ok: false, msg: 'Kamu sudah menggunakan voucher ini.' };
  if (v.usedCount >= v.maxUses) return { ok: false, msg: 'Voucher sudah habis.' };
  vouchers[idx].usedCount++;
  vouchers[idx].usedBy.push(telegramId);
  if (vouchers[idx].usedCount >= vouchers[idx].maxUses) vouchers[idx].active = false;
  await write('voucher', vouchers);
  return { ok: true, reward: v.reward, type: v.type };
}

async function deleteVoucher(code) {
  const vouchers = await read('voucher');
  await write('voucher', vouchers.filter(v => v.code !== code.toUpperCase()));
}

// Referral
async function getReferral(telegramId) {
  const referrals = await read('referral');
  return referrals.find(r => r.telegramId === telegramId) || null;
}

async function addReferralPoint(referrerId, invitedId, points) {
  const referrals = await read('referral');
  const idx = referrals.findIndex(r => r.telegramId === referrerId);
  if (idx !== -1) {
    referrals[idx].points += points;
    referrals[idx].invitedUsers.push(invitedId);
  } else {
    referrals.push({ telegramId: referrerId, points, invitedUsers: [invitedId], createdAt: new Date().toISOString() });
  }
  await write('referral', referrals);
}

// Packages
async function getPackages() {
  return (await read('packages')).filter(p => p.active);
}

async function getPackage(id) {
  const pkgs = await read('packages');
  return pkgs.find(p => p.id === parseInt(id)) || null;
}

async function savePackage(data) {
  const pkgs = await read('packages');
  const idx = pkgs.findIndex(p => p.id === data.id);
  if (idx !== -1) pkgs[idx] = { ...pkgs[idx], ...data };
  else pkgs.push({ ...data, id: Date.now() });
  await write('packages', pkgs);
}

async function deletePackage(id) {
  const pkgs = await read('packages');
  await write('packages', pkgs.filter(p => p.id !== parseInt(id)));
}

// Stats
async function getStats() {
  const [users, servers, premiums, resellers, admins, vouchers, blacklist, claims, shares] = await Promise.all([
    read('users'), read('servers'), read('premium'), read('reseller'),
    read('admins'), read('voucher'), read('blacklist'), read('claims'), read('share_logs'),
  ]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart - 6 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayClaims = servers.filter(s => new Date(s.createdAt) >= todayStart).length;
  const weekClaims = servers.filter(s => new Date(s.createdAt) >= weekStart).length;
  const monthClaims = servers.filter(s => new Date(s.createdAt) >= monthStart).length;

  return {
    totalUsers: users.length,
    totalServers: servers.length,
    totalPremium: premiums.length,
    totalResellers: resellers.length,
    totalAdmins: admins.length,
    totalVouchers: vouchers.length,
    totalBlacklist: blacklist.length,
    totalShares: shares.length,
    todayClaims,
    weekClaims,
    monthClaims,
    dbSize: await getDatabaseSize(),
  };
}

async function getDatabaseSize() {
  try {
    const files = await fs.readdir(DB_DIR);
    let total = 0;
    for (const file of files) {
      try {
        const stat = await fs.stat(path.join(DB_DIR, file));
        total += stat.size;
      } catch (_) {}
    }
    return (total / 1024).toFixed(2) + ' KB';
  } catch (_) {
    return 'N/A';
  }
}

// Username uniqueness check
async function isUsernameUsed(username) {
  const servers = await read('servers');
  return servers.some(s => s.panelUsername && s.panelUsername.toLowerCase() === username.toLowerCase());
}

module.exports = {
  init, read, write,
  getUser, createUser, updateUser, getAllUsers,
  isOwner, isAdmin, isReseller, isPremium, isBlacklisted,
  addToBlacklist, removeFromBlacklist,
  addAdmin, removeAdmin,
  addReseller, removeReseller, getReseller,
  addPremium, removePremium,
  saveServer, getUserServers, getAllServers, getServerById, updateServer, deleteServer,
  getCooldown, setCooldown, clearCooldown,
  getSession, setSession, clearSession,
  getShareLogs, addShareLog, updateShareLog,
  getRequiredGroups, addRequiredGroup, removeRequiredGroup,
  logActivity, logAudit, logSecurity,
  getVoucher, createVoucher, useVoucher, deleteVoucher,
  getReferral, addReferralPoint,
  getPackages, getPackage,
  savePackage, deletePackage,
  getStats, getDatabaseSize, isUsernameUsed,
};
