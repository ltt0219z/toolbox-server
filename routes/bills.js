const express = require('express');
const { db } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// GET /api/bills/stats — 月度统计（必须在 /:id 之前）
router.get('/stats', (req, res) => {
  const { year, month, detail } = req.query;
  const userId = req.user.id;

  if (!year || !month) {
    return res.status(400).json({ code: 400, msg: '请提供 year 和 month 参数' });
  }

  const y = parseInt(year);
  const m = parseInt(month);

  const bills = db.prepare(
    'SELECT type, amount, category FROM bills WHERE user_id = ? AND year = ? AND month = ?'
  ).all(userId, y, m);

  let income = 0;
  let expense = 0;
  const categoryExpense = {};

  for (const b of bills) {
    if (b.type === 'income') {
      income += b.amount;
    } else {
      expense += b.amount;
      categoryExpense[b.category] = (categoryExpense[b.category] || 0) + b.amount;
    }
  }

  const result = {
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    categoryExpense
  };

  // 6 个月趋势
  if (detail === 'true' || detail === true) {
    const monthly = [];
    for (let i = 0; i < 6; i++) {
      let tm = m - i;
      let ty = y;
      if (tm <= 0) { tm += 12; ty -= 1; }

      const mb = db.prepare(
        'SELECT type, amount FROM bills WHERE user_id = ? AND year = ? AND month = ?'
      ).all(userId, ty, tm);

      let inc = 0, exp = 0;
      for (const b of mb) {
        if (b.type === 'income') inc += b.amount;
        else exp += b.amount;
      }
      monthly.push({
        month: `${ty}-${String(tm).padStart(2, '0')}`,
        income: inc.toFixed(2),
        expense: exp.toFixed(2)
      });
    }
    result.monthly = monthly;
  }

  res.json({ code: 0, data: result });
});

// GET /api/bills — 账单列表
router.get('/', (req, res) => {
  const { year, month, day, limit, skip } = req.query;
  const userId = req.user.id;

  let sql = 'SELECT * FROM bills WHERE user_id = ?';
  const params = [userId];

  if (year) { sql += ' AND year = ?'; params.push(parseInt(year)); }
  if (month) { sql += ' AND month = ?'; params.push(parseInt(month)); }
  if (day) { sql += ' AND day = ?'; params.push(parseInt(day)); }

  sql += ' ORDER BY bill_date DESC, created_at DESC';
  sql += ` LIMIT ${parseInt(limit) || 50} OFFSET ${parseInt(skip) || 0}`;

  const list = db.prepare(sql).all(...params);
  res.json({ code: 0, data: { list } });
});

// GET /api/bills/:id — 账单详情
router.get('/:id', (req, res) => {
  const bill = db.prepare(
    'SELECT * FROM bills WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!bill) {
    return res.status(404).json({ code: 404, msg: '账单不存在' });
  }
  res.json({ code: 0, data: { bill } });
});

// POST /api/bills — 创建账单
router.post('/', (req, res) => {
  const { type, amount, category, note, date } = req.body;

  if (!type || !amount || !category || !date) {
    return res.status(400).json({ code: 400, msg: '类型、金额、分类和日期不能为空' });
  }

  const parts = date.split('-');
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);

  const result = db.prepare(`
    INSERT INTO bills (user_id, type, amount, category, note, bill_date, year, month, day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, type, parseFloat(amount), category, note || '', date, y, m, d);

  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: '添加成功' });
});

// PUT /api/bills/:id — 更新账单
router.put('/:id', (req, res) => {
  const bill = db.prepare(
    'SELECT * FROM bills WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!bill) {
    return res.status(404).json({ code: 404, msg: '账单不存在' });
  }

  const { type, amount, category, note, date } = req.body;
  const parts = (date || bill.bill_date).split('-');

  db.prepare(`
    UPDATE bills
    SET type = ?, amount = ?, category = ?, note = ?,
        bill_date = ?, year = ?, month = ?, day = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    type || bill.type,
    amount !== undefined ? parseFloat(amount) : bill.amount,
    category || bill.category,
    note !== undefined ? note : bill.note,
    date || bill.bill_date,
    parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]),
    bill.id
  );

  res.json({ code: 0, msg: '更新成功' });
});

// DELETE /api/bills/:id — 删除账单
router.delete('/:id', (req, res) => {
  const bill = db.prepare(
    'SELECT * FROM bills WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!bill) {
    return res.status(404).json({ code: 404, msg: '账单不存在' });
  }

  db.prepare('DELETE FROM bills WHERE id = ?').run(bill.id);
  res.json({ code: 0, msg: '删除成功' });
});

module.exports = router;
