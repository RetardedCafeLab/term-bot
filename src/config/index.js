const path = require('path');
const fs = require('fs');

// Определяем, какой файл .env использовать
const envFile = process.env.NODE_ENV === 'local' && fs.existsSync(path.resolve(process.cwd(), '.env.local'))
  ? '.env.local'
  : '.env';

// Определяем текущее окружение
const isLocalEnv = process.env.NODE_ENV === 'local';

// Загружаем конфигурацию из соответствующего файла
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const config = {
  // Telegram Bot Config
  bot: {
    token: process.env.BOT_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL,
    webhookPort: process.env.WEBHOOK_PORT || 8443,
    useWebhook: process.env.USE_WEBHOOK === 'true',
    adminUserIds: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => Number(id)) : []
  },
  
  // Database Config
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/term-bot'
  },
  
  // Payment Config
  payment: {
    providerToken: process.env.PAYMENT_PROVIDER_TOKEN || '',
    yookassaShopId: process.env.YOOKASSA_SHOP_ID || '',
    yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY || '',
    // Проверка корректности токена Stars
    get isStarsTokenValid() {
      const token = this.providerToken;
      // XTR токен должен иметь формат: число:строка:XTR_строка
      return token && token.includes('XTR') && /^\d+:.+:XTR_.+$/.test(token);
    },
    // Информация о токене для отладки
    get tokenInfo() {
      const token = this.providerToken;
      return {
        exists: !!token,
        length: token ? token.length : 0,
        containsXTR: token ? token.includes('XTR') : false,
        isTest: token ? token.includes('TEST') : false,
        format: token ? (/^\d+:.+:XTR_.+$/.test(token) ? 'Valid' : 'Invalid') : 'None'
      };
    }
  },
  
  // Mini-App Config
  miniApp: {
    url: process.env.MINI_APP_URL
  },
  
  // Каналы для подписки - разные цены в зависимости от окружения
  channels: {
    disruptorsJournal: {
      id: 'disruptors_journal',
      name: 'Disruptor\'s Journal',
      description: 'Дневник цифрового диссидента',
      starsPrice: isLocalEnv ? 5 : 1024,
      rubPrice: isLocalEnv ? 5 : 1337,
      username: '@disruptors_journal',
      inviteLink: 'https://t.me/+Tv0FH_Nfd-c1ZmQ1',
      inviteCode: 'Tv0FH_Nfd-c1ZmQ1'
    },
    retardedCafeLab: {
      id: 'retarded_cafe_lab',
      name: 'Retarded Café Lab',
      description: 'Исследовательская лаборатория',
      starsPrice: isLocalEnv ? 7 : 1337,
      rubPrice: isLocalEnv ? 7 : 3777,
      username: '@retarded_cafe',
      inviteLink: 'https://t.me/+OtNS1cpcoNdhZWU1',
      inviteCode: 'OtNS1cpcoNdhZWU1'
    },
    digitalNomadProtocol: {
      id: 'digital_nomad_protocol',
      name: 'Digital Nomad Protocol',
      description: 'Цифровой кочевник',
      starsPrice: isLocalEnv ? 3 : 256,
      rubPrice: isLocalEnv ? 3 : 888,
      username: '@nomad_protocol'
    }
  },
  
  // Subscription Tiers - разные цены в зависимости от окружения
  subscriptionTiers: {
    monthly: {
      id: 'monthly',
      name: 'Месячная подписка',
      description: 'Базовый доступ к учебным материалам на 1 месяц',
      price: isLocalEnv ? 1 : 1000, // в рублях/Stars
      durationInDays: 30,
      features: [
        'Доступ к базовым учебным материалам',
        'Доступ к лабораторным ресурсам'
      ]
    },
    quarterly: {
      id: 'quarterly',
      name: 'Квартальная подписка',
      description: 'Расширенный доступ к учебным материалам на 3 месяца',
      price: isLocalEnv ? 3 : 2700, // в рублях/Stars, скидка 10%
      durationInDays: 90,
      features: [
        'Все преимущества месячной подписки',
        'Доступ к расширенным учебным материалам',
        'Персональные консультации (1 раз в месяц)'
      ]
    },
    annual: {
      id: 'annual',
      name: 'Годовая подписка',
      description: 'Полный доступ ко всем учебным материалам на 12 месяцев',
      price: isLocalEnv ? 10 : 9600, // в рублях/Stars, скидка 20%
      durationInDays: 365,
      features: [
        'Все преимущества квартальной подписки',
        'Доступ к премиум учебным материалам',
        'Персональные консультации (еженедельно)',
        'Приоритетная поддержка'
      ]
    }
  },
  
  // ASCII Art and Bot Messages
  asciiArt: {
    welcome: `
    ████████╗███████╗██████╗ ███╗   ███╗
    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
       ██║   █████╗  ██████╔╝██╔████╔██║
       ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
       ██║   ███████╗██║  ██║██║ ╚═╝ ██║
       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
    `,
    access: `
    [+] Доступ предоставлен
    `,
    denied: `
    [-] Доступ запрещен
    `
  },
  
  messages: {
    welcome: isLocalEnv ? 'Добро пожаловать в ТЕСТОВЫЙ терминал Retarded Café.' : 'Добро пожаловать в терминал Retarded Café.',
    help: 'Доступные команды:\n/start - Начать работу\n/help - Список команд\n/status - Статус подписки\n/access - Доступ к материалам\n/subscribe - Управление подпиской',
    accessDenied: 'У вас нет доступа к этому ресурсу. Пожалуйста, оформите подписку с помощью команды /subscribe.',
    subscriptionExpired: 'Ваша подписка истекла. Пожалуйста, обновите подписку с помощью команды /subscribe.'
  }
};

// Логирование среды и цен для отладки
if (isLocalEnv) {
  console.log('Running in LOCAL environment with test prices:');
  console.log(`Monthly subscription: ${config.subscriptionTiers.monthly.price} Stars`);
  console.log(`Quarterly subscription: ${config.subscriptionTiers.quarterly.price} Stars`);
  console.log(`Annual subscription: ${config.subscriptionTiers.annual.price} Stars`);
}

module.exports = config; 