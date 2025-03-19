const { Composer, Markup } = require('telegraf');
const config = require('../../config');
const logger = require('../../utils/logger');
const { formatters } = require('../../utils/terminalFormatter');
const { createStarsInvoiceLink } = require('../payments/starsPayment');
const User = require('../../models/user');

const miniAppModule = new Composer();

// Команда /miniapp - запуск мини-приложения (с клавиатурой внизу экрана)
miniAppModule.command('miniapp', async (ctx) => {
  try {
    // Проверяем, настроено ли мини-приложение
    if (!config.miniApp.url) {
      await ctx.reply(formatters.error('Мини-приложение временно недоступно.'));
      return;
    }
    
    // Отправляем кнопку для запуска мини-приложения с обычной клавиатурой
    const keyboard = Markup.keyboard([
      Markup.button.webApp('🖥️ Открыть TERM терминал', config.miniApp.url)
    ]).resize();
    
    await ctx.reply(
      formatters.info('TERM - Терминальное мини-приложение для доступа к материалам лаборатории Retarded Café') +
      '\n\nНажмите кнопку ниже, чтобы открыть терминальный интерфейс.',
      keyboard
    );
  } catch (error) {
    logger.error(`Error in miniapp command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при запуске мини-приложения. Пожалуйста, попробуйте позже.'));
  }
});

// Команда /webapp - запуск мини-приложения (с inline кнопкой)
miniAppModule.command('webapp', async (ctx) => {
  try {
    // Проверяем, настроено ли мини-приложение
    if (!config.miniApp.url) {
      await ctx.reply(formatters.error('Мини-приложение временно недоступно.'));
      return;
    }
    
    // Проверяем наличие подписки
    if (!ctx.user.hasActiveSubscription()) {
      await ctx.reply(
        formatters.warning('Для доступа к мини-приложению требуется активная подписка.'),
        Markup.inlineKeyboard([
          [Markup.button.callback('Оформить подписку', 'back_to_subscription_type')]
        ])
      );
      return;
    }
    
    // Отправляем inline-кнопку для запуска мини-приложения
    const inlineKeyboard = Markup.inlineKeyboard([
      [Markup.button.webApp('🖥️ Открыть TERM терминал', config.miniApp.url)]
    ]);
    
    await ctx.reply(
      formatters.info('TERM - Терминальное мини-приложение для доступа к материалам лаборатории Retarded Café') +
      '\n\nНажмите кнопку ниже, чтобы открыть терминальный интерфейс в формате встроенного приложения Telegram.',
      inlineKeyboard
    );
  } catch (error) {
    logger.error(`Error in webapp command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при запуске мини-приложения. Пожалуйста, попробуйте позже.'));
  }
});

// Добавляем команду для тестирования мини-приложения
miniAppModule.command('miniapp_debug', async (ctx) => {
  try {
    // Логируем информацию о пользователе для отладки
    logger.info('MiniApp debug command triggered', {
      userId: ctx.from.id,
      username: ctx.from.username,
      chatId: ctx.chat.id,
      chatType: ctx.chat.type
    });
    
    // Отправляем тестовое сообщение с информацией о пользователе
    await ctx.reply(
      formatters.info('Информация о мини-приложении:') +
      `\n\nUser ID: ${ctx.from.id}` + 
      `\nUsername: ${ctx.from.username || 'Не указан'}` +
      `\nChat ID: ${ctx.chat.id}` +
      `\nChat Type: ${ctx.chat.type}` +
      `\nMini-App URL: ${config.miniApp.url || 'Не настроен'}` +
      `\n\nТеперь можно открыть мини-приложение для отладки:`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🧪 Открыть в режиме отладки', config.miniApp.url)]
      ])
    );
    
    // Отправляем еще одно сообщение с инструкциями по отладке
    await ctx.reply(
      formatters.info('Инструкции по отладке:') +
      '\n\n1. Откройте мини-приложение по кнопке выше' +
      '\n2. При нажатии на любую кнопку в мини-приложении, оно должно отправить данные в бота' +
      '\n3. Бот должен ответить сообщением о получении данных' +
      '\n4. Если ответа нет, проверьте логи сервера' +
      '\n\nИспользуйте команду /webapp вместо /miniapp для проверки подписки перед доступом к приложению.'
    );
  } catch (error) {
    logger.error(`Error in miniapp_debug command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отладке мини-приложения. Пожалуйста, попробуйте позже.'));
  }
});

// Добавляем команду для тестирования мини-приложения с другим подходом
miniAppModule.command('webapp_test', async (ctx) => {
  try {
    // Логируем информацию о пользователе для отладки
    logger.info('WebApp test command triggered', {
      userId: ctx.from.id,
      username: ctx.from.username,
      chatId: ctx.chat.id,
      chatType: ctx.chat.type
    });
    
    // Проверяем, что мини-приложение настроено
    if (!config.miniApp.url) {
      await ctx.reply(formatters.error('Мини-приложение не настроено.'));
      return;
    }
    
    // Добавляем параметр тестирования к URL
    const testUrl = `${config.miniApp.url}?test=true&user_id=${ctx.from.id}`;
    
    // Создаем HTML-разметку для отображения информации
    const html = `
<b>Тестирование WebApp Data</b>

1. Нажмите кнопку <b>"Открыть тестовое приложение"</b>
2. В приложении нажмите на ЛЮБУЮ кнопку
3. Данные должны быть отправлены боту

<i>Если бот не отвечает после нажатия кнопки в мини-приложении, проверьте логи сервера и конфигурацию вебхуков.</i>

<b>Технические детали:</b>
User ID: ${ctx.from.id}
URL: ${testUrl}
    `;
    
    // Отправляем сообщение с кнопкой для запуска тестового мини-приложения
    await ctx.replyWithHTML(html, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🧪 Открыть тестовое приложение', web_app: { url: testUrl } }]
        ]
      }
    });
    
  } catch (error) {
    logger.error(`Error in webapp_test command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при запуске тестового мини-приложения.'));
  }
});

// Обработчик для обработки данных, полученных от мини-приложения
miniAppModule.on('web_app_data', async (ctx) => {
  try {
    logger.info('===== WEB APP DATA RECEIVED =====');
    
    // Проверяем структуру ctx
    logger.info('Context structure:', {
      updateType: ctx.updateType,
      updateSubTypes: ctx.updateSubTypes,
      hasUpdate: !!ctx.update,
      updateKeys: ctx.update ? Object.keys(ctx.update) : [],
      hasWebAppData: !!(ctx.update && ctx.update.message && ctx.update.message.web_app_data),
    });
    
    // Проверка структуры сообщения
    logger.info('Message structure:', {
      hasMessage: !!ctx.message,
      messageKeys: ctx.message ? Object.keys(ctx.message) : [],
      webAppDataExists: !!(ctx.message && ctx.message.web_app_data),
      webAppDataKeys: (ctx.message && ctx.message.web_app_data) ? Object.keys(ctx.message.web_app_data) : []
    });
    
    // Получаем данные от мини-приложения
    const webAppData = ctx.webAppData.data;
    
    // Логируем сырые данные и информацию о контексте для отладки
    logger.info(`Raw data received from mini app: "${webAppData}"`, {
      userId: ctx.from.id,
      username: ctx.from.username,
      chatId: ctx.chat.id,
      chatType: ctx.chat.type,
      dataLength: webAppData ? webAppData.length : 0
    });
    
    // Парсим JSON данные (если они в формате JSON)
    let parsedData;
    try {
      parsedData = JSON.parse(webAppData);
      logger.info('Successfully parsed JSON data from mini app', { parsedData });
    } catch (e) {
      logger.error(`Error parsing JSON data from mini app: ${e.message}`, {
        error: e,
        rawData: webAppData
      });
      parsedData = { rawData: webAppData };
    }
    
    // Логируем полученные данные
    logger.info(`Received data from mini app for user ${ctx.from.id}`, { 
      data: parsedData,
      dataType: typeof parsedData,
      hasAction: !!parsedData.action
    });
    
    // Отправляем подтверждение получения данных
    await ctx.reply(
      formatters.info('✅ Получены данные от мини-приложения') +
      `\n\nДействие: ${parsedData.action || 'Не указано'}` +
      (parsedData.duration ? `\nПродолжительность: ${parsedData.duration}` : '') +
      (parsedData.channel ? `\nКанал: ${parsedData.channel}` : '') +
      (parsedData.test_mode ? `\nТестовый режим: Да` : '') +
      `\n\nJSON: ${JSON.stringify(parsedData, null, 2).substring(0, 200)}`,
      { reply_markup: { remove_keyboard: true } }
    );
    
    // Обрабатываем данные в зависимости от их типа
    if (parsedData.action) {
      switch (parsedData.action) {
        case 'subscribe':
          // Перенаправляем на оформление подписки
          await ctx.reply(
            formatters.info('Переходим к оформлению подписки...'),
            { reply_markup: { remove_keyboard: true } }
          );
          
          // Показываем выбор типа подписки
          await showSubscriptionTypeSelection(ctx);
          break;
          
        case 'subscribe_term':
          // Прямое оформление подписки на TERM
          await ctx.reply(
            formatters.info('Переходим к оформлению подписки на TERM...'),
            { reply_markup: { remove_keyboard: true } }
          );
          
          // Если указан конкретный тариф, сразу инициируем оплату через Stars
          if (parsedData.duration) {
            logger.info(`Initiating direct payment for ${parsedData.duration} subscription from mini-app`, {
              duration: parsedData.duration,
              userId: ctx.from.id,
              test_mode: parsedData.test_mode || false
            });
            
            try {
              // Находим соответствующий обработчик в модуле платежей
              const tierId = parsedData.duration;
              const tier = config.subscriptionTiers[tierId];
              
              if (!tier) {
                throw new Error(`Invalid subscription tier: ${tierId}`);
              }
              
              logger.info(`Found tier: ${tierId}`, {
                tier,
                price: tier.price,
                test_mode: parsedData.test_mode || false
              });
              
              // Подготавливаем данные для платежа
              const title = `Подписка TERM "${tier.name}"`;
              const description = `Подписка на ${tier.durationInDays} дней: ${tier.description}`;
              const amount = tier.price;
              const payload = JSON.stringify({
                type: 'term_subscription',
                tierId: tierId,
                userId: ctx.from.id,
                duration: tier.durationInDays
              });
              
              // Импортируем модуль для оплаты в Stars
              const starsPaymentModule = require('../payments/starsPayment');
              
              logger.info('Preparing to send Stars invoice', {
                title,
                description: description.substring(0, 30) + '...',
                amount
              });
              
              // Вызываем специализированную функцию для отправки инвойса
              await starsPaymentModule.sendStarsInvoice(ctx, tierId, title, description, amount, payload);
              
              logger.info(`Stars invoice sent successfully for ${tierId} from mini-app`);
              
              // Сообщаем пользователю об успешном создании инвойса
              await ctx.reply(formatters.success('Счет на оплату успешно создан! Проверьте сообщения от Telegram для завершения платежа.'));
              
            } catch (invoiceError) {
              logger.error(`Error creating invoice from mini-app: ${invoiceError.message}`, { 
                error: invoiceError,
                stack: invoiceError.stack,
                tierId: parsedData.duration
              });
              
              // Более подробное сообщение об ошибке для пользователя
              await ctx.reply(
                formatters.error('Произошла ошибка при создании счета на оплату:') +
                `\n\n${invoiceError.message}` +
                '\n\nВы можете попробовать оформить подписку через меню /subscribe.'
              );
            }
          } else {
            // Иначе показываем меню подписок
            try {
              // Имитируем нажатие на кнопку через экшен
              await ctx.reply('Открываю список подписок TERM...');
              await ctx.telegram.sendMessage(
                ctx.from.id, 
                '/subscribe'
              );
            } catch (err) {
              logger.error(`Failed to trigger term_subscription action: ${err.message}`, { error: err });
              await ctx.reply(formatters.error('Ошибка при открытии меню подписок. Введите /subscribe чтобы продолжить.'));
            }
          }
          break;
          
        case 'subscribe_channels':
          // Прямое оформление подписки на каналы
          await ctx.reply(
            formatters.info('Переходим к оформлению подписки на каналы...'),
            { reply_markup: { remove_keyboard: true } }
          );
          
          // Если указан конкретный канал, переходим сразу к нему
          if (parsedData.channel) {
            // Если указан метод оплаты stars (API), используем его
            if (parsedData.payment === 'stars') {
              logger.info(`Initiating direct Stars payment for channel ${parsedData.channel} from mini-app`, {
                channelId: parsedData.channel,
                userId: ctx.from.id,
                test_mode: parsedData.test_mode || false
              });
              
              try {
                // Используем глобальную функцию findChannelById
                const channelId = parsedData.channel;
                const channel = findChannelById(channelId);
                
                if (!channel) {
                  throw new Error(`Channel not found: ${channelId}`);
                }
                
                logger.info(`Found channel: ${channelId}`, {
                  channel,
                  price: channel.starsPrice,
                  test_mode: parsedData.test_mode || false
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
                
                // Импортируем модуль для оплаты в Stars
                const starsPaymentModule = require('../payments/starsPayment');
                
                logger.info('Preparing to send Stars invoice for channel', {
                  title,
                  description: description.substring(0, 30) + '...',
                  amount
                });
                
                // Вызываем специализированную функцию для отправки инвойса
                await starsPaymentModule.sendStarsInvoice(ctx, channelId, title, description, amount, payload);
                
                logger.info(`Stars invoice sent successfully for channel ${channelId} from mini-app`);
                
                // Сообщаем пользователю об успешном создании инвойса
                await ctx.reply(formatters.success('Счет на оплату успешно создан! Проверьте сообщения от Telegram для завершения платежа.'));
                
              } catch (invoiceError) {
                logger.error(`Error creating invoice for channel from mini-app: ${invoiceError.message}`, { 
                  error: invoiceError,
                  stack: invoiceError.stack,
                  channelId: parsedData.channel
                });
                
                // Более подробное сообщение об ошибке для пользователя
                await ctx.reply(
                  formatters.error('Произошла ошибка при создании счета на оплату:') +
                  `\n\n${invoiceError.message}` +
                  '\n\nВы можете попробовать оформить подписку через меню /subscribe.'
                );
              }
            } else {
              // Переходим к ручному переводу Stars
              try {
                await ctx.reply('Открываю информацию о подписке на канал...');
                await ctx.telegram.sendMessage(
                  ctx.from.id, 
                  `/channel ${parsedData.channel}`
                );
              } catch (err) {
                logger.error(`Failed to trigger manual channel subscription: ${err.message}`, { error: err });
                await ctx.reply(formatters.error('Ошибка при открытии информации о канале. Введите /subscribe чтобы продолжить.'));
              }
            }
          } else {
            // Показываем общее меню каналов
            try {
              await ctx.reply('Открываю список доступных каналов...');
              await ctx.telegram.sendMessage(
                ctx.from.id, 
                '/subscribe'
              );
            } catch (err) {
              logger.error(`Failed to open channels menu: ${err.message}`, { error: err });
              await ctx.reply(formatters.error('Ошибка при открытии списка каналов. Введите /subscribe чтобы продолжить.'));
            }
          }
          break;
          
        case 'content':
          // Перенаправляем на образовательные материалы
          await ctx.reply(
            formatters.info('Переходим к образовательным материалам...'),
            { reply_markup: { remove_keyboard: true } }
          );
          
          // Запускаем команду /content
          await ctx.telegram.sendMessage(ctx.from.id, '/content');
          break;
          
        case 'ask_ai':
          // Функционал "Спросить у ИИ"
          await ctx.reply(
            formatters.info('Функционал "Спросить у ИИ" будет доступен в ближайшем обновлении.'),
            { reply_markup: { remove_keyboard: true } }
          );
          break;
          
        case 'status':
          // Проверка статуса подписок
          await ctx.reply(
            formatters.info('Проверяем статус ваших подписок...'),
            { reply_markup: { remove_keyboard: true } }
          );
          
          // Запускаем команду /status
          await ctx.telegram.sendMessage(ctx.from.id, '/status');
          break;
          
        default:
          await ctx.reply(
            formatters.info(`Получены данные от мини-приложения: ${JSON.stringify(parsedData)}`),
            { reply_markup: { remove_keyboard: true } }
          );
      }
    } else {
      await ctx.reply(
        formatters.info(`Получены данные от мини-приложения: ${JSON.stringify(parsedData)}`),
        { reply_markup: { remove_keyboard: true } }
      );
    }
  } catch (error) {
    logger.error(`Error in web_app_data handler: ${error.message}`, { error });
    await ctx.reply(
      formatters.error('Произошла ошибка при обработке данных от мини-приложения. Пожалуйста, попробуйте позже.'),
      { reply_markup: { remove_keyboard: true } }
    );
  }
});

// Обработчик для уведомлений о запуске каналов
miniAppModule.on('message', async (ctx, next) => {
  if (ctx.message && ctx.message.web_app_data) {
    try {
      const data = JSON.parse(ctx.message.web_app_data.data);
      
      if (data.action === 'notify_launch' && data.channel) {
        logger.info('Launch notification request received', {
          userId: ctx.from.id,
          username: ctx.from.username,
          channel: data.channel
        });
        
        // Находим пользователя в базе данных
        let user = ctx.user;
        
        if (!user) {
          user = await User.findOne({ telegramId: ctx.from.id });
        }
        
        if (!user) {
          logger.error(`User not found: ${ctx.from.id}`);
          await ctx.reply(formatters.error('Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.'));
          return;
        }
        
        // Добавляем или обновляем запись в пользовательских данных
        // Для простоты используем pendingChannelSubscriptions
        const existingRequest = user.pendingChannelSubscriptions.find(
          req => req.channelId === data.channel && req.status === 'pending'
        );
        
        if (!existingRequest) {
          user.pendingChannelSubscriptions.push({
            channelId: data.channel,
            requestDate: new Date(),
            status: 'pending'
          });
          
          await user.save();
          logger.info(`User ${ctx.from.id} subscribed to launch notifications for ${data.channel}`);
        }
        
        // Отправляем подтверждение
        await ctx.reply(formatters.success('Вы успешно подписались на уведомления о запуске!') + 
          '\n\nМы сообщим вам, когда канал Digital Nomad Protocol станет доступен.');
        
        // Уведомляем администраторов
        for (const adminId of config.bot.adminUserIds) {
          try {
            await ctx.telegram.sendMessage(
              adminId,
              formatters.info('Новая подписка на уведомление о запуске') +
              `\n\nПользователь: ${ctx.from.id} (${ctx.from.username || 'без username'})` +
              `\nКанал: ${data.channel}` +
              `\nДата: ${new Date().toLocaleString('ru-RU')}`
            );
          } catch (e) {
            logger.error(`Failed to notify admin ${adminId}: ${e.message}`);
          }
        }
        
        return;
      }
    } catch (error) {
      logger.error(`Error processing notify_launch request: ${error.message}`, { error });
    }
  }
  
  return next();
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

// Команда для создания invoice link и отправки его клиенту
miniAppModule.command('create_invoice_link', async (ctx) => {
  try {
    // Проверяем параметры
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      await ctx.reply(formatters.error('Необходимо указать тип подписки и ID тарифа. Например: /create_invoice_link term monthly'));
      return;
    }
    
    const type = args[1]; // term или channel
    const itemId = args[2]; // ID тарифа или ID канала
    
    logger.info('Creating invoice link', { type, itemId, userId: ctx.from.id });
    
    if (type === 'term') {
      // Создаем ссылку на инвойс для подписки TERM
      const tier = config.subscriptionTiers[itemId];
      
      if (!tier) {
        logger.error(`Tier not found: ${itemId}`);
        await ctx.reply(formatters.error('Выбранный тариф не найден. Пожалуйста, попробуйте снова.'));
        return;
      }
      
      // Подготавливаем данные для платежа
      const title = `Подписка TERM "${tier.name}"`;
      const description = `Подписка на ${tier.durationInDays} дней: ${tier.description}`;
      const amount = tier.price; 
      const payload = JSON.stringify({
        type: 'term_subscription',
        tierId: itemId,
        userId: ctx.from.id,
        duration: tier.durationInDays
      });
      
      // Создаем ссылку на инвойс
      const invoiceLink = await createStarsInvoiceLink(
        ctx.telegram, 
        itemId, 
        title, 
        description, 
        amount, 
        payload, 
        ctx.from.id
      );
      
      // Отправляем ссылку пользователю
      await ctx.reply(
        formatters.success('Ссылка на оплату успешно создана:') +
        `\n\nТариф: ${tier.name}` +
        `\nСумма: ${amount} Stars` +
        `\nСрок: ${tier.durationInDays} дней` +
        '\n\nНажмите на кнопку ниже, чтобы оплатить:',
        Markup.inlineKeyboard([
          [Markup.button.url('Оплатить подписку', invoiceLink)]
        ])
      );
      
      logger.info('Invoice link sent to user', { userId: ctx.from.id, tierId: itemId });
      
    } else if (type === 'channel') {
      // Создаем ссылку на инвойс для подписки на канал
      const channelId = itemId;
      const channel = findChannelById(channelId);
      
      if (!channel) {
        logger.error(`Channel not found: ${channelId}`);
        await ctx.reply(formatters.error('Выбранный канал не найден. Пожалуйста, попробуйте снова.'));
        return;
      }
      
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
      
      // Создаем ссылку на инвойс
      const invoiceLink = await createStarsInvoiceLink(
        ctx.telegram, 
        channelId, 
        title, 
        description, 
        amount, 
        payload, 
        ctx.from.id
      );
      
      // Отправляем ссылку пользователю
      await ctx.reply(
        formatters.success('Ссылка на оплату успешно создана:') +
        `\n\nКанал: ${channel.name}` +
        `\nСумма: ${amount} Stars` +
        `\nСрок: 30 дней` +
        '\n\nНажмите на кнопку ниже, чтобы оплатить:',
        Markup.inlineKeyboard([
          [Markup.button.url('Оплатить подписку', invoiceLink)]
        ])
      );
      
      logger.info('Invoice link sent to user', { userId: ctx.from.id, channelId });
    } else {
      await ctx.reply(formatters.error('Неверный тип подписки. Укажите term или channel.'));
    }
  } catch (error) {
    logger.error(`Error creating invoice link: ${error.message}`, { error });
    await ctx.reply(formatters.error(`Произошла ошибка при создании ссылки на оплату: ${error.message}`));
  }
});

// Команда для тестирования invoice link
miniAppModule.command('test_invoice', async (ctx) => {
  try {
    // По умолчанию создаем тестовый инвойс для подписки monthly
    const tierId = 'monthly';
    const tier = config.subscriptionTiers[tierId];
    
    if (!tier) {
      await ctx.reply(formatters.error('Тариф monthly не найден в конфигурации.'));
      return;
    }
    
    // Подготавливаем данные для тестового платежа
    const title = `Тестовая подписка TERM "${tier.name}"`;
    const description = `Подписка на ${tier.durationInDays} дней: ${tier.description}`;
    const amount = tier.price;
    const payload = JSON.stringify({
      type: 'term_subscription',
      tierId: tierId,
      userId: ctx.from.id,
      duration: tier.durationInDays,
      test: true
    });
    
    logger.info('Creating test invoice link', { 
      tierId, 
      userId: ctx.from.id,
      amount
    });
    
    try {
      // Создаем ссылку на инвойс
      const invoiceLink = await createStarsInvoiceLink(
        ctx.telegram, 
        tierId, 
        title, 
        description, 
        amount, 
        payload, 
        ctx.from.id
      );
      
      // Отправляем ссылку пользователю
      await ctx.reply(
        formatters.success('Тестовая ссылка на оплату успешно создана:') +
        `\n\nТариф: ${tier.name}` +
        `\nСумма: ${amount} Stars` +
        `\nСрок: ${tier.durationInDays} дней` +
        '\n\nНажмите на кнопку ниже, чтобы проверить оплату:',
        Markup.inlineKeyboard([
          [Markup.button.url('Оплатить тестовую подписку', invoiceLink)]
        ])
      );
      
      // Добавляем кнопку для открытия мини-приложения
      await ctx.reply(
        formatters.info('Также вы можете открыть тестовое мини-приложение и проверить работу платежей через него:'),
        Markup.inlineKeyboard([
          [Markup.button.webApp('Открыть тестовое мини-приложение', `${config.miniApp.url}?test=true`)]
        ])
      );
      
      logger.info('Test invoice link sent to user', { userId: ctx.from.id });
    } catch (invoiceLinkError) {
      logger.error(`Error creating test invoice link: ${invoiceLinkError.message}`, { 
        error: invoiceLinkError,
        tokenInfo: config.payment.tokenInfo
      });
      
      await ctx.reply(
        formatters.error(`Ошибка при создании тестовой ссылки: ${invoiceLinkError.message}`) +
        '\n\nПроверьте настройки платежной системы и токен в конфигурации.'
      );
    }
  } catch (error) {
    logger.error(`Error in test_invoice command: ${error.message}`, { error });
    await ctx.reply(formatters.error(`Произошла ошибка при создании тестовой ссылки: ${error.message}`));
  }
});

// Функция для поиска канала по ID (такая же, как в starsPayment.js)
function findChannelById(channelId) {
  for (const key in config.channels) {
    if (config.channels[key].id === channelId) {
      return config.channels[key];
    }
  }
  return null;
}

module.exports = miniAppModule; 