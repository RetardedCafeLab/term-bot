require('dotenv').config();
const { Telegraf } = require('telegraf');

// Создаем экземпляр бота с токеном из .env
const bot = new Telegraf(process.env.BOT_TOKEN);

// Логируем информацию о запуске
console.log('Starting bot with token:', process.env.BOT_TOKEN.substring(0, 8) + '...');
console.log('Webhook mode:', process.env.USE_WEBHOOK === 'true' ? 'ON' : 'OFF');

// Простая команда /start
bot.start((ctx) => {
  console.log('Received /start command from:', ctx.from.id);
  return ctx.reply('Бот TERM успешно запущен! 🚀');
});

// Текстовое сообщение
bot.on('text', (ctx) => {
  console.log('Received message:', ctx.message.text);
  return ctx.reply(`Вы отправили: ${ctx.message.text}`);
});

// Запуск бота
console.log('Launching bot...');
bot.launch()
  .then(() => console.log('Bot successfully launched!'))
  .catch(err => console.error('Launch error:', err));

// Обработка остановки
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 