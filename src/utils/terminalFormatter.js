/**
 * Утилиты для форматирования текста в стиле терминала
 */

/**
 * Добавляет эффект командной строки к тексту
 * @param {string} text - Исходный текст
 * @returns {string} - Отформатированный текст
 */
const terminalizeText = (text) => {
  if (!text) return '';
  
  // Добавляем префикс стиля терминала к каждой строке
  const lines = text.split('\n');
  const formattedLines = lines.map((line, index) => {
    if (index === 0) {
      return `$ ${line}`;
    } else if (line.trim().startsWith('[') && (line.trim().includes('+') || line.trim().includes('-'))) {
      // Оставляем строки с обозначениями [+] или [-] как есть
      return line;
    } else if (line.trim()) {
      // Для непустых строк добавляем отступ для выравнивания
      return `  ${line}`;
    }
    return line;
  });
  
  return formattedLines.join('\n');
};

/**
 * Создает HTML-разметку для текста с эффектом печатающегося терминала
 * (для использования в HTML-сообщениях)
 * @param {string} text - Исходный текст
 * @returns {string} - HTML разметка с классами для стилизации
 */
const createTypingEffect = (text) => {
  if (!text) return '';
  
  // Оборачиваем в HTML с классами для стилизации как терминал
  return `<pre class="terminal-text">${text}</pre>`;
};

/**
 * Форматирует сообщение в стиле терминала для обычных сообщений
 * @param {string} text - Исходный текст
 * @returns {string} - Отформатированный текст
 */
const formatTerminalMessage = (text) => {
  if (!text) return '';
  
  // Преобразование простого текста в стиль терминала
  const now = new Date();
  const timestamp = `[${now.toISOString()}]`;
  
  return `${timestamp} ${terminalizeText(text)}`;
};

/**
 * Форматирует различные типы сообщений
 */
const formatters = {
  // Форматирование успешного результата
  success: (text) => `[+] ${text}`,
  
  // Форматирование ошибки
  error: (text) => `[-] Ошибка: ${text}`,
  
  // Форматирование предупреждения
  warning: (text) => `[!] Внимание: ${text}`,
  
  // Форматирование информационного сообщения
  info: (text) => `[i] ${text}`,
  
  // Форматирование запроса данных
  prompt: (text) => `[?] ${text}`
};

module.exports = {
  terminalizeText,
  createTypingEffect,
  formatTerminalMessage,
  formatters
}; 