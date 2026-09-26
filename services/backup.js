'use strict';

const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');
const settings = require('../settings');

const DB_DIR = path.join(__dirname, '..', 'database');
const BACKUP_DIR = path.join(__dirname, '..', 'backup');

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function createBackup() {
  await ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup_${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  await fs.mkdir(backupPath, { recursive: true });

  const files = await fs.readdir(DB_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      await fs.copyFile(path.join(DB_DIR, file), path.join(backupPath, file));
    }
  }

  logger.info(`Backup created: ${backupName}`);

  // Cleanup old backups
  await cleanupOldBackups();

  return { filename: backupName, path: backupPath };
}

async function cleanupOldBackups() {
  try {
    const backups = await fs.readdir(BACKUP_DIR);
    const backupDirs = [];

    for (const name of backups) {
      const stat = await fs.stat(path.join(BACKUP_DIR, name));
      if (stat.isDirectory()) backupDirs.push({ name, mtime: stat.mtimeMs });
    }

    backupDirs.sort((a, b) => b.mtime - a.mtime);

    const maxBackups = settings.maxBackupFiles || 10;
    if (backupDirs.length > maxBackups) {
      for (const old of backupDirs.slice(maxBackups)) {
        await fs.rm(path.join(BACKUP_DIR, old.name), { recursive: true, force: true });
        logger.info(`Removed old backup: ${old.name}`);
      }
    }
  } catch (err) {
    logger.error(`Backup cleanup error: ${err.message}`);
  }
}

async function listBackups() {
  await ensureBackupDir();
  const backups = await fs.readdir(BACKUP_DIR);
  const result = [];

  for (const name of backups) {
    try {
      const stat = await fs.stat(path.join(BACKUP_DIR, name));
      if (stat.isDirectory()) {
        result.push({ name, size: await getDirSize(path.join(BACKUP_DIR, name)), createdAt: stat.birthtime });
      }
    } catch (_) {}
  }

  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getDirSize(dirPath) {
  let total = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const f of files) {
      const stat = await fs.stat(path.join(dirPath, f));
      total += stat.size;
    }
  } catch (_) {}
  return `${(total / 1024).toFixed(1)} KB`;
}

module.exports = { createBackup, listBackups, cleanupOldBackups };
