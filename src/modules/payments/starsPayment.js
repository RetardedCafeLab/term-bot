const { Composer, Markup } = require('telegraf');
const User = require('../../models/user');
const logger = require('../../utils/logger');
const config = require('../../config');
const { formatters } = require('../../utils/terminalFormatter');

const starsPaymentModule = new Composer();

/**
 * Создает ссылку на инвойс для оплаты в Stars
 * @param {Object} bot - Экземпляр Telegraf бота
 * @param {string} tierId - ID тарифа подписки
 * @param {string} title - Название товара/услуги
 * @param {string} description - Описание товара/услуги
 * @param {number} amount - Сумма в Stars
 * @param {string} payload - Дополнительные данные (JSON строка)
 * @param {number} userId - ID пользователя в Telegram
 * @returns {Promise<string>} URL ссылка на инвойс
 */
async function createStarsInvoiceLink(bot, tierId, title, description, amount, payload, userId) {
  try {
    logger.info('=== CREATING STARS INVOICE LINK ===');
    logger.info('Payment provider token details:', { 
      exists: !!config.payment.providerToken,
      isValid: config.payment.isStarsTokenValid,
      tokenInfo: config.payment.tokenInfo
    });
    
    logger.info('Invoice link parameters:', {
      userId, 
      tierId,
      title,
      description,
      amount,
      payloadLength: payload ? payload.length : 0
    });
    
    // Проверяем, настроен ли провайдер платежей
    if (!config.payment.providerToken) {
      logger.error('Payment provider token is not configured');
      throw new Error('Платежная система не настроена');
    }
    
    // Проверка на обязательные параметры
    if (!title || !description || !amount) {
      logger.error('Missing required parameters for invoice link', { title, description, amount });
      throw new Error('Отсутствуют обязательные параметры');
    }
    
    // Проверяем, что у нас есть правильный bot объект
    if (!bot || (!bot.createInvoiceLink && (!bot.telegram || !bot.telegram.createInvoiceLink))) {
      logger.error('Invalid bot object provided for createInvoiceLink', { 
        botExists: !!bot, 
        hasCreateInvoiceLink: bot && !!bot.createInvoiceLink,
        hasTelegram: bot && !!bot.telegram,
        hasTelegramCreateInvoiceLink: bot && bot.telegram && !!bot.telegram.createInvoiceLink
      });
      throw new Error('Неверный объект бота для создания инвойса');
    }
    
    // Создаем инвойс-ссылку через telegram API
    // Определяем, какой метод использовать в зависимости от структуры объекта bot
    const invoiceLink = await (bot.createInvoiceLink 
      ? bot.createInvoiceLink({
          title,
          description,
          payload,
          provider_token: config.payment.providerToken,
          currency: 'XTR',
          prices: [{ label: 'Подписка', amount: amount }], // amount уже в минимальных единицах
          photo_url: 'https://t.me/retarded_cafe/27',
          need_name: false,
          need_phone_number: false,
          need_email: false,
          need_shipping_address: false,
          send_phone_number_to_provider: false,
          send_email_to_provider: false,
          is_flexible: false
        })
      : bot.telegram.createInvoiceLink({
          title,
          description,
          payload,
          provider_token: config.payment.providerToken,
          currency: 'XTR',
          prices: [{ label: 'Подписка', amount: amount }], // amount уже в минимальных единицах
          photo_url: 'https://t.me/retarded_cafe/27',
          need_name: false,
          need_phone_number: false,
          need_email: false,
          need_shipping_address: false,
          send_phone_number_to_provider: false,
          send_email_to_provider: false,
          is_flexible: false
        })
    );
    
    logger.info('Invoice link created successfully', { 
      link: invoiceLink,
      userId,
      tierId
    });
    
    return invoiceLink;
  } catch (error) {
    logger.error(`Error creating invoice link: ${error.message}`, { 
      error,
      stack: error.stack,
      errorName: error.name,
      errorCode: error.code,
      telegramDescription: error.description || 'No description'
    });
    throw error;
  }
}

/**
 * Создает и отправляет счет для оплаты в Stars
 * @param {Object} ctx - Контекст Telegraf
 * @param {string} tierId - ID тарифа подписки
 * @param {string} title - Название товара/услуги
 * @param {string} description - Описание товара/услуги
 * @param {number} amount - Сумма в Stars
 * @param {string} payload - Дополнительные данные (JSON строка)
 */
async function sendStarsInvoice(ctx, tierId, title, description, amount, payload) {
  try {
    // Подробное логирование конфигурации
    logger.info('=== START STARS PAYMENT ATTEMPT ===');
    logger.info('Payment provider token details:', { 
      exists: !!config.payment.providerToken,
      length: config.payment.providerToken ? config.payment.providerToken.length : 0,
      containsXTR: config.payment.providerToken ? config.payment.providerToken.includes('XTR') : false,
      isTestToken: config.payment.providerToken ? config.payment.providerToken.includes('TEST') : false,
      format: config.payment.providerToken ? 
             (config.payment.providerToken.match(/^\d+:.*:XTR_.*$/) ? 'Valid format' : 'Invalid format') : 'No token'
    });
    
    logger.info('Invoice parameters:', {
      userId: ctx.from.id, 
      tierId,
      title,
      description,
      amount,
      amountInCents: Math.floor(amount * 100),
      payloadLength: payload ? payload.length : 0
    });

    // Проверяем, настроен ли провайдер платежей
    if (!config.payment.providerToken) {
      logger.error('Payment provider token is not configured');
      await ctx.reply(formatters.error('Платежная система временно недоступна. Пожалуйста, попробуйте позже.'));
      return;
    }

    // Проверка на обязательные параметры
    if (!title || !description || !amount) {
      logger.error('Missing required parameters for invoice', { title, description, amount });
      await ctx.reply(formatters.error('Произошла ошибка при создании счета на оплату. Пожалуйста, попробуйте позже.'));
      return;
    }

    logger.info(`Creating Stars invoice: ${title}, ${amount} Stars`, { tierId });

    // Проверка формата токена
    if (!config.payment.providerToken.includes('XTR')) {
      logger.warn('Payment provider token may be invalid: does not contain XTR', {
        tokenPrefix: config.payment.providerToken.substring(0, 10) + '...'
      });
    }

    // НЕ умножаем сумму на 100 для Stars, Telegram сам это делает
    // const amountInCents = Math.floor(amount * 100);
    
    try {
      // Используем прямой вызов Telegram Bot API через callApi
      logger.info('Using direct Telegram Bot API call via callApi');
      
      // Подготавливаем тело запроса для API
      const apiParams = {
        chat_id: ctx.from.id,
        title,
        description,
        payload,
        provider_token: config.payment.providerToken,
        start_parameter: `subscribe_${tierId}`,
        currency: 'XTR',
        prices: JSON.stringify([{ label: 'Подписка', amount: amount }]), // Используем amount напрямую
        photo_url: 'https://t.me/retarded_cafe/27',
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
        send_phone_number_to_provider: false,
        send_email_to_provider: false,
        is_flexible: false
      };
      
      // Логгируем параметры для отладки
      logger.info('Invoice parameters for API call:', {
        ...apiParams,
        provider_token: '***REDACTED***',
        title_length: title.length,
        description_length: description.length,
        payload_length: payload.length,
        original_amount: amount,
        prices_sent: JSON.stringify([{ label: 'Подписка', amount: amount }]) // Логируем то, что отправляем
      });
      
      // Прямой вызов метода API
      await ctx.telegram.callApi('sendInvoice', apiParams);
      
      logger.info('Invoice sent successfully with direct API call!');
    } catch (error) {
      logger.error(`Error sending invoice via API: ${error.message}`, { 
        error,
        stack: error.stack,
        errorName: error.name,
        errorCode: error.code,
        telegramDescription: error.description
      });
      
      // В случае ошибки, попробуем еще один способ - использование метода ctx.replyWithInvoice
      try {
        logger.info('Trying ctx.replyWithInvoice method');
        
        await ctx.replyWithInvoice(
          title,
          description,
          payload,
          config.payment.providerToken,
          `subscribe_${tierId}`,
          'XTR',
          [{ label: 'Подписка', amount: amount }],
          {
            photo_url: 'https://t.me/retarded_cafe/27',
            need_name: false,
            need_phone_number: false,
            need_email: false,
            need_shipping_address: false,
            send_phone_number_to_provider: false,
            send_email_to_provider: false,
            is_flexible: false
          }
        );
        
        logger.info('Invoice sent successfully with ctx.replyWithInvoice!');
      } catch (replyError) {
        logger.error(`Reply method also failed: ${replyError.message}`, {
          error: replyError,
          telegramDescription: replyError.description
        });
        
        // Последняя попытка - использовать минимальный набор параметров через replyWithInvoice
        try {
          logger.info('Last attempt with minimal parameters via replyWithInvoice');
          
          await ctx.replyWithInvoice(
            title,
            description,
            payload,
            config.payment.providerToken,
            `subscribe_${tierId}`,
            'XTR',
            [{ label: 'Подписка', amount: amount }]
          );
          
          logger.info('Invoice sent successfully with minimal parameters!');
        } catch (lastError) {
          logger.error(`All methods failed: ${lastError.message}`, {
            error: lastError,
            telegramDescription: lastError.description
          });
          await ctx.reply(formatters.error('Произошла ошибка при создании счета на оплату. Пожалуйста, попробуйте позже.'));
        }
      }
    }
  } catch (error) {
    logger.error(`Error in sendStarsInvoice: ${error.message}`, { 
      error,
      stack: error.stack,
      errorName: error.name,
      errorCode: error.code,
      telegramDescription: error.description
    });
    await ctx.reply(formatters.error('Произошла ошибка при создании счета на оплату. Пожалуйста, попробуйте позже.'));
  }
}

/**
 * Отправляет счет для оплаты подписки TERM в Stars
 */
starsPaymentModule.action(/^stars_subscribe_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const tierId = ctx.match[1];
    logger.info(`Stars subscription action triggered for tierId: ${tierId}`, {
      from: ctx.from.id,
      username: ctx.from.username
    });
    
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      logger.error(`Tier not found: ${tierId}`);
      await ctx.reply(formatters.error('Выбранный тариф не найден. Пожалуйста, попробуйте снова.'));
      return;
    }

    logger.info(`Found tier: ${tierId}`, { 
      name: tier.name,
      price: tier.price,
      durationInDays: tier.durationInDays
    });

    // Подготавливаем данные для платежа
    const title = `Подписка TERM "${tier.name}"`;
    const description = `Подписка на ${tier.durationInDays} дней: ${tier.description}`;
    const amount = tier.price; // Stars эквивалентны рублям 1:1
    const payload = JSON.stringify({
      type: 'term_subscription',
      tierId: tierId,
      userId: ctx.from.id,
      duration: tier.durationInDays
    });

    logger.info('Sending Stars invoice for TERM subscription', {
      tierId,
      price: amount,
      duration: tier.durationInDays
    });
    
    await sendStarsInvoice(ctx, tierId, title, description, amount, payload);

  } catch (error) {
    logger.error(`Error in stars_subscribe handler: ${error.message}`, { 
      error,
      stack: error.stack
    });
    await ctx.reply(formatters.error('Произошла ошибка при создании подписки. Пожалуйста, попробуйте позже.'));
  }
});

/**
 * Отправляет счет для оплаты подписки на канал в Stars
 */
starsPaymentModule.action(/^stars_channel_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const channelId = ctx.match[1];
    logger.info(`Stars channel subscription action triggered for channelId: ${channelId}`, {
      from: ctx.from.id,
      username: ctx.from.username
    });
    
    const channel = findChannelById(channelId);
    
    if (!channel) {
      logger.error(`Channel not found: ${channelId}`);
      await ctx.reply(formatters.error('Выбранный канал не найден. Пожалуйста, попробуйте снова.'));
      return;
    }

    logger.info(`Found channel: ${channelId}`, { 
      name: channel.name, 
      starsPrice: channel.starsPrice,
      rubPrice: channel.rubPrice
    });

    // Подготавливаем данные для платежа
    const title = `Подписка на канал "${channel.name}"`;
    const description = `Доступ к каналу ${channel.name}: ${channel.description}`;
    const amount = channel.starsPrice;
    const payload = JSON.stringify({
      type: 'channel_subscription',
      channelId: channelId,
      userId: ctx.from.id,
      duration: 30 // 30 дней по умолчанию
    });

    logger.info('Sending Stars invoice for channel subscription', {
      channelId,
      price: amount,
      duration: 30
    });
    
    await sendStarsInvoice(ctx, channelId, title, description, amount, payload);

  } catch (error) {
    logger.error(`Error in stars_channel handler: ${error.message}`, { 
      error,
      stack: error.stack
    });
    await ctx.reply(formatters.error('Произошла ошибка при создании подписки. Пожалуйста, попробуйте позже.'));
  }
});

/**
 * Обработчик предварительной проверки платежа
 */
starsPaymentModule.on('pre_checkout_query', async (ctx) => {
  try {
    logger.info('=== PRE_CHECKOUT_QUERY RECEIVED ===');
    logger.info('Pre checkout query details:', {
      id: ctx.preCheckoutQuery.id,
      from: ctx.preCheckoutQuery.from.id,
      username: ctx.preCheckoutQuery.from.username,
      currency: ctx.preCheckoutQuery.currency,
      totalAmount: ctx.preCheckoutQuery.total_amount,
      invoicePayload: ctx.preCheckoutQuery.invoice_payload,
      currency_is_XTR: ctx.preCheckoutQuery.currency === 'XTR'
    });
    
    // Дополнительная проверка валюты
    if (ctx.preCheckoutQuery.currency !== 'XTR') {
      logger.error(`Invalid currency in pre_checkout_query: ${ctx.preCheckoutQuery.currency}, expected XTR`);
      await ctx.answerPreCheckoutQuery(false, 'Неверная валюта платежа. Обратитесь в поддержку.');
      return;
    }
    
    // В данном примере просто подтверждаем все платежи
    await ctx.answerPreCheckoutQuery(true);
    logger.info(`Pre-checkout query approved for user ${ctx.from.id}`);
  } catch (error) {
    logger.error(`Error in pre_checkout_query handler: ${error.message}`, { 
      error,
      stack: error.stack,
      errorName: error.name,
      errorCode: error.code,
      telegramDescription: error.description
    });
    await ctx.answerPreCheckoutQuery(false, 'Произошла ошибка при обработке платежа. Пожалуйста, попробуйте позже.');
  }
});

/**
 * Обработчик успешного платежа
 */
starsPaymentModule.on('successful_payment', async (ctx) => {
  try {
    const payment = ctx.message.successful_payment;
    logger.info('=== SUCCESSFUL PAYMENT RECEIVED ===');
    logger.info('Payment details:', { 
      fromId: ctx.from.id,
      username: ctx.from.username,
      currency: payment.currency,
      totalAmount: payment.total_amount,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      currency_is_XTR: payment.currency === 'XTR'
    });

    // Парсим payload для получения данных о подписке
    const payloadData = JSON.parse(payment.invoice_payload);
    logger.info('Parsed payload data:', { payloadData });
    
    // Находим пользователя
    const user = ctx.user || await User.findOne({ telegramId: ctx.from.id });
    
    if (!user) {
      logger.error(`User not found for successful payment`, { telegramId: ctx.from.id });
      await ctx.reply(formatters.error('Произошла ошибка при активации подписки. Пожалуйста, обратитесь в поддержку.'));
      return;
    }

    // Обрабатываем разные типы подписок
    if (payloadData.type === 'term_subscription') {
      // Подписка на TERM
      const tierId = payloadData.tierId;
      const duration = payloadData.duration;
      const tier = config.subscriptionTiers[tierId];
      
      logger.info('Activating TERM subscription', { 
        userId: user.telegramId,
        tierId,
        duration,
        tierName: tier ? tier.name : 'unknown'
      });
      
      // Обновляем данные подписки
      user.updateSubscription(
        tierId,
        duration,
        'telegram_stars',
        payment.total_amount / 100, // Делим на 100, так как суммы в копейках
        'XTR',
        payment.telegram_payment_charge_id
      );
      
      await user.save();
      logger.info('User subscription updated successfully');
      
      // Отправляем сообщение пользователю
      await ctx.reply(
        formatters.success(`Ваша подписка "${tier.name}" успешно активирована!`) +
        `\n\nДлительность: ${duration} дней` +
        `\nДействует до: ${new Date(user.subscription.endDate).toLocaleDateString('ru-RU')}`,
        Markup.inlineKeyboard([
          [Markup.button.webApp('Открыть TERM терминал', config.miniApp.url)]
        ])
      );
      
      logger.info(`Term subscription activated for user ${user.telegramId}, tier ${tierId}`);
      
    } else if (payloadData.type === 'channel_subscription') {
      // Подписка на канал
      const channelId = payloadData.channelId;
      const duration = payloadData.duration;
      const channel = findChannelById(channelId);
      
      logger.info('Activating channel subscription', { 
        userId: user.telegramId,
        channelId,
        duration,
        channelName: channel ? channel.name : 'unknown'
      });
      
      // Обновляем данные подписки на канал
      user.updateChannelSubscription(channelId, duration);
      await user.save();
      logger.info('User channel subscription updated successfully');
      
      // Отправляем сообщение пользователю
      let successMessage = formatters.success(`Ваша подписка на канал "${channel.name}" успешно активирована!`) +
        `\n\nДлительность: ${duration} дней` +
        `\nДействует до: ${new Date(user.channelSubscriptions.find(sub => sub.channelId === channelId).endDate).toLocaleDateString('ru-RU')}`;
      
      // Создаем клавиатуру в зависимости от наличия приватной ссылки
      let keyboard;
      if (channel.inviteLink) {
        // Если есть приватная ссылка для входа, добавляем кнопки с разными форматами
        const buttons = [];
        
        // Добавляем стандартную кнопку с https ссылкой
        buttons.push([Markup.button.url(`Войти в канал по приватной ссылке`, channel.inviteLink)]);
        
        // Если есть код приглашения, добавляем альтернативные форматы для совместимости
        if (channel.inviteCode) {
          buttons.push([Markup.button.url(`Альтернативная ссылка для входа`, `tg://join?invite=${channel.inviteCode}`)]);
        }
        
        // Добавляем обычную кнопку для открытия канала
        buttons.push([Markup.button.url(`Открыть канал ${channel.name}`, `https://t.me/${channel.username.replace('@', '')}`)]);
        
        keyboard = Markup.inlineKeyboard(buttons);
        
        // Добавляем в сообщение инструкцию по использованию приватной ссылки
        successMessage += `\n\nДля доступа к приватному каналу используйте кнопку "Войти в канал по приватной ссылке" ниже. Если основная ссылка не работает, попробуйте альтернативную.`;
      } else {
        // Если приватной ссылки нет, используем только обычную кнопку
        keyboard = Markup.inlineKeyboard([
          [Markup.button.url(`Открыть канал ${channel.name}`, `https://t.me/${channel.username.replace('@', '')}`)],
        ]);
      }
      
      await ctx.reply(successMessage, keyboard);
      
      logger.info(`Channel subscription activated for user ${user.telegramId}, channel ${channelId}`);
    }
    
    // Уведомляем администраторов о новой подписке
    notifyAdminsAboutSubscription(ctx, user, payloadData, payment);
    
  } catch (error) {
    logger.error(`Error processing successful payment: ${error.message}`, { 
      error,
      stack: error.stack,
      errorName: error.name,
      errorCode: error.code,
      telegramDescription: error.description
    });
    await ctx.reply(formatters.error('Платеж успешно выполнен, но произошла ошибка при активации подписки. Наша команда уже работает над этим.'));
  }
});

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
 * Уведомляет администраторов о новой подписке
 */
async function notifyAdminsAboutSubscription(ctx, user, payloadData, payment) {
  try {
    const adminIds = config.bot.adminUserIds;
    
    let subscriptionInfo = '';
    let paymentDetails = `Сумма: ${payment.total_amount / 100} Stars`;
    
    if (payloadData.type === 'term_subscription') {
      const tier = config.subscriptionTiers[payloadData.tierId];
      subscriptionInfo = `Тип: Подписка TERM\nТариф: ${tier.name}\nДлительность: ${payloadData.duration} дней`;
    } else if (payloadData.type === 'channel_subscription') {
      const channel = findChannelById(payloadData.channelId);
      subscriptionInfo = `Тип: Подписка на канал\nКанал: ${channel.name}\nДлительность: ${payloadData.duration} дней`;
    }
    
    const message = formatters.info(`Новая автоматическая подписка оформлена`) +
      `\n\nПользователь: ${user.telegramId} (${user.username || 'без username'})` +
      `\n\n${subscriptionInfo}` +
      `\n\n${paymentDetails}` +
      `\nID платежа: ${payment.telegram_payment_charge_id}` +
      `\nДата: ${new Date().toLocaleString('ru-RU')}`;
    
    logger.info('Notifying admins about subscription', { adminIds });
    
    for (const adminId of adminIds) {
      try {
        await ctx.telegram.sendMessage(adminId, message);
        logger.info(`Admin notification sent to ${adminId}`);
      } catch (e) {
        logger.error(`Failed to notify admin ${adminId}: ${e.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error notifying admins about subscription: ${error.message}`, { error });
  }
}

// Экспортируем модуль и функции
module.exports = starsPaymentModule;
// Добавляем функции в экспорт для доступа из других модулей
module.exports.sendStarsInvoice = sendStarsInvoice;
module.exports.createStarsInvoiceLink = createStarsInvoiceLink; 