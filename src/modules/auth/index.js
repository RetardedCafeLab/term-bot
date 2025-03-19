const { Composer, Markup } = require('telegraf');
const User = require('../../models/user');
const logger = require('../../utils/logger');
const config = require('../../config');
const { formatters } = require('../../utils/terminalFormatter');

const authModule = new Composer();

// Команда /start - начало работы с ботом
authModule.command('start', async (ctx) => {
  try {
    // Проверяем наличие ссылки для приглашения (реферальная система)
    const startPayload = ctx.startPayload;
    
    if (startPayload && ctx.user) {
      const referrerId = parseInt(startPayload, 10);
      
      if (!isNaN(referrerId) && referrerId !== ctx.user.telegramId) {
        // Найдем пользователя, который пригласил
        const referrer = await User.findOne({ telegramId: referrerId });
        
        if (referrer) {
          // Записываем информацию о приглашении
          ctx.user.referrals.referredBy = referrerId;
          await ctx.user.save();
          
          // Добавляем пользователя в список приглашенных у реферера
          referrer.addReferral(ctx.user.telegramId);
          await referrer.save();
          
          logger.info(`User ${ctx.user.telegramId} was referred by ${referrerId}`);
        }
      }
    }
    
    // Создаем клавиатуру с основными действиями
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📋 Список команд', 'show_help')],
      [Markup.button.callback('💳 Подписка', 'back_to_subscribe')],
      [Markup.button.webApp('🖥️ Открыть TERM терминал', config.miniApp.url)]
    ]);
    
    // Отправляем приветственное сообщение
    await ctx.replyWithAsciiArt(
      config.asciiArt.welcome,
      `Привет, ${ctx.user.firstName || 'пользователь'}!\n\n` +
      config.messages.welcome + '\n\n' +
      'Для получения списка доступных команд, введите /help',
      keyboard
    );
    
    // Если у пользователя нет активной подписки, предложим подписаться
    if (!ctx.user.hasActiveSubscription()) {
      await ctx.reply(
        formatters.info('У вас нет активной подписки.') + 
        '\n\nИспользуйте /subscribe для получения доступа к материалам лаборатории.'
      );
    }
  } catch (error) {
    logger.error(`Error in start command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик нажатия на кнопку "Список команд"
authModule.action('show_help', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Формируем текст с командами помощи
    let helpText = config.messages.help;
    
    // Дополнительные команды для пользователей с подпиской
    if (ctx.user.hasActiveSubscription()) {
      helpText += '\n\n--- Команды для подписчиков ---\n' +
                 '/content - Доступные образовательные материалы\n' + 
                 '/referral - Ваша реферальная ссылка\n' +
                 '/webapp - Открыть мини-приложение TERM терминала';
    }
    
    // Дополнительные команды для администраторов
    if (ctx.user.isAdmin) {
      helpText += '\n\n--- Команды администратора ---\n' +
                 '/admin - Панель администратора\n' +
                 '/broadcast - Отправить сообщение всем пользователям\n' +
                 '/stats - Статистика использования бота\n' +
                 '/confirm_payment - Подтвердить платеж (Telegram Stars)';
    }
    
    // Создаем клавиатуру с основными действиями
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Подписка', 'back_to_subscribe')],
      [Markup.button.webApp('🖥️ Открыть TERM терминал', config.miniApp.url)]
    ]);
    
    await ctx.editMessageText(helpText, keyboard);
  } catch (error) {
    logger.error(`Error in show_help action handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отображении справки. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /help - получение списка доступных команд
authModule.command('help', async (ctx) => {
  try {
    // Базовые команды для всех пользователей
    let helpText = config.messages.help;
    
    // Дополнительные команды для пользователей с подпиской
    if (ctx.user.hasActiveSubscription()) {
      helpText += '\n\n--- Команды для подписчиков ---\n' +
                 '/content - Доступные образовательные материалы\n' + 
                 '/referral - Ваша реферальная ссылка\n' +
                 '/webapp - Открыть мини-приложение TERM терминала';
    }
    
    // Дополнительные команды для администраторов
    if (ctx.user.isAdmin) {
      helpText += '\n\n--- Команды администратора ---\n' +
                 '/admin - Панель администратора\n' +
                 '/broadcast - Отправить сообщение всем пользователям\n' +
                 '/stats - Статистика использования бота\n' +
                 '/confirm_payment - Подтвердить платеж (Telegram Stars)';
    }
    
    // Создаем клавиатуру с основными действиями
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Подписка', 'back_to_subscribe')],
      [Markup.button.webApp('🖥️ Открыть TERM терминал', config.miniApp.url)]
    ]);
    
    await ctx.reply(helpText, keyboard);
  } catch (error) {
    logger.error(`Error in help command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /status - получение информации о текущем статусе пользователя
authModule.command('status', async (ctx) => {
  try {
    const user = ctx.user;
    let statusText = `ID пользователя: ${user.telegramId}\n`;
    
    // Информация о подписке
    if (user.hasActiveSubscription()) {
      const subscriptionEndDate = new Date(user.subscription.endDate).toLocaleDateString('ru-RU');
      statusText += `\nСтатус подписки: ${formatters.success('Активна')}\n` +
                   `Тип подписки: ${user.subscription.tier}\n` +
                   `Дата окончания: ${subscriptionEndDate}\n`;
      
      // Рассчитываем оставшиеся дни
      const today = new Date();
      const endDate = new Date(user.subscription.endDate);
      const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
      
      statusText += `Осталось дней: ${daysLeft}`;
    } else {
      statusText += `\nСтатус подписки: ${formatters.error('Неактивна')}\n` +
                   'Используйте /subscribe для оформления подписки.';
    }
    
    // Информация о рефералах
    const referralsCount = user.referrals.invitedUsers.length;
    const activeReferrals = user.referrals.invitedUsers.filter(ref => ref.hasSubscribed).length;
    
    statusText += `\n\nПриглашенных пользователей: ${referralsCount}\n` +
                 `Активных рефералов: ${activeReferrals}`;
    
    // Если пользователь администратор, добавляем эту информацию
    if (user.isAdmin) {
      statusText += `\n\nСтатус администратора: ${formatters.success('Да')}`;
    }
    
    await ctx.reply(statusText);
  } catch (error) {
    logger.error(`Error in status command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении статуса. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /referral - получение реферальной ссылки
authModule.command('referral', async (ctx) => {
  try {
    const botUsername = (await ctx.telegram.getMe()).username;
    const referralLink = `https://t.me/${botUsername}?start=${ctx.user.telegramId}`;
    
    let referralText = formatters.info('Ваша реферальная ссылка:') + 
                      `\n\n${referralLink}\n\n` +
                      'Поделитесь этой ссылкой с друзьями. Когда они подпишутся, вы получите дополнительные бонусы!';
    
    // Информация о текущих рефералах
    const referralsCount = ctx.user.referrals.invitedUsers.length;
    const activeReferrals = ctx.user.referrals.invitedUsers.filter(ref => ref.hasSubscribed).length;
    
    referralText += `\n\nВы пригласили: ${referralsCount} пользователей\n` +
                   `Активных рефералов: ${activeReferrals}`;
    
    // Добавляем информацию о бонусах за рефералов
    referralText += '\n\nБонусы за рефералов:\n' +
                   '• 1 активный реферал: +7 дней к подписке\n' +
                   '• 3 активных реферала: +14 дней к подписке\n' +
                   '• 5 активных рефералов: +30 дней к подписке';
    
    await ctx.reply(referralText);
  } catch (error) {
    logger.error(`Error in referral command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении реферальной ссылки. Пожалуйста, попробуйте позже.'));
  }
});

module.exports = authModule; 