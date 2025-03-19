const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если она не существует
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Формат для консольных логов
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

// Формат для файловых логов
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Создаем логгер
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fileFormat,
  defaultMeta: { service: 'term-bot' },
  transports: [
    // Логи с уровнем error и ниже будут записываться в error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // Все логи будут записываться в combined.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    })
  ]
});

// Если не в production, также выводим логи в консоль
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

/**
 * Логгирование действий пользователей
 * @param {number} userId - ID пользователя в Telegram
 * @param {string} action - Выполненное действие
 * @param {Object} details - Дополнительные детали (опционально)
 */
logger.logUserAction = (userId, action, details = {}) => {
  logger.info(`User ${userId} performed action: ${action}`, {
    userId,
    action,
    details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Логгирование ошибок с контекстом пользователя
 * @param {number} userId - ID пользователя в Telegram
 * @param {string} error - Сообщение об ошибке
 * @param {Object} context - Контекст ошибки (опционально)
 */
logger.logError = (userId, error, context = {}) => {
  logger.error(`Error for user ${userId}: ${error}`, {
    userId,
    error: error instanceof Error ? { 
      message: error.message, 
      stack: error.stack 
    } : error,
    context,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger; 