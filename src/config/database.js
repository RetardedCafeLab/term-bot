const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./index');

// Опции подключения к MongoDB
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

/**
 * Инициализация соединения с базой данных
 */
async function connectToDatabase() {
  try {
    await mongoose.connect(config.db.uri, mongoOptions);
    logger.info('Successfully connected to MongoDB');
    
    // Обработка событий соединения
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
      setTimeout(connectToDatabase, 5000);
    });
    
    // Правильное закрытие соединения при завершении процесса
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed due to app termination');
      process.exit(0);
    });
    
    return mongoose.connection;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    // Пробуем переподключиться через некоторое время
    setTimeout(connectToDatabase, 5000);
    return null;
  }
}

module.exports = { connectToDatabase }; 