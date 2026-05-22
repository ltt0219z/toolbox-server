module.exports = {
  // 微信小程序配置（后续填入真实值）
  WECHAT_APPID: 'wx276e67fd1902494a',
  WECHAT_SECRET: 'ac219833a9017c5f10258c68b025e911',
  WECHAT_TEMPLATE_ID: 's41MRdvJvx1hCDJEf8PaqpsCiq01R_d7GoEzQEGHEo8',

  // JWT 密钥（生产环境请更换）
  JWT_SECRET: 'todo_app_jwt_secret_' + Date.now(),
  JWT_EXPIRES_IN: '7d',

  // 服务配置
  PORT: 3000,
  DB_PATH: './database/data.db',

  // 腾讯云 OCR 配置（后续填入真实值）
  TENCENT_SECRET_ID: 'your_tencent_secret_id',
  TENCENT_SECRET_KEY: 'your_tencent_secret_key'
};
