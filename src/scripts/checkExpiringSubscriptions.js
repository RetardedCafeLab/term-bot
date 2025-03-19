/**
 * Скрипт для проверки истекающих подписок и отправки уведомлений
 * Запускается ежедневно через cron-задачу
 */

const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/user');
const logger = require('../utils/logger');
const { Markup } = require('telegraf');
const { formatters } = require('../utils/terminalFormatter');

// Инициализируем бота
const bot = new Telegraf(config.bot.token);

// Периоды для проверки
const CHECK_PERIODS = [1, 3]; // За сколько дней до окончания отправлять уведомления

/**
 * Основная функция скрипта
 */
async function checkExpiringSubscriptions() {
  try {
    logger.info('Starting check for expiring subscriptions');
    
    // Подключаемся к базе данных
    await mongoose.connect(config.db.uri);
    logger.info('Connected to MongoDB');
    
    // Получаем текущую дату
    const now = new Date();
    
    // Проверяем подписки для всех периодов
    for (const days of CHECK_PERIODS) {
      // Рассчитываем дату для проверки (текущая дата + days дней)
      const checkDate = new Date();
      checkDate.setDate(now.getDate() + days);
      
      // Устанавливаем начало дня
      const startOfDay = new Date(checkDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      // Устанавливаем конец дня
      const endOfDay = new Date(checkDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      logger.info(`Checking for subscriptions expiring in ${days} days`, {
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString()
      });
      
      // Находим пользователей с подписками, истекающими в этот день
      const users = await User.find({
        'subscription.active': true,
        'subscription.endDate': {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });
      
      logger.info(`Found ${users.length} users with subscriptions expiring in ${days} days`);
      
      // Отправляем уведомления найденным пользователям
      for (const user of users) {
        await sendExpirationNotification(user, days);
      }
      
      // Проверяем также подписки на каналы
      const usersWithChannelSubs = await User.find({
        'channelSubscriptions.active': true,
        'channelSubscriptions.endDate': {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });
      
      logger.info(`Found ${usersWithChannelSubs.length} users with channel subscriptions expiring in ${days} days`);
      
      // Отправляем уведомления для каждой истекающей подписки на канал
      for (const user of usersWithChannelSubs) {
        const expiringChannelSubs = user.channelSubscriptions.filter(sub => {
          if (!sub.active || !sub.endDate) return false;
          
          const subEndDate = new Date(sub.endDate);
          return subEndDate >= startOfDay && subEndDate <= endOfDay;
        });
        
        for (const channelSub of expiringChannelSubs) {
          await sendChannelExpirationNotification(user, channelSub.channelId, days);
        }
      }
    }
    
    logger.info('Subscription expiration check completed');
    
    // Закрываем соединение с базой данных
    await mongoose.connection.close();
    logger.info('Disconnected from MongoDB');
    
    // Закрываем соединение бота
    bot.stop();
    logger.info('Bot connection closed');
    
    return { success: true, message: 'Subscription check completed successfully' };
  } catch (error) {
    logger.error(`Error checking expiring subscriptions: ${error.message}`, { error });
    
    // Пытаемся закрыть соединения
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info('Disconnected from MongoDB');
      }
      
      bot.stop();
      logger.info('Bot connection closed');
    } catch (e) {
      logger.error(`Error closing connections: ${e.message}`, { error: e });
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Отправляет уведомление об истечении подписки TERM
 * @param {Object} user - Объект пользователя из базы данных
 * @param {Number} days - Количество дней до истечения подписки
 */
async function sendExpirationNotification(user, days) {
  try {
    const tier = config.subscriptionTiers[user.subscription.tier];
    const tierName = tier ? tier.name : user.subscription.tier;
    
    const dayWord = getDayWordForm(days);
    
    const message = formatters.warning(`Ваша подписка TERM "${tierName}" истекает через ${days} ${dayWord}!`) +
      `\n\nДата окончания: ${new Date(user.subscription.endDate).toLocaleDateString('ru-RU')}` +
      `\nНе пропустите доступ к образовательным материалам и ресурсам. Продлите подписку сейчас и получите дополнительный доступ.`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Продлить сейчас', `extend_term_${user.subscription.tier}`)],
      [Markup.button.webApp('Открыть TERM терминал', config.miniApp.url)]
    ]);
    
    logger.info(`Sending expiration notification to user ${user.telegramId}`, {
      tier: user.subscription.tier, 
      daysLeft: days,
      endDate: user.subscription.endDate
    });
    
    await bot.telegram.sendMessage(user.telegramId, message, keyboard);
    
    logger.info(`Expiration notification sent to user ${user.telegramId}`);
    
    // Добавляем отметку в логи активности
    user.lastActivity = new Date();
    await user.save();
    
    return true;
  } catch (error) {
    logger.error(`Error sending expiration notification to user ${user.telegramId}: ${error.message}`, { error });
    return false;
  }
}

/**
 * Отправляет уведомление об истечении подписки на канал
 * @param {Object} user - Объект пользователя из базы данных
 * @param {String} channelId - ID канала
 * @param {Number} days - Количество дней до истечения подписки
 */
async function sendChannelExpirationNotification(user, channelId, days) {
  try {
    const channel = findChannelById(channelId);
    
    if (!channel) {
      logger.error(`Channel not found: ${channelId}`);
      return false;
    }
    
    const channelSubscription = user.channelSubscriptions.find(sub => sub.channelId === channelId);
    
    if (!channelSubscription || !channelSubscription.endDate) {
      logger.error(`Channel subscription not found for user ${user.telegramId}, channel ${channelId}`);
      return false;
    }
    
    const dayWord = getDayWordForm(days);
    
    const message = formatters.warning(`Ваша подписка на канал "${channel.name}" истекает через ${days} ${dayWord}!`) +
      `\n\nДата окончания: ${new Date(channelSubscription.endDate).toLocaleDateString('ru-RU')}` +
      `\nНе пропустите новый контент и обновления. Продлите подписку сейчас.`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Продлить подписку', `extend_channel_${channelId}`)],
      [Markup.button.url(`Открыть канал ${channel.name}`, `https://t.me/${channel.username.replace('@', '')}`)]
    ]);
    
    logger.info(`Sending channel expiration notification to user ${user.telegramId}`, {
      channelId,
      channelName: channel.name,
      daysLeft: days,
      endDate: channelSubscription.endDate
    });
    
    await bot.telegram.sendMessage(user.telegramId, message, keyboard);
    
    logger.info(`Channel expiration notification sent to user ${user.telegramId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error sending channel expiration notification to user ${user.telegramId}: ${error.message}`, { error });
    return false;
  }
}

/**
 * Функция для поиска канала по ID
 */
function findChannelById(channelId) {
  for (const key in config.channels) {
    if (config.channels[key].id === channelId) {
      return config.channels[key];
    }
  }
  return null;
}

/**
 * Возвращает правильную форму слова "день" для указанного числа
 * @param {Number} days - Количество дней
 * @returns {String} - Правильная форма слова
 */
function getDayWordForm(days) {
  if (days % 10 === 1 && days % 100 !== 11) {
    return 'день';
  } else if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) {
    return 'дня';
  } else {
    return 'дней';
  }
}

// Если скрипт запущен напрямую (не импортирован)
if (require.main === module) {
  checkExpiringSubscriptions()
    .then(result => {
      if (result.success) {
        console.log('Script completed successfully');
        process.exit(0);
      } else {
        console.error(`Script failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`Unhandled error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { checkExpiringSubscriptions }; 