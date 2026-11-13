const $ = (s) => document.querySelector(s);
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMOJI = { tosh: '✊', qaychi: '✌️', qogoz: '✋' };
const LABEL = { tosh: 'Tosh', qaychi: 'Qaychi', qogoz: 'Qog\'oz' };

let S = null;           // serverdan kelgan oxirgi holat
let es = null;          // EventSource
let offset = 0;         // server va telefon soati farqi
let session = null;
try { session = JSON.parse(localStorage.getItem('session') || 'null'); } catch (e) {}
let draft = {};         // kataklar uchun qoralama: { katakRaqami: matn }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 2500);
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Xatolik');
  return d;
}

function act(type, data) {
  post('/api/action', { code: session.code, pid: session.pid, type, data }).catch((e) => toast(e.message));
}

function myName() {
  const v = $('#name').value.trim();
  if (v) localStorage.setItem('name', v);
  return v;
}

// ---------- Ulanish ----------
function connect() {
  if (es) es.close();
  es = new EventSource(`/api/events?code=${session.code}&pid=${session.pid}`);
  es.onmessage = (ev) => {
    S = JSON.parse(ev.data);
    offset = S.serverNow - Date.now();
    render();
  };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) { // xona topilmadi
      localStorage.removeItem('session');
      session = null; S = null;
      $('#room').classList.add('hidden');
      $('#lobby').classList.remove('hidden');
      toast('Xona topilmadi yoki yopilgan');
    }
  };
}

function enter(d) {
  session = { code: d.code, pid: d.pid };
  localStorage.setItem('session', JSON.stringify(session));
  draft = {};
  connect();
}

$('#createBtn').onclick = async () => {
  const name = myName();
  if (!name) return toast('Avval ismingizni yozing');
  try { enter(await post('/api/create', { name })); } catch (e) { toast(e.message); }
};
$('#joinBtn').onclick = async () => {
  const name = myName();
  const code = $('#codeInput').value.trim().toUpperCase();
  if (!name) return toast('Avval ismingizni yozing');
  if (code.length !== 4) return toast('Xona kodi 4 ta belgi');
  try { enter(await post('/api/join', { name, code })); } catch (e) { toast(e.message); }
};

// ---------- Ulashish ----------
function shareLink() {
  const link = `${location.origin}/?room=${S.code}`;
  const text = 'Kel, birga o\'ynaymiz! ❤️';
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
}

// ---------- Chizish ----------
function show(id) {
  ['waiting', 'menu', 'rps', 'cards'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id));
}

function render() {
  $('#lobby').classList.add('hidden');
  $('#room').classList.remove('hidden');
  const me = S.players[S.you], opp = S.players[1 - S.you];

  $('#roomBar').innerHTML = `
    <div>Xona: <b>${esc(S.code)}</b></div>
    <div class="muted"><span class="dot on"></span>${esc(me.name)}
      ${opp ? `&nbsp; <span class="dot ${opp.connected ? 'on' : ''}"></span>${esc(opp.name)}` : ''}</div>`;

  if (!opp) {
    show('waiting');
    $('#waiting').innerHTML = `
      <div class="center stack">
        <div>Ikkinchi o'yinchini kutyapmiz…</div>
        <div class="muted">Kod: <b style="font-size:28px;letter-spacing:5px">${esc(S.code)}</b></div>
        <button class="primary" id="shareBtn">✈️ Telegram orqali yuborish</button>
      </div>`;
    $('#shareBtn').onclick = shareLink;
    return;
  }
  if (!S.game) return renderMenu();
  if (S.game === 'rps') return renderRps();
  if (S.game === 'cards') return renderCards();
}

function renderMenu() {
  show('menu');
  $('#menu').innerHTML = `
    <div class="stack">
      <div class="center muted">O'yinni tanlang</div>
      <button class="primary" data-game="rps">✊✌️✋ Don-don-ziki</button>
      <button class="primary" data-game="cards">🎁 4×4 kataklar</button>
    </div>`;
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-game]');
  if (g) return act('choose', { game: g.dataset.game });
  const pk = e.target.closest('[data-pick]');
  if (pk) return act('rps-pick', { choice: pk.dataset.pick });
  if (e.target.closest('[data-menu]')) { draft = {}; return act('menu'); }
});

// ----- Don-don-ziki -----
function renderRps() {
  show('rps');
  const r = S.rps, me = S.players[S.you], opp = S.players[1 - S.you];
  const sc = [r.scores[S.you], r.scores[1 - S.you]];
  let body = '';

  if (r.phase === 'pick') {
    const waitMsg = r.myPick ? (r.oppPicked ? '' : `${esc(opp.name)} tanlayapti…`) : (r.oppPicked ? `${esc(opp.name)} tanladi, navbat sizda!` : 'Tanlang!');
    body = `
      <div class="timer" id="timer">15</div>
      <div class="picks">
        ${['tosh', 'qaychi', 'qogoz'].map((c) => `
          <button data-pick="${c}" class="${r.myPick === c ? 'sel' : ''}" ${r.myPick ? 'disabled' : ''}>
            ${EMOJI[c]}<small>${LABEL[c]}</small></button>`).join('')}
      </div>
      <p class="center muted">${waitMsg}</p>`;
  } else {
    const l = r.last, mine = l.picks[S.you], theirs = l.picks[1 - S.you];
    let res, cls = '';
    if (l.winner === -1) res = (!mine && !theirs) ? 'Ikkalasi ham tanlamadi — ochko yo\'q' : 'Durrang!';
    else if (l.winner === S.you) { res = '🎉 Bu raundni siz yutdingiz! +1'; cls = 'win'; }
    else { res = `${esc(opp.name)} yutdi +1`; cls = 'lose'; }
    if (l.why === 'timeout' && l.winner !== -1) res += ' (vaqt tugadi)';
    body = `
      <div class="versus">
        <div>${mine ? EMOJI[mine] : '⏰'}</div><div class="vs">VS</div><div>${theirs ? EMOJI[theirs] : '⏰'}</div>
      </div>
      <div class="result ${cls}">${res}</div>`;
    if (r.phase === 'over') {
      const won = r.scores[S.you] > r.scores[1 - S.you];
      body += `<div class="result ${won ? 'win' : 'lose'}">${won ? '🏆 G\'alaba sizniki!' : `🏆 ${esc(opp.name)} g'olib bo'ldi!`}</div>
        <div class="stack"><button class="primary" data-game="rps">🔁 Yana o'ynash</button><button data-menu>⬅️ O'yinlar menyusi</button></div>`;
    } else {
      body += '<p class="center muted">Keyingi raund tez orada…</p>';
    }
  }

  $('#rps').innerHTML = `
    <div class="scoreboard">
      <div><div class="n">${sc[0]}</div><div class="who">${esc(me.name)}</div></div>
      <div class="muted">Raund ${r.round}<br>${r.winScore} gacha</div>
      <div><div class="n">${sc[1]}</div><div class="who">${esc(opp.name)}</div></div>
    </div>${body}`;
  tick();
}

function tick() {
  const el = $('#timer');
  if (!el || !S || !S.rps || S.rps.phase !== 'pick') return;
  const left = Math.max(0, Math.ceil((S.rps.deadline - (Date.now() + offset)) / 1000));
  el.textContent = left;
  el.classList.toggle('low', left <= 5);
}
setInterval(tick, 250);

// ----- 4x4 kataklar -----
function renderCards() {
  const c = S.cards, me = S.players[S.you], opp = S.players[1 - S.you];
  show('cards');
  const box = $('#cards');

  if (c.phase === 'write') {
    if (c.myReady) {
      box.dataset.phase = 'wait';
      box.innerHTML = `<div class="center stack"><div>✅ Tayyor!</div>
        <div class="muted">${esc(opp.name)} yozib bo'lishini kutyapmiz…</div></div>`;
      return;
    }
    if (box.dataset.phase === 'write') { // yozayotgan matnni o'chirib yubormaslik uchun qayta chizmaymiz
      const o = $('#oppReady'); if (o) o.textContent = c.oppReady ? `${opp.name} tayyor ✅` : '';
      return;
    }
    box.dataset.phase = 'write';
    drawWrite(c);
    return;
  }
  box.dataset.phase = c.phase;

  const openedMap = {};
  c.opened.forEach((o) => { openedMap[o.cell] = o; });
  const mineSet = new Set(c.mine.map((m) => m.cell));
  const myTurn = c.phase === 'play' && c.turn === S.you;

  const cells = Array.from({ length: 16 }, (_, i) => {
    const o = openedMap[i];
    if (o) return `<button class="cell open ${o.entries.length ? 'hit' : ''}" disabled>${o.entries.length ? '🎁' : '·'}</button>`;
    return `<button class="cell ${mineSet.has(i) ? 'mine' : ''}" data-cell="${i}" ${myTurn ? '' : 'disabled'}>${i + 1}</button>`;
  }).join('');

  const nameOf = (i) => (i === S.you ? 'Siz' : S.players[i].name);
  const log = c.opened.slice().reverse().map((o) => {
    const who = nameOf(o.by);
    const what = o.entries.length
      ? o.entries.map((e) => `<div><b>${esc(nameOf(e.owner))}</b> yozgan: «${esc(e.text)}» — <b>${esc(who)}</b> bajaradi!</div>`).join('')
      : '<div>Bo\'sh katak — hech narsa chiqmadi 🙂</div>';
    return `<div class="item">${o.cell + 1}-katak, ${esc(who)} ochdi:${what}</div>`;
  }).join('');

  let head;
  if (c.phase === 'over') head = '🏁 Hamma yozilgan kataklar ochildi!';
  else head = myTurn ? '👉 Sizning navbatingiz — katakni tanlang' : `⏳ ${esc(opp.name)} tanlayapti…`;

  let tail = '';
  if (c.phase === 'over') {
    tail = `<div class="stack" style="margin-top:12px"><button class="primary" data-game="cards">🔁 Yana o'ynash</button><button data-menu>⬅️ O'yinlar menyusi</button></div>`;
  }
  box.innerHTML = `<div class="center">${head}</div>
    <div class="grid">${cells}</div>
    <div class="muted center">● — o'zingiz yozgan katak (raqibga ko'rinmaydi)</div>
    <div class="log">${log}</div>${tail}`;
}

function drawWrite(c) {
  const cells = Array.from({ length: 16 }, (_, i) =>
    `<button class="cell ${i in draft ? 'sel' : ''}" data-wcell="${i}">${i + 1}</button>`).join('');
  const picked = Object.keys(draft).map(Number).sort((a, b) => a - b);
  const fields = picked.map((i) => `
    <label class="field">${i + 1}-katak uchun nima yozasiz?
      <textarea data-text="${i}" maxlength="200" placeholder="Xohlagan narsangizni yozing…">${esc(draft[i])}</textarea>
    </label>`).join('');
  const full = picked.length === 3;
  $('#cards').innerHTML = `
    <div class="center">3 ta katakni tanlab, ichiga xohlagan narsani yozing.<br>
      <span class="muted">Raqibingiz hech qachon ko'rmaydi (o'yin tugaguncha).</span></div>
    <div class="grid">${cells}</div>
    <div class="center muted">Tanlandi: ${picked.length}/3 <span id="oppReady"></span></div>
    ${fields}
    <button class="primary" id="readyBtn" ${full ? '' : 'disabled'}>✅ Tayyorman</button>`;
  $('#readyBtn').onclick = () => {
    const entries = picked.map((i) => ({ cell: i, text: (draft[i] || '').trim() }));
    if (entries.some((e) => !e.text)) return toast('Hamma 3 ta katakka nimadir yozing');
    act('cards-ready', { entries });
  };
}

document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-wcell]');
  if (w && S && S.cards && S.cards.phase === 'write') {
    const i = Number(w.dataset.wcell);
    if (i in draft) delete draft[i];
    else if (Object.keys(draft).length < 3) draft[i] = '';
    else toast('Faqat 3 ta katak');
    drawWrite(S.cards);
    return;
  }
  const c = e.target.closest('[data-cell]');
  if (c) act('cards-open', { cell: Number(c.dataset.cell) });
});

document.addEventListener('input', (e) => {
  const t = e.target.closest('[data-text]');
  if (t) draft[Number(t.dataset.text)] = t.value;
});

// ---------- Boshlash ----------
(function init() {
  const saved = localStorage.getItem('name');
  const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  $('#name').value = saved || (tgUser && tgUser.first_name) || '';
  const params = new URLSearchParams(location.search);
  const roomParam = (params.get('room') || '').toUpperCase();
  const tgParam = tg && tg.initDataUnsafe && (tg.initDataUnsafe.start_param || '').toUpperCase();
  const code = roomParam || tgParam || '';
  if (code) $('#codeInput').value = code;
  if (session && (!code || code === session.code)) connect();
})();
