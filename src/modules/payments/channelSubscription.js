const { Composer, Markup } = require('telegraf');
const User = require('../../models/user');
const logger = require('../../utils/logger');
const config = require('../../config');
const { formatters } = require('../../utils/terminalFormatter');

const channelSubscriptionModule = new Composer();

// Команда для выбора канала подписки
channelSubscriptionModule.command('channels', async (ctx) => {
  try {
    await showChannelSelection(ctx);
  } catch (error) {
    logger.error(`Error in channels command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отображении списка каналов. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик выбора команды из мини-приложения
channelSubscriptionModule.action('channels_menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await showChannelSelection(ctx);
  } catch (error) {
    logger.error(`Error in channels_menu action: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отображении списка каналов. Пожалуйста, попробуйте позже.'));
  }
});

// Функция для отображения списка каналов
async function showChannelSelection(ctx) {
  const channels = config.channels;
  
  // Создаем клавиатуру с кнопками для каждого канала
  const keyboard = [];
  
  for (const key in channels) {
    const channel = channels[key];
    keyboard.push([
      Markup.button.callback(
        `${channel.name} - ${channel.starsPrice} Stars`,
        `select_channel_${channel.id}`
      )
    ]);
  }
  
  // Добавляем кнопку возврата
  keyboard.push([
    Markup.button.callback('« Назад', 'back_to_subscription_type')
  ]);
  
  const channelsKeyboard = Markup.inlineKeyboard(keyboard);
  
  await ctx.reply(
    formatters.info('Выберите канал для подписки:') +
    '\n\nПодписка дает доступ ко всем материалам выбранного канала.', 
    channelsKeyboard
  );
}

// Обработчики для выбора канала
channelSubscriptionModule.action(/^select_channel_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const channelId = ctx.match[1];
    const channel = findChannelById(channelId);
    
    if (!channel) {
      await ctx.reply(formatters.error('Канал не найден. Пожалуйста, попробуйте снова.'));
      return;
    }
    
    // Показываем варианты оплаты
    const paymentKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💫 Оплатить Telegram Stars', `stars_channel_${channelId}`)],
      [Markup.button.callback('« Назад к выбору канала', 'back_to_channels')]
    ]);
    
    await ctx.editMessageText(
      formatters.info(`Вы выбрали канал "${channel.name}"`) +
      `\n\nСтоимость: ${channel.starsPrice} Stars` +
      `\nДлительность: 30 дней` +
      '\n\nНажмите кнопку ниже для оплаты:',
      paymentKeyboard
    );
    
  } catch (error) {
    logger.error(`Error in select_channel handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке выбора канала. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для ручного перевода Stars на каналы
channelSubscriptionModule.action(/^manual_channel_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const channelId = ctx.match[1];
    const channel = findChannelById(channelId);
    
    if (!channel) {
      await ctx.reply(formatters.error('Канал не найден. Пожалуйста, попробуйте снова.'));
      return;
    }
    
    await createChannelSubscriptionRequest(ctx, channel);
  } catch (error) {
    logger.error(`Error in manual_channel handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при обработке выбора канала. Пожалуйста, попробуйте позже.'));
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

// Функция для создания запроса на подписку к каналу
async function createChannelSubscriptionRequest(ctx, channel) {
  try {
    // Проверяем, есть ли уже активная подписка на этот канал
    if (ctx.user.hasActiveChannelSubscription(channel.id)) {
      await ctx.reply(
        formatters.info(`У вас уже есть активная подписка на канал "${channel.name}"`) +
        '\n\nВы можете проверить статус подписок с помощью команды /status.'
      );
      return;
    }
    
    // Проверяем, нет ли уже ожидающего запроса
    const pendingRequest = ctx.user.pendingChannelSubscriptions.find(
      sub => sub.channelId === channel.id && sub.status === 'pending'
    );
    
    if (pendingRequest) {
      const requestDate = new Date(pendingRequest.requestDate).toLocaleDateString('ru-RU');
      
      await ctx.reply(
        formatters.info(`У вас уже есть ожидающий запрос на подписку к каналу "${channel.name}"`) +
        `\nДата запроса: ${requestDate}` +
        '\n\nОжидайте подтверждения от администратора после оплаты.'
      );
      return;
    }
    
    // Создаем новый запрос на подписку
    ctx.user.pendingChannelSubscriptions.push({
      channelId: channel.id,
      requestDate: new Date(),
      status: 'pending'
    });
    
    await ctx.user.save();
    
    // Формируем информацию о стоимости в Stars
    const starsAmount = channel.starsPrice;
    
    // Создаем сообщение для пользователя
    const message = formatters.info(`Запрос на подписку на канал "${channel.name}"`) +
      `\n\nСтоимость: ${starsAmount} Stars` +
      `\nДлительность: 30 дней` +
      '\n\nДля оплаты выполните следующие шаги:' +
      '\n1. Откройте Settings > Telegram Stars в вашем Telegram' +
      '\n2. Переведите Stars (звезды) на указанный ниже аккаунт с комментарием вашего ID' +
      '\n3. После перевода, администратор проверит платеж и активирует вашу подписку' +
      `\n\nВаш ID для комментария: ${ctx.user.telegramId}` +
      '\n\nАккаунт для перевода Stars: @retarded_cafe';
    
    // Клавиатура с кнопками
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Открыть Telegram Stars', 'tg://settings/stars')],
      [Markup.button.callback('« Назад к списку каналов', 'channels_menu')]
    ]);
    
    await ctx.reply(message, keyboard);
    
    // Уведомляем администраторов о новом запросе
    const adminIds = config.bot.adminUserIds;
    
    for (const adminId of adminIds) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          formatters.info(`Новый запрос на подписку на канал`) +
          `\n\nПользователь: ${ctx.user.telegramId} (${ctx.user.username || 'без username'})` +
          `\nКанал: ${channel.name}` +
          `\nСтоимость: ${starsAmount} Stars` +
          `\nДата запроса: ${new Date().toLocaleString('ru-RU')}` +
          `\n\nДля подтверждения используйте команду:\n/confirm_channel ${ctx.user.telegramId} ${channelId}`
        );
      } catch (e) {
        logger.error(`Failed to notify admin ${adminId}: ${e.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error creating channel subscription request: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при создании запроса на подписку. Пожалуйста, попробуйте позже.'));
  }
}

// Команда для подтверждения подписки на канал администратором
channelSubscriptionModule.command('confirm_channel', async (ctx) => {
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
        '\nИспользуйте: /confirm_channel USER_ID CHANNEL_ID'
      );
      return;
    }
    
    const userId = parseInt(args[0]);
    const channelId = args[1];
    
    if (isNaN(userId)) {
      await ctx.reply(formatters.error('ID пользователя должен быть числом.'));
      return;
    }
    
    // Находим пользователя
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      await ctx.reply(formatters.error(`Пользователь с ID ${userId} не найден.`));
      return;
    }
    
    // Находим канал
    const channel = findChannelById(channelId);
    
    if (!channel) {
      await ctx.reply(formatters.error(`Канал с ID ${channelId} не найден.`));
      return;
    }
    
    // Находим ожидающий запрос на подписку
    const pendingRequestIndex = user.pendingChannelSubscriptions.findIndex(
      sub => sub.channelId === channelId && sub.status === 'pending'
    );
    
    if (pendingRequestIndex === -1) {
      await ctx.reply(formatters.error(`Ожидающий запрос на подписку к каналу ${channel.name} не найден для пользователя ${userId}.`));
      return;
    }
    
    // Обновляем подписку
    user.updateChannelSubscription(channelId, 30); // подписка на 30 дней
    
    // Удаляем ожидающий запрос
    user.pendingChannelSubscriptions.splice(pendingRequestIndex, 1);
    
    await user.save();
    
    // Отправляем сообщение администратору
    await ctx.reply(
      formatters.success(`Подписка на канал ${channel.name} для пользователя ${userId} успешно активирована!`) +
      `\nКанал: ${channel.name}` +
      `\nДлительность: 30 дней` +
      `\nДействует до: ${new Date(user.channelSubscriptions.find(sub => sub.channelId === channelId).endDate).toLocaleDateString('ru-RU')}`
    );
    
    // Отправляем сообщение пользователю
    await ctx.telegram.sendMessage(
      userId,
      formatters.success(`Ваша подписка на канал "${channel.name}" успешно активирована!`) +
      `\nДлительность: 30 дней` +
      `\nДействует до: ${new Date(user.channelSubscriptions.find(sub => sub.channelId === channelId).endDate).toLocaleDateString('ru-RU')}`,
      Markup.inlineKeyboard([
        [Markup.button.url(`Открыть канал ${channel.name}`, `https://t.me/${channel.username.replace('@', '')}`)]
      ])
    );
    
    logger.info(`Admin ${ctx.from.id} manually confirmed channel subscription for user ${userId}, channel ${channelId}`);
    
  } catch (error) {
    logger.error(`Error in confirm_channel command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при подтверждении подписки на канал.'));
  }
});

// Команда для получения статуса подписок на каналы
channelSubscriptionModule.command('mystatus', async (ctx) => {
  try {
    const user = ctx.user;
    
    if (user.channelSubscriptions.length === 0) {
      await ctx.reply(
        formatters.info('У вас нет активных подписок на каналы.') +
        '\n\nИспользуйте команду /channels, чтобы просмотреть доступные каналы и оформить подписку.'
      );
      return;
    }
    
    let statusText = formatters.info('Статус ваших подписок на каналы:') + '\n\n';
    
    for (const subscription of user.channelSubscriptions) {
      const channel = findChannelById(subscription.channelId);
      
      if (!channel) continue;
      
      const endDate = new Date(subscription.endDate);
      const now = new Date();
      const isActive = subscription.active && endDate > now;
      const daysLeft = isActive ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
      
      statusText += `${channel.name}: ${isActive ? formatters.success('Активна') : formatters.error('Неактивна')}\n`;
      if (isActive) {
        statusText += `Действует до: ${endDate.toLocaleDateString('ru-RU')}\n`;
        statusText += `Осталось дней: ${daysLeft}\n\n`;
      } else {
        statusText += 'Подписка истекла.\n\n';
      }
    }
    
    // Проверяем ожидающие запросы
    if (user.pendingChannelSubscriptions.length > 0) {
      statusText += formatters.info('Ожидающие запросы на подписку:') + '\n\n';
      
      for (const request of user.pendingChannelSubscriptions) {
        if (request.status !== 'pending') continue;
        
        const channel = findChannelById(request.channelId);
        if (!channel) continue;
        
        const requestDate = new Date(request.requestDate).toLocaleDateString('ru-RU');
        
        statusText += `${channel.name}\n`;
        statusText += `Дата запроса: ${requestDate}\n`;
        statusText += 'Статус: Ожидает подтверждения администратором\n\n';
      }
    }
    
    await ctx.reply(statusText);
    
  } catch (error) {
    logger.error(`Error in mystatus command: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении статуса подписок. Пожалуйста, попробуйте позже.'));
  }
});

module.exports = channelSubscriptionModule; 