const express = require('express');
const { db } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 所有接口都需要登录
router.use(authMiddleware);

// GET /api/todos — 待办列表
router.get('/', (req, res) => {
  const { status, assignee_id } = req.query;
  const userId = req.user.id;

  let sql = `
    SELECT t.*,
      c.nick_name AS creator_name,
      a.nick_name AS assignee_name,
      GROUP_CONCAT(r.remind_offset) AS reminder_offsets
    FROM todos t
    LEFT JOIN users c ON t.creator_id = c.id
    LEFT JOIN users a ON t.assignee_id = a.id
    LEFT JOIN reminders r ON r.todo_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  } else {
    // 默认不显示已完成的
    sql += " AND t.status != 'completed'";
  }

  if (assignee_id) {
    sql += ' AND t.assignee_id = ?';
    params.push(assignee_id);
  }

  sql += ' GROUP BY t.id ORDER BY t.due_time ASC';

  const todos = db.prepare(sql).all(...params);
  const list = todos.map((t) => ({
    ...t,
    reminders: t.reminder_offsets
      ? t.reminder_offsets.split(',').map(Number)
      : [],
    can_edit: t.creator_id === userId,
    can_delete: t.creator_id === userId,
    can_complete: t.creator_id === userId || t.assignee_id === userId,
    can_reassign: t.creator_id === userId
  }));

  res.json({ code: 0, data: list });
});

// GET /api/todos/:id — 待办详情
router.get('/:id', (req, res) => {
  const userId = req.user.id;
  const todo = db.prepare(`
    SELECT t.*,
      c.nick_name AS creator_name,
      a.nick_name AS assignee_name
    FROM todos t
    LEFT JOIN users c ON t.creator_id = c.id
    LEFT JOIN users a ON t.assignee_id = a.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!todo) {
    return res.status(404).json({ code: 404, msg: '待办不存在' });
  }

  const reminders = db.prepare(
    'SELECT * FROM reminders WHERE todo_id = ?'
  ).all(req.params.id);

  res.json({
    code: 0,
    data: {
      ...todo,
      reminders,
      can_edit: todo.creator_id === userId,
      can_delete: todo.creator_id === userId,
      can_complete: todo.creator_id === userId || todo.assignee_id === userId,
      can_reassign: todo.creator_id === userId
    }
  });
});

// POST /api/todos — 创建待办
router.post('/', (req, res) => {
  const { title, description, assignee_id, start_time, due_time, reminders } = req.body;

  if (!title || !due_time) {
    return res.status(400).json({ code: 400, msg: '标题和到期时间不能为空' });
  }

  const result = db.prepare(`
    INSERT INTO todos (title, description, creator_id, assignee_id, start_time, due_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, description || '', req.user.id, assignee_id || null, start_time || null, due_time);

  const todoId = result.lastInsertRowid;

  // 插入提醒设置
  if (reminders && Array.isArray(reminders)) {
    const insertReminder = db.prepare(
      'INSERT INTO reminders (todo_id, remind_offset) VALUES (?, ?)'
    );
    for (const offset of reminders) {
      insertReminder.run(todoId, offset);
    }
  }

  res.json({ code: 0, data: { id: todoId }, msg: '创建成功' });
});

// PUT /api/todos/:id — 编辑待办（仅创建者）
router.put('/:id', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) {
    return res.status(404).json({ code: 404, msg: '待办不存在' });
  }
  if (todo.creator_id !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '只有创建者可以编辑' });
  }

  const { title, description, assignee_id, start_time, due_time, reminders } = req.body;

  db.prepare(`
    UPDATE todos
    SET title = ?, description = ?, assignee_id = ?, start_time = ?, due_time = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || todo.title,
    description !== undefined ? description : todo.description,
    assignee_id !== undefined ? assignee_id : todo.assignee_id,
    start_time !== undefined ? start_time : todo.start_time,
    due_time || todo.due_time,
    todo.id
  );

  // 更新提醒：先删后插
  if (reminders && Array.isArray(reminders)) {
    db.prepare('DELETE FROM reminders WHERE todo_id = ?').run(todo.id);
    const insertReminder = db.prepare(
      'INSERT INTO reminders (todo_id, remind_offset) VALUES (?, ?)'
    );
    for (const offset of reminders) {
      insertReminder.run(todo.id, offset);
    }
  }

  res.json({ code: 0, msg: '更新成功' });
});

// DELETE /api/todos/:id — 删除待办（仅创建者）
router.delete('/:id', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) {
    return res.status(404).json({ code: 404, msg: '待办不存在' });
  }
  if (todo.creator_id !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '只有创建者可以删除' });
  }

  db.prepare('DELETE FROM todos WHERE id = ?').run(todo.id);
  res.json({ code: 0, msg: '删除成功' });
});

// PATCH /api/todos/:id/status — 更新完成状态（创建者/责任人）
router.patch('/:id/status', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) {
    return res.status(404).json({ code: 404, msg: '待办不存在' });
  }
  if (todo.creator_id !== req.user.id && todo.assignee_id !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '只有创建者或责任人可以更新状态' });
  }

  const { status } = req.body;
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ code: 400, msg: '无效的状态值' });
  }

  db.prepare('UPDATE todos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, todo.id);
  res.json({ code: 0, msg: '状态更新成功' });
});

// PATCH /api/todos/:id/assignee — 重新指派（仅创建者）
router.patch('/:id/assignee', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) {
    return res.status(404).json({ code: 404, msg: '待办不存在' });
  }
  if (todo.creator_id !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '只有创建者可以重新指派' });
  }

  const { assignee_id } = req.body;
  db.prepare('UPDATE todos SET assignee_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(assignee_id, todo.id);
  res.json({ code: 0, msg: '指派成功' });
});

module.exports = router;
