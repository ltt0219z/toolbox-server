const express = require('express');
const config = require('./config');
const { initDatabase } = require('./database/init');
const { startScheduler } = require('./utils/scheduler');

const app = express();

// 中间件
app.use(express.json());

// 初始化数据库
initDatabase();

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/ocr', require('./routes/ocr'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 启动定时提醒
startScheduler();

const port = process.env.PORT || config.PORT;
app.listen(port, () => {
  console.log(`[Server] 服务已启动，端口: ${port}`);
});
