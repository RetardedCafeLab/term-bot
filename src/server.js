const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Telegraf } = require('telegraf');
const { connectToDatabase } = require('./config/database');
const logger = require('./utils/logger');
const config = require('./config');

// Создаем экземпляр бота для API запросов
const bot = new Telegraf(config.bot.token);
// Делаем бота глобально доступным
global.bot = bot;
console.log("Бот создан и доступен глобально для API");

// Создаем экземпляр Express приложения
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Настраиваем статический файловый сервер
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

// Импортируем API модули
const miniAppApi = require('./modules/miniapp/api');

// Маршруты API
app.use('/api/miniapp', miniAppApi);

// Здоровье API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', env: process.env.NODE_ENV });
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Обработка ошибок API
app.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`, { error: err, path: req.path });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Запускаем сервер
async function startServer() {
  try {
    // Подключаемся к базе данных
    await connectToDatabase();
    
    // Определяем порт из конфигурации
    const apiPort = process.env.API_PORT || 3001;
    console.log(`Запускаем API сервер на порту ${apiPort}...`);
    
    app.listen(apiPort, () => {
      logger.info(`API server started on port ${apiPort}`);
      console.log(`API сервер успешно запущен на порту ${apiPort}`);
    });
  } catch (error) {
    console.error(`Ошибка при запуске API сервера: ${error.message}`);
    logger.error(`Error starting API server: ${error.message}`, { error });
    process.exit(1);
  }
}

// Запускаем сервер
startServer(); 