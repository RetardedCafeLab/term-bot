/**
 * API для мини-приложения
 * Обрабатывает запросы из мини-приложения и возвращает данные в формате JSON
 */

const { Router } = require('express');
const config = require('../../config');
const logger = require('../../utils/logger');
const { createStarsInvoiceLink } = require('../payments/starsPayment');
const User = require('../../models/user');

const router = Router();

/**
 * Поиск канала по ID
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
 * Middleware для проверки и парсинга initData от Telegram
 */
async function validateInitData(req, res, next) {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }
    
    logger.info(`Processing initData: ${initData.substring(0, 100)}...`, {
      initDataLength: initData.length
    });
    
    // Здесь в реальном приложении должна быть проверка подписи initData
    // для безопасности от подделки запросов
    // https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
    
    // Парсим данные из строки инициализации
    const params = new URLSearchParams(initData);
    
    // Проверяем два возможных формата - с параметром 'data' или с параметром 'user'
    let userData;
    
    if (params.has('data')) {
      // Формат с параметром data
      const dataCheckString = params.get('data');
      let data;
      try {
        data = JSON.parse(decodeURIComponent(dataCheckString));
        userData = data.user;
      } catch (e) {
        logger.error(`Error parsing data parameter: ${e.message}`, { error: e });
        return res.status(400).json({ error: 'Error parsing initData.data parameter' });
      }
    } else if (params.has('user')) {
      // Формат с прямым параметром user
      try {
        const userString = params.get('user');
        userData = JSON.parse(decodeURIComponent(userString));
      } catch (e) {
        logger.error(`Error parsing user parameter: ${e.message}`, { error: e });
        return res.status(400).json({ error: 'Error parsing initData.user parameter' });
      }
    } else {
      logger.error('Neither data nor user parameter found in initData');
      return res.status(400).json({ error: 'Invalid initData structure: missing user data' });
    }
    
    // Проверяем наличие данных о пользователе
    if (!userData || !userData.id) {
      logger.error('User data not found or invalid in initData', { userData });
      return res.status(400).json({ error: 'User data not found or invalid in initData' });
    }
    
    // Добавляем данные в запрос для использования в следующих обработчиках
    req.webAppUser = userData;
    req.webAppData = { 
      user: userData,
      auth_date: params.get('auth_date'),
      query_id: params.get('query_id'),
      hash: params.get('hash')
    };
    
    logger.info('WebApp initData validated', { 
      userId: userData.id, 
      username: userData.username || 'no_username'
    });
    
    next();
  } catch (error) {
    logger.error(`Error validating initData: ${error.message}`, { error });
    res.status(500).json({ error: 'Internal server error during validation' });
  }
}

/**
 * Эндпоинт для создания ссылки на инвойс для TERM подписки
 */
router.post('/create-term-invoice', validateInitData, async (req, res) => {
  try {
    const { tierId, test_mode } = req.body;
    const userId = req.webAppUser.id;
    
    logger.info('Creating invoice link for TERM subscription', { 
      userId, 
      tierId, 
      test_mode 
    });
    
    // Проверяем наличие тарифа
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      logger.error(`Tier not found: ${tierId}`);
      return res.status(404).json({ error: 'Subscription tier not found' });
    }
    
    // Подготавливаем данные для платежа
    const title = `Подписка TERM "${tier.name}"`;
    const description = `Подписка на ${tier.durationInDays} дней: ${tier.description}`;
    const amount = test_mode ? 1 : tier.price; // Для тестового режима устанавливаем минимальную цену
    const payload = JSON.stringify({
      type: 'term_subscription',
      tierId: tierId,
      userId: userId,
      duration: tier.durationInDays,
      test: !!test_mode
    });
    
    // Создаем ссылку на инвойс
    const invoiceLink = await createStarsInvoiceLink(
      global.bot.telegram, 
      tierId, 
      title, 
      description, 
      amount, 
      payload, 
      userId
    );
    
    logger.info('Invoice link created successfully', { 
      userId,
      tierId,
      invoiceLink: invoiceLink.substring(0, 50) + '...' // логируем только часть ссылки
    });
    
    // Возвращаем ссылку на инвойс
    res.json({
      success: true,
      invoice_url: invoiceLink,
      tier_name: tier.name,
      amount: amount,
      duration: tier.durationInDays
    });
  } catch (error) {
    logger.error(`Error creating invoice link: ${error.message}`, { error });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Эндпоинт для создания ссылки на инвойс для подписки на канал
 */
router.post('/create-channel-invoice', validateInitData, async (req, res) => {
  try {
    const { channelId, test_mode } = req.body;
    const userId = req.webAppUser.id;
    
    logger.info('Creating invoice link for channel subscription', { 
      userId, 
      channelId, 
      test_mode 
    });
    
    // Проверяем наличие канала
    const channel = findChannelById(channelId);
    
    if (!channel) {
      logger.error(`Channel not found: ${channelId}`);
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Подготавливаем данные для платежа
    const title = `Подписка на канал "${channel.name}"`;
    const description = `Доступ к каналу ${channel.name}: ${channel.description}`;
    const amount = test_mode ? 1 : channel.starsPrice; // Для тестового режима устанавливаем минимальную цену
    const payload = JSON.stringify({
      type: 'channel_subscription',
      channelId: channelId,
      userId: userId,
      duration: 30, // 30 дней по умолчанию
      test: !!test_mode
    });
    
    // Создаем ссылку на инвойс
    const invoiceLink = await createStarsInvoiceLink(
      global.bot.telegram, 
      channelId, 
      title, 
      description, 
      amount, 
      payload, 
      userId
    );
    
    logger.info('Invoice link created successfully', { 
      userId,
      channelId,
      invoiceLink: invoiceLink.substring(0, 50) + '...' // логируем только часть ссылки
    });
    
    // Возвращаем ссылку на инвойс
    res.json({
      success: true,
      invoice_url: invoiceLink,
      channel_name: channel.name,
      amount: amount,
      duration: 30
    });
  } catch (error) {
    logger.error(`Error creating invoice link: ${error.message}`, { error });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Эндпоинт для получения статуса подписки пользователя
 */
router.post('/get-subscription-status', validateInitData, async (req, res) => {
  try {
    const userId = req.webAppUser.id;
    
    logger.info('Getting subscription status', { userId });
    
    // Находим пользователя в базе
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      logger.error(`User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Готовим данные о подписке
    const subscriptionData = {
      has_subscription: user.hasActiveSubscription(),
      subscription: user.subscription ? {
        active: user.subscription.active,
        tier: user.subscription.tier,
        start_date: user.subscription.startDate,
        end_date: user.subscription.endDate,
        days_left: user.getDaysLeftInSubscription(),
      } : null,
      has_channel_subscriptions: user.hasAnyChannelSubscription(),
      channel_subscriptions: user.channelSubscriptions
    };
    
    // Возвращаем данные о подписке
    res.json({
      success: true,
      user_id: userId,
      ...subscriptionData
    });
  } catch (error) {
    logger.error(`Error getting subscription status: ${error.message}`, { error });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Эндпоинт для логирования событий аналитики
 */
router.post('/log-analytics', validateInitData, async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    const userId = req.webAppUser.id;
    
    logger.info('Analytics event received', { 
      userId, 
      event,
      data,
      timestamp
    });
    
    // В будущем здесь можно сохранять события в базу данных для анализа воронки
    // Например:
    /*
    await AnalyticsEvent.create({
      userId,
      eventType: event,
      eventData: data,
      timestamp: timestamp || new Date()
    });
    */
    
    // Отвечаем успехом
    res.json({
      success: true
    });
  } catch (error) {
    logger.error(`Error logging analytics event: ${error.message}`, { error });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 