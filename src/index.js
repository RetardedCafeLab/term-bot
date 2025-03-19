const { Telegraf, session } = require('telegraf');
const TelegrafSessionLocal = require('telegraf-session-local');
const config = require('./config');
const logger = require('./utils/logger');
const { connectToDatabase } = require('./config/database');
const { userIdentification } = require('./middleware/auth');
const terminalStyleMiddleware = require('./middleware/terminal');
const { Markup } = require('telegraf');

// Импортируем модули
const authModule = require('./modules/auth');
const paymentsModule = require('./modules/payments');
const contentModule = require('./modules/content');
const adminModule = require('./modules/admin');
const miniAppModule = require('./modules/miniapp');
const { startScheduler } = require('./scripts/scheduler');

// Создаем экземпляр бота
const bot = new Telegraf(config.bot.token);

// Настраиваем локальное хранилище сессий
const localSession = new TelegrafSessionLocal({
  database: 'sessions.json',
  property: 'session',
  storage: TelegrafSessionLocal.storageMemory
});

// Обработка ошибок
bot.catch((err, ctx) => {
  logger.error(`Ошибка при обработке обновления ${ctx?.updateType || 'unknown'}`, {
    error: err.message,
    userId: ctx?.from?.id
  });
  
  // Пытаемся отправить сообщение об ошибке пользователю
  if (ctx && ctx.chat && ctx.telegram) {
    try {
      ctx.telegram.sendMessage(
        ctx.chat.id, 
        'Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'
      ).catch(() => {});
    } catch (e) {
      // игнорируем ошибки при попытке отправить сообщение об ошибке
    }
  }
});

// Middleware для управления сессиями
bot.use(localSession.middleware());

// Middleware для идентификации пользователя
bot.use(userIdentification);

// Middleware для стилизации сообщений в терминальном стиле
bot.use(terminalStyleMiddleware);

// Добавляем глобальный перехватчик всех событий для отладки
bot.on('message', (ctx, next) => {
  logger.info('=== DEBUG: GOT MESSAGE EVENT ===', {
    from: ctx.from,
    updateType: ctx.updateType,
    updateSubType: ctx.updateSubTypes,
    hasWebAppData: ctx.message && ctx.message.web_app_data ? 'YES' : 'NO',
    chatType: ctx.chat.type,
    text: ctx.message.text
  });
  return next();
});

// Специфичный обработчик для web_app_data, добавленный ДО модулей
bot.on('web_app_data', (ctx, next) => {
  logger.info('=== DEBUG: WEB_APP_DATA CAUGHT AT ROOT LEVEL ===', {
    from: ctx.from,
    data: ctx.message.web_app_data,
    chatType: ctx.chat.type
  });
  return next();
});

// Подключаем модули
bot.use(authModule);
bot.use(paymentsModule);
bot.use(contentModule);
bot.use(adminModule);
bot.use(miniAppModule);

// Добавляем глобальные команды для отладки
bot.command('debug_mode', async (ctx) => {
  try {
    logger.info('Entering debug mode', {
      userId: ctx.from.id,
      username: ctx.from.username,
      chatId: ctx.chat.id
    });
    
    await ctx.reply('🧪 Режим отладки активирован. Выберите инструмент:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Проверить вебхук', 'debug_webhook')],
        [Markup.button.callback('📱 Проверить WebApp', 'debug_webapp')],
        [Markup.button.callback('🔄 Перезапустить вебхук', 'debug_reset_webhook')],
        [Markup.button.callback('📊 Показать логи событий', 'debug_show_events')]
      ])
    );
  } catch (error) {
    logger.error(`Error in debug_mode command: ${error.message}`, { error });
    await ctx.reply(`Ошибка при активации режима отладки: ${error.message}`);
  }
});

// Обработчики действий для отладки
bot.action('debug_webhook', async (ctx) => {
  try {
    // Получаем информацию о вебхуке
    const webhookInfo = await ctx.telegram.getWebhookInfo();
    
    await ctx.answerCbQuery('Получение информации о вебхуке');
    
    // Форматируем информацию для вывода
    const infoMessage = 
      `🔍 Информация о вебхуке:\n\n` +
      `URL: ${webhookInfo.url || 'Не установлен'}\n` +
      `Последняя ошибка: ${webhookInfo.last_error_message || 'Нет ошибок'}\n` +
      `Ожидающие обновления: ${webhookInfo.pending_update_count || 0}\n\n` +
      `Режим работы: ${config.bot.useWebhook ? 'Webhook' : 'Long Polling'}\n` +
      `Порт: ${config.bot.webhookPort}`;
    
    await ctx.editMessageText(infoMessage, Markup.inlineKeyboard([
      [Markup.button.callback('« Назад', 'back_to_debug')]
    ]));
  } catch (error) {
    logger.error(`Error in debug_webhook action: ${error.message}`, { error });
    await ctx.answerCbQuery(`Ошибка: ${error.message.substring(0, 200)}`);
  }
});

bot.action('debug_webapp', async (ctx) => {
  try {
    await ctx.answerCbQuery('Подготовка тестового WebApp');
    
    // Добавляем параметр тестирования к URL
    const testUrl = `${config.miniApp.url}?test=true&user_id=${ctx.from.id}`;
    
    await ctx.editMessageText(
      '📱 Тестирование WebApp\n\n' +
      'Нажмите кнопку ниже, чтобы открыть тестовое приложение. В приложении нажмите на любую кнопку, чтобы проверить передачу данных.',
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть тестовое приложение', testUrl)],
        [Markup.button.callback('« Назад', 'back_to_debug')]
      ])
    );
  } catch (error) {
    logger.error(`Error in debug_webapp action: ${error.message}`, { error });
    await ctx.answerCbQuery(`Ошибка: ${error.message.substring(0, 200)}`);
  }
});

bot.action('debug_reset_webhook', async (ctx) => {
  try {
    await ctx.answerCbQuery('Перенастройка вебхука');
    
    // Удаляем текущий вебхук
    await ctx.telegram.deleteWebhook();
    logger.info('Webhook deleted during debug');
    
    // Если указан URL вебхука и useWebhook = true, устанавливаем новый вебхук
    if (config.bot.webhookUrl && config.bot.useWebhook) {
      await ctx.telegram.setWebhook(config.bot.webhookUrl);
      logger.info(`New webhook set to ${config.bot.webhookUrl} during debug`);
      
      await ctx.editMessageText(
        `🔄 Вебхук переустановлен\n\n` +
        `Новый URL: ${config.bot.webhookUrl}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('« Назад', 'back_to_debug')]
        ])
      );
    } else {
      // Иначе бот работает в режиме long polling
      logger.info('Bot is working in long polling mode after debug reset');
      
      await ctx.editMessageText(
        '🔄 Режим работы: Long Polling\n\n' +
        'Вебхук удален. Бот работает в режиме Long Polling.',
        Markup.inlineKeyboard([
          [Markup.button.callback('« Назад', 'back_to_debug')]
        ])
      );
    }
  } catch (error) {
    logger.error(`Error in debug_reset_webhook action: ${error.message}`, { error });
    await ctx.answerCbQuery(`Ошибка: ${error.message.substring(0, 200)}`);
  }
});

bot.action('debug_show_events', async (ctx) => {
  try {
    await ctx.answerCbQuery('Получение информации о событиях');
    
    // Здесь можно показать последние события из логов или из памяти
    await ctx.editMessageText(
      '📊 Журнал событий\n\n' +
      'Последние события не найдены. Используйте режим отладки в терминале для просмотра событий в реальном времени.',
      Markup.inlineKeyboard([
        [Markup.button.callback('« Назад', 'back_to_debug')]
      ])
    );
  } catch (error) {
    logger.error(`Error in debug_show_events action: ${error.message}`, { error });
    await ctx.answerCbQuery(`Ошибка: ${error.message.substring(0, 200)}`);
  }
});

bot.action('back_to_debug', async (ctx) => {
  try {
    await ctx.answerCbQuery('Возврат в меню отладки');
    
    await ctx.editMessageText('🧪 Режим отладки активирован. Выберите инструмент:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Проверить вебхук', 'debug_webhook')],
        [Markup.button.callback('📱 Проверить WebApp', 'debug_webapp')],
        [Markup.button.callback('🔄 Перезапустить вебхук', 'debug_reset_webhook')],
        [Markup.button.callback('📊 Показать логи событий', 'debug_show_events')]
      ])
    );
  } catch (error) {
    logger.error(`Error in back_to_debug action: ${error.message}`, { error });
    await ctx.answerCbQuery(`Ошибка: ${error.message.substring(0, 200)}`);
  }
});

// Старт бота
async function startBot() {
  try {
    // Подключаемся к базе данных
    await connectToDatabase();
    
    console.log("Запускаем бота и настраиваем API...");
    
    // Настраиваем Express для API сначала, до запуска бота
    console.log("Настраиваем API сервер...");
    const express = require('express');
    const bodyParser = require('body-parser');
    const cors = require('cors');
    const path = require('path');
    
    // Делаем бота глобально доступным для API
    global.bot = bot;
    console.log("Бот доступен глобально");
    
    const miniAppApi = require('./modules/miniapp/api');
    
    const app = express();
    
    // Middleware
    // Настраиваем CORS для разрешения запросов от всех источников
    app.use(cors({
      origin: '*', // Разрешаем запросы с любого источника
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    // Настраиваем статический файловый сервер для обслуживания файлов из директории public/
    app.use(express.static(path.join(__dirname, '../public')));
    console.log("Статический файловый сервер настроен для директории public/");
    
    // Логгер для API запросов
    app.use((req, res, next) => {
      logger.debug(`API Request: ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined
      });
      next();
    });
    
    // Обработка предварительных запросов OPTIONS
    app.options('*', (req, res) => {
      res.status(200).end();
      logger.debug('Обработан предварительный запрос OPTIONS');
    });
    
    // Маршруты API
    app.use('/api/miniapp', miniAppApi);
    
    // Здоровье API
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', version: '1.0.0', env: process.env.NODE_ENV });
    });
    
    // Корневой маршрут, если статический файловый сервер не справился
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
    
    // Обработка ошибок API
    app.use((err, req, res, next) => {
      logger.error(`API Error: ${err.message}`, { error: err, path: req.path });
      res.status(500).json({ error: 'Internal Server Error' });
    });
    
    // Запускаем API сервер на порту 3000
    const apiPort = process.env.API_PORT || 3000;
    console.log(`Пытаемся запустить API сервер на порту ${apiPort}...`);
    
    const server = app.listen(apiPort, () => {
      logger.info(`API server started on port ${apiPort}`);
      console.log(`API сервер запущен на порту ${apiPort}`);
    });
    
    // Добавляем обработку ошибок при запуске сервера
    server.on('error', (error) => {
      console.log(`Ошибка при запуске API сервера: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        // Если порт занят, пробуем запустить на другом порту
        const newPort = apiPort + 1;
        logger.warn(`Port ${apiPort} is already in use, trying port ${newPort}`);
        console.log(`Порт ${apiPort} занят, пробуем порт ${newPort}...`);
        
        const newServer = app.listen(newPort, () => {
          logger.info(`API server started on alternative port ${newPort}`);
          console.log(`API сервер запущен на альтернативном порту ${newPort}`);
        });
        
        // Также обрабатываем ошибки на новом порту
        newServer.on('error', (newError) => {
          logger.error(`Failed to start API server on alternative port: ${newError.message}`);
          console.log(`Не удалось запустить API сервер на альтернативном порту: ${newError.message}`);
        });
      } else {
        logger.error(`Error starting API server: ${error.message}`);
      }
    });
    
    // Теперь запускаем бота после настройки API
    console.log("API настроен, теперь запускаем бота...");
    
    // Определяем режим работы бота (webhook или polling)
    if (config.bot.webhookUrl && config.bot.useWebhook) {
      // Webhook mode
      await bot.telegram.setWebhook(config.bot.webhookUrl);
      logger.info(`Bot webhook set to ${config.bot.webhookUrl}`);
      
      // Запускаем веб-сервер для обработки webhook запросов
      const app = require('express')();
      app.use(require('body-parser').json());
      
      // Настраиваем обработку webhook запросов
      app.post('/webhook', (req, res) => {
        bot.handleUpdate(req.body, res);
      });
      
      // Запускаем сервер
      const webhookServer = app.listen(config.bot.webhookPort, () => {
        logger.info(`Webhook server started on port ${config.bot.webhookPort}`);
      });
      
      // Добавляем обработку ошибок при запуске вебхук-сервера
      webhookServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          // Если порт занят, пробуем запустить на другом порту
          const newPort = config.bot.webhookPort + 1;
          logger.warn(`Webhook port ${config.bot.webhookPort} is already in use, trying port ${newPort}`);
          
          const newServer = app.listen(newPort, () => {
            logger.info(`Webhook server started on alternative port ${newPort}`);
            
            // Обновляем URL вебхука с новым портом
            const webhookUrlParts = new URL(config.bot.webhookUrl);
            webhookUrlParts.port = newPort;
            const newWebhookUrl = webhookUrlParts.toString();
            
            bot.telegram.setWebhook(newWebhookUrl)
              .then(() => logger.info(`Updated webhook URL to ${newWebhookUrl}`))
              .catch((err) => logger.error(`Failed to update webhook URL: ${err.message}`));
          });
          
          newServer.on('error', (newError) => {
            logger.error(`Failed to start webhook server on alternative port: ${newError.message}`);
          });
        } else {
          logger.error(`Error starting webhook server: ${error.message}`);
        }
      });
    } else {
      // Polling mode
      console.log('Запускаем бота в режиме polling...');
      try {
        await bot.launch();
        console.log('Бот успешно запущен в режиме polling');
        logger.info('Bot started in polling mode');
      } catch (error) {
        console.log(`Исключение при запуске бота: ${error.message}`);
        logger.error(`Exception when starting bot: ${error.message}`, { error });
        throw error;
      }
    }
    
    // Запускаем планировщик задач
    if (process.env.NODE_ENV !== 'test') {
      console.log("Запускаем планировщик задач...");
      startScheduler();
      console.log("Планировщик задач запущен");
    }
    
    // Обработка сигналов остановки
    process.once('SIGINT', () => {
      bot.stop('SIGINT');
      logger.info('Bot stopped due to SIGINT signal');
    });
    
    process.once('SIGTERM', () => {
      bot.stop('SIGTERM');
      logger.info('Bot stopped due to SIGTERM signal');
    });
    
    logger.info('TERM bot successfully started');
    console.log('TERM бот и API успешно запущены');
  } catch (error) {
    logger.error(`Failed to start bot: ${error.message}`, { error });
    console.log(`Ошибка при запуске бота: ${error.message}`);
    process.exit(1);
  }
}

// Запускаем бота
startBot(); 