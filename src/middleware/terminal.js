const { formatTerminalMessage, createTypingEffect } = require('../utils/terminalFormatter');
const logger = require('../utils/logger');

/**
 * Middleware для обработки ответов в стиле терминала
 * Перехватывает стандартные методы отправки сообщений и стилизует их
 */
const terminalStyleMiddleware = (ctx, next) => {
  // Проверка на наличие контекста
  if (!ctx) {
    logger.warn('Context is undefined in terminalStyleMiddleware');
    return next ? next() : undefined;
  }

  // Сохраняем оригинальные методы, только если они существуют
  const originalReply = ctx.reply;
  const originalReplyWithHTML = ctx.replyWithHTML;
  
  // Переопределяем метод reply только если он существует
  if (typeof originalReply === 'function') {
    ctx.reply = function(text, extra = {}) {
      try {
        // Форматируем текст в стиле терминала
        const formattedText = formatTerminalMessage(text);
        
        // Устанавливаем зеленый цвет (не работает в обычных сообщениях, но оставляем для согласованности)
        return originalReply.call(this, formattedText, {
          ...extra,
          parse_mode: 'HTML'
        });
      } catch (error) {
        logger.error(`Error in terminal-styled reply: ${error.message}`, { error });
        // В случае ошибки используем оригинальный метод
        try {
          return originalReply.call(this, text, extra);
        } catch (fallbackError) {
          logger.error(`Fallback reply also failed: ${fallbackError.message}`);
          return Promise.reject(error);
        }
      }
    };
  }
  
  // Переопределяем метод replyWithHTML только если он существует
  if (typeof originalReplyWithHTML === 'function') {
    ctx.replyWithHTML = function(text, extra = {}) {
      try {
        // Применяем эффект печатающегося терминала к тексту
        const terminalStyledText = `<code class="terminal-text" style="color: #00FF00; background-color: #000000;">
${text}
</code>`;
        
        return originalReplyWithHTML.call(this, terminalStyledText, extra);
      } catch (error) {
        logger.error(`Error in terminal-styled HTML reply: ${error.message}`, { error });
        // В случае ошибки используем оригинальный метод
        try {
          return originalReplyWithHTML.call(this, text, extra);
        } catch (fallbackError) {
          logger.error(`Fallback HTML reply also failed: ${fallbackError.message}`);
          return Promise.reject(error);
        }
      }
    };
  }
  
  // Добавляем специальный метод для отправки сообщений с эффектом печатающегося текста
  if (typeof originalReply === 'function' && typeof originalReplyWithHTML === 'function') {
    ctx.replyWithTypingEffect = function(text, extra = {}) {
      try {
        // Форматируем текст в стиле печатающегося терминала
        const typingText = createTypingEffect(formatTerminalMessage(text));
        
        return originalReplyWithHTML.call(this, typingText, {
          ...extra,
          parse_mode: 'HTML'
        });
      } catch (error) {
        logger.error(`Error in typing effect reply: ${error.message}`, { error });
        // В случае ошибки используем оригинальный метод
        try {
          return originalReply.call(this, text, extra);
        } catch (fallbackError) {
          logger.error(`Fallback typing reply also failed: ${fallbackError.message}`);
          return Promise.reject(error);
        }
      }
    };
  }
  
  // Добавляем метод для отправки ASCII-арта
  if (typeof originalReply === 'function' && typeof originalReplyWithHTML === 'function') {
    ctx.replyWithAsciiArt = function(asciiArt, message = '', extra = {}) {
      try {
        const text = `<pre>${asciiArt}</pre>\n\n${message}`;
        
        return originalReplyWithHTML.call(this, text, {
          ...extra,
          parse_mode: 'HTML'
        });
      } catch (error) {
        logger.error(`Error in ASCII art reply: ${error.message}`, { error });
        // В случае ошибки используем оригинальный метод
        try {
          return originalReply.call(this, `${asciiArt}\n\n${message}`, extra);
        } catch (fallbackError) {
          logger.error(`Fallback ASCII reply also failed: ${fallbackError.message}`);
          return Promise.reject(error);
        }
      }
    };
  }
  
  return next();
};

module.exports = terminalStyleMiddleware; 