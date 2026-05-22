const cron = require('node-cron');
const { db } = require('../database/init');
const { sendSubscribeMessage } = require('./wechat');
const config = require('../config');

function startScheduler() {
  // 每分钟检查一次
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date().toISOString();
      const nowUnix = Math.floor(Date.now() / 1000);

      // 查找需要发送提醒的记录
      const pendingReminders = db.prepare(`
        SELECT
          r.id AS reminder_id,
          r.remind_offset,
          r.todo_id,
          t.title,
          t.due_time,
          t.status,
          COALESCE(a.openid, c.openid) AS openid,
          COALESCE(a.nick_name, c.nick_name) AS nick_name
        FROM reminders r
        JOIN todos t ON r.todo_id = t.id
        LEFT JOIN users a ON t.assignee_id = a.id
        JOIN users c ON t.creator_id = c.id
        WHERE r.sent = 0
          AND t.status != 'completed'
      `).all();

      for (const item of pendingReminders) {
        const dueTime = Math.floor(new Date(item.due_time).getTime() / 1000);
        const remindAt = dueTime - item.remind_offset;

        if (nowUnix >= remindAt) {
          console.log('[Scheduler] 准备发送提醒:', JSON.stringify({
            todo_id: item.todo_id,
            title: item.title,
            due_time: item.due_time,
            remind_offset: item.remind_offset,
            openid: item.openid ? item.openid.substring(0, 8) + '...' : 'NULL',
            nick_name: item.nick_name
          }));

          // 未配置 AppID 时跳过实际发送
          if (config.WECHAT_APPID === 'your_appid_here') {
            console.log(`[Scheduler] [DEV] 提醒: "${item.title}" -> ${item.nick_name} (offset=${item.remind_offset}s)`);
          } else if (item.openid) {
            const statusMap = { pending: '未开始', in_progress: '进行中', completed: '已完成' };
            await sendSubscribeMessage(item.openid, {
              todo_id: item.todo_id,
              title: item.title.substring(0, 20),
              due_time: item.due_time,
              status_text: statusMap[item.status] || item.status,
              note: `到期时间: ${item.due_time}`
            });
            console.log(`[Scheduler] 已发送提醒: "${item.title}" -> ${item.nick_name}`);
          }

          // 标记已发送
          db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(item.reminder_id);
        }
      }
    } catch (err) {
      console.error('[Scheduler] 定时任务异常:', err);
    }
  });

  console.log('[Scheduler] 定时提醒任务已启动（每分钟检查）');
}

module.exports = { startScheduler };
