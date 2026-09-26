'use strict';

require('dotenv').config();

const settings = {
  // ── Bot Configuration ──────────────────────────────────────────────────────
  botToken: process.env.BOT_TOKEN || '8194599694:AAGJlc89LNOAurUX0YMhimZtsax24u_EPfc',
  botName: process.env.BOT_NAME || 'Panel Bot',
  botVersion: process.env.BOT_VERSION || '1.0.0',
  ownerUsername: process.env.OWNER_USERNAME || 'zeetasi',
  ownerIds: (process.env.OWNER_IDS || '7338916279')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id)),

  // ── Pterodactyl Panel ──────────────────────────────────────────────────────
  panelUrl: (process.env.PANEL_URL || 'https://panellll.zeetasi.qzz.io').replace(/\/+$/, 'https://panellll.zeetasi.qzz.io'),
  appApiKey: process.env.PTERO_APP_KEY || 'ptla_ort9jN7rNA6sjXMvcMlD1QhKj15f7gMuediFbKEqCxq',    // Application API key (ptla_...)
  clientApiKey: process.env.PTERO_CLIENT_KEY || 'ptlc_62X9wHHk3U36d8LpNnVsTlNzPzPVuPIEjxjlzkENVqg', // Client API key (ptlc_...)
  defaultLocationId: parseInt(process.env.DEFAULT_LOCATION_ID || '1'),
  defaultNodeId: parseInt(process.env.DEFAULT_NODE_ID || '4'),
  // Domain used to build the panel account email (kept short: username@domain)
  panelEmailDomain: process.env.PANEL_EMAIL_DOMAIN || 'zeetasi.qzz.io',

  // ── Panel Limits ───────────────────────────────────────────────────────────
  maxPanelPerUser: parseInt(process.env.MAX_PANEL_PER_USER || '1'),
  maxPanelPremium: parseInt(process.env.MAX_PANEL_PREMIUM || '3'),
  claimCooldown: parseInt(process.env.CLAIM_COOLDOWN || '86400000'), // seconds (default 24h)
  redeemCooldown: parseInt(process.env.REDEEM_COOLDOWN || '3600'), // seconds

  // ── Channel & Share Requirements ───────────────────────────────────────────
  requiredChannels: [], // Will be loaded dynamically from DB
  requiredGroupCount: parseInt(process.env.REQUIRED_GROUP_COUNT || '2'),
  requiredShareCount: parseInt(process.env.REQUIRED_SHARE_COUNT || '3'),

  // ── Referral System ────────────────────────────────────────────────────────
  referralPointsPerInvite: parseInt(process.env.REFERRAL_POINTS || '10'),
  referralPremiumThreshold: parseInt(process.env.REFERRAL_PREMIUM_THRESHOLD || '50'),
  referralVoucherThreshold: parseInt(process.env.REFERRAL_VOUCHER_THRESHOLD || '30'),

  // ── Logging ────────────────────────────────────────────────────────────────
  logGroupId: process.env.LOG_GROUP_ID ? parseInt(process.env.LOG_GROUP_ID) : null,

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60'),   // seconds
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '20'),          // requests per window
  rateLimitWarnings: parseInt(process.env.RATE_LIMIT_WARNINGS || '3'),

  // ── Feature Flags ──────────────────────────────────────────────────────────
  maintenanceMode: false,
  autoBackup: process.env.AUTO_BACKUP === 'true',
  autoSecurity: process.env.AUTO_SECURITY === 'true',
  autoBlacklist: process.env.AUTO_BLACKLIST === 'true',
};

module.exports = settings;
