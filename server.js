const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Включаем CORS для всех запросов
app.use(cors());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Настраиваем middleware для статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для проверки статуса API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TERM Mini App API is running',
    timestamp: new Date().toISOString()
  });
});

// Маршрут по умолчанию - возвращаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] TERM Mini App server is running on http://localhost:${PORT}`);
}); 