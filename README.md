# Ikkimizning o'yinlar ❤️

Telegram orqali masofadan ikki kishi o'ynaydigan 2 ta o'yin:

1. **Don-don-ziki** (tosh, qaychi, qog'oz) — har raundga 15 soniya, 12 ochkogacha. Ikkalasi tanlasa vaqt kutilmaydi, natija darhol ochiladi. Faqat bittasi tanlasa — o'sha ochko oladi, ikkalasi ham tanlamasa ochko yo'q.
2. **4×4 kataklar** — har kim 3 ta katakka xohlagan narsasini yozadi (raqibga ko'rinmaydi). Keyin navbatma-navbat kataklar ochiladi: kimning katagi chiqsa, ochgan odam o'sha topshiriqni bajaradi.

## Ishga tushirish

Faqat Node.js 18+ kerak, hech narsa o'rnatish shart emas.

```
node server.js
```

Brauzerda `http://localhost:3000` oching. Bir kishi "Yangi xona ochish" bosadi, kodni (yoki "Telegram orqali yuborish" tugmasi bilan havolani) sevgan insoniga yuboradi, u kod bilan kiradi.

## Internetga chiqarish (Telegram uchun HTTPS kerak)

- Tez usul: kompyuteringizda `cloudflared tunnel --url http://localhost:3000` yoki `ngrok http 3000`, chiqqan `https://...` havolani yuboring.
- Doimiy: serverni Render, Railway, Fly.io yoki VPS'ga qo'ying (`node server.js`, port `PORT` o'zgaruvchisidan olinadi).

## Telegram bot (ixtiyoriy)

1. @BotFather → `/newbot` → token oling.
2. `BOT_TOKEN=... WEBAPP_URL=https://sizning-domen node bot.js`
3. Botga `/start` yozing — "O'ynash" tugmasi o'yinni Telegram ichida ochadi.
