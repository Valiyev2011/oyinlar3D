// Ikkimizning o'yinlar — server (hech qanday paket kerak emas, faqat Node.js 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const WIN_SCORE = 12;      // nechta ochkoga o'ynaladi
const ROUND_MS = 15000;    // bir raund vaqti
const REVEAL_MS = 3000;    // natija ko'rsatilish vaqti
const BEATS = { tosh: 'qaychi', qaychi: 'qogoz', qogoz: 'tosh' };
const CHOICES = Object.keys(BEATS);

const rooms = new Map();

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 4 }, () => abc[crypto.randomInt(abc.length)]).join('');
  } while (rooms.has(c));
  return c;
}

function newRoom(name) {
  const room = {
    code: makeCode(),
    players: [],
    game: null,
    rps: null,
    cards: null,
    last: Date.now(),
  };
  addPlayer(room, name);
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, name) {
  const p = {
    id: crypto.randomBytes(8).toString('hex'),
    name: String(name || 'O\'yinchi').trim().slice(0, 20) || 'O\'yinchi',
    res: null,
  };
  room.players.push(p);
  return p;
}

// ---------- Don-don-ziki (tosh, qaychi, qog'oz) ----------
function startRps(room) {
  room.rps = { round: 1, scores: [0, 0], picks: [null, null], phase: 'pick', deadline: 0, last: null, timer: null };
  startRound(room);
}

function startRound(room) {
  const r = room.rps;
  r.picks = [null, null];
  r.phase = 'pick';
  r.last = null;
  r.deadline = Date.now() + ROUND_MS;
  clearTimeout(r.timer);
  r.timer = setTimeout(() => resolveRound(room, 'timeout'), ROUND_MS + 50);
  broadcast(room);
}

function resolveRound(room, why) {
  const r = room.rps;
  if (!r || r.phase !== 'pick') return;
  clearTimeout(r.timer);
  const [a, b] = r.picks;
  let winner = -1;
  if (a && b) {
    if (a !== b) winner = BEATS[a] === b ? 0 : 1;
  } else if (a || b) {
    winner = a ? 0 : 1; // vaqt tugadi: faqat tanlagan odam ochko oladi
  }
  if (winner >= 0) r.scores[winner]++;
  r.last = { picks: [a, b], winner, why };
  if (r.scores[0] >= WIN_SCORE || r.scores[1] >= WIN_SCORE) {
    r.phase = 'over';
  } else {
    r.phase = 'reveal';
    r.timer = setTimeout(() => { r.round++; startRound(room); }, REVEAL_MS);
  }
  broadcast(room);
}

// ---------- 4x4 kataklar ----------
function startCards(room) {
  room.cards = { phase: 'write', secrets: [[], []], ready: [false, false], opened: [], turn: 0 };
}

function secretCellCount(c) {
  return new Set([...c.secrets[0], ...c.secrets[1]].map((s) => s.cell)).size;
}

// ---------- Ko'rinish (har bir o'yinchiga faqat o'ziga ruxsat etilgani) ----------
function view(room, i) {
  const v = {
    code: room.code,
    you: i,
    players: room.players.map((p) => ({ name: p.name, connected: !!p.res })),
    game: room.game,
    serverNow: Date.now(),
  };
  if (room.game === 'rps' && room.rps) {
    const r = room.rps;
    v.rps = {
      round: r.round,
      scores: r.scores,
      phase: r.phase,
      deadline: r.deadline,
      myPick: r.picks[i],
      oppPicked: r.picks[1 - i] !== null,
      last: r.last,
      winScore: WIN_SCORE,
    };
  }
  if (room.game === 'cards' && room.cards) {
    const c = room.cards;
    v.cards = {
      phase: c.phase,
      myReady: c.ready[i],
      oppReady: c.ready[1 - i],
      mine: c.secrets[i],
      opened: c.opened,
      turn: c.turn,
      all: c.phase === 'over' ? c.secrets : null,
    };
  }
  return v;
}

function broadcast(room) {
  room.last = Date.now();
  room.players.forEach((p, i) => {
    if (p.res) p.res.write(`data: ${JSON.stringify(view(room, i))}\n\n`);
  });
}

// ---------- Harakatlar ----------
function handleAction(room, i, type, data) {
  data = data || {};
  if (type === 'choose') {
    if (room.players.length < 2) return 'Ikkinchi o\'yinchi hali kirmadi';
    if (data.game === 'rps') { room.game = 'rps'; startRps(room); }
    else if (data.game === 'cards') { room.game = 'cards'; startCards(room); }
    else return 'Noto\'g\'ri o\'yin';
  } else if (type === 'menu') {
    if (room.rps) clearTimeout(room.rps.timer);
    room.game = null; room.rps = null; room.cards = null;
  } else if (type === 'rps-pick') {
    const r = room.rps;
    if (room.game !== 'rps' || !r || r.phase !== 'pick') return 'Hozir tanlab bo\'lmaydi';
    if (!CHOICES.includes(data.choice) || r.picks[i]) return 'Xato';
    r.picks[i] = data.choice;
    if (r.picks[0] && r.picks[1]) { resolveRound(room, 'both'); return null; } // ikkalasi tanlasa — vaqt o'tkazib yuboriladi
  } else if (type === 'cards-ready') {
    const c = room.cards;
    if (room.game !== 'cards' || !c || c.phase !== 'write' || c.ready[i]) return 'Xato';
    const list = Array.isArray(data.entries) ? data.entries : [];
    const seen = new Set();
    const clean = [];
    for (const e of list) {
      const cell = Number(e.cell);
      const text = String(e.text || '').trim().slice(0, 200);
      if (!Number.isInteger(cell) || cell < 0 || cell > 15 || seen.has(cell) || !text) continue;
      seen.add(cell);
      clean.push({ cell, text });
    }
    if (clean.length !== 3) return '3 ta katakka yozing';
    c.secrets[i] = clean;
    c.ready[i] = true;
    if (c.ready[0] && c.ready[1]) { c.phase = 'play'; c.turn = 0; }
  } else if (type === 'cards-open') {
    const c = room.cards;
    const cell = Number(data.cell);
    if (room.game !== 'cards' || !c || c.phase !== 'play') return 'Xato';
    if (c.turn !== i) return 'Navbat sizniki emas';
    if (!Number.isInteger(cell) || cell < 0 || cell > 15 || c.opened.some((o) => o.cell === cell)) return 'Bu katak ochilgan';
    const entries = [];
    [0, 1].forEach((owner) => c.secrets[owner].forEach((s) => { if (s.cell === cell) entries.push({ owner, text: s.text }); }));
    c.opened.push({ cell, by: i, entries });
    c.turn = 1 - c.turn;
    const found = new Set(c.opened.filter((o) => o.entries.length).map((o) => o.cell));
    if (found.size >= secretCellCount(c)) c.phase = 'over';
  } else {
    return 'Noma\'lum harakat';
  }
  broadcast(room);
  return null;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const room = rooms.get((url.searchParams.get('code') || '').toUpperCase());
    const i = room ? room.players.findIndex((p) => p.id === url.searchParams.get('pid')) : -1;
    if (i < 0) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const p = room.players[i];
    if (p.res) { try { p.res.end(); } catch {} }
    p.res = res;
    res.write('retry: 2000\n\n');
    broadcast(room);
    const hb = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(hb);
      if (p.res === res) { p.res = null; broadcast(room); }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/create') {
    const b = await readBody(req);
    const room = newRoom(b.name);
    return json(res, 200, { code: room.code, pid: room.players[0].id });
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {
    const b = await readBody(req);
    const room = rooms.get(String(b.code || '').toUpperCase());
    if (!room) return json(res, 404, { error: 'Bunday xona topilmadi' });
    if (room.players.length >= 2) return json(res, 409, { error: 'Xona to\'la' });
    const p = addPlayer(room, b.name);
    broadcast(room);
    return json(res, 200, { code: room.code, pid: p.id });
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    const b = await readBody(req);
    const room = rooms.get(String(b.code || '').toUpperCase());
    const i = room ? room.players.findIndex((p) => p.id === b.pid) : -1;
    if (i < 0) return json(res, 404, { error: 'Xona topilmadi' });
    const err = handleAction(room, i, b.type, b.data);
    return json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
  }

  // statik fayllar
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(path.join(PUBLIC, file));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Topilmadi'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// eski bo'sh xonalarni tozalash
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.last > 3 * 3600 * 1000 && room.players.every((p) => !p.res)) {
      if (room.rps) clearTimeout(room.rps.timer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`O'yin serveri ishga tushdi: http://localhost:${PORT}`));
