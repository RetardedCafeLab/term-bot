const { Composer, Markup } = require('telegraf');
const Content = require('../../models/content');
const User = require('../../models/user');
const logger = require('../../utils/logger');
const config = require('../../config');
const { formatters } = require('../../utils/terminalFormatter');
const { requireSubscription } = require('../../middleware/auth');

const contentModule = new Composer();

// Требуем наличие подписки для доступа к контенту
contentModule.use(requireSubscription);

// Команда /content - список доступных образовательных материалов
contentModule.command('content', async (ctx) => {
  try {
    // Получаем уровень подписки пользователя
    const userSubscriptionTier = ctx.user.subscription.tier;
    
    // Получаем категории контента
    const categories = await Content.distinct('category');
    
    if (categories.length === 0) {
      await ctx.reply(formatters.info('В настоящее время нет доступных образовательных материалов.'));
      return;
    }
    
    // Создаем клавиатуру с категориями
    const categoryButtons = categories.map(category => [
      Markup.button.callback(category, `content_category_${category}`)
    ]);
    
    // Добавляем кнопку для просмотра всего контента
    categoryButtons.push([Markup.button.callback('Все материалы', 'content_all')]);
    
    const keyboard = Markup.inlineKeyboard(categoryButtons);
    
    await ctx.reply(
      formatters.info('Выберите категорию образовательного контента:'),
      keyboard
    );
  } catch (error) {
    logger.error(`Error in content command handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении списка материалов. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик выбора категории
contentModule.action(/^content_category_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const category = ctx.match[1];
    await showContentList(ctx, { category });
  } catch (error) {
    logger.error(`Error in content category handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении материалов категории. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для просмотра всего контента
contentModule.action('content_all', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await showContentList(ctx);
  } catch (error) {
    logger.error(`Error in content all handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении всех материалов. Пожалуйста, попробуйте позже.'));
  }
});

// Функция для отображения списка контента
async function showContentList(ctx, filter = {}) {
  // Получаем уровень подписки пользователя
  const userSubscriptionTier = ctx.user.subscription.tier;
  
  // Создаем фильтр для поиска контента
  const query = {
    ...filter,
    isPublished: true
  };
  
  // Получаем контент
  const content = await Content.find(query).sort({ createdAt: -1 });
  
  if (content.length === 0) {
    const categoryText = filter.category ? ` в категории "${filter.category}"` : '';
    await ctx.editMessageText(
      formatters.info(`Нет доступных материалов${categoryText}.`),
      Markup.inlineKeyboard([
        Markup.button.callback('« Назад к категориям', 'back_to_categories')
      ])
    );
    return;
  }
  
  // Формируем список контента, доступного пользователю
  let contentText = 'Доступные материалы:\n\n';
  const contentButtons = [];
  
  for (const item of content) {
    // Проверяем, доступен ли контент с учетом уровня подписки
    const isAccessible = item.isAccessibleTo(userSubscriptionTier);
    
    // Добавляем информацию о материале
    contentText += `${isAccessible ? '📌' : '🔒'} ${item.title}\n`;
    contentText += `Тип: ${getContentTypeText(item.type)}\n`;
    contentText += `Уровень доступа: ${getSubscriptionTierText(item.accessLevel)}\n`;
    
    if (!isAccessible) {
      contentText += '⚠️ Требуется подписка более высокого уровня\n';
    }
    
    contentText += `\n`;
    
    // Добавляем кнопку для доступа к материалу (только если доступен)
    if (isAccessible) {
      contentButtons.push([
        Markup.button.callback(`Открыть: ${item.title}`, `content_view_${item.id}`)
      ]);
    }
  }
  
  // Добавляем кнопку "Назад к категориям"
  contentButtons.push([
    Markup.button.callback('« Назад к категориям', 'back_to_categories')
  ]);
  
  // Если есть недоступные материалы, добавляем информацию о повышении уровня подписки
  if (content.some(item => !item.isAccessibleTo(userSubscriptionTier))) {
    contentText += '🔍 Для доступа к материалам, отмеченным 🔒, необходима подписка более высокого уровня.\n';
    contentText += 'Используйте /subscribe для повышения уровня подписки.';
  }
  
  await ctx.editMessageText(
    contentText,
    Markup.inlineKeyboard(contentButtons)
  );
}

// Обработчик для просмотра конкретного материала
contentModule.action(/^content_view_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const contentId = ctx.match[1];
    const content = await Content.findOne({ id: contentId });
    
    if (!content) {
      await ctx.reply(formatters.error('Материал не найден.'));
      return;
    }
    
    // Проверяем доступ к материалу
    if (!content.isAccessibleTo(ctx.user.subscription.tier)) {
      await ctx.reply(
        formatters.error(`Для доступа к этому материалу требуется подписка уровня ${content.accessLevel} или выше.`) +
        '\n\nИспользуйте /subscribe для повышения уровня подписки.'
      );
      return;
    }
    
    // Увеличиваем счетчик просмотров
    content.incrementViews();
    await content.save();
    
    // Отслеживаем доступ пользователя к контенту
    ctx.user.trackContentAccess(contentId);
    await ctx.user.save();
    
    // Формируем сообщение с контентом
    let contentText = `# ${content.title}\n\n`;
    
    if (content.description) {
      contentText += `${content.description}\n\n`;
    }
    
    // В зависимости от типа контента, отображаем разное содержимое
    switch (content.type) {
      case 'article':
        // Для статей отправляем полное содержимое
        contentText += content.fullContent || 'Содержимое статьи отсутствует.';
        break;
        
      case 'video':
        // Для видео отправляем ссылку
        contentText += `${content.previewText || ''}\n\n`;
        contentText += `Ссылка на видео: ${content.externalUrl}`;
        break;
        
      case 'repository':
        // Для репозиториев отправляем ссылку на GitHub
        contentText += `${content.previewText || ''}\n\n`;
        contentText += `Репозиторий GitHub: ${content.githubRepo}`;
        break;
        
      case 'course':
        // Для курсов отправляем превью и ссылку
        contentText += `${content.previewText || ''}\n\n`;
        contentText += `Ссылка на курс: ${content.externalUrl}`;
        break;
        
      case 'resource':
        // Для других ресурсов отправляем описание и ссылку
        contentText += `${content.previewText || ''}\n\n`;
        contentText += `Ссылка на ресурс: ${content.externalUrl}`;
        break;
    }
    
    // Создаем клавиатуру с опциями
    const contentKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Отметить как прочитанное', `content_complete_${contentId}`)],
      [Markup.button.callback('« Назад к списку материалов', 'back_to_content_list')]
    ]);
    
    await ctx.reply(contentText, contentKeyboard);
  } catch (error) {
    logger.error(`Error in content view handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при получении материала. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для отметки материала как прочитанного
contentModule.action(/^content_complete_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const contentId = ctx.match[1];
    const content = await Content.findOne({ id: contentId });
    
    if (!content) {
      await ctx.reply(formatters.error('Материал не найден.'));
      return;
    }
    
    // Обновляем статус прохождения материала у пользователя
    ctx.user.trackContentAccess(contentId, 'completed');
    await ctx.user.save();
    
    // Увеличиваем счетчик завершений у материала
    content.incrementCompletions();
    await content.save();
    
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Отмечено как прочитанное', 'content_already_completed')],
        [Markup.button.callback('« Назад к списку материалов', 'back_to_content_list')]
      ]).reply_markup
    );
    
    await ctx.reply(formatters.success('Материал отмечен как прочитанный!'));
  } catch (error) {
    logger.error(`Error in content complete handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка при отметке материала. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для предотвращения повторных нажатий на кнопку "Отмечено как прочитанное"
contentModule.action('content_already_completed', async (ctx) => {
  await ctx.answerCbQuery('Вы уже отметили этот материал как прочитанный.');
});

// Обработчик для возврата к списку категорий
contentModule.action('back_to_categories', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем категории контента
    const categories = await Content.distinct('category');
    
    // Создаем клавиатуру с категориями
    const categoryButtons = categories.map(category => [
      Markup.button.callback(category, `content_category_${category}`)
    ]);
    
    // Добавляем кнопку для просмотра всего контента
    categoryButtons.push([Markup.button.callback('Все материалы', 'content_all')]);
    
    const keyboard = Markup.inlineKeyboard(categoryButtons);
    
    await ctx.editMessageText(
      formatters.info('Выберите категорию образовательного контента:'),
      keyboard
    );
  } catch (error) {
    logger.error(`Error in back to categories handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Обработчик для возврата к списку материалов
contentModule.action('back_to_content_list', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Возвращаемся к общему списку материалов
    await showContentList(ctx);
  } catch (error) {
    logger.error(`Error in back to content list handler: ${error.message}`, { error });
    await ctx.reply(formatters.error('Произошла ошибка. Пожалуйста, попробуйте позже.'));
  }
});

// Вспомогательные функции для форматирования текста
function getContentTypeText(type) {
  const typeMap = {
    'article': 'Статья',
    'video': 'Видео',
    'repository': 'Репозиторий',
    'course': 'Курс',
    'resource': 'Ресурс'
  };
  
  return typeMap[type] || type;
}

function getSubscriptionTierText(tier) {
  const tierMap = {
    'free': 'Бесплатный',
    'monthly': 'Месячная подписка',
    'quarterly': 'Квартальная подписка',
    'annual': 'Годовая подписка'
  };
  
  return tierMap[tier] || tier;
}

module.exports = contentModule; 