const User = require('../models/user');
const logger = require('../utils/logger');
const config = require('../config');
const { formatters } = require('../utils/terminalFormatter');

/**
 * Middleware для идентификации пользователя
 * Создает нового пользователя, если он не найден
 */
const userIdentification = async (ctx, next) => {
  try {
    if (!ctx.from) {
      logger.warn('User context not available');
      return next();
    }

    // Поиск пользователя в базе данных
    let user = await User.findOne({ telegramId: ctx.from.id });
    
    // Если пользователь не найден, создаем нового
    if (!user) {
      user = new User({
        telegramId: ctx.from.id,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        isAdmin: config.bot.adminUserIds.includes(ctx.from.id)
      });
      
      await user.save();
      logger.info(`New user registered: ${ctx.from.id} (${ctx.from.username || 'no username'})`);
    } else {
      // Обновляем информацию о пользователе, если она изменилась
      if (user.username !== ctx.from.username || 
          user.firstName !== ctx.from.first_name || 
          user.lastName !== ctx.from.last_name) {
            
        user.username = ctx.from.username;
        user.firstName = ctx.from.first_name;
        user.lastName = ctx.from.last_name;
        await user.save();
      }
      
      // Обновляем время последней активности
      user.updateLastActivity();
      await user.save();
    }
    
    // Сохраняем пользователя в контексте для использования в других middleware и обработчиках
    ctx.user = user;
    
    return next();
  } catch (error) {
    logger.error(`Error in userIdentification middleware: ${error.message}`, { error });
    return next();
  }
};

/**
 * Middleware для проверки активной подписки
 */
const requireSubscription = async (ctx, next) => {
  if (!ctx.user) {
    logger.warn('User not available in context for subscription check');
    await ctx.reply(formatters.error('Ошибка аутентификации. Пожалуйста, попробуйте позже.'));
    return;
  }
  
  // Если пользователь администратор, пропускаем проверку подписки
  if (ctx.user.isAdmin || config.bot.adminUserIds.includes(ctx.user.telegramId)) {
    return next();
  }
  
  // Проверяем наличие активной подписки
  if (!ctx.user.hasActiveSubscription()) {
    logger.info(`Subscription required for user ${ctx.user.telegramId}`);
    await ctx.reply(
      formatters.error(config.messages.subscriptionExpired) + 
      '\n\nИспользуйте /subscribe для управления подпиской.'
    );
    return;
  }
  
  return next();
};

/**
 * Middleware для проверки прав администратора
 */
const requireAdmin = async (ctx, next) => {
  if (!ctx.user) {
    logger.warn('User not available in context for admin check');
    await ctx.reply(formatters.error('Ошибка аутентификации. Пожалуйста, попробуйте позже.'));
    return;
  }
  
  // Проверяем, является ли пользователь администратором
  if (!ctx.user.isAdmin && !config.bot.adminUserIds.includes(ctx.user.telegramId)) {
    logger.info(`Admin access attempt by non-admin user ${ctx.user.telegramId}`);
    await ctx.reply(formatters.error('У вас нет прав администратора для выполнения этого действия.'));
    return;
  }
  
  return next();
};

/**
 * Middleware для проверки доступа к определенному уровню контента
 * @param {string} requiredTier - Требуемый уровень подписки ('monthly', 'quarterly', 'annual')
 */
const requireSubscriptionTier = (requiredTier) => {
  return async (ctx, next) => {
    if (!ctx.user) {
      logger.warn('User not available in context for tier check');
      await ctx.reply(formatters.error('Ошибка аутентификации. Пожалуйста, попробуйте позже.'));
      return;
    }
    
    // Проверяем, имеет ли пользователь подписку требуемого уровня
    const tierLevels = {
      'free': 0,
      'monthly': 1,
      'quarterly': 2,
      'annual': 3
    };
    
    const userTier = ctx.user.hasActiveSubscription() ? ctx.user.subscription.tier : 'free';
    const userLevel = tierLevels[userTier] || 0;
    const requiredLevel = tierLevels[requiredTier] || 1;
    
    if (userLevel < requiredLevel) {
      logger.info(`Higher tier subscription required for user ${ctx.user.telegramId}. Has: ${userTier}, Required: ${requiredTier}`);
      await ctx.reply(
        formatters.error(`Для доступа к этому материалу требуется подписка уровня ${requiredTier} или выше.`) + 
        '\n\nИспользуйте /subscribe для управления подпиской.'
      );
      return;
    }
    
    return next();
  };
};

module.exports = {
  userIdentification,
  requireSubscription,
  requireAdmin,
  requireSubscriptionTier
}; 