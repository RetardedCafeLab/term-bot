const { Composer, Markup } = require('telegraf');
const User = require('../../models/user');
const Content = require('../../models/content');
const logger = require('../../utils/logger');
const { formatters } = require('../../utils/terminalFormatter');
const { requireAdmin } = require('../../middleware/auth');
const config = require('../../config');

const adminModule = new Composer();

// Применяем middleware для проверки прав администратора ко всем командам
adminModule.use(requireAdmin);

// Команда /admin - главное меню панели администратора
adminModule.command('admin', async (ctx) => {
  try {
    const adminKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
      [Markup.button.callback('📚 Управление контентом', 'admin_content')],
      [Markup.button.callback('🔄 Операции с подписками', 'admin_subscriptions')],
      [Markup.button.callback('📢 Отправить сообщение всем', 'admin_broadcast')]
    ]);
    
    await ctx.replyWithHTML(
      '<b>Панель администратора</b>\n\n' +
      'Выберите действие:',
      adminKeyboard
    );
  } catch (error) {
    logger.error(`Error in admin command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при открытии панели администратора. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для отображения статистики
adminModule.action('admin_stats', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем статистику по пользователям
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({ 'subscription.active': true });
    const monthlySubscriptions = await User.countDocuments({ 'subscription.active': true, 'subscription.tier': 'monthly' });
    const quarterlySubscriptions = await User.countDocuments({ 'subscription.active': true, 'subscription.tier': 'quarterly' });
    const annualSubscriptions = await User.countDocuments({ 'subscription.active': true, 'subscription.tier': 'annual' });
    
    // Получаем статистику по контенту
    const totalContent = await Content.countDocuments();
    const publishedContent = await Content.countDocuments({ isPublished: true });
    
    // Вычисляем общую статистику
    const subscriptionRate = totalUsers > 0 ? Math.round((activeSubscriptions / totalUsers) * 100) : 0;
    
    // Формируем текст со статистикой
    let statsText = '<b>📊 Статистика бота</b>\n\n';
    
    statsText += '<b>👥 Пользователи:</b>\n';
    statsText += `• Всего пользователей: ${totalUsers}\n`;
    statsText += `• Активных подписок: ${activeSubscriptions} (${subscriptionRate}%)\n`;
    statsText += `• Месячных подписок: ${monthlySubscriptions}\n`;
    statsText += `• Квартальных подписок: ${quarterlySubscriptions}\n`;
    statsText += `• Годовых подписок: ${annualSubscriptions}\n\n`;
    
    statsText += '<b>📚 Контент:</b>\n';
    statsText += `• Всего материалов: ${totalContent}\n`;
    statsText += `• Опубликованных материалов: ${publishedContent}\n`;
    
    // Добавляем кнопку для возврата в админ-панель
    const backButton = Markup.inlineKeyboard([
      Markup.button.callback('« Назад в админ-панель', 'back_to_admin')
    ]);
    
    await ctx.editMessageText(statsText, {
      parse_mode: 'HTML',
      ...backButton
    });
  } catch (error) {
    logger.error(`Error in admin stats handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для управления пользователями
adminModule.action('admin_users', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем последних 10 пользователей
    const recentUsers = await User.find()
      .sort({ registeredAt: -1 })
      .limit(10);
    
    let usersText = '<b>👥 Управление пользователями</b>\n\n';
    usersText += '<b>Последние зарегистрированные пользователи:</b>\n\n';
    
    for (const user of recentUsers) {
      const username = user.username ? `@${user.username}` : 'Нет username';
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      const subscribedText = user.hasActiveSubscription() ? '✅ Подписка активна' : '❌ Нет подписки';
      
      usersText += `• <code>${user.telegramId}</code> - ${name} (${username})\n`;
      usersText += `  ${subscribedText}\n\n`;
    }
    
    // Добавляем кнопки для управления пользователями
    const usersKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Найти пользователя', 'admin_find_user')],
      [Markup.button.callback('🎁 Выдать бесплатную подписку', 'admin_grant_subscription')],
      [Markup.button.callback('« Назад в админ-панель', 'back_to_admin')]
    ]);
    
    await ctx.editMessageText(usersText, {
      parse_mode: 'HTML',
      ...usersKeyboard
    });
  } catch (error) {
    logger.error(`Error in admin users handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении списка пользователей. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для управления контентом
adminModule.action('admin_content', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем последние 10 материалов
    const recentContent = await Content.find()
      .sort({ createdAt: -1 })
      .limit(10);
    
    let contentText = '<b>📚 Управление контентом</b>\n\n';
    contentText += '<b>Последние добавленные материалы:</b>\n\n';
    
    if (recentContent.length === 0) {
      contentText += 'Материалы еще не добавлены.\n';
    } else {
      for (const content of recentContent) {
        const publishedText = content.isPublished ? '✅ Опубликован' : '❌ Не опубликован';
        contentText += `• <b>${content.title}</b> (${content.type})\n`;
        contentText += `  ${publishedText} - Уровень: ${content.accessLevel}\n\n`;
      }
    }
    
    // Добавляем кнопки для управления контентом
    const contentKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить материал', 'admin_add_content')],
      [Markup.button.callback('🔍 Найти материал', 'admin_find_content')],
      [Markup.button.callback('« Назад в админ-панель', 'back_to_admin')]
    ]);
    
    await ctx.editMessageText(contentText, {
      parse_mode: 'HTML',
      ...contentKeyboard
    });
  } catch (error) {
    logger.error(`Error in admin content handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении списка материалов. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для управления подписками
adminModule.action('admin_subscriptions', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем статистику по подпискам
    const totalSubscriptions = await User.countDocuments({ 'subscription.active': true });
    const expiringThis7Days = await User.countDocuments({
      'subscription.active': true,
      'subscription.endDate': { 
        $gte: new Date(), 
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
      }
    });
    const expiredLast7Days = await User.countDocuments({
      'subscription.active': false,
      'subscription.endDate': { 
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 
        $lte: new Date() 
      }
    });
    
    let subscriptionsText = '<b>🔄 Управление подписками</b>\n\n';
    subscriptionsText += `• Всего активных подписок: ${totalSubscriptions}\n`;
    subscriptionsText += `• Истекает в ближайшие 7 дней: ${expiringThis7Days}\n`;
    subscriptionsText += `• Истекло за последние 7 дней: ${expiredLast7Days}\n\n`;
    
    // Добавляем кнопки для управления подписками
    const subscriptionsKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Выдать подписку', 'admin_grant_subscription')],
      [Markup.button.callback('📧 Напомнить об истечении', 'admin_remind_expiring')],
      [Markup.button.callback('« Назад в админ-панель', 'back_to_admin')]
    ]);
    
    await ctx.editMessageText(subscriptionsText, {
      parse_mode: 'HTML',
      ...subscriptionsKeyboard
    });
  } catch (error) {
    logger.error(`Error in admin subscriptions handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении данных о подписках. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для отправки сообщения всем пользователям
adminModule.action('admin_broadcast', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Сохраняем в сессии состояние, что администратор хочет сделать рассылку
    ctx.session = {
      ...ctx.session,
      adminBroadcast: {
        step: 'awaiting_message',
        filter: 'all'
      }
    };
    
    // Предлагаем выбрать тип пользователей для рассылки
    const filterKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Всем пользователям', 'broadcast_filter_all')],
      [Markup.button.callback('Только с активной подпиской', 'broadcast_filter_active')],
      [Markup.button.callback('С истекшей подпиской', 'broadcast_filter_expired')],
      [Markup.button.callback('« Назад в админ-панель', 'back_to_admin')]
    ]);
    
    await ctx.editMessageText(
      '<b>📢 Отправка сообщения пользователям</b>\n\n' +
      'Выберите, кому отправить сообщение:',
      {
        parse_mode: 'HTML',
        ...filterKeyboard
      }
    );
  } catch (error) {
    logger.error(`Error in admin broadcast handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при подготовке к рассылке. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчики для выбора фильтра рассылки
adminModule.action('broadcast_filter_all', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.session.adminBroadcast = {
    ...ctx.session.adminBroadcast,
    filter: 'all'
  };
  
  await ctx.reply(
    formatters.info('Вы выбрали отправку всем пользователям.') +
    '\n\nВведите сообщение для рассылки или отправьте /cancel для отмены.'
  );
});

adminModule.action('broadcast_filter_active', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.session.adminBroadcast = {
    ...ctx.session.adminBroadcast,
    filter: 'active'
  };
  
  await ctx.reply(
    formatters.info('Вы выбрали отправку только пользователям с активной подпиской.') +
    '\n\nВведите сообщение для рассылки или отправьте /cancel для отмены.'
  );
});

adminModule.action('broadcast_filter_expired', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.session.adminBroadcast = {
    ...ctx.session.adminBroadcast,
    filter: 'expired'
  };
  
  await ctx.reply(
    formatters.info('Вы выбрали отправку пользователям с истекшей подпиской.') +
    '\n\nВведите сообщение для рассылки или отправьте /cancel для отмены.'
  );
});

// Обработчик для возврата в админ-панель
adminModule.action('back_to_admin', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const adminKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
      [Markup.button.callback('📚 Управление контентом', 'admin_content')],
      [Markup.button.callback('🔄 Операции с подписками', 'admin_subscriptions')],
      [Markup.button.callback('📢 Отправить сообщение всем', 'admin_broadcast')]
    ]);
    
    await ctx.editMessageText(
      '<b>Панель администратора</b>\n\n' +
      'Выберите действие:',
      {
        parse_mode: 'HTML',
        ...adminKeyboard
      }
    );
  } catch (error) {
    logger.error(`Error in back to admin handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик текстовых сообщений для рассылки
adminModule.on('text', async (ctx, next) => {
  try {
    // Проверяем, находится ли пользователь в режиме ожидания ввода сообщения для рассылки
    if (ctx.session.adminBroadcast && ctx.session.adminBroadcast.step === 'awaiting_message') {
      const messageText = ctx.message.text;
      
      // Проверяем, не является ли сообщение командой отмены
      if (messageText.startsWith('/cancel')) {
        delete ctx.session.adminBroadcast;
        await ctx.reply(formatters.info('Рассылка отменена.'));
        return;
      }
      
      // Сохраняем текст сообщения для рассылки и определяем фильтр пользователей
      let filter = {};
      let filterDescription = 'всем пользователям';
      
      if (ctx.session.adminBroadcast.filter === 'active') {
        filter = { 'subscription.active': true };
        filterDescription = 'пользователям с активной подпиской';
      } else if (ctx.session.adminBroadcast.filter === 'expired') {
        filter = { 
          'subscription.active': false, 
          'subscription.endDate': { $exists: true, $ne: null } 
        };
        filterDescription = 'пользователям с истекшей подпиской';
      }
      
      // Получаем пользователей согласно фильтру
      const users = await User.find(filter);
      
      if (users.length === 0) {
        await ctx.reply(formatters.warning(`В базе данных нет пользователей, соответствующих фильтру "${filterDescription}".`));
        delete ctx.session.adminBroadcast;
        return;
      }
      
      // Сохраняем информацию о сообщении в сессии
      ctx.session.broadcastMessage = {
        text: messageText,
        usersCount: users.length,
        filter: filter
      };
      
      // Обновляем шаг на ожидание подтверждения
      ctx.session.adminBroadcast.step = 'awaiting_confirmation';
      
      // Спрашиваем подтверждение
      const confirmKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, отправить', 'confirm_broadcast')],
        [Markup.button.callback('❌ Отмена', 'cancel_broadcast')]
      ]);
      
      await ctx.reply(
        formatters.warning(`Внимание: Вы собираетесь отправить сообщение ${users.length} пользователям.`) +
        `\n\nТекст сообщения:\n${messageText}` +
        `\n\nПодтвердите отправку:`,
        confirmKeyboard
      );
      
      return; // Прекращаем обработку, чтобы другие обработчики не выполнялись
    }
    
    // Если это не сообщение для рассылки, передаем управление следующему обработчику
    return next();
  } catch (error) {
    logger.error(`Error in text message handler for broadcast: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при подготовке рассылки. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /stats - показать статистику (сокращенная версия)
adminModule.command('stats', async (ctx) => {
  try {
    // Получаем основную статистику
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({ 'subscription.active': true });
    const totalContent = await Content.countDocuments();
    
    // Получаем статистику по новым пользователям
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    const newUsersToday = await User.countDocuments({ registeredAt: { $gte: oneDayAgo } });
    const newUsersThisWeek = await User.countDocuments({ registeredAt: { $gte: sevenDaysAgo } });
    
    const statsText = 
      formatters.info('Статистика бота:') + '\n\n' +
      `Всего пользователей: ${totalUsers}\n` +
      `Активных подписок: ${activeSubscriptions}\n` +
      `Всего материалов: ${totalContent}\n\n` +
      `Новых пользователей за 24ч: ${newUsersToday}\n` +
      `Новых пользователей за 7 дней: ${newUsersThisWeek}`;
    
    await ctx.reply(statsText);
  } catch (error) {
    logger.error(`Error in stats command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /broadcast - отправить сообщение всем пользователям (короткий способ)
adminModule.command('broadcast', async (ctx) => {
  try {
    // Извлекаем текст сообщения
    const messageText = ctx.message.text.replace(/^\/broadcast\s+/, '').trim();
    
    if (!messageText) {
      await ctx.reply(
        formatters.error('Не указан текст сообщения.') +
        '\n\nИспользуйте формат: /broadcast <текст сообщения>'
      );
      return;
    }
    
    // Получаем всех пользователей
    const users = await User.find();
    
    if (users.length === 0) {
      await ctx.reply(formatters.warning('В базе данных нет пользователей для рассылки.'));
      return;
    }
    
    // Спрашиваем подтверждение
    const confirmKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Да, отправить всем', 'confirm_broadcast')],
      [Markup.button.callback('❌ Отмена', 'cancel_broadcast')]
    ]);
    
    // Сохраняем информацию о сообщении в сессии
    ctx.session = {
      ...ctx.session,
      broadcastMessage: {
        text: messageText,
        usersCount: users.length
      }
    };
    
    await ctx.reply(
      formatters.warning(`Вы собираетесь отправить сообщение ${users.length} пользователям.`) +
      '\n\nТекст сообщения:\n' +
      messageText +
      '\n\nПодтвердите отправку:',
      confirmKeyboard
    );
  } catch (error) {
    logger.error(`Error in broadcast command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при подготовке рассылки. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчики подтверждения/отмены рассылки
adminModule.action('confirm_broadcast', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    if (!ctx.session.broadcastMessage) {
      await ctx.reply(formatters.error('Данные о сообщении для рассылки не найдены. Пожалуйста, повторите команду /broadcast.'));
      return;
    }
    
    const { text, usersCount, filter } = ctx.session.broadcastMessage;
    
    // Получаем пользователей согласно фильтру
    const users = await User.find(filter || {});
    
    // Отправляем сообщение каждому пользователю
    let successCount = 0;
    let errorCount = 0;
    
    await ctx.reply(formatters.info(`Начинаю рассылку ${users.length} пользователям...`));
    
    for (const user of users) {
      try {
        await ctx.telegram.sendMessage(user.telegramId, text);
        successCount++;
        
        // Небольшая задержка, чтобы не превысить лимиты Telegram API
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        errorCount++;
        logger.error(`Failed to send broadcast to user ${user.telegramId}: ${error.message}`);
      }
    }
    
    // Очищаем данные рассылки из сессии
    delete ctx.session.broadcastMessage;
    delete ctx.session.adminBroadcast;
    
    await ctx.reply(
      formatters.success(`Рассылка завершена!`) +
      `\n\nУспешно отправлено: ${successCount} из ${usersCount}` +
      (errorCount > 0 ? `\nОшибок: ${errorCount}` : '')
    );
  } catch (error) {
    logger.error(`Error in confirm broadcast handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при выполнении рассылки. Пожалуйста, попробуйте позже.'));
  }
});

adminModule.action('cancel_broadcast', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Очищаем данные рассылки из сессии
    delete ctx.session.broadcastMessage;
    delete ctx.session.adminBroadcast;
    
    await ctx.reply(formatters.info('Рассылка отменена.'));
  } catch (error) {
    logger.error(`Error in cancel broadcast handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Команда для получения информации о текущей конфигурации бота
adminModule.command('webhook_info', async (ctx) => {
  try {
    // Проверяем, является ли пользователь администратором
    if (!config.bot.adminUserIds.includes(ctx.from.id)) {
      await ctx.reply(formatters.error('Доступ запрещен. Вы не являетесь администратором.'));
      return;
    }
    
    // Получаем информацию о вебхуке
    const webhookInfo = await ctx.telegram.getWebhookInfo();
    
    // Форматируем информацию для вывода
    const infoMessage = formatters.info('Информация о текущей конфигурации вебхука:') +
      `\n\nURL: ${webhookInfo.url || 'Не установлен'}` +
      `\nIP-адрес: ${webhookInfo.ip_address || 'Не указан'}` +
      `\nПоследняя ошибка: ${webhookInfo.last_error_message || 'Нет ошибок'}` +
      `\nДата последней ошибки: ${webhookInfo.last_error_date ? new Date(webhookInfo.last_error_date * 1000).toISOString() : 'Не указана'}` +
      `\nМаксимальное кол-во соединений: ${webhookInfo.max_connections || 'Не указано'}` +
      `\nОжидающие обновления: ${webhookInfo.pending_update_count || 0}` +
      `\n\nРежим работы: ${config.bot.useWebhook ? 'Webhook' : 'Long Polling'}` +
      `\nПорт: ${config.bot.webhookPort}`;
    
    await ctx.reply(infoMessage);
  } catch (error) {
    logger.error(`Error in webhook_info command: ${error.message}`, { error });
    await ctx.reply(formatters.error(`Ошибка при получении информации о вебхуке: ${error.message}`));
  }
});

// Команда для перенастройки вебхука
adminModule.command('reset_webhook', async (ctx) => {
  try {
    // Проверяем, является ли пользователь администратором
    if (!config.bot.adminUserIds.includes(ctx.from.id)) {
      await ctx.reply(formatters.error('Доступ запрещен. Вы не являетесь администратором.'));
      return;
    }
    
    // Удаляем текущий вебхук
    await ctx.telegram.deleteWebhook();
    logger.info('Webhook deleted');
    
    // Если указан URL вебхука и useWebhook = true, устанавливаем новый вебхук
    if (config.bot.webhookUrl && config.bot.useWebhook) {
      await ctx.telegram.setWebhook(config.bot.webhookUrl);
      logger.info(`New webhook set to ${config.bot.webhookUrl}`);
      await ctx.reply(formatters.success(`Вебхук успешно переустановлен на ${config.bot.webhookUrl}`));
    } else {
      // Иначе бот работает в режиме long polling
      logger.info('Bot is working in long polling mode');
      await ctx.reply(formatters.success('Вебхук удален. Бот работает в режиме long polling.'));
    }
  } catch (error) {
    logger.error(`Error in reset_webhook command: ${error.message}`, { error });
    await ctx.reply(formatters.error(`Ошибка при перенастройке вебхука: ${error.message}`));
  }
});

module.exports = adminModule; 