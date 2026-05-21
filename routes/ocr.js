const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.use(authMiddleware);

// POST /api/ocr — 上传小票图片，返回提取的金额和日期
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: '请上传图片' });
  }

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64 = imageBuffer.toString('base64');

    let ocrText = '';

    // 开发模式：未配置腾讯云密钥时返回模拟数据
    if (
      config.TENCENT_SECRET_ID === 'your_tencent_secret_id' ||
      config.TENCENT_SECRET_KEY === 'your_tencent_secret_key'
    ) {
      console.log('[OCR] 开发模式 — 未配置腾讯云密钥，返回模拟数据');
      ocrText = '模拟OCR文本 合计 0.00 2024-01-01';
    } else {
      // 调用腾讯云通用 OCR API
      const crypto = require('crypto');

      const timestamp = Math.floor(Date.now() / 1000);
      const date = new Date(timestamp * 1000).toISOString().split('T')[0];
      const service = 'ocr';
      const host = 'ocr.tencentcloudapi.com';
      const action = 'GeneralBasicOCR';
      const version = '2018-11-19';

      const payload = JSON.stringify({ ImageBase64: base64 });
      const signedHeaders = 'content-type;host';
      const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');

      const httpRequestMethod = 'POST';
      const canonicalUri = '/';
      const canonicalQueryString = '';
      const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
      const canonicalRequest = [
        httpRequestMethod, canonicalUri, canonicalQueryString,
        canonicalHeaders, signedHeaders, hashedRequestPayload
      ].join('\n');

      const algorithm = 'TC3-HMAC-SHA256';
      const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
      const credentialScope = `${date}/${service}/tc3_request`;
      const stringToSign = [
        algorithm, timestamp, credentialScope, hashedCanonicalRequest
      ].join('\n');

      const kDate = crypto.createHmac('sha256', `TC3${config.TENCENT_SECRET_KEY}`).update(date).digest();
      const kService = crypto.createHmac('sha256', kDate).update(service).digest();
      const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
      const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      const authorization = `${algorithm} Credential=${config.TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const axios = require('axios');
      const ocrRes = await axios.post(`https://${host}`, payload, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Host: host,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': String(timestamp),
          Authorization: authorization
        }
      });

      ocrText = (ocrRes.data.Response.TextDetections || [])
        .map((t) => t.DetectedText)
        .join(' ');
    }

    // 解析金额
    let amount = null;
    const amountMatch = ocrText.match(
      /(?:合计|总计|实付|金额)[：:\s]*[¥￥]?\s*(\d+\.?\d*)/
    );
    if (amountMatch) {
      amount = parseFloat(amountMatch[1]);
    }

    // 解析日期
    let billDate = null;
    const dateMatch = ocrText.match(
      /(\d{4})[年-](\d{1,2})[月-](\d{1,2})/
    );
    if (dateMatch) {
      billDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
    }

    res.json({
      code: 0,
      data: { amount, date: billDate, rawText: ocrText }
    });
  } catch (e) {
    console.error('[OCR] 识别失败:', e.message);
    res.json({ code: 0, data: { amount: null, date: null, rawText: '', error: e.message } });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
