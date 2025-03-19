const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['article', 'video', 'course', 'repository', 'resource'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  accessLevel: {
    type: String,
    enum: ['free', 'monthly', 'quarterly', 'annual'],
    default: 'monthly'
  },
  githubRepo: String,
  previewText: String,
  fullContent: String,
  externalUrl: String,
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  publishedAt: Date,
  isPublished: {
    type: Boolean,
    default: false
  },
  author: {
    name: String,
    telegramId: Number
  },
  relatedContent: [{
    contentId: String,
    relationship: {
      type: String,
      enum: ['prerequisite', 'related', 'next', 'advanced']
    }
  }],
  stats: {
    views: {
      type: Number,
      default: 0
    },
    completions: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    ratings: [{
      userId: Number,
      rating: Number,
      comment: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  }
});

// Метод для проверки доступа к контенту на основе уровня подписки пользователя
contentSchema.methods.isAccessibleTo = function(userSubscriptionTier) {
  const tierLevels = {
    'free': 0,
    'monthly': 1,
    'quarterly': 2,
    'annual': 3
  };
  
  const contentLevel = tierLevels[this.accessLevel] || 0;
  const userLevel = tierLevels[userSubscriptionTier] || 0;
  
  return userLevel >= contentLevel;
};

// Метод для увеличения счетчика просмотров
contentSchema.methods.incrementViews = function() {
  this.stats.views += 1;
  return this;
};

// Метод для увеличения счетчика завершений
contentSchema.methods.incrementCompletions = function() {
  this.stats.completions += 1;
  return this;
};

// Метод для добавления оценки
contentSchema.methods.addRating = function(userId, rating, comment = '') {
  // Проверяем, оставлял ли пользователь уже оценку
  const existingRatingIndex = this.stats.ratings.findIndex(r => r.userId === userId);
  
  if (existingRatingIndex !== -1) {
    // Обновляем существующую оценку
    this.stats.ratings[existingRatingIndex] = {
      userId,
      rating,
      comment,
      timestamp: new Date()
    };
  } else {
    // Добавляем новую оценку
    this.stats.ratings.push({
      userId,
      rating,
      comment,
      timestamp: new Date()
    });
  }
  
  // Пересчитываем среднюю оценку
  this.recalculateAverageRating();
  
  return this;
};

// Вспомогательный метод для пересчета средней оценки
contentSchema.methods.recalculateAverageRating = function() {
  if (this.stats.ratings.length === 0) {
    this.stats.averageRating = 0;
    return;
  }
  
  const sum = this.stats.ratings.reduce((acc, r) => acc + r.rating, 0);
  this.stats.averageRating = sum / this.stats.ratings.length;
};

// Метод для получения превью контента
contentSchema.methods.getPreview = function() {
  return {
    id: this.id,
    title: this.title,
    description: this.description,
    type: this.type,
    accessLevel: this.accessLevel,
    previewText: this.previewText,
    publishedAt: this.publishedAt,
    stats: {
      views: this.stats.views,
      completions: this.stats.completions,
      averageRating: this.stats.averageRating
    }
  };
};

// Создаем и экспортируем модель
const Content = mongoose.model('Content', contentSchema);
module.exports = Content; 