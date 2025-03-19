const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String,
    sparse: true
  },
  firstName: String,
  lastName: String,
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  subscription: {
    active: {
      type: Boolean,
      default: false
    },
    tier: {
      type: String,
      enum: ['monthly', 'quarterly', 'annual', 'gift', 'free'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    paymentMethod: {
      type: String,
      enum: ['telegram_stars', 'bank_card', 'gift', 'free'],
      default: 'free'
    },
    paymentHistory: [{
      amount: Number,
      currency: String,
      method: {
        type: String,
        enum: ['telegram_stars', 'bank_card']
      },
      transactionId: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // Подписки на каналы
  channelSubscriptions: [{
    channelId: {
      type: String,
      required: true
    },
    startDate: Date,
    endDate: Date,
    active: {
      type: Boolean,
      default: false
    }
  }],
  // Ожидающие подписки на каналы (для подтверждения администратором)
  pendingChannelSubscriptions: [{
    channelId: {
      type: String,
      required: true
    },
    requestDate: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  // Ожидающая подписка (для подтверждения администратором)
  pendingSubscription: {
    tierId: {
      type: String,
      enum: ['monthly', 'quarterly', 'annual']
    },
    requestDate: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  },
  referrals: {
    referredBy: {
      type: Number, // telegramId пользователя, который пригласил
      default: null
    },
    invitedUsers: [{
      telegramId: Number,
      joinDate: {
        type: Date,
        default: Date.now
      },
      hasSubscribed: {
        type: Boolean,
        default: false
      }
    }]
  },
  accessedContent: [{
    contentId: String,
    accessedAt: {
      type: Date,
      default: Date.now
    },
    completionStatus: {
      type: String,
      enum: ['started', 'in_progress', 'completed'],
      default: 'started'
    }
  }]
}, { timestamps: true });

// Метод для проверки активной подписки
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription.active) return false;
  
  // Проверяем, не истекла ли подписка
  if (this.subscription.endDate && new Date() > this.subscription.endDate) {
    this.subscription.active = false;
    return false;
  }
  
  return true;
};

// Метод для проверки активной подписки на канал
userSchema.methods.hasActiveChannelSubscription = function(channelId) {
  const subscription = this.channelSubscriptions.find(sub => sub.channelId === channelId);
  
  if (!subscription || !subscription.active) return false;
  
  // Проверяем, не истекла ли подписка
  if (subscription.endDate && new Date() > subscription.endDate) {
    subscription.active = false;
    return false;
  }
  
  return true;
};

// Метод для получения количества дней до окончания подписки
userSchema.methods.getDaysLeftInSubscription = function() {
  if (!this.hasActiveSubscription() || !this.subscription.endDate) {
    return 0;
  }
  
  // Вычисляем разницу в миллисекундах между датой окончания и текущей датой
  const endDate = new Date(this.subscription.endDate);
  const now = new Date();
  const diffMs = endDate - now;
  
  // Конвертируем миллисекунды в дни и округляем
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

// Метод для проверки наличия подписки на любой канал
userSchema.methods.hasAnyChannelSubscription = function() {
  return this.channelSubscriptions.some(sub => this.hasActiveChannelSubscription(sub.channelId));
};

// Метод для обновления подписки на канал
userSchema.methods.updateChannelSubscription = function(channelId, durationInDays) {
  // Ищем существующую подписку
  const existingSubIndex = this.channelSubscriptions.findIndex(sub => sub.channelId === channelId);
  
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationInDays);
  
  if (existingSubIndex >= 0) {
    // Обновляем существующую подписку
    this.channelSubscriptions[existingSubIndex].startDate = startDate;
    this.channelSubscriptions[existingSubIndex].endDate = endDate;
    this.channelSubscriptions[existingSubIndex].active = true;
  } else {
    // Создаем новую подписку
    this.channelSubscriptions.push({
      channelId,
      startDate,
      endDate,
      active: true
    });
  }
  
  return this;
};

// Метод для обновления данных подписки
userSchema.methods.updateSubscription = function(tier, durationInDays, paymentMethod, amount, currency, transactionId) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationInDays);
  
  // Инициализируем объект подписки с пустым массивом paymentHistory, если он не существует
  if (!this.subscription) {
    this.subscription = {
      active: false,
      tier: 'free',
      paymentHistory: []
    };
  }
  
  // Убедимся, что paymentHistory существует и является массивом
  if (!this.subscription.paymentHistory) {
    this.subscription.paymentHistory = [];
  }
  
  // Обновляем основные данные подписки
  this.subscription.active = true;
  this.subscription.tier = tier;
  this.subscription.startDate = startDate;
  this.subscription.endDate = endDate;
  this.subscription.paymentMethod = paymentMethod;
  
  // Добавляем запись о платеже, если это не бесплатная или подарочная подписка
  if (paymentMethod !== 'free' && paymentMethod !== 'gift') {
    this.subscription.paymentHistory.push({
      amount,
      currency,
      method: paymentMethod,
      transactionId,
      timestamp: startDate
    });
  }
  
  return this;
};

// Метод для обновления времени последней активности
userSchema.methods.updateLastActivity = function() {
  this.lastActivity = new Date();
  return this;
};

// Метод для добавления приглашенного пользователя
userSchema.methods.addReferral = function(referredTelegramId) {
  const existingReferral = this.referrals.invitedUsers.find(
    user => user.telegramId === referredTelegramId
  );
  
  if (!existingReferral) {
    this.referrals.invitedUsers.push({
      telegramId: referredTelegramId,
      joinDate: new Date(),
      hasSubscribed: false
    });
  }
  
  return this;
};

// Метод для отметки, что приглашенный пользователь оформил подписку
userSchema.methods.markReferralSubscribed = function(referredTelegramId) {
  const referral = this.referrals.invitedUsers.find(
    user => user.telegramId === referredTelegramId
  );
  
  if (referral) {
    referral.hasSubscribed = true;
  }
  
  return this;
};

// Метод для добавления записи о доступе к контенту
userSchema.methods.trackContentAccess = function(contentId, status = 'started') {
  const existingAccess = this.accessedContent.find(
    content => content.contentId === contentId
  );
  
  if (existingAccess) {
    existingAccess.accessedAt = new Date();
    existingAccess.completionStatus = status;
  } else {
    this.accessedContent.push({
      contentId,
      accessedAt: new Date(),
      completionStatus: status
    });
  }
  
  return this;
};

// Создаем и экспортируем модель
const User = mongoose.model('User', userSchema);
module.exports = User; 