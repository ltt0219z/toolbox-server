const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../database/init');
const { code2Session } = require('../utils/wechat');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { code, nick_name, avatar_url } = req.body;
    if (!code) {
      return res.status(400).json({ code: 400, msg: '缺少登录凭证' });
    }

    // 开发模式：如果没有配置 AppID，使用 mock 登录
    let openid;
    if (config.WECHAT_APPID === 'your_appid_here') {
      openid = 'dev_' + (nick_name || 'user');
      console.log('[Auth] 开发模式登录:', openid);
    } else {
      const session = await code2Session(code);
      openid = session.openid;
    }

    // 查找或创建用户
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const info = db.prepare(
        'INSERT INTO users (openid, nick_name, avatar_url) VALUES (?, ?, ?)'
      ).run(openid, nick_name || '', avatar_url || '');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else if (nick_name) {
      db.prepare('UPDATE users SET nick_name = ?, avatar_url = ? WHERE id = ?')
        .run(nick_name, avatar_url || '', user.id);
    }

    const token = jwt.sign(
      { id: user.id, openid: user.openid },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.json({
      code: 0,
      data: {
        token,
        user: {
          id: user.id,
          nick_name: user.nick_name,
          avatar_url: user.avatar_url
        }
      }
    });
  } catch (err) {
    console.error('[Auth] 登录失败:', err);
    res.status(500).json({ code: 500, msg: err.message || '登录失败' });
  }
});

// GET /api/auth/check  — 检查登录状态
router.get('/check', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, nick_name, avatar_url FROM users WHERE id = ?').get(req.user.id);
  res.json({ code: 0, data: user });
});

module.exports = router;
