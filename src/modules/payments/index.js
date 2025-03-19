const { Composer, Markup } = require('telegraf');
const User = require('../../models/user');
const logger = require('../../utils/logger');
const config = require('../../config');
const { formatters } = require('../../utils/terminalFormatter');
const channelSubscriptionModule = require('./channelSubscription');
const starsPaymentModule = require('./starsPayment');

const paymentsModule = new Composer();

// Подключаем модуль подписок на каналы
paymentsModule.use(channelSubscriptionModule);

// Подключаем модуль платежей через Stars
paymentsModule.use(starsPaymentModule);

// Команда /subscribe - меню подписок
paymentsModule.command('subscribe', async (ctx) => {
  try {
    // Показываем выбор типа подписки (TERM или каналы)
    await showSubscriptionTypeSelection(ctx);
  } catch (error) {
    logger.error(`Error in subscribe command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'));
  }
});

// Функция для отображения выбора типа подписки
async function showSubscriptionTypeSelection(ctx) {
  const subscriptionTypeKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📱 Подписка на TERM', 'term_subscription')],
    [Markup.button.callback('📢 Подписка на каналы', 'channels_menu')]
  ]);

  await ctx.reply(
    formatters.info('Выберите тип подписки:') + 
    '\n\n📱 Подписка на TERM - доступ к терминальному приложению и образовательным материалам' +
    '\n\n📢 Подписка на каналы - доступ к закрытым Telegram-каналам',
    subscriptionTypeKeyboard
  );
}

// Обработчик выбора подписки на TERM
paymentsModule.action('term_subscription', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Если у пользователя уже есть активная подписка, показываем информацию о ней
    if (ctx.user.hasActiveSubscription()) {
      const subscriptionEndDate = new Date(ctx.user.subscription.endDate).toLocaleDateString('ru-RU');
      const tier = ctx.user.subscription.tier;
      
      await ctx.editMessageText(
        formatters.info(`У вас уже есть активная подписка уровня "${tier}"`) +
        `\nДата окончания: ${subscriptionEndDate}\n\n` +
        'Вы можете обновить свою подписку до более высокого уровня или продлить текущую.',
        Markup.inlineKeyboard([
          [Markup.button.callback('Обновить подписку', 'back_to_subscribe')],
          [Markup.button.callback('« Назад к выбору типа', 'back_to_subscription_type')],
          [Markup.button.webApp('Открыть TERM терминал', config.miniApp.url)]
        ])
      );
      return;
    }

    // Создаем клавиатуру с вариантами подписок и способами оплаты
    const subscriptionKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Месячная подписка', 'select_payment_monthly')],
      [Markup.button.callback('Квартальная подписка (-10%)', 'select_payment_quarterly')],
      [Markup.button.callback('Годовая подписка (-20%)', 'select_payment_annual')],
      [Markup.button.callback('Информация о подписках', 'subscription_info')],
      [Markup.button.callback('« Назад к выбору типа', 'back_to_subscription_type')]
    ]);

    await ctx.editMessageText(
      formatters.info('Выберите тип подписки на TERM:'), 
      subscriptionKeyboard
    );
  } catch (error) {
    logger.error(`Error in term_subscription handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке выбора подписки. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчики выбора тарифа для оплаты
paymentsModule.action(/^select_payment_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const tierId = ctx.match[1];
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      await ctx.reply(formatters.error('Выбранный тариф не найден. Пожалуйста, попробуйте снова.'));
      return;
    }
    
    // Показываем варианты оплаты - только автоматическая оплата
    const paymentKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💫 Оплатить Telegram Stars', `stars_subscribe_${tierId}`)],
      [Markup.button.callback('« Назад к выбору тарифа', 'back_to_subscribe')]
    ]);
    
    await ctx.editMessageText(
      formatters.info(`Вы выбрали "${tier.name}"`) +
      `\n\nСтоимость: ${tier.price} Stars` +
      `\nДлительность: ${tier.durationInDays} дней` +
      '\n\nНажмите кнопку ниже для оплаты:',
      paymentKeyboard
    );
    
  } catch (error) {
    logger.error(`Error in select_payment handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при выборе способа оплаты. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для ручного перевода Stars
paymentsModule.action(/^manual_stars_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await createStarsPaymentRequest(ctx, ctx.match[1]);
});

// Обработчик возврата к выбору типа подписки
paymentsModule.action('back_to_subscription_type', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await showSubscriptionTypeSelection(ctx);
  } catch (error) {
    logger.error(`Error in back_to_subscription_type handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик нажатия на кнопку "Информация о подписках"
paymentsModule.action('subscription_info', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    let infoText = formatters.info('Информация о доступных подписках:') + '\n\n';
    
    // Месячная подписка
    infoText += '📌 Месячная подписка\n' +
                `Стоимость: ${config.subscriptionTiers.monthly.price} Stars/месяц\n` +
                'Включает:\n';
    
    config.subscriptionTiers.monthly.features.forEach(feature => {
      infoText += `• ${feature}\n`;
    });
    
    // Квартальная подписка
    infoText += '\n📌 Квартальная подписка\n' +
                `Стоимость: ${config.subscriptionTiers.quarterly.price} Stars/3 месяца (скидка 10%)\n` +
                'Включает:\n';
    
    config.subscriptionTiers.quarterly.features.forEach(feature => {
      infoText += `• ${feature}\n`;
    });
    
    // Годовая подписка
    infoText += '\n📌 Годовая подписка\n' +
                `Стоимость: ${config.subscriptionTiers.annual.price} Stars/год (скидка 20%)\n` +
                'Включает:\n';
    
    config.subscriptionTiers.annual.features.forEach(feature => {
      infoText += `• ${feature}\n`;
    });
    
    // Кнопка назад к выбору подписки
    const backKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('« Назад к выбору подписки', 'term_subscription')]
    ]);
    
    await ctx.editMessageText(infoText, backKeyboard);
  } catch (error) {
    logger.error(`Error in subscription_info handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении информации о подписках. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик нажатия на кнопку "Назад к выбору подписки"
paymentsModule.action('back_to_subscribe', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Создаем клавиатуру с вариантами подписок
    const subscriptionKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Месячная подписка', 'select_payment_monthly')],
      [Markup.button.callback('Квартальная подписка (-10%)', 'select_payment_quarterly')],
      [Markup.button.callback('Годовая подписка (-20%)', 'select_payment_annual')],
      [Markup.button.callback('Информация о подписках', 'subscription_info')],
      [Markup.button.callback('« Назад к выбору типа', 'back_to_subscription_type')]
    ]);

    await ctx.editMessageText(
      formatters.info('Выберите тип подписки на TERM:'), 
      subscriptionKeyboard
    );
  } catch (error) {
    logger.error(`Error in back_to_subscribe handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Временная функция для создания запроса на оплату через Telegram Stars
async function createStarsPaymentRequest(ctx, tierId) {
  try {
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      throw new Error(`Invalid subscription tier: ${tierId}`);
    }
    
    // Сохраняем запрос в базе для дальнейшего подтверждения администратором
    ctx.user.pendingSubscription = {
      tierId,
      requestDate: new Date(),
      status: 'pending'
    };
    
    await ctx.user.save();
    
    // Формируем информацию о стоимости в Stars (1 ₽ = 1 Star примерно)
    const starsAmount = tier.price;
    
    // Создаем сообщение для пользователя
    const message = formatters.info(`Запрос на подписку "${tier.name}"`) +
      `\n\nСтоимость: ~${starsAmount} Telegram Stars` +
      `\nДлительность: ${tier.durationInDays} дней` +
      '\n\nДля оплаты выполните следующие шаги:' +
      '\n1. Откройте Settings > Telegram Stars в вашем Telegram' +
      '\n2. Переведите Stars (звезды) на указанный ниже аккаунт с комментарием вашего ID' +
      '\n3. После перевода, администратор проверит платеж и активирует вашу подписку' +
      `\n\nВаш ID для комментария: ${ctx.user.telegramId}` +
      '\n\nАккаунт для перевода Stars: @retarded_cafe';
    
    // Клавиатура с кнопками
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Открыть Telegram Stars', 'tg://settings/stars')],
      [Markup.button.callback('« Назад к выбору подписки', 'back_to_subscribe')]
    ]);
    
    await ctx.editMessageText(message, keyboard);
    
    // Уведомляем администраторов о новом запросе
    const adminIds = config.bot.adminUserIds;
    
    for (const adminId of adminIds) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          formatters.info(`Новый запрос на подписку`) +
          `\n\nПользователь: ${ctx.user.telegramId} (${ctx.user.username || 'без username'})` +
          `\nТип подписки: ${tier.name}` +
          `\nСтоимость: ${starsAmount} Stars` +
          `\nДата запроса: ${new Date().toLocaleString('ru-RU')}` +
          `\n\nДля подтверждения используйте команду:\n/confirm_payment ${ctx.user.telegramId} ${tierId}`
        );
      } catch (e) {
        logger.error(`Failed to notify admin ${adminId}: ${e.message}`);
      }
    }
    
  } catch (error) {
    logger.error(`Error creating Stars payment request: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при создании запроса на оплату. Пожалуйста, попробуйте позже.'));
  }
}

// Команда подтверждения платежа для администраторов
paymentsModule.command('confirm_payment', async (ctx) => {
  try {
    // Проверяем, является ли пользователь администратором
    const isAdmin = config.bot.adminUserIds.includes(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.reply(formatters.error('У вас нет прав для выполнения этой команды.'));
      return;
    }
    
    // Парсим аргументы команды
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      await ctx.reply(
        formatters.error('Неверный формат команды.') +
        '\nИспользуйте: /confirm_payment USER_ID SUBSCRIPTION_TYPE'
      );
      return;
    }
    
    const userId = parseInt(args[0]);
    const tierId = args[1];
    
    if (isNaN(userId)) {
      await ctx.reply(formatters.error('ID пользователя должен быть числом.'));
      return;
    }
    
    if (!['monthly', 'quarterly', 'annual'].includes(tierId)) {
      await ctx.reply(
        formatters.error('Неверный тип подписки.') +
        '\nДопустимые значения: monthly, quarterly, annual'
      );
      return;
    }
    
    // Находим пользователя
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      await ctx.reply(formatters.error(`Пользователь с ID ${userId} не найден.`));
      return;
    }
    
    const tier = config.subscriptionTiers[tierId];
    
    // Обновляем подписку пользователя
    user.updateSubscription(
      tierId,
      tier.durationInDays,
      'telegram_stars',
      tier.price,
      'RUB',
      `manual_confirm_${Date.now()}`
    );
    
    // Очищаем ожидающую подписку
    user.pendingSubscription = null;
    
    await user.save();
    
    // Отправляем сообщение администратору
    await ctx.reply(
      formatters.success(`Подписка для пользователя ${userId} успешно активирована!`) +
      `\nТип: ${tier.name}` +
      `\nДлительность: ${tier.durationInDays} дней` +
      `\nДействует до: ${new Date(user.subscription.endDate).toLocaleDateString('ru-RU')}`
    );
    
    // Отправляем сообщение пользователю
    await ctx.telegram.sendMessage(
      userId,
      formatters.success(`Ваша подписка "${tier.name}" успешно активирована!`) +
      `\nДлительность: ${tier.durationInDays} дней` +
      `\nДействует до: ${new Date(user.subscription.endDate).toLocaleDateString('ru-RU')}`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть TERM терминал', config.miniApp.url)]
      ])
    );
    
    logger.info(`Admin ${ctx.from.id} manually confirmed subscription for user ${userId}, tier ${tierId}`);
    
  } catch (error) {
    logger.error(`Error in confirm_payment command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при подтверждении подписки.'));
  }
});

// Команда проверки статуса подписки
paymentsModule.command('status', async (ctx) => {
  try {
    // Проверяем статус подписки на TERM
    const hasTermSubscription = ctx.user.hasActiveSubscription();
    // Проверяем статус подписок на каналы
    const hasAnyChannelSubscription = ctx.user.channelSubscriptions.some(sub => 
      sub.active && new Date(sub.endDate) > new Date()
    );
    
    // Формируем сообщение о статусе
    let statusMessage = formatters.info('Статус ваших подписок:') + '\n\n';
    
    // Статус подписки на TERM
    statusMessage += '📱 Подписка на TERM: ';
    if (hasTermSubscription) {
      const subscription = ctx.user.subscription;
      const endDate = new Date(subscription.endDate);
      const now = new Date();
      const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      const tier = config.subscriptionTiers[subscription.tier];
      
      statusMessage += formatters.success('Активна') + '\n';
      statusMessage += `Тип подписки: ${tier.name}\n`;
      statusMessage += `Действует до: ${endDate.toLocaleDateString('ru-RU')}\n`;
      statusMessage += `Осталось дней: ${daysLeft}\n\n`;
    } else if (ctx.user.pendingSubscription) {
      // Если есть ожидающий запрос на подписку TERM
      const pendingTier = config.subscriptionTiers[ctx.user.pendingSubscription.tierId];
      const requestDate = new Date(ctx.user.pendingSubscription.requestDate).toLocaleDateString('ru-RU');
      
      statusMessage += formatters.warning('Ожидает подтверждения') + '\n';
      statusMessage += `Тип подписки: ${pendingTier.name}\n`;
      statusMessage += `Дата запроса: ${requestDate}\n\n`;
    } else {
      statusMessage += formatters.error('Неактивна') + '\n\n';
    }
    
    // Статус подписок на каналы
    statusMessage += '📢 Подписки на каналы:\n';
    
    if (ctx.user.channelSubscriptions.length === 0 && ctx.user.pendingChannelSubscriptions.length === 0) {
      statusMessage += 'У вас нет активных подписок на каналы.\n\n';
    } else {
      // Активные подписки на каналы
      for (const subscription of ctx.user.channelSubscriptions) {
        const channel = findChannelById(subscription.channelId);
        if (!channel) continue;
        
        const endDate = new Date(subscription.endDate);
        const now = new Date();
        const isActive = subscription.active && endDate > now;
        const daysLeft = isActive ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
        
        statusMessage += `${channel.name}: ${isActive ? formatters.success('Активна') : formatters.error('Неактивна')}\n`;
        if (isActive) {
          statusMessage += `Действует до: ${endDate.toLocaleDateString('ru-RU')}\n`;
          statusMessage += `Осталось дней: ${daysLeft}\n\n`;
        } else {
          statusMessage += 'Подписка истекла.\n\n';
        }
      }
      
      // Ожидающие запросы на подписку каналов
      for (const request of ctx.user.pendingChannelSubscriptions) {
        if (request.status !== 'pending') continue;
        
        const channel = findChannelById(request.channelId);
        if (!channel) continue;
        
        const requestDate = new Date(request.requestDate).toLocaleDateString('ru-RU');
        
        statusMessage += `${channel.name}: ${formatters.warning('Ожидает подтверждения')}\n`;
        statusMessage += `Дата запроса: ${requestDate}\n\n`;
      }
    }
    
    // Добавляем кнопки для управления подписками
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Управление подписками', 'back_to_subscription_type')]
    ]);
    
    if (hasTermSubscription) {
      keyboard.inline_keyboard.push([
        Markup.button.webApp('Открыть TERM терминал', config.miniApp.url)
      ]);
    }
    
    await ctx.reply(statusMessage, keyboard);
    
  } catch (error) {
    logger.error(`Error in status command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при проверке статуса подписки.'));
  }
});

// Функция для поиска канала по ID
function findChannelById(channelId) {
  for (const key in config.channels) {
    if (config.channels[key].id === channelId) {
      return config.channels[key];
    }
  }
  return null;
}

// Обработчик для отмены запроса на подписку
paymentsModule.action('cancel_subscription_request', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Проверяем наличие ожидающего запроса
    if (!ctx.user.pendingSubscription) {
      await ctx.editMessageText(formatters.error('У вас нет ожидающих запросов на подписку.'));
      return;
    }
    
    // Удаляем запрос на подписку
    ctx.user.pendingSubscription = null;
    await ctx.user.save();
    
    await ctx.editMessageText(
      formatters.success('Запрос на подписку успешно отменен.'),
      Markup.inlineKeyboard([
        [Markup.button.callback('Оформить новую подписку', 'back_to_subscription_type')]
      ])
    );
    
  } catch (error) {
    logger.error(`Error in cancel_subscription_request handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отмене запроса на подписку.'));
  }
});

// Команда для диагностики платежной системы
paymentsModule.command('payment_debug', async (ctx) => {
  try {
    // Проверяем, является ли пользователь администратором
    const isAdmin = config.bot.adminUserIds.includes(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.reply(formatters.error('У вас нет прав для выполнения этой команды.'));
      return;
    }
    
    // Собираем информацию о конфигурации платежей
    const paymentConfig = {
      providerTokenExists: !!config.payment.providerToken,
      providerTokenLength: config.payment.providerToken ? config.payment.providerToken.length : 0,
      containsXTR: config.payment.providerToken ? config.payment.providerToken.includes('XTR') : false,
      isTest: config.payment.providerToken ? config.payment.providerToken.includes('TEST') : false,
      tokenFormat: config.payment.providerToken ? 
                  (/^\d+:.+:XTR_.+$/.test(config.payment.providerToken) ? 'Valid' : 'Invalid') : 'None',
      isYookassaConfigured: !!(config.payment.yookassaShopId && config.payment.yookassaSecretKey),
      miniAppUrl: config.miniApp.url
    };
    
    // Отправляем отчет администратору
    await ctx.reply(
      formatters.info('Диагностика платежной системы:') +
      `\n\nTelegram Stars (XTR):` +
      `\n• Токен: ${paymentConfig.providerTokenExists ? 'Настроен' : 'Отсутствует'}` +
      `\n• Длина: ${paymentConfig.providerTokenLength}` +
      `\n• Содержит XTR: ${paymentConfig.containsXTR ? 'Да' : 'Нет'}` +
      `\n• Тестовый: ${paymentConfig.isTest ? 'Да' : 'Нет'}` +
      `\n• Формат: ${paymentConfig.tokenFormat}` +
      `\n\nЮKassa:` +
      `\n• Настроена: ${paymentConfig.isYookassaConfigured ? 'Да' : 'Нет'}` +
      `\n\nДополнительная информация:` +
      `\n• URL мини-приложения: ${paymentConfig.miniAppUrl}` +
      `\n\nДля получения правильного токена для Stars:` +
      `\n1. Перейдите в @BotFather` +
      `\n2. Выберите /mybots` +
      `\n3. Выберите вашего бота` +
      `\n4. Payments > Add stars` +
      `\n5. Добавьте полученный токен в .env.local`
    );
    
    logger.info('Payment system diagnostics requested', { 
      admin: ctx.from.id,
      config: paymentConfig
    });
    
  } catch (error) {
    logger.error(`Error in payment_debug command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при выполнении диагностики платежной системы.'));
  }
});

/**
 * Обработчики для продления подписки
 */
paymentsModule.action(/^extend_term_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const tierId = ctx.match[1];
    logger.info(`Subscription extension request for tier: ${tierId}`, {
      from: ctx.from.id,
      username: ctx.from.username
    });
    
    // Проверяем существование тарифа
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      logger.error(`Tier not found for extension: ${tierId}`);
      await ctx.reply(formatters.error('Выбранный тариф не найден. Пожалуйста, попробуйте снова.'));
      return;
    }
    
    // Получаем информацию о текущей подписке пользователя
    const user = ctx.user;
    const hasActiveSubscription = user.hasActiveSubscription();
    const daysLeft = user.getDaysLeftInSubscription();
    
    // Готовим сообщение о продлении с учетом текущего статуса
    let message = '';
    
    if (hasActiveSubscription) {
      message = formatters.info(`Продление подписки "${tier.name}"`) +
        `\n\nТекущая подписка активна еще ${daysLeft} ${getDayWordForm(daysLeft)}` +
        `\nПри продлении эти дни будут добавлены к новому сроку подписки.` +
        `\n\nСтоимость продления: ${tier.price} Stars` +
        `\nДлительность: ${tier.durationInDays} дней`;
    } else {
      message = formatters.info(`Оформление подписки "${tier.name}"`) +
        `\n\nСтоимость: ${tier.price} Stars` +
        `\nДлительность: ${tier.durationInDays} дней`;
    }
    
    // Создаем клавиатуру с кнопками оплаты
    await ctx.reply(message, Markup.inlineKeyboard([
      [Markup.button.callback(`Оплатить ${tier.price} Stars`, `stars_subscribe_${tierId}`)],
      [Markup.button.callback('Отмена', 'cancel_payment')]
    ]));
    
  } catch (error) {
    logger.error(`Error in extend_term handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.'));
  }
});

paymentsModule.action(/^extend_channel_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const channelId = ctx.match[1];
    logger.info(`Channel subscription extension request for channel: ${channelId}`, {
      from: ctx.from.id,
      username: ctx.from.username
    });
    
    // Проверяем существование канала
    const channel = findChannelById(channelId);
    
    if (!channel) {
      logger.error(`Channel not found for extension: ${channelId}`);
      await ctx.reply(formatters.error('Выбранный канал не найден. Пожалуйста, попробуйте снова.'));
      return;
    }
    
    // Получаем информацию о текущей подписке на канал
    const user = ctx.user;
    const channelSubscription = user.channelSubscriptions.find(sub => sub.channelId === channelId);
    let daysLeft = 0;
    let hasActiveSubscription = false;
    
    if (channelSubscription && channelSubscription.active && channelSubscription.endDate) {
      const endDate = new Date(channelSubscription.endDate);
      const now = new Date();
      const diffMs = endDate - now;
      daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      hasActiveSubscription = daysLeft > 0;
    }
    
    // Готовим сообщение о продлении с учетом текущего статуса
    let message = '';
    
    if (hasActiveSubscription) {
      message = formatters.info(`Продление подписки на канал "${channel.name}"`) +
        `\n\nТекущая подписка активна еще ${daysLeft} ${getDayWordForm(daysLeft)}` +
        `\nПри продлении эти дни будут добавлены к новому сроку подписки.` +
        `\n\nСтоимость продления: ${channel.starsPrice} Stars` +
        `\nДлительность: 30 дней`;
    } else {
      message = formatters.info(`Оформление подписки на канал "${channel.name}"`) +
        `\n\nСтоимость: ${channel.starsPrice} Stars` +
        `\nДлительность: 30 дней`;
    }
    
    // Создаем клавиатуру с кнопками оплаты
    await ctx.reply(message, Markup.inlineKeyboard([
      [Markup.button.callback(`Оплатить ${channel.starsPrice} Stars`, `stars_channel_${channelId}`)],
      [Markup.button.callback('Отмена', 'cancel_payment')]
    ]));
    
  } catch (error) {
    logger.error(`Error in extend_channel handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.'));
  }
});

paymentsModule.action('cancel_payment', async (ctx) => {
  try {
    await ctx.answerCbQuery('Операция отменена');
    await ctx.deleteMessage();
  } catch (error) {
    logger.error(`Error in cancel_payment handler: ${error.message}`, { error });
  }
});

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

module.exports = paymentsModule; 