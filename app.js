import { supabaseUrl, supabaseAnonKey } from './config.js';
const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'journal-session-v1' }
});

const $ = id => document.getElementById(id);
const USERS_KEY = 'journal-users';
const SESSION_KEY = 'journal-session';
function STORAGE_KEY() { const s = getSession(); return s ? 'daily-journal-v1-' + s.id : 'daily-journal-v1-guest'; }
function SETTINGS_KEY() { const s = getSession(); return s ? 'daily-journal-settings-' + s.id : 'daily-journal-settings-guest'; }

const state = {
  entries: {},
  current: todayStr(),
  view: 'editor',
  session: null,
  settings: { name: '', theme: 'light', autosave: 3, themeName: 'Номин', fontFamily: '' },
  autosaveTimer: null,
};

function todayStr(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function formatDate(s) {
  const d = parseDate(s);
  const months = ['1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар','7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар'];
  const days = ['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'];
  return `${d.getFullYear()} оны ${months[d.getMonth()]}ын ${d.getDate()}, ${days[d.getDay()]}`;
}

// ---------- Auth (Supabase) ----------
function getSession() { return state.session; }
async function getCurrentUser() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  return { id: data.session.user.id, username: data.session.user.email, email: data.session.user.email };
}
async function registerUser(email, password) {
  if (password.length < 6) throw new Error('Нууц үг дор хаяж 6 тэмдэгт');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Бүртгэл үүслээ. И-мэйлээ баталгаажуулна уу.');
  return { id: data.user.id, username: data.user.email, email: data.user.email };
}
async function loginUser(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('И-мэйл эсвэл нууц үг буруу');
  return { id: data.user.id, username: data.user.email, email: data.user.email };
}
async function logoutUser() { await sb.auth.signOut(); }

// ---------- Storage (Supabase) ----------
async function load() {
  state.entries = {};
  try {
    const { data } = await sb.from('journal_entries').select('*');
    if (data) {
      data.forEach(row => {
        state.entries[row.entry_date] = {
          title: row.title || '',
          html: row.content || '',
          mood: row.mood || '',
          tags: row.tags || [],
          color: row.color || 'Номин',
          font: row.font || '',
        };
      });
    }
  } catch (e) { console.error('load error', e); }
  try { state.settings = Object.assign({ name: '', theme: 'light', autosave: 3, themeName: 'Номин', fontFamily: '' }, JSON.parse(localStorage.getItem(SETTINGS_KEY()) || '{}')); } catch {}
}
async function saveEntry(date) {
  const e = state.entries[date];
  if (!e) return;
  const row = {
    entry_date: date,
    title: e.title || '',
    content: e.html || '',
    mood: e.mood || '',
    tags: e.tags || [],
    color: e.color || 'Номин',
    font: e.font || '',
  };
  try {
    await sb.from('journal_entries').upsert(row, { onConflict: 'user_id,entry_date' });
  } catch (err) { console.error('save error', err); }
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function text(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
function wordCount(html) {
  const txt = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!txt) return 0;
  return txt.split(' ').filter(Boolean).length;
}

// ---------- Theme presets ----------
const THEMES = [
  { name: 'Номин', bg: '#faf8f5', surface: '#ffffff', ink: '#2a2433', muted: '#7a7088', border: '#ece6f0', accent: '#7c5cff', soft: '#f0ecff' },
  { name: 'Нар', bg: '#fff8f0', surface: '#ffffff', ink: '#3a2a1a', muted: '#8a7060', border: '#f0e0d0', accent: '#ff7a3d', soft: '#ffe9d6' },
  { name: 'Ой', bg: '#f0f7f0', surface: '#ffffff', ink: '#1a3320', muted: '#5a7a60', border: '#d8e8d8', accent: '#2e9e5b', soft: '#dff0e4' },
  { name: 'Далай', bg: '#f0f6fa', surface: '#ffffff', ink: '#1a2a3a', muted: '#5a7a8a', border: '#d8e4f0', accent: '#2b8fd9', soft: '#dceef8' },
  { name: 'Сарнай', bg: '#fdf0f3', surface: '#ffffff', ink: '#3a1a24', muted: '#8a5a6a', border: '#f0d8e0', accent: '#e05a8a', soft: '#fce0e8' },
  { name: 'Харанхуй', bg: '#1a1625', surface: '#252033', ink: '#f0ecf5', muted: '#a89fb8', border: '#3a3348', accent: '#a78bfa', soft: '#2d2640', dark: true },
  { name: 'Бор', bg: '#f5f0e8', surface: '#faf7f0', ink: '#3a3020', muted: '#7a7060', border: '#e8e0d0', accent: '#b08d57', soft: '#efe8d8' },
  { name: 'Мөнгөн', bg: '#f4f5f7', surface: '#ffffff', ink: '#2a2d33', muted: '#6b7280', border: '#e0e2e6', accent: '#6b7280', soft: '#e8eaed' },
  { name: 'Шөнө', bg: '#0f0f1a', surface: '#1a1a2e', ink: '#e8e6f0', muted: '#8884a0', border: '#2a2a40', accent: '#818cf8', soft: '#1e1e38', dark: true },
  { name: 'Наран шар', bg: '#fffbea', surface: '#ffffff', ink: '#3a3010', muted: '#8a8040', border: '#f0e8c0', accent: '#d4a017', soft: '#faf0c8' },
];
const FONTS = [
  { name: 'Manrope', family: "'Manrope', system-ui, sans-serif", sample: 'Абвгд 123' },
  { name: 'Playfair Display', family: "'Playfair Display', Georgia, serif", sample: 'Абвгд 123' },
  { name: 'Caveat (гар бичмэл)', family: "'Caveat', cursive", sample: 'Абвгд 123' },
  { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", sample: 'Абвгд 123' },
  { name: 'Georgia', family: "Georgia, serif", sample: 'Абвгд 123' },
  { name: 'Merriweather', family: "'Merriweather', Georgia, serif", sample: 'Абвгд 123' },
  { name: 'Lora', family: "'Lora', Georgia, serif", sample: 'Абвгд 123' },
  { name: 'Inter', family: "'Inter', system-ui, sans-serif", sample: 'Абвгд 123' },
  { name: 'Roboto', family: "'Roboto', system-ui, sans-serif", sample: 'Абвгд 123' },
  { name: 'Open Sans', family: "'Open Sans', system-ui, sans-serif", sample: 'Абвгд 123' },
  { name: 'Dancing Script', family: "'Dancing Script', cursive", sample: 'Абвгд 123' },
  { name: 'Pacifico', family: "'Pacifico', cursive", sample: 'Абвгд 123' },
  { name: 'Kalam', family: "'Kalam', cursive", sample: 'Абвгд 123' },
  { name: 'Indie Flower', family: "'Indie Flower', cursive", sample: 'Абвгд 123' },
  { name: 'Shadows Into Light', family: "'Shadows Into Light', cursive", sample: 'Абвгд 123' },
  { name: 'Satisfy', family: "'Satisfy', cursive", sample: 'Абвгд 123' },
  { name: 'Great Vibes', family: "'Great Vibes', cursive", sample: 'Абвгд 123' },
  { name: 'Permanent Marker', family: "'Permanent Marker', cursive", sample: 'Абвгд 123' },
  { name: 'Courier New', family: "'Courier New', monospace", sample: 'Абвгд 123' },
  { name: 'Times New Roman', family: "'Times New Roman', serif", sample: 'Абвгд 123' },
  { name: 'Arial', family: "Arial, sans-serif", sample: 'Абвгд 123' },
  { name: 'Noto Sans Mongolian', family: "'Noto Sans Mongolian', sans-serif", sample: 'ᠠᠪ ᠰᠢᠨᠵᠢ' },
];

function applyTheme(t) {
  const theme = THEMES.find(x => x.name === t) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--bg', theme.bg);
  r.setProperty('--surface', theme.surface);
  r.setProperty('--ink', theme.ink);
  r.setProperty('--muted', theme.muted);
  r.setProperty('--border', theme.border);
  r.setProperty('--accent', theme.accent);
  r.setProperty('--accent-soft', theme.soft);
  document.body.classList.toggle('dark', !!theme.dark);
  state.settings.themeName = theme.name;
}
function applyFont(f) {
  document.querySelector('.editor').style.fontFamily = f;
  state.settings.fontFamily = f;
}

// ---------- EMOJI data ----------
const EMOJI_CATS = {
  'Сэтгэл': ['😀','😃','😄','😁','😆','🥹','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
  'Гар': ['👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','🤏','✋','🤚','🖐','🖖','👋','🤙','💪','🦾','🖕','✍️','💅','🤳'],
  'Зүрх': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Байгаль': ['🌸','🌺','🌻','🌹','🌷','🌼','🌱','🌿','🍀','🍁','🍂','🍃','🌲','🌳','🌴','🌵','🌾','🍁','🍂'],
  'Амьтан': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦙','🦌','🐕','🐩','🐈','🐈‍⬛','🐓','🦃','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦦','🦫','🐿','🦔'],
  'Хоол': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯'],
  'Байгууламж': ['🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','💒','⛪','🕌','🕍','🛕','⛩','🗼','🗽','🏰','🏟','🎪'],
  'Тээвэр': ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','✈️','🛩','🛫','🛬','🪂','💺','🚁','🚤','🛥','⛵','🚢','⚓','🪝','⛽','🚧','🚨','🚥','🚮'],
  'Цаг': ['⏰','⏱','⏲','🕰','🕛','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','⏳'],
  'Од': ['⭐','🌟','✨','💫','☄️','🌙','☀️','🌤','⛅','🌥','☁️','🌧','⛈','🌩','🌨','❄️','☃️','⛄','🌬','💨','🌪','🌈','☂️','☔','⚡'],
};

// ---------- Password protection ----------
const LOCK_KEY = 'journal-lock-hash';
async function hashLockPw(pw) {
  const data = new TextEncoder().encode('lock:' + pw);
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function isLocked() { return !!localStorage.getItem(LOCK_KEY); }
async function verifyLock(pw) {
  const stored = localStorage.getItem(LOCK_KEY);
  if (!stored) return true;
  const h = await hashLockPw(pw);
  return h === stored;
}
function showLock() {
  document.querySelector('.app').style.visibility = 'hidden';
  $('lock-dialog').showModal();
  $('lock-password').value = '';
  $('lock-error').textContent = '';
  $('lock-password').focus();
}
async function unlock() {
  const pw = $('lock-password').value;
  if (await verifyLock(pw)) {
    $('lock-dialog').close();
    document.querySelector('.app').style.visibility = 'visible';
    toast('Нээгдлээ.');
  } else {
    $('lock-error').textContent = 'Нууц үг буруу.';
  }
}

// ---------- Daily reminders ----------
let reminderTimer = null;
function scheduleReminder() {
  if (reminderTimer) clearInterval(reminderTimer);
  const interval = Number(localStorage.getItem('journal-reminder-interval') || '0');
  if (!interval) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    Notification.requestPermission().then(p => { if (p === 'granted') startReminder(interval); });
    return;
  }
  startReminder(interval);
}
function startReminder(hours) {
  const ms = hours * 60 * 60 * 1000;
  reminderTimer = setInterval(() => {
    const today = todayStr();
    if (!state.entries[today]) {
      new Notification('Тэмдэглэл', { body: 'Өнөөдрийн тэмдэглэлээ бичээрэй! ✍️', icon: '' });
    }
  }, ms);
}

// ---------- Auth (Supabase) ----------
// ---------- Storage (Supabase) ----------
// ---------- Toast ----------
async function doAuth() {
  const mode = $('auth-form').dataset.mode || 'login';
  const email = $('auth-username').value.trim();
  const password = $('auth-password').value;
  $('auth-error').textContent = '';
  try {
    const user = mode === 'register' ? await registerUser(email, password) : await loginUser(email, password);
    $('auth-overlay').hidden = true;
    document.querySelector('.app').style.visibility = 'visible';
    await enterApp({ id: user.id, username: user.username, email: user.email });
    toast(mode === 'register' ? 'Бүртгэл үүслээ. Тавтай морил!' : 'Нэвтэрлээ. Тавтай морил!');
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
}
async function doLogout() {
  await saveCurrent();
  await logoutUser();
  state.session = null;
  state.entries = {};
  state.current = todayStr();
  document.querySelector('.app').style.visibility = 'hidden';
  $('side-user').hidden = true;
  $('logout-btn').hidden = true;
  showAuth('login');
}

// ---------- Render entry ----------
function renderEditor() {
  const date = state.current;
  const e = getEntry(date);
  const editor = $('editor');
  editor.innerHTML = e ? e.html : '';
  $('entry-title').value = e ? (e.title || '') : '';
  editor.querySelectorAll('figure.img-figure').forEach(fig => {
    const img = fig.querySelector('img');
    const fc = fig.querySelector('figcaption');
    if (!img) return;
    const wrap = createImageBlock(img.src, img.alt);
    const caption = wrap.querySelector('.img-caption');
    if (fc && caption) caption.value = fc.textContent;
    fig.replaceWith(wrap);
  });
  editor.querySelectorAll('.time-capsule').forEach(c => renderCapsule(c));
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', e && e.mood === b.dataset.mood));
  renderTags(e ? e.tags || [] : []);
  if (e && e.color) applyTheme(e.color);
  if (e && e.font) applyFont(e.font);
  updateWordCount();
  updateSaveStatus('Хадгалагдсан');
}

function getEntry(date) { return state.entries[date] || null; }

function renderTags(tags) {
  const row = $('tag-row'); row.replaceChildren();
  tags.forEach(t => {
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.append(document.createTextNode(t));
    const rm = document.createElement('span'); rm.className = 'tag-remove'; rm.textContent = '×';
    rm.addEventListener('click', () => removeTag(t));
    tag.append(rm); row.append(tag);
  });
}
function applyThemeByName(name) {
  const theme = THEMES.find(t => t.name === name);
  if (theme) applyTheme(theme.name);
}
function updateWordCount() {
  const wc = wordCount($('editor').innerHTML);
  $('word-count').textContent = `${wc} үг`;
}
let saveStatusTimer;
function updateSaveStatus(text) {
  const el = $('save-status'); el.textContent = text;
  clearTimeout(saveStatusTimer);
  if (text !== 'Хадгалагдсан') saveStatusTimer = setTimeout(() => { el.textContent = 'Хадгалагдсан'; }, 1500);
}

// ---------- Save entry ----------
async function saveCurrent() {
  const title = $('entry-title').value.trim();
  $('editor').querySelectorAll('.img-block').forEach(block => {
    const img = block.querySelector('img');
    const caption = block.querySelector('.img-caption');
    const figure = document.createElement('figure');
    figure.className = 'img-figure';
    if (img) figure.append(img.cloneNode(true));
    if (caption && caption.value.trim()) {
      const fc = document.createElement('figcaption');
      fc.textContent = caption.value.trim();
      figure.append(fc);
    }
    block.replaceWith(figure);
  });
  const html = $('editor').innerHTML.trim();
  const mood = document.querySelector('.mood-btn.active')?.dataset.mood || '';
  const tags = [...$('tag-row').querySelectorAll('.tag')].map(t => t.firstChild.textContent);
  const color = state.settings.themeName || 'Номин';
  const font = $('editor').style.fontFamily || "'Manrope', system-ui, sans-serif";
  if (!html && !title && !mood && !tags.length) {
    delete state.entries[state.current];
    try { await sb.from('journal_entries').delete().eq('entry_date', state.current); } catch (e) { console.error(e); }
  } else {
    state.entries[state.current] = { title, html, mood, tags, color, font };
    await saveEntry(state.current);
  }
  updateSaveStatus('Хадгалагдсан ✓');
  refreshMiniList();
  updateStats();
}

// ---------- Navigation ----------
function switchView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'calendar') renderCalendar();
  if (v === 'list') renderList();
  if (v === 'search') { $('global-search').focus(); }
}
function goDate(delta) {
  const d = parseDate(state.current);
  d.setDate(d.getDate() + delta);
  state.current = todayStr(d);
  renderEditor();
}
function goToday() { state.current = todayStr(); renderEditor(); }

// ---------- Calendar ----------
let calMonth = new Date();
function renderCalendar() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const months = ['1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар','7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар'];
  $('cal-title').textContent = `${y} оны ${months[m]}`;
  const grid = $('calendar-grid'); grid.replaceChildren();
  const dayNames = ['Ня','Да','Мя','Лх','Пү','Ба','Бя'];
  dayNames.forEach(n => { const c = document.createElement('div'); c.className = 'cal-dayname'; c.textContent = n; grid.append(c); });
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const today = todayStr();
  for (let i = 0; i < 42; i++) {
    const cell = document.createElement('div'); cell.className = 'cal-cell';
    let dayNum, dateStr, other = false;
    if (i < startDay) { dayNum = prevDays - startDay + i + 1; other = true; const d = new Date(y, m - 1, dayNum); dateStr = todayStr(d); }
    else if (i >= startDay + daysInMonth) { dayNum = i - startDay - daysInMonth + 1; other = true; const d = new Date(y, m + 1, dayNum); dateStr = todayStr(d); }
    else { dayNum = i - startDay + 1; const d = new Date(y, m, dayNum); dateStr = todayStr(d); }
    if (other) cell.classList.add('other-month');
    if (dateStr === today) cell.classList.add('today');
    const e = getEntry(dateStr);
    if (e) { cell.classList.add('has-entry'); if (e.mood) { const md = document.createElement('span'); md.className = 'cal-mood'; md.textContent = e.mood; cell.append(md); } }
    cell.append(document.createTextNode(dayNum));
    cell.addEventListener('click', () => { showCalDetail(dateStr); });
    grid.append(cell);
  }
  showCalDetail(state.current);
}

// ---------- Calendar detail (entry preview) ----------
function showCalDetail(date) {
  const box = $('cal-detail');
  if (!box) return;
  box.replaceChildren();
  const e = getEntry(date);
  const head = document.createElement('div'); head.className = 'cal-detail-head';
  const mood = document.createElement('span'); mood.className = 'cal-detail-mood'; mood.textContent = (e && e.mood) || '📝';
  const dateEl = document.createElement('strong'); dateEl.textContent = formatDate(date);
  const btns = document.createElement('div'); btns.className = 'cal-detail-btns';
  const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'card-action'; editBtn.textContent = '✎ Засах';
  editBtn.addEventListener('click', () => { state.current = date; switchView('editor'); renderEditor(); });
  const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'card-action danger'; delBtn.textContent = '🗑 Устгах';
  delBtn.addEventListener('click', () => deleteEntry(date));
  btns.append(editBtn, delBtn);
  head.append(mood, dateEl, btns);
  box.append(head);

  if (!e) {
    const empty = document.createElement('p'); empty.className = 'cal-detail-empty'; empty.textContent = 'Энэ өдөр бичигдээгүй байна.';
    box.append(empty);
    return;
  }
  if (e.title) { const h = document.createElement('h3'); h.className = 'cal-detail-title'; h.textContent = e.title; box.append(h); }
  if (e.tags && e.tags.length) {
    const tg = document.createElement('div'); tg.className = 'ec-tags';
    e.tags.forEach(t => { const s = document.createElement('span'); s.className = 'ec-tag'; s.textContent = t; tg.append(s); });
    box.append(tg);
  }
  const body = document.createElement('div'); body.className = 'cal-detail-body';
  body.innerHTML = e.html || '';
  box.append(body);
  const foot = document.createElement('div'); foot.className = 'cal-detail-foot';
  foot.textContent = `${wordCount(e.html || '')} үг`;
  box.append(foot);
}

// ---------- List view ----------
function renderList() {
  const q = $('list-search').value.trim().toLowerCase();
  const sort = $('list-sort').value;
  let dates = Object.keys(state.entries);
  if (q) dates = dates.filter(d => {
    const e = state.entries[d];
    const text = (e.html || '').replace(/<[^>]+>/g, ' ').toLowerCase();
    const title = (e.title || '').toLowerCase();
    return title.includes(q) || text.includes(q) || (e.tags || []).some(t => t.toLowerCase().includes(q)) || (e.mood || '').includes(q);
  });
  dates.sort((a, b) => sort === 'newest' ? b.localeCompare(a) : a.localeCompare(b));
  const grid = $('entries-grid'); grid.replaceChildren();
  if (!dates.length) { grid.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'Тэмдэглэл олдсонгүй.' })); return; }
  dates.forEach(d => {
    const e = state.entries[d];
    const card = document.createElement('div'); card.className = 'entry-card';
    const titleHtml = e.title ? `<div class="ec-title">${e.title}</div>` : '';
    card.innerHTML = `<div class="ec-date"><span class="ec-mood">${e.mood || '📝'}</span>${formatDate(d)}</div>${titleHtml}<div class="ec-preview">${(e.html || '').replace(/<[^>]+>/g, ' ')}</div>`;
    if (e.tags && e.tags.length) {
      const tg = document.createElement('div'); tg.className = 'ec-tags';
      e.tags.forEach(t => { const s = document.createElement('span'); s.className = 'ec-tag'; s.textContent = t; tg.append(s); });
      card.append(tg);
    }
    wireEntryCardActions(card, d);
    grid.append(card);
  });
}

// ---------- Search ----------
function doSearch(q) {
  q = q.trim().toLowerCase();
  const res = $('search-results'); res.replaceChildren();
  if (!q) return;
  const matches = Object.keys(state.entries).filter(d => {
    const e = state.entries[d];
    const text = (e.html || '').replace(/<[^>]+>/g, ' ').toLowerCase();
    const title = (e.title || '').toLowerCase();
    return title.includes(q) || text.includes(q) || (e.tags || []).some(t => t.toLowerCase().includes(q));
  }).sort((a, b) => b.localeCompare(a));
  if (!matches.length) { res.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'Илэрц олдсонгүй.' })); return; }
  matches.forEach(d => {
    const e = state.entries[d];
    const card = document.createElement('div'); card.className = 'entry-card';
    let preview = (e.html || '').replace(/<[^>]+>/g, ' ');
    const idx = preview.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40), end = Math.min(preview.length, idx + q.length + 40);
      preview = (start > 0 ? '…' : '') + preview.slice(start, end) + (end < preview.length ? '…' : '');
    }
    const titleHtml = e.title ? `<div class="ec-title">${e.title}</div>` : '';
    card.innerHTML = `<div class="ec-date"><span class="ec-mood">${e.mood || '📝'}</span>${formatDate(d)}</div>${titleHtml}<div class="ec-preview">${preview}</div>`;
    wireEntryCardActions(card, d);
    res.append(card);
  });
}

// ---------- Mini list ----------
function editEntry(date) {
  state.current = date;
  switchView('editor');
  renderEditor();
}
async function deleteEntry(date) {
  if (!confirm('Энэ тэмдэглэл устгах уу?')) return;
  delete state.entries[date];
  const wasCurrent = state.current === date;
  try { await sb.from('journal_entries').delete().eq('entry_date', date); } catch (e) { console.error(e); }
  if (wasCurrent) renderEditor();
  toast('Тэмдэглэл устгагдлаа.');
  refreshMiniList(); updateStats(); renderList(); renderCalendar();
}
function wireEntryCardActions(card, date) {
  const actions = document.createElement('div'); actions.className = 'entry-card-actions';
  const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'card-action'; editBtn.title = 'Засах'; editBtn.textContent = '✎ Засах';
  editBtn.addEventListener('click', ev => { ev.stopPropagation(); editEntry(date); });
  const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'card-action danger'; delBtn.title = 'Устгах'; delBtn.textContent = '🗑 Устгах';
  delBtn.addEventListener('click', ev => { ev.stopPropagation(); deleteEntry(date); });
  actions.append(editBtn, delBtn);
  card.append(actions);
}
function refreshMiniList() {
  const list = $('mini-list'); list.replaceChildren();
  const sort = ($('mini-sort') && $('mini-sort').value) || 'newest';
  const dates = Object.keys(state.entries).sort((a, b) => sort === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)).slice(0, 12);
  dates.forEach(d => {
    const e = state.entries[d];
    const preview = e.title ? e.title : ((e.html || '').replace(/<[^>]+>/g, ' ') || 'Хоосон');
    const item = document.createElement('div'); item.className = 'mini-entry' + (d === state.current ? ' active' : '');
    item.innerHTML = `<span class="me-date"><span class="me-mood">${e.mood || '📝'}</span>${d.slice(5)}</span><span class="me-preview">${preview}</span>`;
    const actions = item.appendChild(document.createElement('div')); actions.className = 'me-actions';
    const editBtn = item.appendChild(document.createElement('button')); editBtn.type = 'button'; editBtn.className = 'mini-action'; editBtn.dataset.act = 'edit'; editBtn.title = 'Засах'; editBtn.textContent = '✎';
    editBtn.addEventListener('click', ev => { ev.stopPropagation(); editEntry(d); });
    const delBtn = item.appendChild(document.createElement('button')); delBtn.type = 'button'; delBtn.className = 'mini-action danger'; delBtn.dataset.act = 'del'; delBtn.title = 'Устгах'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', ev => { ev.stopPropagation(); deleteEntry(d); });
    item.addEventListener('click', () => { state.current = d; switchView('editor'); renderEditor(); });
    list.append(item);
  });
}

// ---------- Stats ----------
function updateStats() {
  const dates = Object.keys(state.entries).sort();
  $('stat-total').textContent = dates.length;
  let words = 0;
  dates.forEach(d => { words += wordCount(state.entries[d].html || ''); });
  $('stat-words').textContent = words;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (state.entries[todayStr(d)]) streak++; else break;
  }
  $('stat-streak').textContent = streak;
}

// ---------- Emoji picker ----------
const EMOJI_SEARCH = Object.values(EMOJI_CATS).flat();

function renderEmojiTabs() {
  const tabs = $('emoji-tabs'); tabs.replaceChildren();
  Object.keys(EMOJI_CATS).forEach((cat, idx) => {
    const b = document.createElement('button'); b.className = 'emoji-tab' + (idx === 0 ? ' active' : ''); b.textContent = cat;
    b.addEventListener('click', () => {
      document.querySelectorAll('.emoji-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderEmojiGrid(EMOJI_CATS[cat]);
    });
    tabs.append(b);
  });
  renderEmojiGrid(EMOJI_CATS[Object.keys(EMOJI_CATS)[0]]);
}
function renderEmojiGrid(list) {
  const grid = $('emoji-grid'); grid.replaceChildren();
  list.forEach(em => {
    const b = document.createElement('button'); b.textContent = em;
    b.addEventListener('click', () => { insertAtCursor(em + ' '); closePopovers(); });
    grid.append(b);
  });
}
function filterEmoji(q) {
  q = q.trim().toLowerCase();
  if (!q) { renderEmojiGrid(EMOJI_CATS[Object.keys(EMOJI_CATS)[0]]); return; }
  const matches = EMOJI_SEARCH.filter(e => e.includes(q));
  renderEmojiGrid(matches.length ? matches : EMOJI_SEARCH.slice(0, 60));
}

// ---------- GIF picker ----------
let gifTimer;
async function searchGif(q) {
  const grid = $('gif-grid'); grid.replaceChildren();
  if (!q.trim()) {
    grid.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'Хайх үгээ бичнэ үү (англиар).' }));
    return;
  }
  grid.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'Ачаалж байна...' }));
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=18&rating=g`);
    const data = await res.json();
    grid.replaceChildren();
    (data.data || []).forEach(g => {
      const img = document.createElement('img');
      img.src = g.images.fixed_height_small.url;
      img.alt = g.title;
      img.addEventListener('click', () => { insertImageAtCursor(g.images.original.url, g.title); closePopovers(); toast('GIF нэмэгдлээ.'); });
      grid.append(img);
    });
    if (!grid.children.length) grid.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'Илэрц олдсонгүй.' }));
  } catch {
    grid.replaceChildren();
    grid.append(Object.assign(document.createElement('p'), { className: 'helper', textContent: 'GIF ачаалж чадсангүй.' }));
  }
}

// ---------- Insert helpers ----------
function getInsertRange() {
  const editor = $('editor');
  const sel = window.getSelection();
  if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return sel.getRangeAt(0);
}

function insertAtCursor(text) {
  const sel = window.getSelection();

  const range = getInsertRange();
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  $('editor').focus();
  triggerAutosave();
}
function insertImageFile(file) {
  if (!file.type.startsWith('image/')) { toast('Зураг биш файл.'); return; }
  if (file.size > 20 * 1024 * 1024) { toast('Зураг 20 MB-аас бага байх ёстой.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 900; const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      insertImageAtCursor(canvas.toDataURL('image/jpeg', 0.85), file.name);
      toast('Зураг нэмэгдлээ.');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function createImageBlock(src, alt) {
  const wrap = document.createElement('div');
  wrap.className = 'img-block';
  wrap.contentEditable = 'false';
  const img = document.createElement('img');
  img.src = src; img.alt = alt || '';
  img.draggable = false;
  const toolbar = document.createElement('div');
  toolbar.className = 'img-toolbar';
  const mkBtn = (label, title, fn) => {
    const b = document.createElement('button'); b.className = 'img-tb-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  };
  toolbar.append(
    mkBtn('🔍+', 'Томруулах', () => { const w = img.offsetWidth || img.naturalWidth; img.style.width = Math.min(w * 1.25, wrap.parentElement.offsetWidth - 20) + 'px'; img.style.height = 'auto'; triggerAutosave(); }),
    mkBtn('🔍−', 'Жижигрүүлэх', () => { const w = img.offsetWidth || img.naturalWidth; img.style.width = Math.max(80, w * 0.8) + 'px'; img.style.height = 'auto'; triggerAutosave(); }),
    mkBtn('⬛', 'Анхны хэмжээ', () => { img.style.width = ''; img.style.height = ''; triggerAutosave(); }),
    mkBtn('✂️', 'Crop (тасдах)', () => enterCropMode(wrap, img)),
    mkBtn('↺', 'Зүүн эргүүлэх', () => rotateImage(wrap, img, -90)),
    mkBtn('↻', 'Баруун эргүүлэх', () => rotateImage(wrap, img, 90)),
    mkBtn('⬅', 'Зүүн талд', () => { wrap.style.textAlign = 'left'; img.style.display = 'block'; img.style.margin = '8px 0'; triggerAutosave(); }),
    mkBtn('↔', 'Төвд', () => { wrap.style.textAlign = 'center'; img.style.display = 'block'; img.style.margin = '8px auto'; triggerAutosave(); }),
    mkBtn('➡', 'Баруун талд', () => { wrap.style.textAlign = 'right'; img.style.display = 'block'; img.style.margin = '8px 0 8px auto'; triggerAutosave(); }),
  );
  const del = document.createElement('button');
  del.className = 'img-delete'; del.textContent = '×'; del.title = 'Зураг устгах';
  del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (confirm('Зураг устгах уу?')) { wrap.remove(); triggerAutosave(); } });
  const caption = document.createElement('input');
  caption.type = 'text'; caption.className = 'img-caption'; caption.placeholder = 'Тайлбар (сонголттой)';
  caption.addEventListener('input', triggerAutosave);
  const cropOverlay = document.createElement('div'); cropOverlay.className = 'img-crop-overlay'; cropOverlay.hidden = true;
  const cropBox = document.createElement('div'); cropBox.className = 'img-crop-box';
  cropOverlay.append(cropBox);
  const cropActions = document.createElement('div'); cropActions.className = 'img-crop-actions';
  cropActions.innerHTML = '<button class="primary small" id="crop-apply">✓ Тасдах</button><button class="secondary small" id="crop-cancel">✕ Болих</button>';
  cropOverlay.append(cropActions);
  wrap.append(img, toolbar, del, caption, cropOverlay);
  let selected = false;
  function select() { if (selected) return; selected = true; wrap.classList.add('img-selected'); }
  function deselect() { selected = false; wrap.classList.remove('img-selected'); }
  img.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); select(); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) deselect(); });
  let resizing = false, startX = 0, startW = 0, startH = 0, dir = '';
  ['nw','n','ne','e','se','s','sw','w'].forEach(d => {
    const h = document.createElement('span'); h.className = 'img-handle img-handle-' + d; h.dataset.dir = d;
    h.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); resizing = true; dir = d; startX = e.clientX; startW = img.offsetWidth; startH = img.offsetHeight; document.body.style.cursor = d + '-resize'; });
    wrap.append(h);
  });
  const onMove = e => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const aspect = startH / startW;
    let newW = startW, newH = startH;
    if (dir.includes('e')) newW = Math.max(80, startW + dx);
    if (dir.includes('w')) newW = Math.max(80, startW - dx);
    if (dir.includes('s')) newH = Math.max(60, startH + (e.clientY - startX));
    if (dir.includes('n')) newH = Math.max(60, startH - (e.clientY - startX));
    if (dir.length === 2) { newH = newW * aspect; }
    img.style.width = newW + 'px'; img.style.height = newH + 'px';
  };
  const onUp = () => { if (!resizing) return; resizing = false; document.body.style.cursor = ''; triggerAutosave(); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  function enterCropMode() {
    cropOverlay.hidden = false;
    const rect = img.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    cropBox.style.left = (w * 0.1) + 'px'; cropBox.style.top = (h * 0.1) + 'px';
    cropBox.style.width = (w * 0.8) + 'px'; cropBox.style.height = (h * 0.8) + 'px';
    makeCropDraggable(cropBox, img);
  }
  cropActions.querySelector('#crop-apply').addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    applyCrop(wrap, img, cropBox); cropOverlay.hidden = true;
  });
  cropActions.querySelector('#crop-cancel').addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); cropOverlay.hidden = true;
  });
  // store enterCropMode reference
  wrap._enterCrop = () => enterCropMode();
  // wire the crop button
  toolbar.children[3].onclick = e => { e.preventDefault(); e.stopPropagation(); enterCropMode(); };
  return wrap;
}
function makeCropDraggable(box, img) {
  let dragging = false, resizing = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, startW = 0, startH = 0, handle = '';
  box.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    const rect = box.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const edge = 10;
    const onLeft = x < edge, onRight = x > rect.width - edge;
    const onTop = y < edge, onBottom = y > rect.height - edge;
    if (onLeft || onRight || onTop || onBottom) {
      resizing = true;
      handle = (onTop ? 'n' : '') + (onBottom ? 's' : '') + (onLeft ? 'w' : '') + (onRight ? 'e' : '');
      if (!handle) handle = 'se';
    } else { dragging = true; }
    startX = e.clientX; startY = e.clientY;
    startLeft = parseFloat(box.style.left) || 0; startTop = parseFloat(box.style.top) || 0;
    startW = parseFloat(box.style.width) || rect.width; startH = parseFloat(box.style.height) || rect.height;
  };
  const onMove = e => {
    if (!dragging && !resizing) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const imgW = img.offsetWidth, imgH = img.offsetHeight;
    if (dragging) {
      let nl = Math.max(0, Math.min(imgW - startW, startLeft + dx));
      let nt = Math.max(0, Math.min(imgH - startH, startTop + dy));
      box.style.left = nl + 'px'; box.style.top = nt + 'px';
    } else {
      let nl = startLeft, nt = startTop, nw = startW, nh = startH;
      if (handle.includes('e')) nw = Math.max(20, startW + dx);
      if (handle.includes('w')) { nw = Math.max(20, startW - dx); nl = startLeft + (startW - nw); }
      if (handle.includes('s')) nh = Math.max(20, startH + dy);
      if (handle.includes('n')) { nh = Math.max(20, startH - dy); nt = startTop + (startH - nh); }
      nl = Math.max(0, nl); nt = Math.max(0, nt);
      nw = Math.min(nw, imgW - nl); nh = Math.min(nh, imgH - nt);
      box.style.left = nl + 'px'; box.style.top = nt + 'px';
      box.style.width = nw + 'px'; box.style.height = nh + 'px';
    }
  };
  const onUp = () => { dragging = false; resizing = false; };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
function applyCrop(wrap, img, cropBox) {
  const imgRect = img.getBoundingClientRect();
  const boxRect = cropBox.getBoundingClientRect();
  const scaleX = img.naturalWidth / imgRect.width;
  const scaleY = img.naturalHeight / imgRect.height;
  const sx = (boxRect.left - imgRect.left) * scaleX;
  const sy = (boxRect.top - imgRect.top) * scaleY;
  const sw = boxRect.width * scaleX;
  const sh = boxRect.height * scaleY;
  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  img.src = canvas.toDataURL('image/png');
  img.style.width = boxRect.width + 'px';
  img.style.height = 'auto';
  triggerAutosave();
  toast('Зураг тасдагдлаа.');
}
function rotateImage(wrap, img, deg) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = img.naturalWidth, h = img.naturalHeight;
  const rad = deg * Math.PI / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  canvas.width = w * cos + h * sin;
  canvas.height = w * sin + h * cos;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  img.src = canvas.toDataURL('image/png');
  img.style.width = ''; img.style.height = '';
  triggerAutosave();
  toast('Зураг эргүүлэгдлээ.');
}
function insertImageAtCursor(src, alt) {
  const wrap = createImageBlock(src, alt);
  const sel = window.getSelection();

  const range = getInsertRange();
  range.deleteContents();
  range.insertNode(wrap);
  const br = document.createElement('br');
  range.insertNode(br);
  range.setStartAfter(br); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  $('editor').focus();
  triggerAutosave();
}

// ---------- Link management ----------
function createLink() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { toast('Текст сонгоно уу.'); return; }
  const url = prompt('Линк (URL):', 'https://');
  if (!url || !url.trim()) return;
  let href = url.trim();
  if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
  document.execCommand('createLink', false, href);
  const links = $('editor').querySelectorAll('a');
  links.forEach(a => { if (!a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } });
  $('editor').focus();
  triggerAutosave();
  toast('Линк нэмэгдлээ.');
}
let linkHoverTimer = null;
function showLinkPopover(a) {
  const pop = $('link-popover');
  const url = a.getAttribute('href') || '';
  $('link-popover-url').textContent = url;
  $('link-popover-open').setAttribute('href', url);
  $('link-popover-remove').onclick = () => {
    const parent = a.parentNode;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
    parent.normalize();
    pop.hidden = true;
    triggerAutosave();
    toast('Линк устгагдлаа.');
  };
  pop.hidden = false;
  const r = a.getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
}
function hideLinkPopover() {
  $('link-popover').hidden = true;
}

// ---------- Table management ----------
function insertTable(rows, cols, hasHeader, border) {
  const table = document.createElement('table');
  table.className = 'editor-table';
  if (border === 'none') table.classList.add('no-border');
  if (border === 'outer') table.classList.add('outer-border');
  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    if (hasHeader && r === 0) tr.classList.add('header-row');
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement(hasHeader && r === 0 ? 'th' : 'td');
      cell.contentEditable = 'true';
      cell.innerHTML = '&nbsp;';
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  const sel = window.getSelection();

  const range = getInsertRange();
  range.deleteContents();
  range.insertNode(table);
  const br = document.createElement('br');
  range.insertNode(br);
  range.setStartAfter(br); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  $('editor').focus();
  triggerAutosave();
  toast('Хүснэгт нэмэгдлээ.');
}
function getActiveTable() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node && node !== $('editor')) {
    if (node.nodeName === 'TABLE') return node;
    node = node.parentNode;
  }
  return null;
}
function getActiveCell() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node && node !== $('editor')) {
    if (node.nodeName === 'TD' || node.nodeName === 'TH') return node;
    node = node.parentNode;
  }
  return null;
}
function addRow(table, above) {
  const cell = getActiveCell();
  if (!cell) return;
  const row = cell.parentNode;
  const idx = Array.from(table.rows).indexOf(row);
  const newRow = table.insertRow(above ? idx : idx + 1);
  for (let c = 0; c < row.cells.length; c++) {
    const newCell = newRow.insertCell(c);
    newCell.contentEditable = 'true';
    newCell.innerHTML = '&nbsp;';
  }
  triggerAutosave();
}
function addCol(table, before) {
  const cell = getActiveCell();
  if (!cell) return;
  const colIdx = cell.cellIndex;
  Array.from(table.rows).forEach(row => {
    const newCell = row.insertCell(before ? colIdx : colIdx + 1);
    newCell.contentEditable = 'true';
    newCell.innerHTML = '&nbsp;';
  });
  triggerAutosave();
}
function deleteRow(table) {
  const cell = getActiveCell();
  if (!cell) return;
  const row = cell.parentNode;
  if (table.rows.length <= 1) { toast('Сүүлийн мөрийг устгах боломжгүй.'); return; }
  row.remove();
  triggerAutosave();
}
function deleteCol(table) {
  const cell = getActiveCell();
  if (!cell) return;
  const colIdx = cell.cellIndex;
  if (table.rows[0].cells.length <= 1) { toast('Сүүлийн баганыг устгах боломжгүй.'); return; }
  Array.from(table.rows).forEach(row => row.deleteCell(colIdx));
  triggerAutosave();
}
function deleteTable(table) { if (confirm('Хүснэгт устгах уу?')) { table.remove(); triggerAutosave(); toast('Хүснэгт устгагдлаа.'); } }
function updateTableToolbar() {
  const tb = $('table-toolbar');
  const table = getActiveTable();
  if (table) {
    tb.hidden = false;
    const rect = table.getBoundingClientRect();
    const wrapRect = document.querySelector('.editor-wrap').getBoundingClientRect();
    tb.style.top = (rect.top - wrapRect.top - 44) + 'px';
    tb.style.left = (rect.left - wrapRect.left) + 'px';
  } else {
    tb.hidden = true;
  }
}

// ---------- Time capsule ----------
function createCapsule(title, unlockDate, content) {
  const capsule = document.createElement('div');
  capsule.className = 'time-capsule';
  capsule.dataset.unlock = unlockDate;
  capsule.dataset.content = content;
  capsule.dataset.title = title;
  renderCapsule(capsule);
  const sel = window.getSelection();

  const range = getInsertRange();
  range.deleteContents();
  range.insertNode(capsule);
  const br = document.createElement('br');
  range.insertNode(br);
  range.setStartAfter(br); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  $('editor').focus();
  triggerAutosave();
  toast('Цагны капсул үүслээ.');
}
function renderCapsule(capsule) {
  const unlock = new Date(capsule.dataset.unlock);
  const now = new Date();
  const locked = now < unlock;
  capsule.replaceChildren();
  if (locked) {
    const box = document.createElement('div'); box.className = 'capsule-locked';
    const icon = document.createElement('div'); icon.className = 'capsule-icon'; icon.textContent = '⏳';
    const title = document.createElement('div'); title.className = 'capsule-title'; title.textContent = capsule.dataset.title || 'Цагны капсул';
    const msg = document.createElement('div'); msg.className = 'capsule-msg'; msg.textContent = `Нээх хугацаа: ${unlock.toLocaleString('mn-MN')}`;
    const countdown = document.createElement('div'); countdown.className = 'capsule-countdown'; countdown.textContent = formatCountdown(unlock - now);
    box.append(icon, title, msg, countdown);
    capsule.append(box);
    setTimeout(() => renderCapsule(capsule), Math.min(unlock - new Date(), 60000));
  } else {
    const box = document.createElement('div'); box.className = 'capsule-opened';
    const icon = document.createElement('div'); icon.className = 'capsule-icon'; icon.textContent = '🔓';
    const title = document.createElement('div'); title.className = 'capsule-title'; title.textContent = capsule.dataset.title || 'Цагны капсул';
    const content = document.createElement('div'); content.className = 'capsule-content'; content.innerHTML = capsule.dataset.content || '';
    box.append(icon, title, content);
    capsule.append(box);
  }
}
function formatCountdown(ms) {
  if (ms <= 0) return 'Нээгдэж байна...';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} өдөр ${h} цаг ${m} мин`;
  if (h > 0) return `${h} цаг ${m} мин ${sec} сек`;
  return `${m} мин ${sec} сек`;
}
function renderAllCapsules() {
  document.querySelectorAll('.time-capsule').forEach(c => renderCapsule(c));
}

// ---------- Tag management ----------
function addTag(t) {
  t = t.trim().replace(/^#/, '');
  if (!t) return;
  const current = [...$('tag-row').querySelectorAll('.tag')].map(x => x.firstChild.textContent);
  if (current.includes(t)) { toast('Шошго аль хэдийн байна.'); return; }
  const tag = document.createElement('span'); tag.className = 'tag';
  tag.append(document.createTextNode(t));
  const rm = document.createElement('span'); rm.className = 'tag-remove'; rm.textContent = '×';
  rm.addEventListener('click', () => removeTag(t));
  tag.append(rm); $('tag-row').append(tag);
  triggerAutosave();
}
function removeTag(t) {
  [...$('tag-row').querySelectorAll('.tag')].forEach(tag => { if (tag.firstChild.textContent === t) tag.remove(); });
  triggerAutosave();
}
function renderTagCloud() {
  const cloud = $('tag-cloud'); cloud.replaceChildren();
  const all = new Set();
  Object.values(state.entries).forEach(e => (e.tags || []).forEach(t => all.add(t)));
  all.forEach(t => {
    const b = document.createElement('button'); b.textContent = t;
    b.addEventListener('click', () => { addTag(t); closePopovers(); });
    cloud.append(b);
  });
}

// ---------- Highlight colors ----------
const HL_COLORS = ['#ffeb3b','#ff9800','#f48fb1','#81c784','#64b5f6','#b39ddb','#fff176','#ffcc80','#ef9a9a','#a5d6a7','#90caf9','#ce93d8','#f8bbd0','#d7ccc8','#b0bec5'];
function renderHighlightColors() {
  const wrap = $('hl-colors'); wrap.replaceChildren();
  HL_COLORS.forEach(c => {
    const b = document.createElement('button'); b.className = 'hl-color'; b.style.background = c;
    b.addEventListener('click', () => { highlightSelection(c); closePopovers(); });
    wrap.append(b);
  });
}
function highlightSelection(color) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { toast('Текст сонгоно уу.'); return; }
  document.execCommand('hiliteColor', false, color || '#ffeb3b');
  $('editor').focus();
  triggerAutosave();
}

// ---------- Link management ----------
// ---------- Font list ----------
function renderFontList() {
  const wrap = $('font-list'); wrap.replaceChildren();
  const groups = {
    'Sans-serif': ['Manrope','Inter','Roboto','Open Sans','Arial'],
    'Serif': ['Playfair Display','Merriweather','Lora','Georgia','Times New Roman'],
    'Mono': ['JetBrains Mono','Courier New'],
    'Гар бичмэл': ['Caveat (гар бичмэл)','Kalam','Indie Flower','Shadows Into Light','Dancing Script','Pacifico','Satisfy','Great Vibes','Sacramento','Allura','Tangerine','Yellowtail','Parisienne','Cookie','Gloria Hallelujah','Permanent Marker','Handlee','Homemade Apple','Reenie Beanie','Rock Salt','Amatic SC','Patrick Hand','Architects Daughter','Coming Soon','Covered By Your Grace','Nothing You Could Do'],
    'Монгол': ['Noto Sans Mongolian'],
  };
  const currentFont = $('editor').style.fontFamily || "'Manrope', system-ui, sans-serif";
  Object.entries(groups).forEach(([cat, names]) => {
    const h = document.createElement('div'); h.className = 'font-group-label'; h.textContent = cat; wrap.append(h);
    names.forEach(name => {
      const f = FONTS.find(x => x.name === name);
      if (!f) return;
      const b = document.createElement('button'); b.className = 'font-option' + (f.family === currentFont ? ' active' : '');
      b.style.fontFamily = f.family; b.textContent = `${f.name} — ${f.sample}`;
      b.addEventListener('click', () => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          document.execCommand('fontName', false, f.family);
        } else {
          applyFont(f.family);
        }
        state.settings.fontFamily = f.family;
        saveSettings();
        document.querySelectorAll('.font-option').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        toast(`Бичиг: ${f.name}`);
      });
      wrap.append(b);
    });
  });
}

// ---------- Popovers ----------
function closePopovers() {
  ['emoji-popover','gif-popover','color-popover','font-popover','tag-popover','highlight-popover'].forEach(id => $(id).hidden = true);
  $('link-popover').hidden = true;
}
function positionPopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.top = (r.bottom + 8) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
}
function togglePopover(id, anchor) {
  const pop = $(id);
  const wasHidden = pop.hidden;
  closePopovers();
  if (wasHidden) { pop.hidden = false; requestAnimationFrame(() => positionPopover(pop, anchor)); }
}

// ---------- Autosave ----------
function triggerAutosave() {
  updateWordCount();
  updateSaveStatus('Хадгалж байна...');
  clearTimeout(state.autosaveTimer);
  const delay = (state.settings.autosave || 3) * 1000;
  if (delay === 0) return;
  state.autosaveTimer = setTimeout(saveCurrent, delay);
}

// ---------- Export / Import ----------
function exportData() {
  const blob = new Blob([JSON.stringify({ entries: state.entries, settings: state.settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `temdegel-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Экспорт хийгдлээ.');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.entries) { state.entries = { ...state.entries, ...data.entries }; }
      if (data.settings) { state.settings = { ...state.settings, ...data.settings }; }
      saveSettings();
      renderEditor(); refreshMiniList(); updateStats();
      toast('Импорт хийгдлээ.');
    } catch { toast('Файл буруу форматтай.'); }
  };
  reader.readAsText(file);
}

// ---------- Settings ----------
function openSettings() {
  $('settings-name').value = state.settings.name || '';
  $('settings-theme').value = state.settings.theme || 'light';
  $('settings-autosave').value = String(state.settings.autosave ?? 3);
  $('settings-lock-pw').value = '';
  $('settings-lock-pw').dataset.hadValue = isLocked() ? 'true' : 'false';
  $('settings-reminder').value = localStorage.getItem('journal-reminder-interval') || '0';
  $('settings-dialog').showModal();
}
async function saveSettings() {
  state.settings.name = $('settings-name').value.trim();
  state.settings.theme = $('settings-theme').value;
  state.settings.autosave = Number($('settings-autosave').value);
  const lockPw = $('settings-lock-pw').value;
  if (lockPw) {
    localStorage.setItem(LOCK_KEY, await hashLockPw(lockPw));
    toast('Нууц үг тохируулагдлаа.');
  } else if (lockPw === '' && $('settings-lock-pw').dataset.hadValue === 'true') {
    localStorage.removeItem(LOCK_KEY);
    toast('Нууц үг устгагдлаа.');
  }
  const rem = $('settings-reminder').value;
  localStorage.setItem('journal-reminder-interval', rem);
  scheduleReminder();
  if (state.settings.theme === 'dark') applyTheme('Харанхуй');
  else if (state.settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('Харанхуй');
  else applyTheme(state.settings.themeName || 'Номин');
  localStorage.setItem(SETTINGS_KEY(), JSON.stringify(state.settings));
  $('settings-dialog').close();
  toast('Тохиргоо хадгалагдлаа.');
}

// ---------- Init ----------
function showAuth(mode = 'login') {
  const overlay = $('auth-overlay');
  const form = $('auth-form');
  form.reset();
  $('auth-error').textContent = '';
  form.dataset.mode = mode;
  const reg = mode === 'register';
  $('auth-title').textContent = reg ? 'Шинэ бүртгэл' : 'Нэвтрэх';
  $('auth-help').textContent = reg ? 'И-мэйл, нууц үгээ үүсгэнэ үү.' : 'И-мэйл, нууц үгээ оруулна уу.';
  $('auth-submit').textContent = reg ? 'Бүртгүүлэх ↗' : 'Нэвтрэх ↗';
  $('auth-switch').textContent = reg ? 'Бүртгэлтэй бол нэвтрэх' : 'Шинээр бүртгүүлэх';
  $('auth-password').autocomplete = reg ? 'new-password' : 'current-password';
  document.querySelector('.app').style.visibility = 'hidden';
  overlay.hidden = false;
}

function renderColorThemes() {
  const wrap = $('color-themes'); wrap.replaceChildren();
  THEMES.forEach(t => {
    const b = document.createElement('button'); b.className = 'color-theme' + (t.name === (state.settings.themeName || 'Номин') ? ' active' : '');
    b.style.background = 'linear-gradient(135deg, ' + t.accent + ', ' + t.bg + ')';
    b.innerHTML = '<span class="ct-name">' + t.name + '</span>';
    b.addEventListener('click', () => {
      applyTheme(t.name);
      state.settings.themeName = t.name;
      localStorage.setItem(SETTINGS_KEY(), JSON.stringify(state.settings));
      document.querySelectorAll('.color-theme').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      toast('Өнгө: ' + t.name);
    });
    wrap.append(b);
  });
}

function initDrawCanvas() {
  const canvas = $('draw-canvas');
  const ctx = canvas.getContext('2d');
  drawState.ctx = ctx;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  drawState.history = [canvas.toDataURL()];
  const wrap = $('draw-colors'); wrap.replaceChildren();
  ['#2a2433','#7c5cff','#ff7a3d','#2e9e5b','#e05a8a','#2b8fd9','#ffffff','#ffeb3b'].forEach(c => {
    const b = document.createElement('button'); b.className = 'draw-color' + (c === drawState.color ? ' active' : '');
    b.style.background = c; b.dataset.color = c;
    b.addEventListener('click', () => { drawState.color = c; document.querySelectorAll('.draw-color').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
    wrap.append(b);
  });
  document.querySelectorAll('.draw-tool').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.draw-tool').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); drawState.tool = b.dataset.tool;
  }));
  $('draw-size').addEventListener('input', e => { drawState.size = +e.target.value; $('draw-size-val').textContent = e.target.value; });
  $('draw-undo').addEventListener('click', undoDraw);
  $('draw-clear').addEventListener('click', () => { if (confirm('Зургийг цэвэрлэх үү?')) clearCanvas(); });
  $('draw-save').addEventListener('click', saveDrawingAsImage);
  $('draw-close').addEventListener('click', () => { $('draw-panel').hidden = true; });
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); moveDraw(e.touches[0]); });
  canvas.addEventListener('touchend', endDraw);
}
function getCanvasPos(e) {
  const canvas = $('draw-canvas');
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function startDraw(e) {
  drawState.drawing = true;
  const pos = getCanvasPos(e);
  const ctx = drawState.ctx;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  if (drawState.tool === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineWidth = drawState.size * 3; ctx.strokeStyle = drawState.color; }
  else if (drawState.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = drawState.size * 4; }
  else if (drawState.tool === 'marker') { ctx.globalAlpha = 0.85; ctx.lineWidth = drawState.size * 2; ctx.strokeStyle = drawState.color; }
  else { ctx.globalAlpha = 1; ctx.lineWidth = drawState.size; ctx.strokeStyle = drawState.color; }
  if (drawState.tool !== 'eraser') ctx.globalCompositeOperation = 'source-over';
}
function moveDraw(e) {
  if (!drawState.drawing) return;
  const pos = getCanvasPos(e);
  const ctx = drawState.ctx;
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}
function endDraw() {
  if (!drawState.drawing) return;
  drawState.drawing = false;
  const ctx = drawState.ctx;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawState.history.push($('draw-canvas').toDataURL());
  if (drawState.history.length > 30) drawState.history.shift();
}
function undoDraw() {
  if (drawState.history.length <= 1) return;
  drawState.history.pop();
  const img = new Image();
  img.onload = () => {
    const canvas = $('draw-canvas');
    const ctx = drawState.ctx;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  img.src = drawState.history[drawState.history.length - 1];
}
function clearCanvas() {
  const canvas = $('draw-canvas');
  const ctx = drawState.ctx;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  drawState.history = [canvas.toDataURL()];
}
function saveDrawingAsImage() {
  const dataUrl = $('draw-canvas').toDataURL('image/png');
  insertImageAtCursor(dataUrl, 'Зураг');
  toast('Зураг тэмдэглэлд нэмэгдлээ.');
  $('draw-panel').hidden = true;
}
const drawState = { tool: 'pencil', color: '#2a2433', size: 3, drawing: false, history: [], ctx: null };

async function enterApp(user) {
  state.session = user;
  $('side-user').hidden = false;
  $('session-name').textContent = user.username;
  $('logout-btn').hidden = false;
  await load();
  scheduleReminder();
  if (state.settings.theme === 'dark') applyTheme('Харанхуй');
  else if (state.settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('Харанхуй');
  else applyTheme(state.settings.themeName || 'Номин');
  if (state.settings.fontFamily) applyFont(state.settings.fontFamily);
  $('entry-date').value = state.current;
  renderEditor();
  refreshMiniList();
  updateStats();
  renderEmojiTabs();
  renderColorThemes();
  renderFontList();
}

function attachAppListeners() {
  $('entry-date').addEventListener('change', e => { state.current = e.target.value; renderEditor(); });
  $('prev-day').addEventListener('click', () => goDate(-1));
  $('next-day').addEventListener('click', () => goDate(1));
  $('today-btn').addEventListener('click', goToday);
  document.querySelectorAll('.mood-btn').forEach(b => b.addEventListener('click', () => {
    const active = b.classList.contains('active');
    document.querySelectorAll('.mood-btn').forEach(x => x.classList.remove('active'));
    if (!active) b.classList.add('active');
    triggerAutosave();
  }));
  document.querySelectorAll('.tb[data-cmd]').forEach(b => b.addEventListener('click', () => {
    const cmd = b.dataset.cmd, val = b.dataset.val;
    if (val) document.execCommand(cmd, false, val);
    else document.execCommand(cmd, false, null);
    $('editor').focus();
    triggerAutosave();
  }));
  $('emoji-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('emoji-popover', e.currentTarget); });
  $('gif-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('gif-popover', e.currentTarget); searchGif(''); });
  $('color-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('color-popover', e.currentTarget); });
  $('font-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('font-popover', e.currentTarget); });
  $('tag-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('tag-popover', e.currentTarget); renderTagCloud(); });
  $('highlight-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('highlight-popover', e.currentTarget); renderHighlightColors(); });
  $('image-btn').addEventListener('click', () => $('image-file').click());
  $('image-file').addEventListener('change', e => {
    const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
    files.forEach(f => insertImageFile(f));
    if (files.length > 1) toast(`${files.length} зураг нэмэгдлээ.`);
    e.target.value = '';
  });
  $('entry-title').addEventListener('input', triggerAutosave);
  $('draw-btn').addEventListener('click', () => {
    const panel = $('draw-panel'); panel.hidden = !panel.hidden;
    if (!panel.hidden && !drawState.ctx) initDrawCanvas();
    if (!panel.hidden) {
      const canvas = $('draw-canvas');
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = (rect.width - 24) + 'px';
      canvas.style.height = '360px';
      canvas.width = (rect.width - 24) * dpr;
      canvas.height = 360 * dpr;
      if (drawState.ctx) drawState.ctx.scale(dpr, dpr);
    }
  });
  $('link-btn').addEventListener('click', createLink);
  $('table-btn').addEventListener('click', () => $('table-dialog').showModal());
  $('table-create').addEventListener('click', () => {
    const rows = Math.max(1, Math.min(20, +$('table-rows').value || 3));
    const cols = Math.max(1, Math.min(10, +$('table-cols').value || 3));
    const header = $('table-header').value === 'yes';
    const border = $('table-border').value;
    insertTable(rows, cols, header, border);
    $('table-dialog').close();
  });
  $('table-dialog').addEventListener('cancel', e => e.preventDefault());
  $('tbl-add-row-above').addEventListener('click', () => { const t = getActiveTable(); if (t) addRow(t, true); });
  $('tbl-add-row-below').addEventListener('click', () => { const t = getActiveTable(); if (t) addRow(t, false); });
  $('tbl-add-col-left').addEventListener('click', () => { const t = getActiveTable(); if (t) addCol(t, true); });
  $('tbl-add-col-right').addEventListener('click', () => { const t = getActiveTable(); if (t) addCol(t, false); });
  $('tbl-del-row').addEventListener('click', () => { const t = getActiveTable(); if (t) deleteRow(t); updateTableToolbar(); });
  $('tbl-del-col').addEventListener('click', () => { const t = getActiveTable(); if (t) deleteCol(t); updateTableToolbar(); });
  $('tbl-del-table').addEventListener('click', () => { const t = getActiveTable(); if (t) { deleteTable(t); updateTableToolbar(); } });
  $('editor').addEventListener('click', () => { setTimeout(updateTableToolbar, 50); });
  $('editor').addEventListener('keyup', () => { setTimeout(updateTableToolbar, 50); });
  $('capsule-btn').addEventListener('click', () => {
    const now = new Date(); now.setHours(now.getHours() + 1);
    $('capsule-date').value = now.toISOString().slice(0, 16);
    $('capsule-dialog').showModal();
  });
  $('capsule-create').addEventListener('click', () => {
    const title = $('capsule-title').value.trim();
    const date = $('capsule-date').value;
    const content = $('capsule-content').value.trim();
    if (!date) { toast('Хугацаа сонгоно уу.'); return; }
    if (!content) { toast('Агуулга бичнэ үү.'); return; }
    createCapsule(title, date, content);
    $('capsule-dialog').close();
    $('capsule-title').value = '';
    $('capsule-content').value = '';
  });
  $('capsule-dialog').addEventListener('cancel', e => e.preventDefault());
  $('clear-btn').addEventListener('click', () => { if (confirm('Тэмдэглэлийг цэвэрлэх үү?')) { $('editor').innerHTML = ''; triggerAutosave(); } });
  $('hl-custom').addEventListener('input', e => { highlightSelection(e.target.value); closePopovers(); });
  $('emoji-search').addEventListener('input', e => filterEmoji(e.target.value));
  $('gif-search').addEventListener('input', e => { clearTimeout(gifTimer); gifTimer = setTimeout(() => searchGif(e.target.value), 400); });
  $('custom-color').addEventListener('input', e => {
    document.documentElement.style.setProperty('--accent', e.target.value);
    toast('Өнгө өөрчлөгдлөө.');
  });
  $('tag-add').addEventListener('click', () => { addTag($('tag-input').value); $('tag-input').value = ''; });
  $('tag-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); e.target.value = ''; } });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    const el = $(b.dataset.close);
    if (el && typeof el.close === 'function') el.close();
    else if (el) el.hidden = true;
  }));
  document.addEventListener('click', e => {
    const popovers = ['emoji-popover','gif-popover','color-popover','font-popover','tag-popover','highlight-popover'];
    if (!popovers.some(id => { const p = $(id); return !p.hidden && p.contains(e.target); }) && !e.target.closest('.tb') && !e.target.closest('a')) {
      closePopovers();
    }
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('nav-calendar').addEventListener('click', () => { calMonth = new Date(state.current); renderCalendar(); });
  $('cal-prev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
  $('list-search').addEventListener('input', renderList);
  $('list-sort').addEventListener('change', renderList);
  $('mini-sort').addEventListener('change', refreshMiniList);
  $('global-search').addEventListener('input', e => doSearch(e.target.value));
  $('editor').addEventListener('input', triggerAutosave);
  $('editor').addEventListener('blur', saveCurrent);
  $('editor').addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  $('editor').addEventListener('drop', e => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    files.forEach(f => insertImageFile(f));
    if (files.length) toast(`${files.length} зураг нэмэгдлээ.`);
  });
  document.querySelector('.editor-wrap').addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.querySelector('.editor-wrap').addEventListener('drop', e => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    files.forEach(f => insertImageFile(f));
  });
  $('export-btn').addEventListener('click', exportData);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('settings-btn').addEventListener('click', openSettings);
  $('settings-save').addEventListener('click', saveSettings);
  $('settings-dialog').addEventListener('cancel', e => e.preventDefault());
  $('fab-new').addEventListener('click', () => { state.current = todayStr(); switchView('editor'); renderEditor(); });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrent(); toast('Хадгалагдлаа.'); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
  });
  window.addEventListener('beforeunload', saveCurrent);
}

async function init() {
  if (isLocked()) {
    document.querySelector('.app').style.visibility = 'hidden';
    showLock();
    $('lock-submit').addEventListener('click', unlock);
    $('lock-password').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
    await new Promise(resolve => {
      const check = setInterval(() => { if (!$('lock-dialog').open) { clearInterval(check); resolve(); } }, 200);
    });
    document.querySelector('.app').style.visibility = 'visible';
  }

  $('auth-submit').addEventListener('click', doAuth);
  $('auth-form').addEventListener('submit', e => { e.preventDefault(); doAuth(); });
  $('auth-switch').addEventListener('click', () => showAuth($('auth-form').dataset.mode === 'login' ? 'register' : 'login'));
  $('logout-btn').addEventListener('click', doLogout);
  attachAppListeners();

  const user = await getCurrentUser();
  if (!user) {
    showAuth('login');
    return;
  }
  await enterApp(user);
}

init();