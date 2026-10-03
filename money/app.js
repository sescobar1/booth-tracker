// Money: check register, bank statement matching, and tax documents in one place.
// Everything saves on the device first; db.js keeps it matched with the cloud when signed in.
// Receipts, tax forms and statements are uploaded to a private storage bucket only this account can open.
const CFG = window.MONEY_CONFIG || {};
const KEY = CFG.storageKey || 'moneyApp';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDay(new Date());
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const DEFAULT_CATEGORIES = ['House Bill', 'Groceries', 'Gas', 'Eating out', 'Car', 'Insurance', 'Utilities', 'Phone & internet', 'Subscriptions', 'Medical', 'Kids & school', 'Band', 'Booth business', 'Personal care', 'Shopping', 'Gifts & donations', 'Savings', 'Paycheck', 'Transfer', 'Other'];
// Tax categories an expense (or receipt) can count toward.
const DEFAULT_TAX_CATS = ['Charitable donations', 'Medical & dental', 'Mortgage interest', 'Property & personal property tax', 'Booth business – supplies & inventory', 'Booth business – booth rent & fees', 'Booth business – mileage', 'Education', 'Childcare', 'Other deductible'];
// The yearly tax checklist: papers to gather. Each one checks itself off when a file is uploaded to it.
const DEFAULT_CHECKLIST = [
  { key: 'w2', title: 'W-2 from each job (ATU, etc.)' },
  { key: '1099nec', title: '1099-NEC / 1099-K (booth sales, side work)' },
  { key: '1099int', title: '1099-INT / 1099-DIV (bank interest, investments)' },
  { key: '1098', title: '1098 Mortgage interest (Shellpoint)' },
  { key: 'proptax', title: 'Property tax & personal property (car) tax receipts' },
  { key: '1095', title: '1095 Health insurance form' },
  { key: '1098t', title: '1098-T Tuition (college)' },
  { key: 'childcare', title: 'Childcare / after-school receipts' },
  { key: 'donations', title: 'Donation receipts (church, band, charity)' },
  { key: 'medical', title: 'Medical & dental bills' },
  { key: 'booth', title: 'Booth business summary (Booth Tracker → Taxes)' },
  { key: 'estimated', title: 'Estimated tax payments made' },
  { key: 'lastyear', title: 'Last year\'s tax return' }
];

function blank() {
  return { accounts: [], tx: [], docs: [], settings: { categories: DEFAULT_CATEGORIES.slice(), taxCats: DEFAULT_TAX_CATS.slice(), checklist: DEFAULT_CHECKLIST.slice() } };
}
// `data` is global so db.js can swap in another device's copy.
var data = (() => {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.tx) return Object.assign(blank(), d); } catch (e) {}
  return blank();
})();
['categories', 'taxCats', 'checklist'].forEach(k => { if (!data.settings[k]) data.settings[k] = blank().settings[k]; });

window.save = function () {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('Could not save on this device: ' + e.message); }
};

// ---------- formatting ----------
const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
function fmtDate(iso, long) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const opts = { weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString([], opts);
}
const monthName = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }); };
// Spreadsheet and app dates: "Oct 2, 2026 at 6:08 AM", 10/02/2026, 2026-10-02, or a spreadsheet day number.
function parseDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isoDay(v);
  const s = String(v).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(m[1]) + '-' + pad(m[2]); }
  m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s*(\d{4})/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return m[3] + '-' + pad(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1) + '-' + pad(m[2]);
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Math.round((Number(s) - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  return '';
}
function parseTime(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})\s*([AP])M/i);
  if (!m) return '';
  let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12;
  return pad(h) + ':' + m[2];
}

// ---------- UI helpers ----------
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400); }
window.toast = toast;
function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; document.body.classList.add('locked'); }
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; document.body.classList.remove('locked'); }
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = x => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x);
const signedIn = () => !!(window.moneySync && window.moneySync.user());

// ---------- accounts & balances ----------
const account = id => data.accounts.find(a => a.id === id);
let currentAccount = null;
function activeAccount() {
  if (!data.accounts.length) return null;
  if (!account(currentAccount)) currentAccount = data.accounts.slice().sort((a, b) => a.sort - b.sort)[0].id;
  return account(currentAccount);
}
const signed = t => t.type === 'income' ? Number(t.amount) : -Number(t.amount);
// Oldest first, so a running balance can be added up.
const byTime = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || String(a.id).localeCompare(String(b.id));
function balances(acc) {
  const list = data.tx.filter(t => t.accountId === acc.id).sort(byTime);
  let bal = Number(acc.openingBalance) || 0, cleared = bal;
  const running = {};
  list.forEach(t => { bal += signed(t); if (t.cleared) cleared += signed(t); running[t.id] = bal; });
  return { balance: Math.round(bal * 100) / 100, cleared: Math.round(cleared * 100) / 100, running, list };
}

// ---------- routing ----------
function route() {
  const [tab, arg] = (location.hash.slice(1) || 'register').split('/');
  const tabOf = { reports: 'register', import: 'more', accounts: 'more' };
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tabOf[tab] || tab)));
  const views = { register: viewRegister, reports: viewReports, bank: viewBank, taxes: viewTaxes, more: viewMore, import: viewImport };
  (views[tab] || viewRegister)(arg);
}
window.render = () => { const y = window.scrollY; if (!(location.hash.startsWith('#bank') && bankState)) route(); window.scrollTo(0, y); };
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
$('topAdd').onclick = () => editTx(null, 'expense');

// ---------- Register ----------
let regMonth = '', regSearch = '', regCat = '';
function viewRegister() {
  const acc = activeAccount();
  if (!acc) {
    $('view').innerHTML = (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') +
      '<div class="empty"><h2>Welcome!</h2><p>Bring in your check register from the CheckBook app, or start a new account.</p>' +
      '<div class="row-actions" style="justify-content:center"><a class="button" href="#import">⬆ Import CheckBook file</a><button type="button" class="ghost" id="newAcc">+ New account</button></div></div>';
    $('newAcc').onclick = () => editAccount();
    if (window.moneySync) window.moneySync.renderBox();
    return;
  }
  const b = balances(acc);
  const months = [...new Set(b.list.map(t => t.date.slice(0, 7)))].sort().reverse();
  const q = regSearch.toLowerCase();
  const shown = b.list.filter(t => (!regMonth || t.date.startsWith(regMonth)) && (!regCat || (t.category || '') === regCat) &&
    (!q || [t.payee, t.note, t.category, t.checkNum, String(t.amount)].join(' ').toLowerCase().includes(q))).reverse();
  let lastDate = '', rows = '';
  shown.forEach(t => {
    if (t.date !== lastDate) { rows += '<div class="day">' + esc(fmtDate(t.date, true)) + '</div>'; lastDate = t.date; }
    rows += '<div class="tx' + (t.cleared ? ' cleared' : '') + '" data-tx="' + t.id + '">' +
      '<button type="button" class="clr" data-clear="' + t.id + '" title="' + (t.cleared ? 'Cleared – tap to unclear' : 'Not cleared – tap to clear') + '">' + (t.cleared ? '✓' : '') + '</button>' +
      '<div class="who"><b>' + esc(t.payee || '(no payee)') + '</b>' +
      '<span class="sub">' + esc([t.category, t.checkNum ? '#' + t.checkNum : '', t.note].filter(Boolean).join(' · ')) + '</span>' +
      (t.taxCat || t.receipt ? '<span class="sub">' + (t.taxCat ? '<span class="chip tax">🧾 ' + esc(t.taxCat) + '</span> ' : '') + (t.receipt ? '<span class="chip">📎 receipt</span>' : '') + '</span>' : '') + '</div>' +
      '<div class="amt"><b class="' + t.type + '">' + (t.type === 'income' ? '+' : '−') + money(t.amount).replace('−', '') + '</b><span class="sub">' + money(b.running[t.id]) + '</span></div></div>';
  });
  const accOpts = data.accounts.length > 1 ? '<select id="accPick">' + data.accounts.slice().sort((a, c) => a.sort - c.sort).map(a => '<option value="' + a.id + '"' + (a.id === acc.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select>' : '<b>' + esc(acc.name) + '</b>';
  const monthIn = regMonth ? b.list.filter(t => t.date.startsWith(regMonth)) : [];
  $('view').innerHTML = (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') +
    '<div class="toptabs"><a href="#register" class="on">📒 Register</a><a href="#reports">📊 Spending</a></div>' +
    '<div class="balance-card"><div class="acc">' + accOpts + '</div>' +
    '<div class="bal"><span>Balance</span><b class="' + (b.balance < 0 ? 'neg' : '') + '">' + money(b.balance) + '</b></div>' +
    '<div class="bal-row"><span>Cleared: <b>' + money(b.cleared) + '</b></span><span>Not cleared: <b>' + money(b.balance - b.cleared) + '</b></span></div></div>' +
    '<div class="row-actions quick"><button type="button" id="addExp">− Expense</button><button type="button" class="income-btn" id="addInc">+ Income</button></div>' +
    '<div class="filters"><input id="regFind" type="search" placeholder="Search payee, note, amount" value="' + esc(regSearch) + '">' +
    '<select id="regMonth"><option value="">All months</option>' + months.map(m => '<option value="' + m + '"' + (m === regMonth ? ' selected' : '') + '>' + esc(monthName(m)) + '</option>').join('') + '</select>' +
    '<select id="regCat"><option value="">All categories</option>' + data.settings.categories.map(c => '<option' + (c === regCat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
    (regMonth ? '<p class="helper">' + esc(monthName(regMonth)) + ': in ' + money(monthIn.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)) + ' · out ' + money(monthIn.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)) + '</p>' : '') +
    (rows || '<p class="helper">No entries' + (q || regMonth || regCat ? ' match' : ' yet') + '.</p>');
  if ($('accPick')) $('accPick').onchange = e => { currentAccount = e.target.value; viewRegister(); };
  $('addExp').onclick = () => editTx(null, 'expense');
  $('addInc').onclick = () => editTx(null, 'income');
  $('regFind').oninput = e => { regSearch = e.target.value; clearTimeout(viewRegister.t); viewRegister.t = setTimeout(() => { viewRegister(); const f = $('regFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  $('regMonth').onchange = e => { regMonth = e.target.value; viewRegister(); };
  $('regCat').onchange = e => { regCat = e.target.value; viewRegister(); };
  $('view').querySelectorAll('[data-clear]').forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const t = data.tx.find(x => x.id === btn.dataset.clear); t.cleared = !t.cleared; window.save(); viewRegister();
  });
  $('view').querySelectorAll('[data-tx]').forEach(el => el.onclick = () => editTx(el.dataset.tx));
  if (window.moneySync) window.moneySync.renderBox();
}

// Last category used for a payee, so typing "Shellpoint" fills in "House Bill".
function payeeMemory() {
  const m = {};
  data.tx.slice().sort(byTime).forEach(t => { if (t.payee) m[t.payee.trim().toLowerCase()] = { category: t.category, type: t.type, taxCat: t.taxCat, amount: t.amount }; });
  return m;
}
function editTx(id, type) {
  const acc = activeAccount();
  if (!acc) { toast('Add an account first (More → Accounts).'); return; }
  const t = id ? data.tx.find(x => x.id === id) : { accountId: acc.id, date: today(), time: '', payee: '', amount: '', type: type || 'expense', category: '', note: '', checkNum: '', cleared: false, taxCat: '', receipt: '', source: 'Added' };
  let kind = t.type;
  const mem = payeeMemory();
  const payees = Object.keys(mem).length ? [...new Set(data.tx.map(x => (x.payee || '').trim()).filter(Boolean))].sort() : [];
  openModal('<h2>' + (id ? 'Edit entry' : kind === 'income' ? 'Add income' : 'Add expense') + '</h2>' +
    '<div class="segs" id="tKind"><button type="button" class="seg' + (kind === 'expense' ? ' on' : '') + '" data-k="expense">− Expense</button><button type="button" class="seg' + (kind === 'income' ? ' on' : '') + '" data-k="income">+ Income</button></div>' +
    '<label>Amount<input id="tAmt" inputmode="decimal" placeholder="0.00" value="' + (t.amount === '' ? '' : Number(t.amount).toFixed(2)) + '" class="big-input"></label>' +
    '<label>Payee<input id="tPayee" list="payees" value="' + esc(t.payee) + '" placeholder="Walmart" autocapitalize="words"></label><datalist id="payees">' + payees.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Category<input id="tCat" list="cats" value="' + esc(t.category) + '" placeholder="Groceries"></label><label>Date<input id="tDate" type="date" value="' + esc(t.date) + '"></label></div>' +
    '<datalist id="cats">' + data.settings.categories.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Check #<input id="tCheck" inputmode="numeric" value="' + esc(t.checkNum) + '"></label>' +
    (data.accounts.length > 1 ? '<label>Account<select id="tAcc">' + data.accounts.map(a => '<option value="' + a.id + '"' + (a.id === t.accountId ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></label>' : '<span></span>') + '</div>' +
    '<label>Note<input id="tNote" value="' + esc(t.note) + '"></label>' +
    '<label class="check"><input type="checkbox" id="tClr"' + (t.cleared ? ' checked' : '') + '> Cleared the bank</label>' +
    '<details class="taxbox"' + (t.taxCat || t.receipt ? ' open' : '') + '><summary>🧾 Taxes &amp; receipt</summary>' +
    '<label>Counts for taxes as<select id="tTax"><option value="">— not for taxes —</option>' + data.settings.taxCats.map(c => '<option' + (c === t.taxCat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
    '<div class="row-actions">' + (t.receipt ? '<button type="button" class="ghost small" id="tView">📎 View receipt</button>' : '') +
    '<label class="button ghost small file">📷 ' + (t.receipt ? 'Replace' : 'Add') + ' receipt<input type="file" id="tFile" accept="image/*,application/pdf" hidden></label></div>' +
    '<p class="helper" id="tFileNote">' + (signedIn() ? 'Receipts are stored privately in your account.' : 'Sign in to save receipt photos.') + '</p></details>' +
    '<div class="row-actions"><button type="button" id="tSave">Save</button><button type="button" class="ghost" id="tCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="tDel">Delete</button>' : '') + '</div>');
  let pendingFile = null;
  $('tKind').querySelectorAll('.seg').forEach(b => b.onclick = () => { kind = b.dataset.k; $('tKind').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); });
  $('tPayee').onchange = () => {
    const m = mem[$('tPayee').value.trim().toLowerCase()];
    if (m && !$('tCat').value) $('tCat').value = m.category || '';
    if (m && !id && !$('tAmt').value && m.category === 'House Bill') $('tAmt').value = Number(m.amount).toFixed(2);
    if (m && m.taxCat && !$('tTax').value) $('tTax').value = m.taxCat;
  };
  $('tFile').onchange = e => { pendingFile = e.target.files[0] || null; if (pendingFile) $('tFileNote').textContent = '📎 ' + pendingFile.name + ' will be saved with this entry.'; };
  if ($('tView')) $('tView').onclick = () => openFile(t.receipt);
  $('tCancel').onclick = closeModal;
  $('tSave').onclick = async () => {
    const amount = toNum($('tAmt').value);
    if (!amount) { toast('Enter the amount.'); return; }
    if (!$('tDate').value) { toast('Pick the date.'); return; }
    if (pendingFile && !signedIn()) { toast('Sign in (More → Account) to save receipt photos.'); return; }
    Object.assign(t, { amount: Math.abs(amount), type: kind, payee: $('tPayee').value.trim(), category: $('tCat').value.trim(), date: $('tDate').value, checkNum: $('tCheck').value.trim(), note: $('tNote').value.trim(), cleared: $('tClr').checked, taxCat: $('tTax').value, accountId: $('tAcc') ? $('tAcc').value : t.accountId });
    if (!id) { t.id = uid(); t.time = new Date().toTimeString().slice(0, 5); data.tx.push(t); }
    if (t.category && !data.settings.categories.includes(t.category)) data.settings.categories.push(t.category);
    if (pendingFile) {
      $('tSave').disabled = true; $('tSave').textContent = 'Saving receipt…';
      try { t.receipt = await uploadFile(pendingFile, t.date.slice(0, 4) + '/receipts'); }
      catch (e) { toast('The entry saved, but the receipt didn\'t upload: ' + e.message); }
    }
    window.save(); closeModal(); route();
  };
  if (id) $('tDel').onclick = () => {
    if (!confirm('Delete ' + (t.payee || 'this entry') + ' (' + money(t.amount) + ')?')) return;
    data.tx = data.tx.filter(x => x.id !== id); window.save(); closeModal(); route();
  };
  setTimeout(() => { if (!id) $('tAmt').focus(); }, 50);
}

// ---------- private files ----------
// Photos are shrunk before upload; PDFs go up as they are. Paths start with the account id (storage rules).
async function shrinkImage(file) {
  if (!/^image\//.test(file.type) || file.size < 600000) return file;
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
async function uploadFile(file, folder) {
  const sb = window.moneySync && window.moneySync.client(), user = window.moneySync && window.moneySync.user();
  if (!sb || !user) throw new Error('Sign in first.');
  if (!navigator.onLine) throw new Error('No signal right now.');
  const f = await shrinkImage(file);
  const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = user.id + '/' + folder + '/' + uid() + '-' + safe;
  const { error } = await sb.storage.from(CFG.bucket || 'money').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return path;
}
async function openFile(path) {
  const sb = window.moneySync && window.moneySync.client();
  if (!sb || !signedIn()) { toast('Sign in to open saved files.'); return; }
  const w = window.open('', '_blank');
  const { data: d, error } = await sb.storage.from(CFG.bucket || 'money').createSignedUrl(path, 600);
  if (error) { if (w) w.close(); toast('Could not open the file: ' + error.message); return; }
  if (w) w.location = d.signedUrl; else location.href = d.signedUrl;
}

// ---------- Accounts ----------
function editAccount(id) {
  const a = id ? account(id) : { name: 'Checking', kind: 'checking', openingBalance: 0, openingDate: null, sort: data.accounts.length };
  const b = id ? balances(a) : null;
  openModal('<h2>' + (id ? 'Edit account' : 'New account') + '</h2>' +
    '<label>Name<input id="aName" value="' + esc(a.name) + '" placeholder="Checking"></label>' +
    '<label>Type<select id="aKind">' + [['checking', 'Checking'], ['savings', 'Savings'], ['credit', 'Credit card'], ['cash', 'Cash']].map(([v, l]) => '<option value="' + v + '"' + (a.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<h3>Starting balance</h3><p class="helper">Easiest: type what the bank says your balance is <b>right now</b>, and the app works out the rest. Or set the balance from before your first entry.</p>' +
    '<div class="grid2"><label>Balance right now (from the bank)<input id="aNow" inputmode="decimal" placeholder="' + (b ? money(b.balance) : '0.00') + '"></label>' +
    '<label>Or: balance before first entry<input id="aOpen" inputmode="decimal" value="' + Number(a.openingBalance || 0).toFixed(2) + '"></label></div>' +
    '<div class="row-actions"><button type="button" id="aSave">Save</button><button type="button" class="ghost" id="aCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="aDel">Delete account</button>' : '') + '</div>');
  $('aCancel').onclick = closeModal;
  $('aSave').onclick = () => {
    const name = $('aName').value.trim(); if (!name) { toast('Name the account.'); return; }
    Object.assign(a, { name, kind: $('aKind').value, openingBalance: toNum($('aOpen').value) });
    if (!id) { a.id = uid(); data.accounts.push(a); currentAccount = a.id; }
    if ($('aNow').value.trim()) {
      // Opening = today's bank balance minus everything entered so far.
      const net = data.tx.filter(t => t.accountId === a.id).reduce((s, t) => s + signed(t), 0);
      a.openingBalance = Math.round((toNum($('aNow').value) - net) * 100) / 100;
    }
    window.save(); closeModal(); route();
  };
  if (id) $('aDel').onclick = () => {
    const n = data.tx.filter(t => t.accountId === id).length;
    if (!confirm('Delete ' + a.name + ' and its ' + n + ' entries? This can\'t be undone.')) return;
    data.accounts = data.accounts.filter(x => x.id !== id); data.tx = data.tx.filter(t => t.accountId !== id); window.save(); closeModal(); route();
  };
}

// ---------- Spending report ----------
let repMonth = '';
function viewReports() {
  const acc = activeAccount();
  // Moving money between her own accounts isn't spending or income.
  const list = data.tx.filter(t => (!acc || t.accountId === acc.id) && t.category !== 'Transfer');
  const months = [...new Set(list.map(t => t.date.slice(0, 7)))].sort().reverse();
  if (!repMonth || !months.includes(repMonth)) repMonth = months[0] || today().slice(0, 7);
  const inMonth = list.filter(t => t.date.startsWith(repMonth));
  const out = inMonth.filter(t => t.type === 'expense'), inc = inMonth.filter(t => t.type === 'income');
  const totOut = out.reduce((s, t) => s + Number(t.amount), 0), totIn = inc.reduce((s, t) => s + Number(t.amount), 0);
  const byCat = {};
  out.forEach(t => { const c = t.category || 'Uncategorized'; byCat[c] = (byCat[c] || 0) + Number(t.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  const last6 = months.slice(0, 6).reverse().map(m => {
    const l = list.filter(t => t.date.startsWith(m));
    return { m, inc: l.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), out: l.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) };
  });
  $('view').innerHTML = '<div class="toptabs"><a href="#register">📒 Register</a><a href="#reports" class="on">📊 Spending</a></div>' +
    '<label>Month<select id="repMonth">' + (months.length ? months : [repMonth]).map(m => '<option value="' + m + '"' + (m === repMonth ? ' selected' : '') + '>' + esc(monthName(m)) + '</option>').join('') + '</select></label>' +
    '<div class="stat-row"><div class="stat"><span>Money in</span><b class="income">' + money(totIn) + '</b></div><div class="stat"><span>Money out</span><b class="expense">' + money(totOut) + '</b></div><div class="stat"><span>Left over</span><b class="' + (totIn - totOut < 0 ? 'expense' : 'income') + '">' + money(totIn - totOut) + '</b></div></div>' +
    '<div class="card pad"><h2>Where it went</h2>' + (cats.map(([c, v]) => '<div class="barrow" data-cat="' + esc(c) + '"><span class="lbl">' + esc(c) + '</span><span class="track"><span style="width:' + Math.max(2, Math.round(v / max * 100)) + '%"></span></span><b>' + money(v) + '</b></div>').join('') || '<p class="helper">No expenses this month.</p>') +
    (byCat.Uncategorized ? '<p class="helper">Tip: tap an entry in the Register to give it a category, and this gets more useful.</p>' : '') + '</div>' +
    (last6.length > 1 ? '<div class="card pad"><h2>Month by month</h2><table class="mini"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Left</th></tr></thead><tbody>' +
      last6.map(r => '<tr><td>' + esc(new Date(r.m + '-02').toLocaleDateString([], { month: 'short', year: '2-digit' })) + '</td><td>' + money(r.inc) + '</td><td>' + money(r.out) + '</td><td class="' + (r.inc - r.out < 0 ? 'expense' : 'income') + '">' + money(r.inc - r.out) + '</td></tr>').join('') + '</tbody></table></div>' : '');
  $('repMonth').onchange = e => { repMonth = e.target.value; viewReports(); };
  $('view').querySelectorAll('[data-cat]').forEach(r => r.onclick = () => { regMonth = repMonth; regCat = r.dataset.cat === 'Uncategorized' ? '' : r.dataset.cat; location.hash = 'register'; });
}

// ---------- Import (CheckBook app and other registers) ----------
function loadXlsx() {
  return new Promise((ok, no) => {
    if (window.XLSX) return ok();
    const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the spreadsheet reader.'));
    document.head.appendChild(s);
  });
}
async function readRows(file) {
  await loadXlsx();
  // CSV files are read as text so curly apostrophes (Domino’s) come through right.
  const wb = /\.(csv|txt)$/i.test(file.name) ? XLSX.read(await file.text(), { type: 'string', raw: false }) : XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim()));
}
function viewImport() {
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>⬆ Import your register</h1>' +
    '<div class="card pad"><h2>From the CheckBook app</h2><ol class="steps"><li>In CheckBook, export your data (it makes a file like <i>CheckBook_data_20261002.csv</i>).</li><li>Upload it here. Entries already in the app are skipped, so you can import again later.</li></ol>' +
    '<label class="button file">Choose CheckBook file<input type="file" id="impFile" accept=".csv,.xlsx,.xls,text/csv" hidden></label></div>' +
    '<p class="helper">Bank statements go on the 🏦 Bank tab instead, where they\'re matched against your register.</p>';
  $('impFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importCheckbook(await readRows(f)); } catch (err) { toast(err.message); }
  };
}
// CheckBook columns: Date/Time, Account, Category, Amount, Type, Payee, Note, CheckNum, Clear
function importCheckbook(rows) {
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  const col = n => head.findIndex(h => h.replace(/[^a-z]/g, '') === n);
  const c = { date: col('datetime') >= 0 ? col('datetime') : col('date'), account: col('account'), cat: col('category'), amount: col('amount'), type: col('type'), payee: col('payee'), note: col('note'), check: col('checknum'), clear: col('clear') };
  if (c.date < 0 || c.amount < 0) { toast('That doesn\'t look like a CheckBook export (no Date or Amount column).'); return; }
  let added = 0, skipped = 0;
  const accByName = {};
  rows.slice(1).forEach(r => {
    const date = parseDate(r[c.date]); if (!date) return;
    const raw = String(r[c.amount]);
    const typeText = c.type >= 0 ? String(r[c.type]).toLowerCase() : '';
    const type = typeText ? (/income|deposit|credit/.test(typeText) ? 'income' : 'expense') : (toNum(raw) > 0 ? 'income' : 'expense');
    const amount = Math.abs(toNum(raw)); if (!amount) return;
    const accName = (c.account >= 0 ? String(r[c.account]).trim() : '') || 'Checking';
    // Remember which app account each CheckBook account went to, so importing again lands in the same place.
    const names = data.settings.importNames = Object.assign({}, data.settings.importNames);
    let acc = accByName[accName] || account(names[accName]) || data.accounts.find(a => a.name === accName);
    if (!acc) { acc = { id: uid(), name: accName === 'New account' ? 'Checking' : accName, kind: 'checking', openingBalance: 0, openingDate: null, sort: data.accounts.length }; data.accounts.push(acc); }
    accByName[accName] = acc; names[accName] = acc.id;
    const payee = c.payee >= 0 ? String(r[c.payee]).trim() : '';
    const cat = c.cat >= 0 ? String(r[c.cat]).trim() : '';
    const dup = data.tx.find(t => t.accountId === acc.id && t.date === date && Number(t.amount) === amount && t.type === type && (t.payee || '').toLowerCase() === payee.toLowerCase());
    if (dup) { skipped++; return; }
    data.tx.push({ id: uid(), accountId: acc.id, date, time: parseTime(r[c.date]), payee, amount, type, category: cat === 'None' ? '' : cat, note: c.note >= 0 ? String(r[c.note]).trim() : '', checkNum: c.check >= 0 ? String(r[c.check]).trim() : '', cleared: c.clear >= 0 ? /^y/i.test(String(r[c.clear])) : false, taxCat: '', receipt: '', source: 'CheckBook' });
    if (cat && cat !== 'None' && !data.settings.categories.includes(cat)) data.settings.categories.push(cat);
    added++;
  });
  window.save();
  currentAccount = (Object.values(accByName)[0] || {}).id || currentAccount;
  toast('Imported ' + added + ' entries' + (skipped ? ' (' + skipped + ' were already here)' : '') + '.');
  location.hash = 'register';
  if (added) setTimeout(() => {
    const acc = activeAccount();
    if (acc && !acc.openingBalance) editAccount(acc.id);
    toast('Now type your bank balance right now, so the running balance is right.');
  }, 400);
}

// ---------- Bank statement matching ----------
let bankState = null;
const BANK_FIELDS = [
  ['date', 'Date', /date/],
  ['desc', 'Description', /desc|payee|name|memo|merchant|detail|transaction$/],
  ['amount', 'Amount (+/−)', /^amount$|^amt$|transaction amount/],
  ['debit', 'Withdrawal / debit', /debit|withdraw|payment|out$|charge/],
  ['credit', 'Deposit / credit', /credit|deposit|in$/],
  ['check', 'Check #', /check|chk|cheque/],
  ['kind', 'Type', /^type$|transaction type/]
];
// Bank descriptions are long ("CHECK CARD DEBIT MERCHANT PURCHASE TERMINAL 55500376 SONIC DRIVE IN #51 52 MAYFLOWER AR 09-28-26…").
// Well-known names are recognized; anything else is trimmed down to the first few words.
const MERCHANTS = [
  [/wal-?\s?mart|walmart|wm supercenter/i, 'Walmart', ''], [/phillips 66/i, 'Phillips 66', 'Gas'], [/sonic drive/i, 'Sonic', 'Eating out'],
  [/mcdonald/i, 'McDonald\'s', 'Eating out'], [/domino/i, 'Domino\'s', 'Eating out'], [/chick[\s-]?fil/i, 'Chick-fil-A', 'Eating out'],
  [/zaxby/i, 'Zaxby\'s', 'Eating out'], [/walgreens/i, 'Walgreens', ''], [/samsclub|sams club/i, 'Sam\'s Club Mastercard', ''],
  [/shellpoin|newrez/i, 'Shellpoint', 'House Bill'], [/(ar tech u|arkansas tech).*payroll/i, 'ATU Payroll', 'Paycheck'],
  [/conway region.*payroll/i, 'Conway Regional Payroll', 'Paycheck'], [/venmo/i, 'Venmo', ''], [/paypal/i, 'PayPal', ''],
  [/cash app/i, 'Cash App', ''], [/\batt\b|at&t/i, 'AT&T', 'House Bill'], [/netflix/i, 'Netflix', 'House Bill'],
  [/openai|chatgpt/i, 'OpenAI ChatGPT', 'House Bill'], [/claude|anthropic/i, 'Claude', 'House Bill'], [/apple\.?\s?com|apple com/i, 'Apple', 'House Bill'],
  [/brightspeed|bright speed/i, 'Brightspeed Internet', 'House Bill'], [/farm bureau/i, 'Farm Bureau Insurance', 'House Bill'],
  [/terminix/i, 'Terminix', 'House Bill'], [/spotify/i, 'Spotify', 'House Bill'], [/youtube/i, 'YouTube TV', 'House Bill'],
  [/prime video|amazon prime/i, 'Prime', 'House Bill'], [/amazon|amzn/i, 'Amazon', ''], [/t\s?j\s?maxx/i, 'TJ Maxx', ''],
  [/tiktok|tik tok/i, 'TikTok', ''], [/target/i, 'Target', ''], [/kroger/i, 'Kroger', 'Groceries'], [/aldi/i, 'Aldi', 'Groceries'],
  [/dollar general/i, 'Dollar General', ''], [/dollar tree/i, 'Dollar Tree', ''], [/marva workshop/i, 'Marva Workshop', ''],
  [/y'?\s?all?ternative/i, 'Y\'allternative Market', 'Booth business'], [/price break/i, 'Price Break', ''],
  [/mobile xfer|xfer from|transfer/i, 'Transfer', 'Transfer'], [/^wthdrl|\batm\b/i, 'Cash withdrawal', ''], [/caseys|casey's|maverik|exxon|shell oil|valero|murphy/i, 'Gas station', 'Gas'],
  [/ebay/i, 'eBay', ''], [/taco bell/i, 'Taco Bell', 'Eating out'], [/corner han ?gout/i, 'The Corner Hangout', 'Eating out'],
  [/^\s*(ac-\s*)?\d+ [\w ]+(st|dr|ave|ar-?\d+)\b/i, 'Phillips 66', 'Gas']
];
function cleanPayee(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  let z = s.match(/zelle\s+(?:to\s+|from\s+)?([a-z]+ [a-z]+)/i);
  if (z) return { payee: 'Zelle – ' + z[1].replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()), category: '' };
  if (/^check\b/i.test(s) && !/check card/i.test(s)) return { payee: 'Check', category: '' };
  const m = MERCHANTS.find(([re]) => re.test(s));
  if (m) return { payee: m[1], category: m[2] };
  let d = (' ' + s + ' ').replace(/X{4,}\d{4}/g, ' ')
    .replace(/\b(CHECK CARD DEBIT|POS PURCHASE|POS DEBIT|CKCD DEBIT|MERCHANT PURCHASE|MC PURCHASE|DDA PURCHASE|TERMINAL|INTERNET BANKING|ACH WITHDRAWAL|ACH DEPOSIT|EPAY DEBIT|EPAY CREDT|WTHDRL DDA|PREAUTHPMT|SQ \*?|TST\*?)\b/gi, ' ')
    .replace(/ AC-/gi, ' ').replace(/\b\d{2}-\d{2}-\d{2} \d{1,2}:\d{2} ?[AP]M\b/gi, ' ').replace(/\b\d{1,2}\/\d{2}( \d{2}:\d{2})?\b/g, ' ')
    .replace(/[#*]/g, ' ').replace(/\b\d+\w*\b/g, ' ').replace(/ [A-Z]{2} *$/, ' ').replace(/\s+/g, ' ').trim();
  d = d.replace(/\b(\w+)\s+\1\b/gi, '$1').replace(/^THE\*/i, '');
  if (d === d.toUpperCase()) d = d.toLowerCase().replace(/(^|[\s'-])[a-z]/g, c => c.toUpperCase());
  return { payee: d.split(' ').slice(0, 4).join(' ') || s.slice(0, 40), category: '' };
}
const looseName = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const words = s => String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 3);
// Register entry vs bank line: same name, a shared word ("Atu Deposit" / "ATU Payroll"), or her payee is the bank line's category ("Gas").
function sameName(t, l) {
  const x = looseName(t.payee), y = looseName(l.payee);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x) || x.slice(0, 4) === y.slice(0, 4)) return true;
  if (l.category && looseName(l.category) === x) return true;
  const w = words(l.payee + ' ' + l.desc);
  return words(t.payee).some(a => w.includes(a));
}
function viewBank() {
  const acc = activeAccount();
  if (!acc) { $('view').innerHTML = '<h1>🏦 Bank</h1><p class="helper">Add an account first (More → Accounts), or import your CheckBook file.</p>'; return; }
  if (!bankState) {
    const unclr = data.tx.filter(t => t.accountId === acc.id && !t.cleared);
    $('view').innerHTML = '<h1>🏦 Match a bank statement</h1>' +
      '<div class="card pad"><ol class="steps"><li>On your bank\'s website, download your transactions as <b>CSV</b> or <b>Excel</b> (look for "Export" or "Download").</li>' +
      '<li>Upload the file here. Each bank line is matched to your register by amount and date.</li>' +
      '<li>Matches get marked ✓ cleared. Your rounded-up amounts still match (and stay rounded unless you choose otherwise). Anything the bank has that your register doesn\'t is listed so you can add it.</li></ol>' +
      '<label class="button file">Choose bank file<input type="file" id="bankFile" accept=".csv,.xlsx,.xls,.ofx,.qfx,text/csv" hidden></label>' +
      '<p class="helper">Uploading the same months again is fine: lines already in your register are recognized.</p></div>' +
      '<div class="card pad"><h2>Not cleared yet (' + unclr.length + ')</h2>' + (unclr.sort(byTime).reverse().map(t => '<div class="mini-row"><span>' + esc(fmtDate(t.date)) + ' · ' + esc(t.payee) + '</span><b class="' + t.type + '">' + (t.type === 'income' ? '+' : '−') + money(t.amount).replace('−', '') + '</b></div>').join('') || '<p class="helper">Everything is cleared. 🎉</p>') + '</div>';
    $('bankFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const rows = /\.(ofx|qfx)$/i.test(f.name) ? ofxRows(await f.text()) : await readRows(f);
        startBank(rows, f);
      } catch (err) { toast(err.message); }
    };
    return;
  }
  drawBank();
}
// OFX/QFX (Quicken) files: pull out each transaction's date, amount, name and check number.
function ofxRows(text) {
  const out = [['Date', 'Description', 'Amount', 'Check']];
  text.split(/<STMTTRN>/i).slice(1).forEach(b => {
    const g = t => ((b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')) || [])[1] || '').trim();
    const d = g('DTPOSTED'); out.push([d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), g('NAME') || g('MEMO'), g('TRNAMT'), g('CHECKNUM')]);
  });
  if (out.length < 2) throw new Error('No transactions found in that file.');
  return out;
}
function startBank(rows, file) {
  let h = 0, best = -1;
  rows.slice(0, 15).forEach((r, i) => { const sc = r.filter(c => BANK_FIELDS.some(([, , re]) => re.test(String(c).toLowerCase().trim()))).length; if (sc > best) { best = sc; h = i; } });
  const headers = rows[h].map(String), map = {}, used = new Set();
  BANK_FIELDS.forEach(([k, , re]) => { const i = headers.findIndex((x, j) => !used.has(j) && re.test(x.toLowerCase().trim())); if (i >= 0) { map[k] = i; used.add(i); } });
  if (map.amount != null) { delete map.debit; delete map.credit; }
  // Some banks leave commas inside the description unquoted ("ESCOBAR,SHAANA"), which adds cells; glue them back.
  const body = rows.slice(h + 1).map(r => {
    const extra = r.length - headers.length;
    if (extra <= 0 || map.desc == null) return r;
    const d = map.desc;
    return r.slice(0, d).concat([r.slice(d, d + extra + 1).join(',')], r.slice(d + extra + 1));
  });
  bankState = { headers, rows: body, map, file, flip: false, fixCents: false, addEarly: true, skip: {}, add: {} };
  drawBank();
}
function bankLines() {
  const { rows, map, flip } = bankState, v = (r, k) => map[k] != null ? r[map[k]] : '';
  return rows.map((r, i) => {
    const date = parseDate(v(r, 'date')); if (!date) return null;
    let amt;
    if (map.amount != null) amt = toNum(v(r, 'amount')) * (/\(.*\)/.test(String(v(r, 'amount'))) ? -1 : 1);
    else amt = toNum(v(r, 'credit')) - Math.abs(toNum(v(r, 'debit')));
    if (flip) amt = -amt;
    if (!amt) return null;
    const desc = String(v(r, 'desc') || '').replace(/\s+/g, ' ').trim(), kind = String(v(r, 'kind') || '');
    const isCheck = /^check$/i.test(kind.trim()) || (/^check\b/i.test(desc) && !/check card/i.test(desc));
    const chk = String(v(r, 'check') || '').trim();
    return { i, date, desc, kind, amount: Math.abs(amt), type: amt > 0 ? 'income' : 'expense', check: isCheck && chk !== '0' ? chk : '', ...cleanPayee(desc) };
  }).filter(Boolean);
}
// Each bank line takes the best register entry going the same direction within 7 days: a matching check number first,
// then the exact amount, then an amount within $1 (CheckBook rounds to whole dollars) with a similar name.
// Bank lines from before the register's first entry are handled separately (they can be brought in all at once).
function matchBank(acc) {
  const lines = bankLines().sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i);
  const pool = data.tx.filter(t => t.accountId === acc.id);
  const start = pool.length ? pool.reduce((m, t) => t.date < m ? t.date : m, pool[0].date) : '9999';
  const taken = new Set(), res = [], early = [];
  const days = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  const pass = (l, ok) => pool.filter(t => !taken.has(t.id) && t.type === l.type && days(t.date, l.date) <= 7 && ok(t))
    .sort((a, b) => Number(a.cleared) - Number(b.cleared) || days(a.date, l.date) - days(b.date, l.date))[0];
  const near = (t, l) => Math.abs(Number(t.amount) - l.amount);
  const inRange = lines.filter(l => { if (l.date < start) { early.push(l); return false; } return true; });
  // Exact amounts first across all lines, so a rounded entry can't steal another line's exact match.
  const hits = new Map();
  inRange.forEach(l => {
    const t = (l.check && pass(l, t => t.checkNum === l.check && near(t, l) < 1)) || pass(l, t => near(t, l) < 0.005);
    if (t) { taken.add(t.id); hits.set(l, t); }
  });
  inRange.forEach(l => {
    if (hits.has(l)) return;
    const t = pass(l, t => near(t, l) < 1 && sameName(t, l)) || pass(l, t => near(t, l) < 1);
    if (t) { taken.add(t.id); hits.set(l, t); }
  });
  // Same payee, amount a bit further off (a bill that changed, like Netflix $20 → $21.49).
  inRange.forEach(l => {
    if (hits.has(l)) return;
    const t = pass(l, t => sameName(t, l) && near(t, l) <= Math.max(2, l.amount * 0.1));
    if (t) { taken.add(t.id); hits.set(l, t); }
  });
  inRange.forEach(l => res.push({ l, t: hits.get(l) || null }));
  const span = lines.length ? [lines[0].date, lines[lines.length - 1].date] : null;
  // Anything in the statement's dates that the bank doesn't show yet (CheckBook marks everything cleared, so don't trust that).
  const missingFromBank = span ? pool.filter(t => !taken.has(t.id) && t.date >= span[0] && t.date <= span[1]) : [];
  return { res, early, span, start, missingFromBank };
}
// A guess at the category: what she used last time for this payee, else the merchant's usual one.
function guessCategory(l, mem) {
  const k = looseName(l.payee);
  const hit = Object.keys(mem).find(p => looseName(p) === k) || Object.keys(mem).find(p => looseName(p).length > 3 && (k.includes(looseName(p)) || looseName(p).includes(k)));
  return (hit && mem[hit].category) || l.category || '';
}
const signedAmt = (type, amt) => (type === 'income' ? '+' : '−') + money(amt).replace('−', '');
function drawBank() {
  const acc = activeAccount(), m = matchBank(acc), { headers, map } = bankState;
  const matched = m.res.filter(x => x.t), extra = m.res.filter(x => !x.t);
  const fixes = matched.filter(x => Math.abs(Number(x.t.amount) - x.l.amount) >= 0.005);
  const earlyNet = m.early.reduce((s, l) => s + (l.type === 'income' ? l.amount : -l.amount), 0);
  bankState.result = m;
  $('view').innerHTML = '<h1>🏦 Statement results</h1><p class="helper">' + esc(bankState.file.name) + (m.span ? ' · ' + esc(fmtDate(m.span[0])) + ' – ' + esc(fmtDate(m.span[1])) : '') + ' · ' + (m.res.length + m.early.length) + ' bank lines</p>' +
    '<details class="card pad"' + (m.res.length + m.early.length ? '' : ' open') + '><summary>Columns in the bank file (tap to fix)</summary><div class="grid2">' +
    BANK_FIELDS.map(([k, label]) => '<label>' + label + '<select data-bmap="' + k + '"><option value="">—</option>' + headers.map((h, i) => '<option value="' + i + '"' + (map[k] === i ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>').join('') + '</select></label>').join('') +
    '</div><label class="check"><input type="checkbox" id="bFlip"' + (bankState.flip ? ' checked' : '') + '> Withdrawals show as positive numbers (flip signs)</label></details>' +
    '<div class="stat-row"><div class="stat"><span>Matched</span><b class="income">' + matched.length + '</b></div><div class="stat"><span>On bank, not in register</span><b class="expense">' + extra.length + '</b></div><div class="stat"><span>In register, not on bank</span><b>' + m.missingFromBank.length + '</b></div></div>' +
    (m.early.length ? '<div class="card pad"><h2>Earlier bank history (' + m.early.length + ')</h2><p class="helper">' + esc(fmtDate(m.early[0].date)) + ' – ' + esc(fmtDate(m.early[m.early.length - 1].date)) + ', before your register starts (' + esc(fmtDate(m.start)) + ').</p>' +
      '<label class="check"><input type="checkbox" id="bEarly"' + (bankState.addEarly ? ' checked' : '') + '> Add them to my register, so Spending and Taxes cover the whole year. Your balance today stays the same.</label></div>' : '') +
    (extra.length ? '<div class="card pad"><h2>On the bank, missing from your register</h2><p class="helper">Ticked ones are added as cleared. Untick any you don\'t want.</p>' +
      extra.map(x => '<label class="check bline"><input type="checkbox" data-add="' + x.l.i + '"' + (bankState.add[x.l.i] === false ? '' : ' checked') + '> <span>' + esc(fmtDate(x.l.date)) + ' · <b>' + esc(x.l.payee) + '</b><span class="sub">' + esc(x.l.desc) + '</span></span> <b class="' + x.l.type + '">' + signedAmt(x.l.type, x.l.amount) + '</b></label>').join('') + '</div>' : '') +
    (m.missingFromBank.length ? '<div class="card pad"><h2>In your register, not on this statement</h2><p class="helper">Usually checks or charges that haven\'t gone through yet. Double-check for typos in the amount.</p>' +
      m.missingFromBank.map(t => '<div class="mini-row"><span>' + esc(fmtDate(t.date)) + ' · ' + esc(t.payee) + '</span><b class="' + t.type + '">' + signedAmt(t.type, t.amount) + '</b></div>').join('') +
      (m.missingFromBank.some(t => t.cleared) ? '<label class="check"><input type="checkbox" id="bUnclear" checked> Mark these as not cleared yet</label>' : '') + '</div>' : '') +
    (matched.length ? '<details class="card pad"' + (matched.some(x => !sameName(x.t, x.l)) ? ' open' : '') + '><summary>Matched (' + matched.length + ') – will be marked ✓ cleared</summary><p class="helper">Untick a pair if it isn\'t really the same thing (⚠ = names look different). An unticked bank line is added as its own entry.</p>' +
      matched.map(x => { const diff = Math.abs(Number(x.t.amount) - x.l.amount) >= 0.005, odd = !sameName(x.t, x.l);
        return '<label class="check bline"><input type="checkbox" data-pair="' + x.l.i + '"' + (bankState.skip[x.l.i] ? '' : ' checked') + '> <span>' + (odd ? '⚠ ' : '') + esc(fmtDate(x.l.date)) + ' · bank: <b>' + esc(x.l.payee) + '</b> ↔ yours: <b>' + esc(x.t.payee) + '</b>' +
          (diff ? '<span class="sub">You wrote ' + money(x.t.amount) + ', bank says ' + money(x.l.amount) + '</span>' : '') + '</span> <b class="' + x.l.type + '">' + signedAmt(x.l.type, x.l.amount) + '</b></label>'; }).join('') + '</details>' : '') +
    (fixes.length ? '<label class="check"><input type="checkbox" id="bFix"' + (bankState.fixCents ? ' checked' : '') + '> Change my ' + fixes.length + ' rounded amounts to the exact bank amount <span class="sub">(leave unticked to keep your rounding cushion)</span></label>' : '') +
    '<label class="check"><input type="checkbox" id="bKeep"' + (signedIn() ? ' checked' : ' disabled') + '> Save a copy of this statement in my Taxes files</label>' +
    '<div class="row-actions"><button type="button" id="bApply">Update my register</button><button type="button" class="ghost" id="bCancel">Cancel</button></div>';
  document.querySelectorAll('[data-bmap]').forEach(s => s.onchange = () => { if (s.value === '') delete bankState.map[s.dataset.bmap]; else bankState.map[s.dataset.bmap] = Number(s.value); drawBank(); });
  document.querySelectorAll('[data-add]').forEach(c => c.onchange = () => { bankState.add[c.dataset.add] = c.checked; });
  document.querySelectorAll('[data-pair]').forEach(c => c.onchange = () => { bankState.skip[c.dataset.pair] = !c.checked; });
  $('bFlip').onchange = e => { bankState.flip = e.target.checked; drawBank(); };
  if ($('bFix')) $('bFix').onchange = e => { bankState.fixCents = e.target.checked; };
  if ($('bEarly')) $('bEarly').onchange = e => { bankState.addEarly = e.target.checked; };
  $('bCancel').onclick = () => { bankState = null; viewBank(); };
  $('bApply').onclick = async () => {
    $('bApply').disabled = true;
    let cleared = 0, added = 0, fixed = 0;
    const mem = payeeMemory();
    const addLine = l => data.tx.push({ id: uid(), accountId: acc.id, date: l.date, time: '', payee: l.payee, amount: l.amount, type: l.type, category: guessCategory(l, mem), note: l.desc.slice(0, 120), checkNum: l.check, cleared: true, taxCat: '', receipt: '', source: 'Bank' });
    matched.forEach(x => {
      if (bankState.skip[x.l.i]) { addLine(x.l); added++; return; }
      if (!x.t.cleared) { x.t.cleared = true; cleared++; }
      if (bankState.fixCents && Math.abs(Number(x.t.amount) - x.l.amount) >= 0.005) { x.t.amount = x.l.amount; fixed++; }
    });
    extra.forEach(x => { if (bankState.add[x.l.i] !== false) { addLine(x.l); added++; } });
    if ($('bUnclear') && $('bUnclear').checked) m.missingFromBank.forEach(t => { t.cleared = false; });
    if (m.early.length && bankState.addEarly) {
      m.early.forEach(l => { addLine(l); added++; });
      // The starting balance already included these, so move it back by their total and today's balance doesn't change.
      acc.openingBalance = Math.round((Number(acc.openingBalance || 0) - earlyNet) * 100) / 100;
    }
    if ($('bKeep').checked && signedIn()) {
      try {
        const year = Number((m.span ? m.span[1] : today()).slice(0, 4));
        const path = await uploadFile(bankState.file, year + '/statements');
        data.docs.push({ id: uid(), year, kind: 'statement', title: acc.name + ' statement ' + (m.span ? fmtDate(m.span[0]) + ' – ' + fmtDate(m.span[1]) : ''), checklist: '', taxCat: '', amount: null, file: path, fileName: bankState.file.name, txId: null, note: '' });
      } catch (e) { toast('Register updated, but the statement copy didn\'t save: ' + e.message); }
    }
    window.save(); bankState = null;
    toast('Done: ' + cleared + ' marked cleared, ' + added + ' added' + (fixed ? ', ' + fixed + ' amounts fixed to the penny' : '') + '.');
    location.hash = 'register';
  };
}

// ---------- Taxes ----------
let taxYear = null;
function viewTaxes() {
  const years = [...new Set(data.tx.map(t => Number(t.date.slice(0, 4))).concat(data.docs.map(d => d.year)).concat([new Date().getFullYear()]))].sort((a, b) => b - a);
  if (!taxYear) taxYear = new Date().getMonth() < 4 ? new Date().getFullYear() - 1 : new Date().getFullYear(); // Jan–Apr: last year's taxes
  if (!years.includes(taxYear)) years.push(taxYear);
  const docs = data.docs.filter(d => d.year === taxYear);
  const list = data.settings.checklist;
  const done = list.filter(c => docs.some(d => d.checklist === c.key) || (data.settings.notNeeded || {})[taxYear + c.key]).length;
  // Deductions: register entries marked for taxes plus receipts entered on their own.
  const totals = {};
  data.tx.filter(t => t.taxCat && t.date.startsWith(String(taxYear))).forEach(t => { (totals[t.taxCat] = totals[t.taxCat] || { amt: 0, n: 0, rec: 0 }); totals[t.taxCat].amt += signed(t) * -1; totals[t.taxCat].n++; if (t.receipt) totals[t.taxCat].rec++; });
  docs.filter(d => d.kind === 'receipt' && d.taxCat && !d.txId).forEach(d => { (totals[d.taxCat] = totals[d.taxCat] || { amt: 0, n: 0, rec: 0 }); totals[d.taxCat].amt += Number(d.amount) || 0; totals[d.taxCat].n++; totals[d.taxCat].rec++; });
  const grand = Object.values(totals).reduce((s, x) => s + x.amt, 0);
  $('view').innerHTML = '<h1>🧾 Taxes</h1>' + (signedIn() ? '' : '<p class="chip warn">Sign in (More → Account) to upload tax papers and receipts.</p>') +
    '<label>Tax year<select id="tyPick">' + years.sort((a, b) => b - a).map(y => '<option' + (y === taxYear ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>' +
    '<div class="card pad"><h2>📋 Checklist <small>' + done + ' of ' + list.length + '</small></h2><div class="progress"><span style="width:' + Math.round(done / Math.max(1, list.length) * 100) + '%"></span></div>' +
    list.map(c => {
      const mine = docs.filter(d => d.checklist === c.key), skip = (data.settings.notNeeded || {})[taxYear + c.key];
      return '<div class="ck' + (mine.length || skip ? ' ok' : '') + '"><span class="box">' + (mine.length ? '✓' : skip ? '–' : '') + '</span><div class="who"><b>' + esc(c.title) + '</b>' +
        (mine.length ? mine.map(d => '<span class="sub"><a href="#" data-open="' + d.id + '">📎 ' + esc(d.fileName || d.title) + '</a>' + (d.amount != null ? ' · ' + money(d.amount) : '') + '</span>').join('') : skip ? '<span class="sub">Not needed this year</span>' : '') + '</div>' +
        '<div class="ck-acts"><label class="button ghost small file">⬆<input type="file" data-up="' + c.key + '" accept="image/*,application/pdf" hidden></label>' + (mine.length ? '' : '<button type="button" class="ghost small" data-skip="' + c.key + '" title="Not needed this year">' + (skip ? '↺' : '✕') + '</button>') + '</div></div>';
    }).join('') +
    '<div class="row-actions"><button type="button" class="ghost small" id="ckAdd">+ Add to checklist</button></div></div>' +
    '<div class="card pad"><h2>💲 Deductions ' + taxYear + ' <small>' + money(grand) + '</small></h2>' +
    (Object.keys(totals).length ? Object.entries(totals).sort((a, b) => b[1].amt - a[1].amt).map(([k, v]) => '<div class="mini-row"><span>' + esc(k) + ' <span class="sub">(' + v.n + ' items, ' + v.rec + ' with receipts)</span></span><b>' + money(v.amt) + '</b></div>').join('') :
      '<p class="helper">Nothing yet. In the Register, open an expense → 🧾 Taxes &amp; receipt → pick what it counts for. Or add a receipt below.</p>') +
    '<div class="row-actions"><button type="button" id="recAdd">📷 Add a receipt</button></div></div>' +
    '<div class="card pad"><h2>📁 All ' + taxYear + ' files (' + docs.length + ')</h2>' +
    (docs.slice().sort((a, b) => (b.kind + b.title).localeCompare(a.kind + a.title)).map(d => '<div class="mini-row"><a href="#" data-open="' + d.id + '">' + ({ statement: '🏦', receipt: '🧾', tax: '📄' }[d.kind] || '📄') + ' ' + esc(d.title || d.fileName) + '</a><button type="button" class="linkish" data-deldoc="' + d.id + '">Remove</button></div>').join('') || '<p class="helper">Uploaded papers, receipts and bank statements show up here.</p>') + '</div>' +
    '<div class="row-actions"><button type="button" class="ghost" id="taxCsv">⬇ Summary for my tax preparer (CSV)</button><button type="button" class="ghost" id="taxPrint">🖨 Print summary</button></div>' +
    '<p class="helper">Booth business: the Booth Tracker\'s Taxes tab has your sales, purchases, rent and mileage. Download its CSV and upload it to “Booth business summary” above.</p>' +
    '<div id="printArea" class="print-only"></div>';
  $('tyPick').onchange = e => { taxYear = Number(e.target.value); viewTaxes(); };
  $('view').querySelectorAll('[data-up]').forEach(inp => inp.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const item = list.find(c => c.key === inp.dataset.up);
    const amount = /1098|w2|1099|donation|medical|proptax|childcare|estimated/i.test(item.key) ? prompt('Amount on this paper (optional, for your totals):', '') : '';
    toast('Uploading…');
    try {
      const path = await uploadFile(f, taxYear + '/tax');
      data.docs.push({ id: uid(), year: taxYear, kind: 'tax', title: item.title, checklist: item.key, taxCat: '', amount: amount ? toNum(amount) : null, file: path, fileName: f.name, txId: null, note: '' });
      window.save(); toast('Saved: ' + f.name); viewTaxes();
    } catch (err) { toast('Upload failed: ' + err.message); }
  });
  $('view').querySelectorAll('[data-skip]').forEach(b => b.onclick = () => {
    const nn = data.settings.notNeeded = Object.assign({}, data.settings.notNeeded), k = taxYear + b.dataset.skip;
    if (nn[k]) delete nn[k]; else nn[k] = true; window.save(); viewTaxes();
  });
  $('view').querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); const d = data.docs.find(x => x.id === a.dataset.open); if (d) openFile(d.file); });
  $('view').querySelectorAll('[data-deldoc]').forEach(b => b.onclick = async () => {
    const d = data.docs.find(x => x.id === b.dataset.deldoc);
    if (!confirm('Remove ' + (d.fileName || d.title) + '?')) return;
    data.docs = data.docs.filter(x => x !== d); window.save();
    try { await window.moneySync.client().storage.from(CFG.bucket || 'money').remove([d.file]); } catch (e) {}
    viewTaxes();
  });
  $('ckAdd').onclick = () => {
    const t = prompt('What paper do you need to gather? (e.g. "1099-R retirement")'); if (!t) return;
    data.settings.checklist = list.concat([{ key: 'c' + uid(), title: t.trim() }]); window.save(); viewTaxes();
  };
  $('recAdd').onclick = addReceipt;
  $('taxCsv').onclick = () => download('tax-summary-' + taxYear + '.csv', taxSummaryCsv(taxYear, totals), 'text/csv');
  $('taxPrint').onclick = () => { $('printArea').innerHTML = taxPrintHtml(taxYear, totals, docs); window.print(); };
}
function addReceipt() {
  if (!signedIn()) { toast('Sign in (More → Account) to save receipts.'); return; }
  openModal('<h2>📷 Add a receipt</h2>' +
    '<label class="button file">Take photo or choose file<input type="file" id="rFile" accept="image/*,application/pdf" hidden></label><p class="helper" id="rName">No file yet.</p>' +
    '<div class="grid2"><label>Amount<input id="rAmt" inputmode="decimal" placeholder="0.00"></label><label>Date<input id="rDate" type="date" value="' + today() + '"></label></div>' +
    '<label>Counts for taxes as<select id="rCat">' + data.settings.taxCats.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label>' +
    '<label>What it was for<input id="rNote" placeholder="Donation to First Baptist"></label>' +
    '<p class="helper">Paid from checking? Better to open that entry in the Register and add the receipt there, so it isn\'t counted twice.</p>' +
    '<div class="row-actions"><button type="button" id="rSave">Save receipt</button><button type="button" class="ghost" id="rCancel">Cancel</button></div>');
  let file = null;
  $('rFile').onchange = e => { file = e.target.files[0] || null; $('rName').textContent = file ? '📎 ' + file.name : 'No file yet.'; };
  $('rCancel').onclick = closeModal;
  $('rSave').onclick = async () => {
    if (!file) { toast('Take a photo or choose the receipt file.'); return; }
    const amount = toNum($('rAmt').value); if (!amount) { toast('Enter the amount.'); return; }
    $('rSave').disabled = true; $('rSave').textContent = 'Saving…';
    try {
      const year = Number($('rDate').value.slice(0, 4));
      const path = await uploadFile(file, year + '/receipts');
      data.docs.push({ id: uid(), year, kind: 'receipt', title: ($('rNote').value.trim() || $('rCat').value) + ' – ' + fmtDate($('rDate').value), checklist: '', taxCat: $('rCat').value, amount, file: path, fileName: file.name, txId: null, note: $('rNote').value.trim() });
      window.save(); closeModal(); taxYear = year; viewTaxes(); toast('Receipt saved.');
    } catch (err) { $('rSave').disabled = false; $('rSave').textContent = 'Save receipt'; toast('Upload failed: ' + err.message); }
  };
}
function taxSummaryCsv(year, totals) {
  const rows = [['Tax summary ' + year], [], ['Deduction category', 'Total', 'Items']];
  Object.entries(totals).forEach(([k, v]) => rows.push([k, v.amt.toFixed(2), v.n]));
  rows.push([], ['Date', 'Payee / item', 'Category', 'Amount', 'Receipt']);
  data.tx.filter(t => t.taxCat && t.date.startsWith(String(year))).sort(byTime).forEach(t => rows.push([t.date, t.payee, t.taxCat, (-signed(t)).toFixed(2), t.receipt ? 'yes' : '']));
  data.docs.filter(d => d.year === year && d.kind === 'receipt' && d.taxCat && !d.txId).forEach(d => rows.push(['', d.note || d.title, d.taxCat, Number(d.amount || 0).toFixed(2), 'yes']));
  rows.push([], ['Tax papers gathered']);
  data.settings.checklist.forEach(c => { const n = data.docs.filter(d => d.year === year && d.checklist === c.key); rows.push([c.title, n.length ? 'have (' + n.length + ')' : (data.settings.notNeeded || {})[year + c.key] ? 'not needed' : 'MISSING', n.map(d => d.amount != null ? Number(d.amount).toFixed(2) : '').filter(Boolean).join(' ')]); });
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}
function taxPrintHtml(year, totals, docs) {
  return '<h1>Tax summary ' + year + '</h1><h2>Deductions</h2><table class="mini"><tbody>' + Object.entries(totals).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + money(v.amt) + '</td><td>' + v.n + ' items</td></tr>').join('') + '</tbody></table>' +
    '<h2>Papers</h2><table class="mini"><tbody>' + data.settings.checklist.map(c => { const n = docs.filter(d => d.checklist === c.key); return '<tr><td>' + esc(c.title) + '</td><td>' + (n.length ? '✓ have' : (data.settings.notNeeded || {})[year + c.key] ? 'not needed' : '<b>missing</b>') + '</td><td>' + n.map(d => d.amount != null ? money(d.amount) : '').join(' ') + '</td></tr>'; }).join('') + '</tbody></table>';
}

// ---------- More ----------
function viewMore() {
  $('view').innerHTML = '<h1>More</h1>' +
    '<div class="card pad"><h2>🏦 Accounts</h2>' + (data.accounts.slice().sort((a, b) => a.sort - b.sort).map(a => { const b = balances(a); return '<div class="mini-row"><a href="#" data-acc="' + a.id + '">' + esc(a.name) + ' <span class="sub">(' + esc(a.kind) + ')</span></a><b>' + money(b.balance) + '</b></div>'; }).join('') || '<p class="helper">No accounts yet.</p>') +
    '<div class="row-actions"><button type="button" class="ghost small" id="accNew">+ New account</button></div></div>' +
    '<div class="card pad"><h2>⬆ Import</h2><p class="helper">Bring in your CheckBook app export.</p><a class="button ghost" href="#import">Import CheckBook file</a></div>' +
    '<div class="card pad"><h2>🏷 Categories</h2><p class="helper">One per line. Used in the Register and Spending.</p><textarea id="mCats" rows="6">' + esc(data.settings.categories.join('\n')) + '</textarea>' +
    '<h3>Tax categories</h3><textarea id="mTax" rows="5">' + esc(data.settings.taxCats.join('\n')) + '</textarea></div>' +
    '<div class="card pad"><h2>Account and sync</h2><div data-syncbox></div></div>' +
    '<div class="card pad"><h2>Back up</h2><div class="row-actions"><button type="button" class="ghost" id="mBackup">Download backup</button><button type="button" class="ghost" id="mCsv">Register as CSV</button></div></div>';
  $('view').querySelectorAll('[data-acc]').forEach(a => a.onclick = e => { e.preventDefault(); editAccount(a.dataset.acc); });
  $('accNew').onclick = () => editAccount();
  const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
  $('mCats').onchange = e => { data.settings.categories = lines(e.target.value); window.save(); };
  $('mTax').onchange = e => { data.settings.taxCats = lines(e.target.value); window.save(); };
  $('mBackup').onclick = () => download('money-backup-' + today() + '.json', JSON.stringify(data, null, 1), 'application/json');
  $('mCsv').onclick = () => {
    const rows = [['Date', 'Account', 'Payee', 'Category', 'Type', 'Amount', 'Cleared', 'Check #', 'Note', 'Tax category']];
    data.tx.slice().sort(byTime).forEach(t => rows.push([t.date, (account(t.accountId) || {}).name || '', t.payee, t.category, t.type, Number(t.amount).toFixed(2), t.cleared ? 'yes' : '', t.checkNum, t.note, t.taxCat]));
    download('register-' + today() + '.csv', rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  };
  if (window.moneySync) window.moneySync.renderBox();
}

route();
