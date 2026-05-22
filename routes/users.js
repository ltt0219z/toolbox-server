const express = require('express');
const { db } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — 用户列表（供选择责任人）
// 支持 ?search=关键词 搜索昵称，默认最多返回 50 条
router.get('/', authMiddleware, (req, res) => {
  const { search, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 50, 200);

  let sql = 'SELECT id, nick_name, avatar_url FROM users';
  const params = [];

  if (search) {
    sql += ' WHERE nick_name LIKE ?';
    params.push('%' + search + '%');
  }

  sql += ' ORDER BY id LIMIT ?';
  params.push(maxLimit);

  const users = db.prepare(sql).all(...params);
  res.json({ code: 0, data: users });
});

// PUT /api/users/profile — 更新个人资料
router.put('/profile', authMiddleware, (req, res) => {
  const { nick_name, avatar_url } = req.body;
  if (!nick_name || !nick_name.trim()) {
    return res.status(400).json({ code: 400, msg: '昵称不能为空' });
  }
  db.prepare('UPDATE users SET nick_name = ?, avatar_url = ? WHERE id = ?')
    .run(nick_name.trim(), avatar_url || '', req.user.id);
  res.json({ code: 0, msg: '更新成功' });
});

// GET /api/users/me — 当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT id, nick_name, avatar_url FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ code: 0, data: user });
});

module.exports = router;
