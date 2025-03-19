# TERM - Telegram Bot для Retarded Café

<p align="center">
  <pre style="color: #00FF00; background-color: #000000;">
  ████████╗███████╗██████╗ ███╗   ███╗
  ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
     ██║   █████╗  ██████╔╝██╔████╔██║
     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
     ██║   ███████╗██║  ██║██║ ╚═╝ ██║
     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
  </pre>
</p>

TERM - это Telegram бот с терминальным интерфейсом для проекта Retarded Café. Бот предоставляет доступ к образовательным материалам лаборатории, систему подписок и реферальную программу.

## Особенности

- 🖥️ Терминальный интерфейс с зеленым текстом на черном фоне
- 💳 Интеграция с Telegram Payments API и Yookassa
- 🔄 Система подписок с разными уровнями доступа
- 👥 Реферальная система с бонусами
- 📚 Доступ к образовательным материалам на основе уровня подписки
- 🖱️ Интеграция с Telegram Mini Apps
- 🔧 Панель администратора для управления ботом

## Технические требования

- Node.js 16 или выше
- MongoDB 5 или выше
- Telegram Bot Token (получается через [@BotFather](https://t.me/BotFather))
- Для платежей: Telegram Payment Provider Token

## Установка

1. Клонирование репозитория:

```bash
git clone https://github.com/retarded-cafe/term-bot.git
cd term-bot
```

2. Установка зависимостей:

```bash
npm install
```

3. Настройка окружения:

Создайте файл `.env` в корне проекта и добавьте следующие переменные:

```
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token
WEBHOOK_URL=https://your-webhook-url.com  # Опционально, для webhook
WEBHOOK_PORT=8443                         # Порт для webhook сервера

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/term-bot

# Payment Configuration
PAYMENT_PROVIDER_TOKEN=your_payment_provider_token
YOOKASSA_SHOP_ID=your_yookassa_shop_id
YOOKASSA_SECRET_KEY=your_yookassa_secret_key

# Mini-App Configuration
MINI_APP_URL=https://your-mini-app-url.com

# Admin Configuration
ADMIN_USER_IDS=123456789,987654321        # Telegram ID администраторов, через запятую
```

## Запуск

### Локальный запуск

```bash
# Режим разработки с hot-reload
npm run dev

# Режим production
npm start
```

### Docker

```bash
# Сборка и запуск через docker-compose
docker-compose up -d
```

## Настройка бота в BotFather

1. Создайте нового бота в [@BotFather](https://t.me/BotFather) с помощью команды `/newbot`
2. Получите токен бота
3. Настройте команды бота:

```
start - Начать работу с ботом
help - Список доступных команд
status - Проверить статус подписки
subscribe - Управление подпиской
content - Образовательные материалы
referral - Получить реферальную ссылку
miniapp - Открыть мини-приложение
admin - Панель администратора (только для админов)
```

4. Для настройки платежей:
   - Используйте команду `/mybots`, выберите вашего бота
   - Выберите "Payments"
   - Выберите платежную систему (Yookassa или другую)
   - Следуйте инструкциям по настройке

## Структура проекта

```
term-bot/
├── src/                      # Исходный код
│   ├── config/               # Конфигурация
│   ├── middleware/           # Middleware
│   ├── models/               # Модели данных (Mongoose)
│   ├── modules/              # Модули бота
│   │   ├── admin/            # Панель администратора
│   │   ├── auth/             # Аутентификация
│   │   ├── content/          # Образовательный контент
│   │   ├── miniapp/          # Мини-приложение
│   │   └── payments/         # Платежи и подписки
│   ├── utils/                # Утилиты
│   └── index.js              # Точка входа
├── .env                      # Переменные окружения (не коммитится)
├── .gitignore                # Игнорируемые файлы
├── docker-compose.yml        # Docker Compose конфигурация
├── Dockerfile                # Docker конфигурация
├── package.json              # NPM конфигурация
└── README.md                 # Документация проекта
```

## Миниприложение

Для разработки миниприложения используйте [Telegram Mini Apps Platform](https://core.telegram.org/bots/webapps). Миниприложение должно быть размещено на HTTPS домене и соответствовать требованиям Telegram.

## Лицензия

MIT

## Контакты

Для вопросов и предложений: [Retarded Café](https://t.me/retarded_cafe) 