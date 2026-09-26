'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs dir exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack }) => {
    return stack
      ? `[${timestamp}] [${level.toUpperCase()}] ${message}\n${stack}`
      : `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  })
);

const logger = createLogger({
  level: process.env.DEBUG === 'true' ? 'debug' : 'info',
  format: logFormat,
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), logFormat),
    }),
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

module.exports = logger;
