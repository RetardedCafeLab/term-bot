/**
 * Скрипт-планировщик для запуска задач по расписанию
 * Используется node-cron для запуска задач
 */

const cron = require('node-cron');
const { checkExpiringSubscriptions } = require('./checkExpiringSubscriptions');
const logger = require('../utils/logger');

// Задачи и их расписание
const scheduledTasks = [
  {
    name: 'Check Expiring Subscriptions',
    schedule: '0 12 * * *', // Ежедневно в 12:00
    task: checkExpiringSubscriptions,
    enabled: true
  }
  // Здесь можно добавить другие регулярные задачи
];

/**
 * Запускает все активные задачи по расписанию
 */
function startScheduler() {
  logger.info('Starting scheduler...');
  
  scheduledTasks.forEach(task => {
    if (!task.enabled) {
      logger.info(`Task '${task.name}' is disabled, skipping`);
      return;
    }
    
    if (!cron.validate(task.schedule)) {
      logger.error(`Invalid cron schedule for task '${task.name}': ${task.schedule}`);
      return;
    }
    
    logger.info(`Scheduling task '${task.name}' with schedule: ${task.schedule}`);
    
    cron.schedule(task.schedule, async () => {
      try {
        logger.info(`Executing scheduled task: ${task.name}`);
        const result = await task.task();
        
        if (result.success) {
          logger.info(`Task '${task.name}' completed successfully`, { result });
        } else {
          logger.error(`Task '${task.name}' failed`, { error: result.error });
        }
      } catch (error) {
        logger.error(`Error executing task '${task.name}': ${error.message}`, { error });
      }
    });
  });
  
  logger.info(`Scheduler started with ${scheduledTasks.filter(t => t.enabled).length} active tasks`);
}

// Если скрипт запущен напрямую (не импортирован)
if (require.main === module) {
  startScheduler();
}

module.exports = { startScheduler }; 