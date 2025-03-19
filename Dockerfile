FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm ci

# Копирование исходного кода
COPY . .

# Создаем директорию для логов
RUN mkdir -p logs

# Указываем порт (для webhook)
EXPOSE 8443

# Запуск бота
CMD ["npm", "start"] 