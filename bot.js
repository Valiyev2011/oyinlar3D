// Oddiy Telegram bot (paketsiz). Ishga tushirish:
//   BOT_TOKEN=123:ABC WEBAPP_URL=https://sizning-domen.uz node bot.js
// Bot /start bosilganda o'yinni ochadigan tugma yuboradi.
const https = require('https');

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
if (!TOKEN || !WEBAPP_URL) {
  console.error('BOT_TOKEN va WEBAPP_URL (https://...) kerak');
  process.exit(1);
}

function api(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let s = ''; res.on('data', (d) => (s += d));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function loop() {
  let offset = 0;
  for (;;) {
    try {
      const r = await api('getUpdates', { offset, timeout: 30 });
      for (const u of r.result || []) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m || !m.text) continue;
        await api('sendMessage', {
          chat_id: m.chat.id,
          text: 'Ikkimizning o\'yinlar ❤️\nTugmani bosing va xona oching, so\'ng kodni sevgan insoningizga yuboring.',
          reply_markup: { inline_keyboard: [[{ text: '🎮 O\'ynash', web_app: { url: WEBAPP_URL } }]] },
        });
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
loop();
