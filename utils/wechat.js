const axios = require('axios');
const config = require('../config');

// 获取 access_token（简单缓存，后续可加 Redis）
let cachedToken = null;
let tokenExpireAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpireAt) {
    return cachedToken;
  }
  const url = 'https://api.weixin.qq.com/cgi-bin/token';
  const res = await axios.get(url, {
    params: {
      grant_type: 'client_credential',
      appid: config.WECHAT_APPID,
      secret: config.WECHAT_SECRET
    }
  });
  if (res.data.errcode) {
    console.error('[Wechat] 获取 access_token 失败:', res.data);
    throw new Error(res.data.errmsg);
  }
  cachedToken = res.data.access_token;
  tokenExpireAt = Date.now() + (res.data.expires_in - 300) * 1000; // 提前5分钟刷新
  return cachedToken;
}

// 微信登录：code 换取 openid
async function code2Session(code) {
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const res = await axios.get(url, {
    params: {
      appid: config.WECHAT_APPID,
      secret: config.WECHAT_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    }
  });
  if (res.data.errcode) {
    console.error('[Wechat] code2Session 失败:', res.data);
    throw new Error(res.data.errmsg);
  }
  return res.data; // { openid, session_key, unionid? }
}

// 发送订阅消息
async function sendSubscribeMessage(openid, data) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`;
  const res = await axios.post(url, {
    touser: openid,
    template_id: config.WECHAT_TEMPLATE_ID,
    page: '/pages/detail/detail?id=' + data.todo_id,
    data: {
      thing1: { value: data.title },
      time2: { value: data.due_time },
      phrase3: { value: data.status_text },
      thing4: { value: data.note || '点击查看详情' }
    }
  });
  if (res.data.errcode !== 0) {
    console.error('[Wechat] 发送订阅消息失败:', res.data);
  }
  return res.data;
}

module.exports = { getAccessToken, code2Session, sendSubscribeMessage };
