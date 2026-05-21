const express = require('express');
const { db } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const DEFAULT_CATEGORIES = [
  { name: '餐饮', type: 'expense' },
  { name: '交通', type: 'expense' },
  { name: '购物', type: 'expense' },
  { name: '娱乐', type: 'expense' },
  { name: '医疗', type: 'expense' },
  { name: '居家', type: 'expense' },
  { name: '工资', type: 'income' },
  { name: '理财', type: 'income' },
  { name: '其他', type: 'expense' }
];

// GET /api/categories — 分类列表（首次自动填充默认值）
router.get('/', (req, res) => {
  const userId = req.user.id;

  let list = db.prepare(
    'SELECT * FROM categories WHERE user_id = ?'
  ).all(userId);

  if (list.length === 0) {
    const insert = db.prepare(
      'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)'
    );
    for (const cat of DEFAULT_CATEGORIES) {
      insert.run(userId, cat.name, cat.type);
    }
    list = db.prepare(
      'SELECT * FROM categories WHERE user_id = ?'
    ).all(userId);
  }

  res.json({ code: 0, data: { list } });
});

// POST /api/categories — 添加分类
router.post('/', (req, res) => {
  const { name, type } = req.body;

  if (!name) {
    return res.status(400).json({ code: 400, msg: '分类名称不能为空' });
  }

  const result = db.prepare(
    'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)'
  ).run(req.user.id, name, type || 'expense');

  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: '添加成功' });
});

// DELETE /api/categories/:id — 删除分类
router.delete('/:id', (req, res) => {
  const cat = db.prepare(
    'SELECT * FROM categories WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!cat) {
    return res.status(404).json({ code: 404, msg: '分类不存在' });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  res.json({ code: 0, msg: '删除成功' });
});

module.exports = router;
