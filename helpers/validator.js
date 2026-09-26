'use strict';

function isValidUsername(username) {
  return /^[a-zA-Z0-9._]{4,16}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 64;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidTelegramId(id) {
  return Number.isInteger(parseInt(id)) && parseInt(id) > 0;
}

function sanitizeText(text) {
  if (!text) return '';
  return String(text).trim().slice(0, 4096);
}

module.exports = { isValidUsername, isValidPassword, isValidEmail, isValidTelegramId, sanitizeText };
