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

const DEFAULT_CATEGORIES = ['House Bill', 'Groceries', 'Eating out', 'Gas', 'Car', 'Shopping', 'Personal care', 'Medical', 'Kids & school', 'Band', 'Booth business', 'Credit card payment', 'Cash', 'Gifts & donations', 'Taxes', 'Fees', 'Paycheck', 'Side income', 'Transfer', 'Other'];
// Name rules for sorting entries into categories automatically (her own choices and past entries come first).
const CATEGORY_RULES = [
  [/payroll|direct dep|salary/i, 'Paycheck'],
  [/shellpoin|newrez|mortgage|\batt\b|at&t|brightspeed|bright speed|farm bureau|netflix|spotify|youtube|prime|hulu|disney|apple (storage|com)|apple\.com|^apple$|openai|chatgpt|claude|terminix|terminex|entergy|swepco|ozarks electric|water|cox|internet|insurance/i, 'House Bill'],
  [/car payment|auto loan|autozone|o'?reilly|oil change|tire|car wash|jiffy|dmv|revenue office/i, 'Car'],
  [/phillips 66|casey'?s|maverik|exxon|shell oil|valero|murphy|kum ?& ?go|love'?s|conoco|chevron|gas station|^gas$|fuel/i, 'Gas'],
  [/kroger|aldi|harps|food lion|grocery|sam'?s club(?! mastercard)|walmart|wm supercenter|neighborhood market|edwards food/i, 'Groceries'],
  [/sonic|mcdonald|domino|chick-?fil|zaxby|taco bell|wendy|burger|pizza|grill|cafe|caf\u00e9|coffee|starbucks|subway|chili'?s|restaurant|bbq|bar-?b|hog|hangout|el charro|red lobster|bundt|gadwall|whataburger|arby|kfc|popeye|dairy queen|braum|waffle|ihop|cracker barrel|panda|sushi|mexican|diner|donut|doughnut|bakery|tropical smoothie|smoothie|dutch bros/i, 'Eating out'],
  [/walgreens|cvs|caremark|pharmacy|clinic|hospital|medical|dental|dentist|doctor|urgent care|optical|vision|health/i, 'Medical'],
  [/nails?\b|salon|hair|barber|spa\b|sally beauty|ulta|beauty|lash|brow/i, 'Personal care'],
  [/amazon|amzn|tj ?maxx|target|ebay|dollar general|dollar tree|lowe'?s|home depot|hobby lobby|bargain|boutique|thrift|marshalls|ross|old navy|kohl|best buy|tiktok|tik tok|shein|etsy|michaels|bath ?& ?body/i, 'Shopping'],
  [/y'?\s?all?ternative|booth|price break|marva/i, 'Booth business'],
  [/band boosters|rsd ?band|band fee/i, 'Band'],
  [/school|rsdk12|tuition|arkansas tech|ar tech|atu\b|lunch money|my ?school ?bucks/i, 'Kids & school'],
  [/church|donation|tithe|charity|united way/i, 'Gifts & donations'],
  [/mastercard|visa payment|credit card|card payment|crd pymt|capital one|discover|chase credit|syf|synchrony|amex/i, 'Credit card payment'],
  [/ar\.gov|irs|tax payment|stpayment|dfa/i, 'Taxes'],
  [/\bfees?\b|overdraft|service charge|\bnsf\b/i, 'Fees'],
  [/cash withdrawal|\batm\b|wthdrl/i, 'Cash'],
  [/transfer|xfer/i, 'Transfer']
];
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
// What the bank actually took or paid (her register amounts are rounded).
const bankAmt = t => t.bankAmount != null && t.bankAmount !== '' ? Number(t.bankAmount) : Number(t.amount);
const bankSigned = t => t.type === 'income' ? bankAmt(t) : -bankAmt(t);
// Her rounding: a bill over 5¢ past the dollar rounds up to the next dollar (5¢ or less rounds down); deposits round down.
function myRound(amt, type) {
  const a = Math.round(Number(amt) * 100) / 100;
  if ((data.settings.rounding || 'up5') === 'none') return a;
  const whole = Math.floor(a + 1e-9), cents = Math.round((a - whole) * 100);
  if (type === 'income') return whole;
  return cents > 5 ? whole + 1 : whole;
}
// Oldest first, so a running balance can be added up.
const byTime = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || String(a.id).localeCompare(String(b.id));
function balances(acc) {
  const list = data.tx.filter(t => t.accountId === acc.id).sort(byTime);
  let bal = Number(acc.openingBalance) || 0, cleared = bal;
  const running = {};
  let pending = 0;
  list.forEach(t => { bal += signed(t); if (t.cleared) cleared += bankSigned(t); else pending += signed(t); running[t.id] = bal; });
  const r2 = n => Math.round(n * 100) / 100;
  // What's left after pending entries is the cushion from rounding.
  return { balance: r2(bal), cleared: r2(cleared), pending: r2(pending), cushion: r2(bal - cleared - pending), running, list };
}

// ---------- routing ----------
function route() {
  if (location.hash.startsWith('#add')) { quickAdd(); return; }
  const [tab, arg] = (location.hash.slice(1) || 'register').split('/');
  const tabOf = { reports: 'register', import: 'more', accounts: 'more', recurring: 'more', siri: 'more', inbox: 'register', calendar: 'register', rules: 'more', budgets: 'more' };
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tabOf[tab] || tab)));
  const views = { register: viewRegister, reports: viewReports, bank: viewBank, taxes: viewTaxes, more: viewMore, import: viewImport, recurring: viewRecurring, siri: viewSiri, inbox: viewInbox, rules: viewRules, budgets: viewBudgets, calendar: viewCalendar };
  (views[tab] || viewRegister)(arg);
}
window.render = () => { const y = window.scrollY; firstSort(); runRecurring(); if (pendingAdd) { finishQuickAdd(); return; } if (!(location.hash.startsWith('#bank') && bankState)) route(); window.scrollTo(0, y); };
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
$('fab').onclick = () => $('topAdd').click();
$('topAdd').onclick = () => {
  openModal('<h2>Add</h2><div class="addgrid">' +
    '<button type="button" data-addk="expense">− Expense<span>money out</span></button>' +
    '<button type="button" class="income-btn" data-addk="income">+ Income<span>money in</span></button>' +
    '<button type="button" class="ghost" data-addk="rexpense">🔁 Recurring bill<span>every month</span></button>' +
    '<button type="button" class="ghost" data-addk="rincome">🔁 Recurring deposit<span>paycheck, etc.</span></button>' +
    '<button type="button" class="ghost wide" data-addk="scan">📷 Scan a receipt<span>fills in the store, total and date</span></button></div>' +
    '<div class="row-actions"><button type="button" class="ghost" id="addX">Cancel</button></div>');
  $('addX').onclick = closeModal;
  document.querySelectorAll('[data-addk]').forEach(b => b.onclick = () => {
    const k = b.dataset.addk; closeModal();
    if (k === 'scan') { editTx(null, 'expense'); $('tScan').click(); } else if (k[0] === 'r') editRecurring(null, k.slice(1)); else editTx(null, k);
  });
};

// ---------- Register ----------
let regMonth = '', regSearch = '', regCat = '';
let balView = (() => { try { return localStorage.getItem(KEY + 'BalView') || 'bank'; } catch (e) { return 'bank'; } })();
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
    (!q || [t.payee, t.note, t.category, t.checkNum, String(t.amount), tagsOf(t).map(x => '#' + x).join(' ')].join(' ').toLowerCase().includes(q))).reverse();
  let lastDate = '', rows = '';
  shown.forEach(t => {
    if (t.date !== lastDate) { rows += '<div class="day">' + esc(fmtDate(t.date, true)) + '</div>'; lastDate = t.date; }
    rows += '<div class="tx' + (t.cleared ? ' cleared' : '') + '" data-tx="' + t.id + '">' +
      '<button type="button" class="clr" data-clear="' + t.id + '" title="' + (t.cleared ? 'Cleared – tap to unclear' : 'Not cleared – tap to clear') + '">' + (t.cleared ? '✓' : '') + '</button>' +
      '<div class="who"><b>' + (String(t.id).startsWith('rec_') ? '🔁 ' : '') + esc(t.payee || '(no payee)') + '</b>' +
      '<span class="sub">' + esc([t.category, t.checkNum ? '#' + t.checkNum : '', t.note].filter(Boolean).join(' · ')) + '</span>' +
      (tagsOf(t).length ? '<span class="sub">' + tagsOf(t).map(x => '<span class="chip tagc">#' + esc(x) + '</span>').join(' ') + '</span>' : '') +
      (t.taxCat || t.receipt ? '<span class="sub">' + (t.taxCat ? '<span class="chip tax">🧾 ' + esc(t.taxCat) + '</span> ' : '') + (t.receipt ? '<span class="chip">📎 receipt</span>' : '') + '</span>' : '') + '</div>' +
      '<div class="amt"><b class="' + t.type + '">' + (t.type === 'income' ? '+' : '−') + money(t.amount).replace('−', '') + '</b>' + (t.bankAmount != null && Math.abs(bankAmt(t) - t.amount) >= 0.005 ? '<span class="sub bankamt">bank ' + money(bankAmt(t)) + '</span>' : '') + '<span class="sub">' + money(b.running[t.id]) + '</span></div></div>';
  });
  const accOpts = data.accounts.length > 1 ? '<select id="accPick">' + data.accounts.slice().sort((a, c) => a.sort - c.sort).map(a => '<option value="' + a.id + '"' + (a.id === acc.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select>' : '<b>' + esc(acc.name) + '</b>';
  const monthIn = regMonth ? b.list.filter(t => t.date.startsWith(regMonth)) : [];
  const needCat = b.list.filter(t => !t.category).length;
  $('view').innerHTML = (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') +
    '<div class="toptabs"><a href="#register" class="on">📒 Register</a><a href="#reports">📊 Reports</a><a href="#calendar">📅 Calendar</a></div>' +
    '<div class="balance-card"><div class="acc">' + accOpts + '</div>' +
    '<div class="baltog"><button type="button" data-bv="bank" class="' + (balView === 'bank' ? 'on' : '') + '">🏦 Bank</button><button type="button" data-bv="register" class="' + (balView === 'register' ? 'on' : '') + '">📒 Register</button></div>' +
    (balView === 'bank'
      ? '<div class="bal"><span>Bank balance (what\'s cleared)</span><b class="' + (b.cleared < 0 ? 'neg' : '') + '">' + money(b.cleared) + '</b></div>' +
        '<div class="bal-row"><span>Pending: <b>' + money(b.pending) + '</b></span>' + (Math.abs(b.cushion) >= 0.005 ? '<span>Rounding cushion: <b>' + money(-b.cushion) + '</b></span>' : '') + '<span>Register: <b>' + money(b.balance) + '</b></span></div></div>'
      : '<div class="bal"><span>Register balance (after pending)</span><b class="' + (b.balance < 0 ? 'neg' : '') + '">' + money(b.balance) + '</b></div>' +
        '<div class="bal-row"><span>Bank: <b>' + money(b.cleared) + '</b></span><span>Pending: <b>' + money(b.pending) + '</b></span>' + (Math.abs(b.cushion) >= 0.005 ? '<span>Rounding cushion: <b>' + money(-b.cushion) + '</b></span>' : '') + '</div></div>') +
    safeToSpend(acc, b.balance) + budgetCard(acc) + comingUp(acc, b.balance) +
    (needCat ? '<a class="card pad inbox-link" href="#inbox">🗂 <b>' + needCat + '</b> ' + (needCat === 1 ? 'entry needs' : 'entries need') + ' a category <span class="sub">Sort them →</span></a>' : '') +
    favRow() +
    '<div class="row-actions quick"><button type="button" id="addExp">− Expense</button><button type="button" class="income-btn" id="addInc">+ Income</button></div>' +
    '<div class="filters"><input id="regFind" type="search" placeholder="Search payee, amount, #tag" value="' + esc(regSearch) + '">' +
    '<select id="regMonth"><option value="">All months</option>' + months.map(m => '<option value="' + m + '"' + (m === regMonth ? ' selected' : '') + '>' + esc(monthName(m)) + '</option>').join('') + '</select>' +
    '<select id="regCat"><option value="">All categories</option>' + data.settings.categories.map(c => '<option' + (c === regCat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
    (regMonth ? '<p class="helper">' + esc(monthName(regMonth)) + ': in ' + money(monthIn.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)) + ' · out ' + money(monthIn.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)) + '</p>' : '') +
    (rows || '<p class="helper">No entries' + (q || regMonth || regCat ? ' match' : ' yet') + '.</p>');
  $('view').querySelectorAll('[data-bv]').forEach(x => x.onclick = () => { balView = x.dataset.bv; try { localStorage.setItem(KEY + 'BalView', balView); } catch (e) {} viewRegister(); });
  if ($('accPick')) $('accPick').onchange = e => { currentAccount = e.target.value; viewRegister(); };
  $('view').querySelectorAll('[data-uprec]').forEach(x => x.onclick = () => editRecurring(x.dataset.uprec));
  $('view').querySelectorAll('[data-newrec]').forEach(x => x.onclick = () => editRecurring(null, x.dataset.newrec));
  $('view').querySelectorAll('[data-fav]').forEach(x => x.onclick = () => editTx(null, 'expense', { payee: x.dataset.fav }));
  $('view').querySelectorAll('[data-budcat]').forEach(x => x.onclick = () => { regCat = x.dataset.budcat; regMonth = today().slice(0, 7); viewRegister(); });
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
  data.tx.slice().sort(byTime).forEach(t => { if (t.payee && (t.category || !m[t.payee.trim().toLowerCase()])) m[t.payee.trim().toLowerCase()] = { category: t.category || (m[t.payee.trim().toLowerCase()] || {}).category || '', type: t.type, taxCat: t.taxCat, amount: t.amount }; });
  return m;
}
function editTx(id, type, preset) {
  const acc = activeAccount();
  if (!acc) { toast('Add an account first (More → Accounts).'); return; }
  const t = id ? data.tx.find(x => x.id === id) : { accountId: acc.id, date: today(), time: '', payee: '', amount: '', type: type || 'expense', category: '', note: '', checkNum: '', cleared: false, taxCat: '', receipt: '', source: 'Added' };
  let kind = t.type;
  const mem = payeeMemory();
  const payees = Object.keys(mem).length ? [...new Set(data.tx.map(x => (x.payee || '').trim()).filter(Boolean))].sort() : [];
  openModal('<h2>' + (id ? 'Edit entry' : kind === 'income' ? 'Add income' : 'Add expense') + '</h2>' +
    (id ? '' : '<label class="button ghost small file scanbtn">📷 Scan a receipt<input type="file" id="tScan" accept="image/*" capture="environment" hidden></label><p class="helper" id="tScanNote" hidden></p>') +
    '<div class="segs" id="tKind"><button type="button" class="seg' + (kind === 'expense' ? ' on' : '') + '" data-k="expense">− Expense</button><button type="button" class="seg' + (kind === 'income' ? ' on' : '') + '" data-k="income">+ Income</button></div>' +
    '<label>Amount<input id="tAmt" inputmode="decimal" placeholder="0.00" value="' + (t.amount === '' ? '' : Number(t.amount).toFixed(2)) + '" class="big-input"></label>' +
    '<label>Payee<input id="tPayee" list="payees" value="' + esc(t.payee) + '" placeholder="Walmart" autocapitalize="words"></label><datalist id="payees">' + payees.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Category<input id="tCat" list="cats" value="' + esc(t.category) + '" placeholder="Groceries"></label><label>Date<input id="tDate" type="date" value="' + esc(t.date) + '"></label></div>' +
    '<datalist id="cats">' + data.settings.categories.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
    '<div class="catchips" id="tChips">' + topCategories(99).map((c, i) => '<button type="button" class="chipbtn' + (i >= 10 && c !== t.category ? ' extra' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') +
    '<button type="button" class="chipbtn more" id="tMoreCats">More ▾</button></div>' +
    '<div class="grid2"><label>Check #<input id="tCheck" inputmode="numeric" value="' + esc(t.checkNum) + '"></label>' +
    (data.accounts.length > 1 ? '<label>Account<select id="tAcc">' + data.accounts.map(a => '<option value="' + a.id + '"' + (a.id === t.accountId ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></label>' : '<span></span>') + '</div>' +
    (t.bankAmount != null && t.bankAmount !== '' ? '<p class="helper">🏦 The bank shows ' + money(t.bankAmount) + '.' + (Math.abs(bankAmt(t) - Number(t.amount)) >= 0.005 ? ' Your register has it rounded.' : '') + '</p>' : '') +
    '<label>Note<input id="tNote" value="' + esc(t.note) + '"></label>' +
    '<p class="lbl">Tags</p>' + tagChips(tagsOf(t)) +
    '<label class="check"><input type="checkbox" id="tClr"' + (t.cleared ? ' checked' : '') + '> Cleared the bank</label>' +
    (id && String(id).startsWith('rec_') ? '<p class="helper">🔁 This came from a recurring ' + (t.type === 'income' ? 'deposit' : 'bill') + '. <button type="button" class="linkish" id="tRec">Edit the recurring ' + (t.type === 'income' ? 'deposit' : 'bill') + '</button></p>' : '<label class="check"><input type="checkbox" id="tRepeat"> 🔁 Repeats every month (adds it on the ' + ordinal(Number(t.date.slice(8, 10)) || 1) + ')</label>') +
    '<details class="taxbox"' + (t.taxCat || t.receipt ? ' open' : '') + '><summary>🧾 Taxes &amp; receipt</summary>' +
    '<label>Counts for taxes as<select id="tTax"><option value="">— not for taxes —</option>' + data.settings.taxCats.map(c => '<option' + (c === t.taxCat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
    '<div class="row-actions">' + (t.receipt ? '<button type="button" class="ghost small" id="tView">📎 View receipt</button>' : '') +
    '<label class="button ghost small file">📷 ' + (t.receipt ? 'Replace' : 'Add') + ' receipt<input type="file" id="tFile" accept="image/*,application/pdf" hidden></label></div>' +
    '<p class="helper" id="tFileNote">' + (signedIn() ? 'Receipts are stored privately in your account.' : 'Sign in to save receipt photos.') + '</p></details>' +
    '<div class="row-actions"><button type="button" id="tSave">Save</button><button type="button" class="ghost" id="tCancel">Cancel</button>' + (id ? '<button type="button" class="ghost" id="tCopy">Copy as new</button><button type="button" class="danger" id="tDel">Delete</button>' : '') + '</div>');
  if ($('tRec')) $('tRec').onclick = () => { const r = recList().find(x => String(id).startsWith('rec_' + x.id + '_')); closeModal(); if (r) editRecurring(r.id); else toast('That recurring bill was removed.'); };
  if ($('tCopy')) $('tCopy').onclick = () => { closeModal(); editTx(null, t.type); ['tAmt', 'tPayee', 'tCat', 'tNote'].forEach((f, i) => { $(f).value = [Number(t.amount).toFixed(2), t.payee, t.category, t.note][i]; }); $('tTax').value = t.taxCat || ''; };
  let pendingFile = null;
  const oldCat = t.category || '';
  const markChip = () => $('tChips').querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === $('tCat').value));
  $('tChips').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { $('tCat').value = b.dataset.cat; markChip(); });
  $('tCat').oninput = markChip; markChip();
  $('tMoreCats').onclick = () => { $('tChips').classList.add('all'); $('tMoreCats').remove(); };
  $('tKind').querySelectorAll('.seg').forEach(b => b.onclick = () => { kind = b.dataset.k; $('tKind').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); });
  $('tPayee').onchange = () => {
    const m = mem[$('tPayee').value.trim().toLowerCase()];
    if (!$('tCat').value) $('tCat').value = autoCategory($('tPayee').value, '', kind) || '';
    markChip();
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
    Object.assign(t, { amount: Math.abs(amount), type: kind, payee: $('tPayee').value.trim(), category: $('tCat').value.trim(), date: $('tDate').value, checkNum: $('tCheck').value.trim(), note: $('tNote').value.trim(), cleared: $('tClr').checked, taxCat: $('tTax').value, tags: pickedTags(), accountId: $('tAcc') ? $('tAcc').value : t.accountId });
    if (!id) { t.id = uid(); t.time = new Date().toTimeString().slice(0, 5); data.tx.push(t); }
    if ($('tRepeat') && $('tRepeat').checked) {
      const r = { id: uid(), accountId: t.accountId, payee: t.payee || t.category || 'Bill', amount: t.amount, type: t.type, category: t.category, taxCat: t.taxCat, every: 'month', day: Number(t.date.slice(8, 10)), start: t.date, through: t.date, paused: false };
      data.settings.recurring = recList().concat([r]);
    }
    if (t.category && !data.settings.categories.includes(t.category)) data.settings.categories.push(t.category);
    if (t.payee && t.category && t.category !== oldCat) {
      // Remember it for this name, and offer to fix the others.
      const k = looseName(t.payee), rules = data.settings.catRules = Object.assign({}, data.settings.catRules);
      const others = data.tx.filter(x => x !== t && x.payee && looseName(x.payee) === k && x.category !== t.category);
      if (!others.length || confirm('Also put your other ' + others.length + ' “' + t.payee + '” entries in ' + t.category + '?')) {
        rules[k] = t.category; others.forEach(x => { x.category = t.category; });
      }
    }
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
  wireTagChips();
  if (preset) {
    if (preset.payee) { $('tPayee').value = preset.payee; $('tPayee').onchange(); }
    if (preset.date) $('tDate').value = preset.date;
  }
  if ($('tScan')) $('tScan').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    pendingFile = f; $('tFileNote').textContent = '📎 The photo will be saved as the receipt.';
    const note = $('tScanNote'); note.hidden = false; note.textContent = '🔎 Reading the receipt…';
    try {
      const r = await readReceipt(f, p => { note.textContent = '🔎 Reading the receipt… ' + p + '%'; });
      if (r.total) $('tAmt').value = r.total.toFixed(2);
      if (r.store) { $('tPayee').value = r.store; $('tCat').value = ''; $('tPayee').onchange(); }
      if (r.date && r.date <= today() && r.date >= isoDay(new Date(Date.now() - 400 * 864e5))) $('tDate').value = r.date;
      note.textContent = r.total ? '✓ Found ' + (r.store || 'a store') + ', ' + money(r.total) + '. Check it, then Save.' : 'Couldn\'t read the total. Type it in; the photo is still attached.';
    } catch (err) { note.textContent = err.message + ' The photo is still attached.'; }
  };
  setTimeout(() => { if (!id && !(preset && preset.payee)) $('tAmt').focus(); else if (preset && preset.payee) $('tAmt').focus(); }, 50);
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

// The next 30 days of recurring bills and income, and what the balance will be after them.
function comingUp(acc, balance) {
  const list = upcoming(acc, 31);
  if (!list.length) return recList().length ? '' : '<p class="helper"><a href="#recurring">🔁 Set up your monthly bills</a> to see what\'s coming up.</p>';
  const net = list.reduce((s, x) => s + (x.r.type === 'income' ? 1 : -1) * Number(x.r.amount), 0);
  const days = {};
  list.forEach(x => { (days[x.date] = days[x.date] || []).push(x); });
  return '<details class="card pad coming"><summary>📅 Coming up: ' + list.length + ' in the next month · after them <b class="' + (balance + net < 0 ? 'expense' : '') + '">' + money(balance + net) + '</b></summary>' +
    Object.entries(days).map(([d, xs]) => '<div class="day">' + esc(fmtDate(d, true)) + '</div>' + xs.map(x => '<div class="mini-row" data-uprec="' + x.r.id + '" style="cursor:pointer"><span>🔁 ' + esc(x.r.payee) + '</span><b class="' + x.r.type + '">' + signedAmt(x.r.type, x.r.amount) + '</b></div>').join('')).join('') +
    '<div class="row-actions"><button type="button" class="ghost small" data-newrec="expense">+ Recurring bill</button><button type="button" class="ghost small" data-newrec="income">+ Recurring deposit</button><a class="button ghost small" href="#recurring">See all</a></div>' +
    '<p class="helper">These go into the register on their day. Tap one to change it.</p></details>';
}

// ---------- Recurring bills & income ----------
// Each one is added to the register on its day (the 1st unless changed), not cleared, until the bank shows it.
// Ids are built from the bill and the date, so two devices adding the same month's bill end up with one entry.
const recList = () => data.settings.recurring || [];
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const recId = (r, date) => 'rec_' + r.id + '_' + date.replace(/-/g, '');
const EVERY = { month: 'Every month', '2weeks': 'Every 2 weeks', week: 'Every week', year: 'Every year' };
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function recWhen(r) {
  if (r.every === 'month') return 'Monthly on the ' + (r.day >= 31 ? 'last day' : ordinal(r.day || 1));
  if (r.every === 'year') return 'Yearly on ' + fmtDate(r.start);
  return EVERY[r.every] + ' from ' + fmtDate(r.start);
}
// Due dates after `from` up to and including `to` (ISO days).
function recDates(r, from, to) {
  const out = [];
  if (r.every === 'month' || r.every === 'year') {
    let [y, m] = from.split('-').map(Number);
    for (let k = 0; k < 400; k++) {
      const mm = ((m - 1 + k) % 12) + 1, yy = y + Math.floor((m - 1 + k) / 12);
      if (r.every === 'year' && mm !== Number(r.start.slice(5, 7))) continue;
      const dd = Math.min(r.every === 'year' ? Number(r.start.slice(8, 10)) : (r.day || 1), lastDay(yy, mm));
      const d = yy + '-' + pad(mm) + '-' + pad(dd);
      if (d > to) break;
      if (d > from && d >= r.start) out.push(d);
    }
  } else {
    const step = r.every === 'week' ? 7 : 14;
    const d = new Date(r.start + 'T12:00');
    for (let k = 0; k < 2000; k++) {
      const s = isoDay(d);
      if (s > to) break;
      if (s > from) out.push(s);
      d.setDate(d.getDate() + step);
    }
  }
  return out;
}
const recTx = (r, date) => ({ id: recId(r, date), accountId: r.accountId, date, time: '', payee: r.payee, amount: Number(r.amount), type: r.type, category: r.category || '', note: '', checkNum: '', cleared: false, taxCat: r.taxCat || '', receipt: '', source: 'Recurring' });
// Add every bill that has come due since it was last added.
function runRecurring() {
  const now = today(), have = new Set(data.tx.map(t => t.id));
  let added = 0, changed = false;
  recList().forEach(r => {
    if (r.paused || !account(r.accountId)) return;
    const from = r.through || isoDay(new Date(new Date(r.start + 'T12:00').getTime() - 864e5));
    recDates(r, from, now).forEach(d => { const t = recTx(r, d); if (!have.has(t.id)) { data.tx.push(t); have.add(t.id); added++; } });
    if (r.through !== now) { r.through = now; changed = true; }
  });
  if (changed || added) window.save();
  if (added) toast('Added ' + added + ' recurring ' + (added === 1 ? 'entry' : 'entries') + ' to your register.');
  return added;
}
// What's due in the next `days` days that isn't in the register yet.
function upcoming(acc, days) {
  const now = today(), end = isoDay(new Date(Date.now() + days * 864e5)), have = new Set(data.tx.map(t => t.id));
  const out = [];
  recList().forEach(r => { if (!r.paused && r.accountId === acc.id) recDates(r, r.through && r.through > now ? r.through : now, end).forEach(d => { if (!have.has(recId(r, d))) out.push({ r, date: d }); }); });
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.r.amount - a.r.amount);
}
function firstOfNextMonth(iso) { const [y, m] = iso.split('-').map(Number); return (m === 12 ? y + 1 : y) + '-' + pad(m === 12 ? 1 : m + 1) + '-01'; }

function viewRecurring() {
  const acc = activeAccount();
  const list = recList().slice().sort((a, b) => (a.type === b.type ? 0 : a.type === 'income' ? -1 : 1) || b.amount - a.amount);
  const total = t => list.filter(r => !r.paused && r.type === t && r.every === 'month').reduce((s, r) => s + Number(r.amount), 0);
  const sugg = acc ? suggestRecurring(acc) : [];
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>🔁 Recurring</h1>' +
    '<p class="helper">Bills and income that repeat. Each one is added to your register on its day (not cleared yet), and the 🏦 Bank tab clears it when it shows up at the bank.</p>' +
    (list.length ? '<div class="stat-row"><div class="stat"><span>Monthly bills</span><b class="expense">' + money(total('expense')) + '</b></div><div class="stat"><span>Monthly income</span><b class="income">' + money(total('income')) + '</b></div><div class="stat"><span>Bills</span><b>' + list.filter(r => r.type === 'expense').length + '</b></div></div>' +
      '<div class="card pad">' + list.map(r => '<div class="mini-row" data-rec="' + r.id + '" style="cursor:pointer"><span><b>' + esc(r.payee) + '</b>' + (r.paused ? ' <span class="chip warn">paused</span>' : '') + '<span class="sub">' + esc(recWhen(r)) + (r.category ? ' · ' + esc(r.category) : '') + '</span></span><b class="' + r.type + '">' + signedAmt(r.type, r.amount) + '</b></div>').join('') + '</div>' : '') +
    '<div class="row-actions"><button type="button" id="recNew">+ Add a recurring bill</button><button type="button" class="ghost" id="recInc">+ Recurring deposit</button></div>' +
    (sugg.length ? '<div class="card pad"><h2>Suggested from your register</h2><p class="helper">Tick the ones that repeat every month. They\'ll be added on the 1st starting ' + esc(fmtDate(sugg[sugg.length - 1].start, true)) + ' (you can change any one\'s day after).</p>' +
      sugg.map((s, k) => '<label class="check bline"><input type="checkbox" data-sug="' + k + '"' + (s.likely ? ' checked' : '') + '> <span><b>' + esc(s.payee) + '</b><span class="sub">' + esc(s.why) + '</span></span> <b class="' + s.type + '">' + signedAmt(s.type, s.amount) + '</b></label>').join('') +
      '<div class="row-actions"><button type="button" id="sugAdd">Add ticked bills</button></div></div>' : '');
  $('view').querySelectorAll('[data-rec]').forEach(el => el.onclick = () => editRecurring(el.dataset.rec));
  $('recNew').onclick = () => editRecurring(null, 'expense');
  $('recInc').onclick = () => editRecurring(null, 'income');
  if ($('sugAdd')) $('sugAdd').onclick = () => {
    const picked = [...document.querySelectorAll('[data-sug]:checked')].map(c => sugg[Number(c.dataset.sug)]);
    if (!picked.length) { toast('Tick at least one.'); return; }
    data.settings.recurring = recList().concat(picked.map(s => ({ id: uid(), accountId: acc.id, payee: s.payee, amount: s.amount, type: s.type, category: s.category, taxCat: s.taxCat || '', every: 'month', day: 1, start: s.start, through: s.through, paused: false })));
    window.save(); toast('Added ' + picked.length + ' recurring bills.'); viewRecurring();
  };
}
// Bills she already enters on the 1st (the CheckBook way), plus anything the bank shows every month.
function suggestRecurring(acc) {
  const have = recList().map(r => looseName(r.payee));
  const known = p => have.some(h => h && (h === looseName(p) || sameName({ payee: p }, { payee: h, desc: '' })));
  const tx = data.tx.filter(t => t.accountId === acc.id && t.type === 'expense');
  const firsts = [...new Set(tx.filter(t => t.date.endsWith('-01') && t.source !== 'Bank').map(t => t.date))].sort();
  const out = [], seen = new Set();
  if (firsts.length) {
    const d = firsts[firsts.length - 1];
    tx.filter(t => t.date === d && t.source !== 'Bank').forEach(t => {
      const k = looseName(t.payee); if (seen.has(k) || known(t.payee)) return; seen.add(k);
      const likely = t.category === 'House Bill' || /payment|insurance|bill|rent|loan|mortgage/i.test(t.payee + ' ' + t.category);
      out.push({ payee: t.payee, amount: Number(t.amount), type: 'expense', category: t.category, taxCat: t.taxCat, likely, why: 'On your ' + fmtDate(d) + ' bills', start: firstOfNextMonth(d), through: d });
    });
  }
  // Bank payees charged in at least 3 of the last 4 months at about the same amount.
  const now = today(), months = [0, 1, 2, 3].map(k => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - k); return isoDay(x).slice(0, 7); });
  const groups = {};
  tx.filter(t => t.source === 'Bank' && months.includes(t.date.slice(0, 7))).forEach(t => { const k = looseName(t.payee); (groups[k] = groups[k] || []).push(t); });
  Object.values(groups).forEach(g => {
    const p = g[g.length - 1].payee, k = looseName(p);
    if (seen.has(k) || known(p) || out.some(o => sameName({ payee: o.payee }, { payee: p, desc: '' }))) return;
    const ms = new Set(g.map(t => t.date.slice(0, 7)));
    const amts = g.map(t => Number(t.amount)).sort((a, b) => a - b), mid = amts[Math.floor(amts.length / 2)];
    if (ms.size < 3 || g.length > ms.size + 1 || amts.some(a => Math.abs(a - mid) > Math.max(3, mid * 0.15)) || /transfer|walmart|cash app|venmo|zelle/i.test(p)) return;
    seen.add(k);
    const last = g.map(t => t.date).sort().pop();
    out.push({ payee: p, amount: Math.ceil(mid), type: 'expense', category: g[g.length - 1].category, likely: false, why: 'Your bank shows it ' + ms.size + ' of the last 4 months (about ' + money(mid) + ')', start: firstOfNextMonth(now), through: now });
  });
  // Paychecks: the same payer in at least 3 of the last 4 months. Amounts can vary some, so the latest is used (rounded down).
  const inc = data.tx.filter(t => t.accountId === acc.id && t.type === 'income' && months.includes(t.date.slice(0, 7)) && t.category !== 'Transfer' && !/transfer|cash app|venmo|zelle/i.test(t.payee));
  const ig = [];
  const samePayer = (a, b) => looseName(a) === looseName(b) || words(a).some(w => words(b).includes(w));
  inc.sort(byTime).forEach(t => { const g = ig.find(x => samePayer(x[0].payee, t.payee)); if (g) g.push(t); else ig.push([t]); });
  ig.forEach(g => {
    const ms = new Set(g.map(t => t.date.slice(0, 7)));
    const amts = g.map(t => Number(t.amount)).sort((a, b) => a - b), mid = amts[Math.floor(amts.length / 2)];
    if (ms.size < 3 || g.length > ms.size + 1 || amts.some(a => Math.abs(a - mid) > mid * 0.25) || known(g[0].payee)) return;
    const latest = g[g.length - 1], named = g.slice().reverse().find(t => t.source !== 'Bank') || latest;
    out.unshift({ payee: named.payee, amount: Math.floor(Number(latest.amount)), type: 'income', category: 'Paycheck', likely: true, why: 'Deposited ' + ms.size + ' of the last 4 months, usually around the ' + ordinal(Math.round(g.reduce((s, t) => s + Number(t.date.slice(8, 10)), 0) / g.length)) + ' (last one ' + money(latest.amount) + ')', start: firstOfNextMonth(now), through: now });
  });
  return out;
}
function editRecurring(id, type) {
  const acc = activeAccount();
  if (!acc) { toast('Add an account first.'); return; }
  const r = id ? recList().find(x => x.id === id) : { payee: '', amount: '', type: type || 'expense', category: '', taxCat: '', every: 'month', day: 1, start: firstOfNextMonth(today()), accountId: acc.id, paused: false };
  let kind = r.type;
  const next = id ? (recDates(r, r.through || today(), '2100-01-01')[0] || r.start) : r.start;
  openModal('<h2>' + (id ? 'Edit recurring' : kind === 'income' ? 'Recurring deposit' : 'Recurring bill') + '</h2>' + (id ? '<p class="helper">Changes also apply to its entries in the register that haven\'t cleared yet.</p>' : '') +
    '<div class="segs" id="rKind"><button type="button" class="seg' + (kind === 'expense' ? ' on' : '') + '" data-k="expense">− Bill</button><button type="button" class="seg' + (kind === 'income' ? ' on' : '') + '" data-k="income">+ Deposit</button></div>' +
    '<label>Payee<input id="rPayee" value="' + esc(r.payee) + '" placeholder="Shellpoint" autocapitalize="words"></label>' +
    '<div class="grid2"><label>Amount<input id="rAmt" inputmode="decimal" value="' + (r.amount === '' ? '' : Number(r.amount).toFixed(2)) + '"></label>' +
    '<label>Category<input id="rCat" list="rcats" value="' + esc(r.category) + '"></label></div><datalist id="rcats">' + data.settings.categories.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>How often<select id="rEvery">' + Object.entries(EVERY).map(([k, l]) => '<option value="' + k + '"' + (r.every === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>Next one<input id="rNext" type="date" value="' + esc(next) + '"></label></div>' +
    '<p class="helper" id="rHint"></p>' +
    (id ? '<label class="check"><input type="checkbox" id="rPause"' + (r.paused ? ' checked' : '') + '> Paused (stop adding it for now)</label>' : '') +
    '<div class="row-actions"><button type="button" id="rSave">Save</button><button type="button" class="ghost" id="rCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="rDel">Delete</button>' : '') + '</div>');
  const hint = () => { const d = $('rNext').value; $('rHint').textContent = d ? ($('rEvery').value === 'month' ? 'Monthly on the ' + ordinal(Number(d.slice(8, 10))) + '.' : '') + ' Added to your register on ' + fmtDate(d, true) + '.' : ''; };
  $('rNext').oninput = hint; $('rEvery').onchange = hint; hint();
  $('rKind').querySelectorAll('.seg').forEach(b => b.onclick = () => { kind = b.dataset.k; $('rKind').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); });
  $('rCancel').onclick = closeModal;
  $('rSave').onclick = () => {
    const amount = Math.abs(toNum($('rAmt').value)), payee = $('rPayee').value.trim(), d = $('rNext').value;
    if (!payee || !amount || !d) { toast('Fill in the payee, amount and next date.'); return; }
    Object.assign(r, { payee, amount, type: kind, category: $('rCat').value.trim(), every: $('rEvery').value, day: Number(d.slice(8, 10)), start: d, through: isoDay(new Date(new Date(d + 'T12:00').getTime() - 864e5)), paused: $('rPause') ? $('rPause').checked : false });
    if (!id) { r.id = uid(); data.settings.recurring = recList().concat([r]); }
    else {
      data.settings.recurring = recList().slice();
      // Entries this bill already added that haven't cleared get the new amount and name too.
      data.tx.forEach(t => { if (String(t.id).startsWith('rec_' + r.id + '_') && !t.cleared) Object.assign(t, { payee: r.payee, amount: r.amount, type: r.type, category: r.category }); });
    }
    window.save(); closeModal(); runRecurring(); route();
  };
  if (id) $('rDel').onclick = () => {
    if (!confirm('Stop ' + r.payee + ' from repeating? Entries already in your register stay.')) return;
    data.settings.recurring = recList().filter(x => x.id !== id); window.save(); closeModal(); route();
  };
}

// ---------- Favorites (one-tap quick add) ----------
// Her pinned list if she made one, otherwise the payees she enters most by hand (last 4 months).
function favorites() {
  const pinned = (data.settings.favorites || []).filter(Boolean);
  if (pinned.length) return pinned.slice(0, 8);
  const since = isoDay(new Date(Date.now() - 120 * 864e5)), count = {}, name = {};
  data.tx.filter(t => t.type === 'expense' && t.date >= since && t.payee && !String(t.id).startsWith('rec_')).forEach(t => {
    const k = looseName(t.payee); count[k] = (count[k] || 0) + (t.source === 'Bank' ? 1 : 3); if (!name[k] || t.source !== 'Bank') name[k] = t.payee;
  });
  return Object.keys(count).filter(k => k && !/^(check|deposit|transfer)$/.test(k)).sort((a, b) => count[b] - count[a]).slice(0, 8).map(k => name[k]);
}
function favRow() {
  const f = favorites();
  if (!f.length) return '';
  return '<div class="favs"><span class="favl">⚡ Quick add</span>' + f.map(p => '<button type="button" class="chipbtn" data-fav="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>';
}

// ---------- Tags ----------
const DEFAULT_TAGS = ['Band', 'Booth', 'Kids', 'Christmas', 'Trip', 'Business', 'Birthday', 'Reimburse'];
const tagList = () => data.settings.tags && data.settings.tags.length ? data.settings.tags : DEFAULT_TAGS;
const tagsOf = t => String(t.tags || '').split(',').map(x => x.trim()).filter(Boolean);
function tagChips(selected) {
  const all = tagList().concat(selected.filter(x => !tagList().includes(x)));
  return '<div class="catchips" id="tTags">' + all.map(x => '<button type="button" class="chipbtn tag' + (selected.includes(x) ? ' on' : '') + '" data-tag="' + esc(x) + '">#' + esc(x) + '</button>').join('') +
    '<button type="button" class="chipbtn" id="tTagNew">+ tag</button></div>';
}
function wireTagChips() {
  const box = $('tTags'); if (!box) return;
  box.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('tTagNew').onclick = () => {
    const n = (prompt('New tag (for example "Disney trip"):') || '').trim().replace(/[#,]/g, ''); if (!n) return;
    if (!tagList().includes(n)) data.settings.tags = tagList().concat([n]);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn tag on'; b.dataset.tag = n; b.textContent = '#' + n; b.onclick = () => b.classList.toggle('on');
    box.insertBefore(b, $('tTagNew'));
  };
}
const pickedTags = () => [...document.querySelectorAll('#tTags [data-tag].on')].map(b => b.dataset.tag).join(', ');

// ---------- Receipt scanning ----------
// Reads the photo on the phone itself (Tesseract), then fills in the store, total and date.
const OCR_CDN = 'https://cdn.jsdelivr.net/npm/';
function loadOcr() {
  return new Promise((ok, no) => {
    if (window.Tesseract) return ok();
    const s = document.createElement('script'); s.src = OCR_CDN + 'tesseract.js@5/dist/tesseract.min.js';
    s.onload = ok; s.onerror = () => no(new Error('Could not load the receipt reader (need signal the first time).'));
    document.head.appendChild(s);
  });
}
async function readReceipt(file, onProgress) {
  await loadOcr();
  const img = await shrinkImage(file);
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: OCR_CDN + 'tesseract.js@5/dist/worker.min.js', corePath: OCR_CDN + 'tesseract.js-core@5', langPath: OCR_CDN + '@tesseract.js-data/eng/4.0.0_best_int',
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100)); }
  });
  try { const { data: d } = await worker.recognize(img); return parseReceipt(d.text); }
  finally { worker.terminate(); }
}
function parseReceipt(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const amountsIn = l => (l.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').match(/-?\$?\s?\d{1,5}[.,]\d{2}(?!\d)/g) || []).map(a => toNum(a.replace(',', '.')));
  let total = 0;
  // The total line: "TOTAL", "Amount due", "Balance" (but not subtotal or tax).
  for (const l of lines.slice().reverse()) {
    if (/total|amount due|balance due|grand|amt due|^due\b|charged|debit tend|visa|mastercard/i.test(l) && !/sub\s?-?total|tax|savings|you saved|items?\b.*sold/i.test(l)) {
      const a = amountsIn(l).filter(x => x > 0); if (a.length) { total = a[a.length - 1]; break; }
    }
  }
  if (!total) total = Math.max(0, ...lines.flatMap(amountsIn));
  let date = '';
  for (const l of lines) { const m = l.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (+m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) { date = y + '-' + pad(m[1]) + '-' + pad(m[2]); break; } } }
  const whole = lines.join(' ');
  const known = MERCHANTS.find(([re]) => re.test(whole));
  let store = known ? known[1] : '';
  if (!store) { const l = lines.find(x => (x.match(/[A-Za-z]/g) || []).length >= 4 && !/receipt|welcome|thank|store #|survey|www|http|\d{3}[-.]\d{3}/i.test(x)); if (l) store = l.replace(/[^A-Za-z0-9&' .-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).split(' ').slice(0, 4).join(' '); }
  return { total: Math.round(total * 100) / 100, date, store, text };
}

// ---------- Category inbox ----------
let inboxSkip = new Set();
function viewInbox() {
  const acc = activeAccount();
  const list = data.tx.filter(t => (!acc || t.accountId === acc.id) && !t.category && t.category !== 'Transfer' && !inboxSkip.has(t.id)).sort(byTime).reverse();
  if (!list.length) {
    $('view').innerHTML = '<a class="back" href="#register">‹ Register</a><div class="empty"><h2>🎉 All sorted!</h2><p>Every entry has a category.' + (inboxSkip.size ? ' (' + inboxSkip.size + ' skipped for now.)' : '') + '</p><a class="button" href="#register">Back to register</a></div>';
    return;
  }
  const t = list[0], same = list.filter(x => looseName(x.payee) === looseName(t.payee));
  $('view').innerHTML = '<a class="back" href="#register">‹ Register</a><h1>🗂 Needs a category <small>' + list.length + ' left</small></h1>' +
    '<div class="card pad inbox-card"><div class="mini-row"><span><b class="big">' + esc(t.payee || '(no payee)') + '</b><span class="sub">' + esc(fmtDate(t.date, true)) + '</span></span><b class="' + t.type + ' big">' + signedAmt(t.type, t.amount) + '</b></div>' +
    (t.note ? '<p class="sub">' + esc(t.note) + '</p>' : '') +
    '<div class="catchips big">' + topCategories(20).map(c => '<button type="button" class="chipbtn" data-ic="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
    '<label>Or another<input id="icOther" list="icCats" placeholder="Type a category"></label><datalist id="icCats">' + data.settings.categories.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
    (same.length > 1 ? '<label class="check"><input type="checkbox" id="icAll" checked> Use for all ' + same.length + ' “' + esc(t.payee) + '” entries, and remember it</label>' : '<label class="check"><input type="checkbox" id="icAll" checked> Remember it for “' + esc(t.payee) + '” next time</label>') +
    '<div class="row-actions"><button type="button" class="ghost" id="icSkip">Skip</button><button type="button" class="ghost" id="icEdit">Open entry</button></div></div>';
  const apply = c => {
    c = c.trim(); if (!c) return;
    if (!data.settings.categories.includes(c)) data.settings.categories.push(c);
    if ($('icAll').checked) { same.forEach(x => { x.category = c; }); if (t.payee) data.settings.catRules = Object.assign({}, data.settings.catRules, { [looseName(t.payee)]: c }); }
    else t.category = c;
    window.save(); viewInbox();
  };
  $('view').querySelectorAll('[data-ic]').forEach(b => b.onclick = () => apply(b.dataset.ic));
  $('icOther').onchange = e => apply(e.target.value);
  $('icSkip').onclick = () => { inboxSkip.add(t.id); viewInbox(); };
  $('icEdit').onclick = () => editTx(t.id);
}

// ---------- Category rules ----------
function viewRules() {
  const rules = data.settings.catRules || {}, cont = data.settings.containsRules || [];
  const names = {}; data.tx.forEach(t => { if (t.payee) names[looseName(t.payee)] = t.payee; });
  const catSel = (v, attr) => '<select ' + attr + '>' + data.settings.categories.map(c => '<option' + (c === v ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>';
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>🧭 Category rules</h1>' +
    '<p class="helper">How new entries get their category, in this order: your “name contains” rules, then names you\'ve sorted, then what you used last time, then the built-in rules.</p>' +
    '<div class="card pad"><h2>If the name contains…</h2>' + (cont.map((r, i) => '<div class="rule"><input value="' + esc(r.text) + '" data-ct="' + i + '">' + catSel(r.category, 'data-cc="' + i + '"') + '<button type="button" class="linkish" data-cdel="' + i + '">✕</button></div>').join('') || '<p class="helper">None yet.</p>') +
    '<div class="rule"><input id="ncText" placeholder="e.g. russellvi">' + catSel('', 'id="ncCat"') + '<button type="button" class="small" id="ncAdd">Add</button></div>' +
    '<label class="check"><input type="checkbox" id="ncApply" checked> Also apply to entries already in the register</label></div>' +
    '<div class="card pad"><h2>Names you\'ve sorted (' + Object.keys(rules).length + ')</h2>' + (Object.keys(rules).sort().map(k => '<div class="rule"><span>' + esc(names[k] || k) + '</span>' + catSel(rules[k], 'data-rk="' + esc(k) + '"') + '<button type="button" class="linkish" data-rdel="' + esc(k) + '">✕</button></div>').join('') || '<p class="helper">When you change an entry\'s category (or sort in the inbox), it shows up here.</p>') + '</div>' +
    '<details class="card pad"><summary>Built-in rules</summary>' + CATEGORY_RULES.map(([re, c]) => '<p class="sub"><b>' + esc(c) + '</b>: ' + esc(re.source.replace(/\\b|\\/g, '').split('|').slice(0, 12).join(', ')) + '…</p>').join('') + '</details>';
  const saveCont = () => { data.settings.containsRules = cont.slice(); window.save(); };
  $('view').querySelectorAll('[data-ct]').forEach(i => i.onchange = () => { cont[+i.dataset.ct].text = i.value.trim(); saveCont(); });
  $('view').querySelectorAll('[data-cc]').forEach(i => i.onchange = () => { cont[+i.dataset.cc].category = i.value; saveCont(); });
  $('view').querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { cont.splice(+b.dataset.cdel, 1); saveCont(); viewRules(); });
  $('view').querySelectorAll('[data-rk]').forEach(i => i.onchange = () => { data.settings.catRules = Object.assign({}, rules, { [i.dataset.rk]: i.value }); data.tx.forEach(t => { if (looseName(t.payee) === i.dataset.rk) t.category = i.value; }); window.save(); toast('Updated.'); });
  $('view').querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { const r = Object.assign({}, rules); delete r[b.dataset.rdel]; data.settings.catRules = r; window.save(); viewRules(); });
  $('ncAdd').onclick = () => {
    const text = $('ncText').value.trim(), category = $('ncCat').value; if (!text) { toast('Type part of the name.'); return; }
    cont.push({ text, category }); data.settings.containsRules = cont.slice();
    let n = 0;
    if ($('ncApply').checked) data.tx.forEach(t => { if ((t.payee + ' ' + t.note).toLowerCase().includes(text.toLowerCase()) && t.category !== category) { t.category = category; n++; } });
    window.save(); toast('Rule added' + (n ? ', ' + n + ' entries updated' : '') + '.'); viewRules();
  };
}

// ---------- Budgets ----------
const budgets = () => data.settings.budgets || {};
function monthSpend(acc, ym) {
  const m = {};
  data.tx.filter(t => t.accountId === acc.id && t.type === 'expense' && t.date.startsWith(ym)).forEach(t => { const c = t.category || 'Uncategorized'; m[c] = (m[c] || 0) + Number(t.amount); });
  return m;
}
function budgetCard(acc) {
  const bud = budgets(), cats = Object.keys(bud).filter(c => bud[c] > 0);
  if (!cats.length) return '';
  const ym = today().slice(0, 7), spent = monthSpend(acc, ym);
  const dayFrac = new Date().getDate() / lastDay(+ym.slice(0, 4), +ym.slice(5, 7));
  const rows = cats.map(c => ({ c, b: bud[c], s: spent[c] || 0 })).sort((a, b) => b.s / b.b - a.s / a.b);
  const over = rows.filter(r => r.s > r.b).length, near = rows.filter(r => r.s <= r.b && r.s >= r.b * 0.8).length;
  return '<details class="card pad budgets"' + (over || near ? ' open' : '') + '><summary>🎯 Budgets this month' + (over ? ' · <b class="expense">' + over + ' over</b>' : near ? ' · <b class="warnc">' + near + ' close</b>' : ' · on track') + '</summary>' +
    rows.slice(0, 5).map(r => { const pct = r.s / r.b, cls = pct >= 1 ? 'red' : pct >= 0.8 ? 'yellow' : 'green';
      return '<div class="bud" data-budcat="' + esc(r.c) + '"><div class="mini-row"><span>' + esc(r.c) + '</span><span class="sub">' + money(r.s) + ' of ' + money(r.b) + (pct < 1 ? ' · ' + money(r.b - r.s) + ' left' : ' · ' + money(r.s - r.b) + ' over') + '</span></div><div class="progress ' + cls + '"><span style="width:' + Math.min(100, Math.round(pct * 100)) + '%"></span><i style="left:' + Math.round(dayFrac * 100) + '%"></i></div></div>'; }).join('') +
    (rows.length > 5 ? '<p class="helper">+ ' + (rows.length - 5) + ' more on track.</p>' : '') +
    '<p class="helper">The little line is where you are in the month. <a href="#budgets">Change budgets</a></p></details>';
}
function viewBudgets() {
  const acc = activeAccount(); if (!acc) { location.hash = 'register'; return; }
  const bud = budgets();
  // Average of the last 3 full months, as a starting point.
  const avg = {};
  [1, 2, 3].forEach(k => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); const s = monthSpend(acc, isoDay(d).slice(0, 7)); Object.entries(s).forEach(([c, v]) => { avg[c] = (avg[c] || 0) + v / 3; }); });
  const cats = data.settings.categories.filter(c => !['Paycheck', 'Side income', 'Transfer'].includes(c));
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>🎯 Monthly budgets</h1><p class="helper">Set a limit for the categories you want to watch. Leave the rest blank. Your average for the last 3 months is shown to help.</p>' +
    '<div class="row-actions"><button type="button" class="ghost small" id="budAvg">Fill blanks with my averages</button></div>' +
    '<div class="card pad">' + cats.map(c => '<div class="rule"><span>' + esc(c) + '<span class="sub">avg ' + money(Math.round(avg[c] || 0)) + '</span></span><input inputmode="decimal" data-bud="' + esc(c) + '" value="' + (bud[c] ? bud[c] : '') + '" placeholder="—"></div>').join('') + '</div>' +
    '<div class="row-actions"><button type="button" id="budSave">Save budgets</button></div>';
  $('budAvg').onclick = () => document.querySelectorAll('[data-bud]').forEach(i => { if (!i.value && avg[i.dataset.bud] >= 1) i.value = Math.ceil(avg[i.dataset.bud] / 5) * 5; });
  $('budSave').onclick = () => {
    const b = {}; document.querySelectorAll('[data-bud]').forEach(i => { const v = toNum(i.value); if (v > 0) b[i.dataset.bud] = v; });
    data.settings.budgets = b; window.save(); toast('Budgets saved.'); location.hash = 'register';
  };
}

// ---------- Safe to spend ----------
// Register balance minus the bills due before the next paycheck (bills due the same day as it are covered by it).
function safeToSpend(acc, balance) {
  const now = today(), horizon = isoDay(new Date(Date.now() + 45 * 864e5));
  const up = upcoming(acc, 45);
  const pay = up.find(x => x.r.type === 'income');
  const until = pay ? pay.date : isoDay(new Date(Date.now() + 30 * 864e5));
  const bills = up.filter(x => x.r.type === 'expense' && x.date < until);
  const safe = balance - bills.reduce((s, x) => s + Number(x.r.amount), 0);
  const days = Math.max(1, Math.round((new Date(until) - new Date(now)) / 864e5));
  return '<div class="card pad safe"><div class="mini-row"><span>💵 <b>Safe to spend</b><span class="sub">until ' + (pay ? 'your next deposit, ' : '') + esc(fmtDate(until)) + (bills.length ? ' · after ' + bills.length + ' bill' + (bills.length > 1 ? 's' : '') + ' (' + money(bills.reduce((s, x) => s + Number(x.r.amount), 0)) + ')' : '') + '</span></span>' +
    '<span class="safe-amt"><b class="' + (safe < 0 ? 'expense' : 'income') + '">' + money(safe) + '</b><span class="sub">' + (safe > 0 ? '≈ ' + money(safe / days) + '/day' : 'short before payday') + '</span></span></div>' +
    (pay ? '' : '<p class="helper"><a href="#recurring">Add your paycheck as a recurring deposit</a> for a better number.</p>') + '</div>';
}

// ---------- Bills calendar ----------
let calMonth = '';
function viewCalendar() {
  const acc = activeAccount(); if (!acc) { location.hash = 'register'; return; }
  if (!calMonth) calMonth = today().slice(0, 7);
  const [y, m] = calMonth.split('-').map(Number), first = new Date(y, m - 1, 1), n = lastDay(y, m);
  const from = calMonth + '-01', to = calMonth + '-' + pad(n), before = isoDay(new Date(y, m - 1, 0));
  const items = {};
  const add = (d, x) => { (items[d] = items[d] || []).push(x); };
  // Bills and deposits: what the recurring list will add, plus the ones already in the register.
  recList().filter(r => !r.paused && r.accountId === acc.id).forEach(r => recDates(r, before, to).forEach(d => {
    const t = data.tx.find(x => x.id === recId(r, d));
    add(d, { name: r.payee, amt: Number(t ? t.amount : r.amount), type: r.type, done: t && t.cleared, rec: r.id });
  }));
  if (viewCalendar.all) data.tx.filter(t => t.accountId === acc.id && t.date >= from && t.date <= to && !String(t.id).startsWith('rec_')).forEach(t => add(t.date, { name: t.payee, amt: Number(t.amount), type: t.type, done: t.cleared, tx: t.id }));
  const totOut = Object.values(items).flat().filter(x => x.type === 'expense').reduce((s, x) => s + x.amt, 0), totIn = Object.values(items).flat().filter(x => x.type === 'income').reduce((s, x) => s + x.amt, 0);
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<div class="cal-d empty"></div>';
  for (let d = 1; d <= n; d++) {
    const iso = calMonth + '-' + pad(d), xs = items[iso] || [];
    const out = xs.filter(x => x.type === 'expense').reduce((s, x) => s + x.amt, 0), inc = xs.filter(x => x.type === 'income').reduce((s, x) => s + x.amt, 0);
    cells += '<button type="button" class="cal-d' + (iso === today() ? ' today' : '') + (xs.length ? ' has' : '') + '" data-day="' + iso + '"><span class="n">' + d + '</span>' +
      (inc ? '<span class="calamt income">+' + Math.round(inc).toLocaleString() + '</span>' : '') + (out ? '<span class="calamt expense">−' + Math.round(out).toLocaleString() + '</span>' : '') + '</button>';
  }
  const list = Object.keys(items).sort().map(d => '<div class="day" id="d' + d + '">' + esc(fmtDate(d, true)) + '</div>' + items[d].map(x => '<div class="mini-row" ' + (x.rec ? 'data-crec="' + x.rec + '"' : 'data-ctx="' + x.tx + '"') + ' style="cursor:pointer"><span>' + (x.rec ? '🔁 ' : '') + esc(x.name) + (x.done ? ' <span class="chip">✓ cleared</span>' : '') + '</span><b class="' + x.type + '">' + signedAmt(x.type, x.amt) + '</b></div>').join('')).join('');
  $('view').innerHTML = '<div class="toptabs"><a href="#register">📒 Register</a><a href="#reports">📊 Reports</a><a href="#calendar" class="on">📅 Calendar</a></div>' +
    '<div class="cal-head"><button type="button" class="ghost small" id="calPrev">‹</button><h2>' + esc(monthName(calMonth)) + '</h2><button type="button" class="ghost small" id="calNext">›</button></div>' +
    '<p class="helper">Bills <b class="expense">' + money(totOut) + '</b> · Deposits <b class="income">' + money(totIn) + '</b></p>' +
    '<div class="cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => '<div class="cal-w">' + x + '</div>').join('') + cells + '</div>' +
    '<label class="check"><input type="checkbox" id="calAll"' + (viewCalendar.all ? ' checked' : '') + '> Show everyday spending too</label>' +
    '<div class="card pad">' + (list || '<p class="helper">No bills this month. <a href="#recurring">Set up recurring bills</a></p>') + '</div>';
  $('calPrev').onclick = () => { const d = new Date(y, m - 2, 1); calMonth = isoDay(d).slice(0, 7); viewCalendar(); };
  $('calNext').onclick = () => { const d = new Date(y, m, 1); calMonth = isoDay(d).slice(0, 7); viewCalendar(); };
  $('calAll').onchange = e => { viewCalendar.all = e.target.checked; viewCalendar(); };
  $('view').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { const el = $('d' + b.dataset.day); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); else editTx(null, 'expense', { date: b.dataset.day }); });
  $('view').querySelectorAll('[data-crec]').forEach(b => b.onclick = () => editRecurring(b.dataset.crec));
  $('view').querySelectorAll('[data-ctx]').forEach(b => b.onclick = () => editTx(b.dataset.ctx));
}

// ---------- This month vs last month ----------
function compareCard(acc) {
  const now = new Date(), day = now.getDate();
  const ym = today().slice(0, 7), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1), pym = isoDay(prev).slice(0, 7);
  const cut = pym + '-' + pad(Math.min(day, lastDay(prev.getFullYear(), prev.getMonth() + 1)));
  const sums = (from, to) => { const m = {}; data.tx.filter(t => t.accountId === acc.id && t.type === 'expense' && t.category !== 'Transfer' && t.date >= from && t.date <= to).forEach(t => { const c = t.category || 'Uncategorized'; m[c] = (m[c] || 0) + Number(t.amount); }); return m; };
  const a = sums(ym + '-01', today()), b = sums(pym + '-01', cut), full = sums(pym + '-01', pym + '-31');
  const cats = [...new Set(Object.keys(a).concat(Object.keys(b)))].map(c => ({ c, a: a[c] || 0, b: b[c] || 0, f: full[c] || 0 })).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  if (!cats.length) return '';
  const ta = cats.reduce((s, x) => s + x.a, 0), tb = cats.reduce((s, x) => s + x.b, 0);
  const m0 = n => '$' + Math.round(n).toLocaleString();
  const arrow = d => d > 0.5 ? '<b class="expense">▲ ' + m0(d) + '</b>' : d < -0.5 ? '<b class="income">▼ ' + m0(-d) + '</b>' : '<span class="sub">same</span>';
  return '<div class="card pad"><h2>This month vs last month</h2><p class="helper">' + esc(monthName(ym)) + ' so far (1st–' + ordinal(day) + ') compared with the same days of ' + esc(monthName(pym)) + '.</p>' +
    '<table class="mini cmp"><thead><tr><th>Category</th><th>Now</th><th>Then</th><th>Change</th></tr></thead><tbody>' +
    cats.map(x => '<tr><td>' + esc(x.c) + '</td><td>' + m0(x.a) + '</td><td>' + m0(x.b) + '</td><td>' + arrow(x.a - x.b) + '</td></tr>').join('') +
    '<tr class="tot"><td>Total</td><td>' + m0(ta) + '</td><td>' + m0(tb) + '</td><td>' + arrow(ta - tb) + '</td></tr></tbody></table></div>';
}

// ---------- Siri (iPhone Shortcuts) ----------
// A Shortcut opens …/money/#add?type=expense&amt=12.50&payee=Sonic and the entry is saved right away.
let pendingAdd = null;
function quickAdd() {
  const q = new URLSearchParams(location.hash.replace(/^#add\??/, ''));
  pendingAdd = { type: /^(in|dep|pay)/i.test(q.get('type') || '') ? 'income' : 'expense', amt: toNum(q.get('amt') || q.get('amount')), payee: (q.get('payee') || q.get('where') || '').trim(), category: (q.get('cat') || q.get('category') || '').trim(), note: (q.get('note') || '').trim() };
  history.replaceState(null, '', location.pathname + '#register');
  finishQuickAdd();
}
// Runs once the account has loaded (a phone that just opened the app may still be syncing).
function finishQuickAdd() {
  if (!pendingAdd) return;
  const acc = activeAccount();
  if (!acc) { $('view').innerHTML = '<p class="helper">Loading your register…</p>'; if (!signedIn()) setTimeout(() => { if (pendingAdd && !activeAccount()) { $('view').innerHTML = '<div class="card pad"><h2>Sign in first</h2><p class="helper">Siri opened the app in Safari. Sign in here once, then try again.</p><div data-syncbox></div></div>'; window.moneySync && window.moneySync.renderBox(); } }, 2500); return; }
  const p = pendingAdd; pendingAdd = null;
  if (!p.amt) { route(); editTx(null, p.type); $('tPayee').value = p.payee; return; }
  const mem = payeeMemory()[p.payee.toLowerCase()] || {};
  const t = { id: uid(), accountId: acc.id, date: today(), time: new Date().toTimeString().slice(0, 5), payee: p.payee.replace(/\b[a-z]/g, c => c.toUpperCase()), amount: Math.abs(p.amt), type: p.type, category: p.category || autoCategory(p.payee, '', p.type) || '', note: p.note || 'Added by Siri', checkNum: '', cleared: false, taxCat: mem.taxCat || '', receipt: '', source: 'Siri' };
  data.tx.push(t); window.save(); route();
  toast('✓ Added ' + (t.payee || 'entry') + ' ' + money(t.amount) + '. Tap it to change anything.');
}
function viewSiri() {
  const base = location.origin + location.pathname;
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>🎙 Add with Siri</h1>' +
    '<p class="helper">Make this Shortcut once on your iPhone. Then say <b>“Hey Siri, add expense”</b>. Siri asks how much and where, and it goes into your register.</p>' +
    '<div class="card pad"><ol class="steps">' +
    '<li>Open the <b>Shortcuts</b> app → tap <b>+</b>.</li>' +
    '<li>Add action <b>Ask for Input</b>. Set Input Type to <b>Number</b>, Prompt: <i>How much?</i></li>' +
    '<li>Add another <b>Ask for Input</b>. Type <b>Text</b>, Prompt: <i>Where?</i></li>' +
    '<li>Add action <b>Text</b> and paste this line:<div class="linkbox"><code id="siriUrl">' + esc(base) + '#add?type=expense&amp;amt=</code></div>Right after <i>amt=</i>, tap <b>Provided Input</b> (the number). Then type <code>&amp;payee=</code> and pick the second <b>Provided Input</b> (the place).</li>' +
    '<li>Add action <b>Open URLs</b> (it uses the Text from step 4).</li>' +
    '<li>Tap the name at the top and call it <b>Add expense</b>. Done!</li></ol>' +
    '<div class="row-actions"><button type="button" class="ghost small" id="siriCopy">Copy the line</button></div>' +
    '<p class="helper">For money in, make a second one called <b>Add deposit</b> with <code>type=income</code>.</p>' +
    '<p class="helper">Siri opens Safari, so <b>sign in once in Safari</b> too (same email and password). The entry syncs to the app.</p></div>' +
    '<div class="card pad"><h2>Try it</h2><p class="helper">This link adds a $1.00 test you can delete after:</p><a class="button ghost" href="#add?type=expense&amt=1&payee=Siri%20test">Add a $1 test</a></div>';
  $('siriCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(base + '#add?type=expense&amt=').then(() => toast('Copied.'), () => toast('Press and hold the line to copy it.')); };
}

// ---------- Accounts ----------
function editAccount(id) {
  const a = id ? account(id) : { name: 'Checking', kind: 'checking', openingBalance: 0, openingDate: null, sort: data.accounts.length };
  const b = id ? balances(a) : null;
  openModal('<h2>' + (id ? 'Edit account' : 'New account') + '</h2>' +
    '<label>Name<input id="aName" value="' + esc(a.name) + '" placeholder="Checking"></label>' +
    '<label>Type<select id="aKind">' + [['checking', 'Checking'], ['savings', 'Savings'], ['credit', 'Credit card'], ['cash', 'Cash']].map(([v, l]) => '<option value="' + v + '"' + (a.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<h3>Starting balance</h3><p class="helper">Easiest: type the <b>available balance</b> your bank shows right now, and the app works out the rest. Or set the balance from before your first entry.</p>' +
    '<div class="grid2"><label>Available balance at the bank right now<input id="aNow" inputmode="decimal" placeholder="' + (b ? money(b.cleared) : '0.00') + '"></label>' +
    '<label>Or: balance before first entry<input id="aOpen" inputmode="decimal" value="' + Number(a.openingBalance || 0).toFixed(2) + '"></label></div>' +
    '<div class="row-actions"><button type="button" id="aSave">Save</button><button type="button" class="ghost" id="aCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="aDel">Delete account</button>' : '') + '</div>');
  $('aCancel').onclick = closeModal;
  $('aSave').onclick = () => {
    const name = $('aName').value.trim(); if (!name) { toast('Name the account.'); return; }
    Object.assign(a, { name, kind: $('aKind').value, openingBalance: toNum($('aOpen').value) });
    if (!id) { a.id = uid(); data.accounts.push(a); currentAccount = a.id; }
    if ($('aNow').value.trim()) {
      // Opening = today's bank balance minus everything entered so far.
      // The bank's balance only includes what has cleared.
      const net = data.tx.filter(t => t.accountId === a.id && t.cleared).reduce((s, t) => s + bankSigned(t), 0);
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

// ---------- Spending charts & reports ----------
const PALETTE = ['#1d5c46', '#e0a526', '#3b82c4', '#c4513b', '#7b5ea7', '#2a9d8f', '#d17a22', '#8a9a5b', '#c2577f', '#5c6f82', '#9c6b3e', '#4f9d4f'];
let rep = { period: 'month', from: '', to: '', group: 'category', kind: 'expense' };
function periodRange(p) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const first = (yy, mm) => isoDay(new Date(yy, mm, 1)), last = (yy, mm) => isoDay(new Date(yy, mm + 1, 0));
  switch (p) {
    case 'month': return [first(y, m), last(y, m), 'This month'];
    case 'last': return [first(y, m - 1), last(y, m - 1), new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })];
    case '3m': return [first(y, m - 2), last(y, m), 'Last 3 months'];
    case 'ytd': return [y + '-01-01', today(), 'This year'];
    case 'lastyear': return [(y - 1) + '-01-01', (y - 1) + '-12-31', String(y - 1)];
    default: return [rep.from || first(y, m), rep.to || today(), 'Custom'];
  }
}
// Pie-style ring chart drawn as SVG, biggest slice first.
function donut(items, total) {
  if (!total) return '';
  let a = -Math.PI / 2, paths = '';
  items.forEach(([, v], i) => {
    const frac = v / total; if (frac <= 0) return;
    const a2 = a + frac * Math.PI * 2, big = frac > 0.5 ? 1 : 0, R = 90, r = 56;
    const p = (ang, rad) => (100 + rad * Math.cos(ang)).toFixed(2) + ' ' + (100 + rad * Math.sin(ang)).toFixed(2);
    paths += frac >= 0.9999 ? '<circle cx="100" cy="100" r="73" fill="none" stroke="' + PALETTE[i % PALETTE.length] + '" stroke-width="34"/>'
      : '<path d="M' + p(a, R) + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + p(a2, R) + ' L' + p(a2, r) + ' A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + p(a, r) + 'Z" fill="' + PALETTE[i % PALETTE.length] + '"/>';
    a = a2;
  });
  return '<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Spending by category">' + paths +
    '<text x="100" y="96" text-anchor="middle" class="d-l">Total</text><text x="100" y="118" text-anchor="middle" class="d-v">' + esc(money(total).replace('.00', '')) + '</text></svg>';
}
// Money in vs out, month by month, as side-by-side bars.
function monthBars(rows) {
  if (rows.length < 2) return '';
  const max = Math.max(1, ...rows.map(r => Math.max(r.inc, r.out))), W = 320, H = 150, bw = Math.min(18, (W - 20) / rows.length / 2 - 3);
  let g = '';
  rows.forEach((r, i) => {
    const x = 10 + i * (W - 20) / rows.length + ((W - 20) / rows.length - bw * 2 - 2) / 2;
    const hi = r.inc / max * (H - 30), ho = r.out / max * (H - 30);
    g += '<rect x="' + x.toFixed(1) + '" y="' + (H - 18 - hi).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hi.toFixed(1) + '" fill="#2a9d5c" rx="2"><title>In ' + money(r.inc) + '</title></rect>' +
      '<rect x="' + (x + bw + 2).toFixed(1) + '" y="' + (H - 18 - ho).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="#c4513b" rx="2"><title>Out ' + money(r.out) + '</title></rect>' +
      '<text x="' + (x + bw + 1).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" class="b-l">' + esc(new Date(r.m + '-02').toLocaleDateString([], { month: 'short' })) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bars" role="img" aria-label="Money in and out by month">' + g + '</svg><p class="helper legend"><span class="sw" style="background:#2a9d5c"></span>In <span class="sw" style="background:#c4513b"></span>Out</p>';
}
function reportData() {
  const acc = activeAccount();
  const [from, to, label] = periodRange(rep.period);
  // Moving money between her own accounts isn't spending or income.
  const all = data.tx.filter(t => (!acc || t.accountId === acc.id) && t.category !== 'Transfer');
  const list = all.filter(t => t.date >= from && t.date <= to);
  const of = k => list.filter(t => t.type === k);
  const sum = l => l.reduce((s, t) => s + Number(t.amount), 0);
  const groups = {};
  of(rep.kind).filter(t => !rep.tag || tagsOf(t).includes(rep.tag)).forEach(t => {
    // An entry with two tags counts under each of them.
    const keys = rep.group === 'tag' ? (tagsOf(t).length ? tagsOf(t) : ['(no tag)']) : [rep.group === 'payee' ? (t.payee || '(no payee)') : rep.group === 'month' ? t.date.slice(0, 7) : (t.category || 'Uncategorized')];
    keys.forEach(k => { (groups[k] = groups[k] || { v: 0, n: 0 }); groups[k].v += Number(t.amount); groups[k].n++; });
  });
  const items = Object.entries(groups).map(([k, x]) => [k, Math.round(x.v * 100) / 100, x.n]).sort((a, b) => rep.group === 'month' ? a[0].localeCompare(b[0]) : b[1] - a[1]);
  const months = [...new Set(list.map(t => t.date.slice(0, 7)))].sort();
  const byMonth = (months.length > 1 ? months : [...new Set(all.map(t => t.date.slice(0, 7)))].sort().slice(-6)).map(m => {
    const l = all.filter(t => t.date.startsWith(m));
    return { m, inc: sum(l.filter(t => t.type === 'income')), out: sum(l.filter(t => t.type === 'expense')) };
  });
  return { from, to, label, list, totIn: sum(of('income')), totOut: sum(of('expense')), items, byMonth };
}
function viewReports() {
  const r = reportData();
  const total = r.items.reduce((s, x) => s + x[1], 0);
  const top = r.items.slice(0, 11), rest = r.items.slice(11).reduce((s, x) => s + x[1], 0);
  const chartItems = rep.group === 'month' ? [] : top.concat(rest ? [['Everything else', rest, 0]] : []);
  const glabel = rep.group === 'payee' ? 'payee' : rep.group === 'month' ? 'month' : rep.group === 'tag' ? 'tag' : 'category';
  const usedTags = [...new Set(data.tx.flatMap(tagsOf))].sort();
  $('view').innerHTML = '<div class="toptabs"><a href="#register">📒 Register</a><a href="#reports" class="on">📊 Reports</a><a href="#calendar">📅 Calendar</a></div>' +
    '<div class="rep-opts"><label>Time<select id="rpPeriod">' + [['month', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['ytd', 'This year'], ['lastyear', 'Last year'], ['custom', 'Pick dates…']].map(([k, l]) => '<option value="' + k + '"' + (rep.period === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>Show<select id="rpKind"><option value="expense"' + (rep.kind === 'expense' ? ' selected' : '') + '>Spending</option><option value="income"' + (rep.kind === 'income' ? ' selected' : '') + '>Income</option></select></label>' +
    '<label>Group by<select id="rpGroup">' + [['category', 'Category'], ['payee', 'Payee'], ['month', 'Month'], ['tag', 'Tag']].map(([k, l]) => '<option value="' + k + '"' + (rep.group === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
    (usedTags.length ? '<label>Only entries tagged<select id="rpTag"><option value="">— any —</option>' + usedTags.map(x => '<option' + (rep.tag === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label>' : '') +
    (rep.period === 'custom' ? '<div class="grid2"><label>From<input type="date" id="rpFrom" value="' + esc(r.from) + '"></label><label>To<input type="date" id="rpTo" value="' + esc(r.to) + '"></label></div>' : '') +
    '<p class="helper">' + esc(fmtDate(r.from)) + ' – ' + esc(fmtDate(r.to)) + ' · transfers between your accounts are left out</p>' +
    '<div class="stat-row"><div class="stat"><span>Money in</span><b class="income">' + money(r.totIn) + '</b></div><div class="stat"><span>Money out</span><b class="expense">' + money(r.totOut) + '</b></div><div class="stat"><span>Left over</span><b class="' + (r.totIn - r.totOut < 0 ? 'expense' : 'income') + '">' + money(r.totIn - r.totOut) + '</b></div></div>' +
    '<div class="card pad"><h2>' + (rep.kind === 'expense' ? 'Where it went' : 'Where it came from') + '</h2>' +
    (r.items.length ? (chartItems.length ? '<div class="chartwrap">' + donut(chartItems, total) + '<div class="legend-list">' + chartItems.map(([k, v], i) => '<div><span class="sw" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' + esc(k) + ' <b>' + Math.round(v / total * 100) + '%</b></div>').join('') + '</div></div>' : '') +
      r.items.map(([k, v, n]) => '<div class="barrow" data-rk="' + esc(k) + '"><span class="lbl">' + esc(rep.group === 'month' ? monthName(k) : k) + ' <span class="sub">' + n + '</span></span><span class="track"><span style="width:' + Math.max(2, Math.round(v / r.items.reduce((m, x) => Math.max(m, x[1]), 1) * 100)) + '%"></span></span><b>' + money(v) + '</b></div>').join('')
      : '<p class="helper">Nothing for this time.</p>') +
    (r.items.some(x => x[0] === 'Uncategorized') ? '<p class="helper">Tip: give entries a category (tap one in the Register) and this gets more useful. Tap a row to see its entries.</p>' : '<p class="helper">Tap a row to see its entries.</p>') + '</div>' +
    (activeAccount() ? compareCard(activeAccount()) : '') +
    (r.byMonth.length > 1 ? '<div class="card pad"><h2>Month by month</h2>' + monthBars(r.byMonth) + '<table class="mini"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Left</th></tr></thead><tbody>' +
      r.byMonth.map(x => '<tr><td>' + esc(new Date(x.m + '-02').toLocaleDateString([], { month: 'short', year: '2-digit' })) + '</td><td>' + money(x.inc) + '</td><td>' + money(x.out) + '</td><td class="' + (x.inc - x.out < 0 ? 'expense' : 'income') + '">' + money(x.inc - x.out) + '</td></tr>').join('') + '</tbody></table></div>' : '') +
    '<div class="row-actions"><button type="button" class="ghost" id="rpCsv">⬇ Download report (CSV)</button><button type="button" class="ghost" id="rpList">⬇ Every entry (CSV)</button><button type="button" class="ghost" id="rpPrint">🖨 Print report</button></div>' +
    '<div id="printArea" class="print-only"></div>';
  $('rpPeriod').onchange = e => { rep.period = e.target.value; viewReports(); };
  $('rpKind').onchange = e => { rep.kind = e.target.value; viewReports(); };
  $('rpGroup').onchange = e => { rep.group = e.target.value; viewReports(); };
  if ($('rpTag')) $('rpTag').onchange = e => { rep.tag = e.target.value; viewReports(); };
  if ($('rpFrom')) { $('rpFrom').onchange = e => { rep.from = e.target.value; viewReports(); }; $('rpTo').onchange = e => { rep.to = e.target.value; viewReports(); }; }
  $('view').querySelectorAll('[data-rk]').forEach(x => x.onclick = () => {
    const k = x.dataset.rk;
    regCat = ''; regSearch = ''; regMonth = '';
    if (rep.group === 'month') regMonth = k; else if (rep.group === 'payee') regSearch = k; else regCat = k === 'Uncategorized' ? '' : k;
    if (rep.group !== 'month' && /^\d{4}-\d{2}-01$/.test(r.from) && r.to.slice(0, 7) === r.from.slice(0, 7)) regMonth = r.from.slice(0, 7);
    location.hash = 'register';
  });
  const title = (rep.kind === 'expense' ? 'Spending' : 'Income') + ' by ' + glabel + ', ' + fmtDate(r.from) + ' – ' + fmtDate(r.to);
  $('rpCsv').onclick = () => download('report-' + r.from + '-to-' + r.to + '.csv', [[title], [], [glabel[0].toUpperCase() + glabel.slice(1), 'Total', 'Entries', 'Share']].concat(r.items.map(([k, v, n]) => [k, v.toFixed(2), n, Math.round(v / (total || 1) * 100) + '%']), [[], ['Total', total.toFixed(2)], ['Money in', r.totIn.toFixed(2)], ['Money out', r.totOut.toFixed(2)]]).map(x => x.map(csvCell).join(',')).join('\n'), 'text/csv');
  $('rpList').onclick = () => download('entries-' + r.from + '-to-' + r.to + '.csv', [['Date', 'Payee', 'Category', 'Type', 'Amount', 'Cleared', 'Note']].concat(r.list.slice().sort(byTime).map(t => [t.date, t.payee, t.category, t.type, Number(t.amount).toFixed(2), t.cleared ? 'yes' : '', t.note])).map(x => x.map(csvCell).join(',')).join('\n'), 'text/csv');
  $('rpPrint').onclick = () => {
    $('printArea').innerHTML = '<h1>' + esc(title) + '</h1><p>Money in ' + money(r.totIn) + ' · Money out ' + money(r.totOut) + ' · Left over ' + money(r.totIn - r.totOut) + '</p>' + (chartItems.length ? donut(chartItems, total) : '') +
      '<table class="mini"><thead><tr><th>' + glabel + '</th><th>Total</th><th>Entries</th><th>Share</th></tr></thead><tbody>' + r.items.map(([k, v, n]) => '<tr><td>' + esc(rep.group === 'month' ? monthName(k) : k) + '</td><td>' + money(v) + '</td><td>' + n + '</td><td>' + Math.round(v / (total || 1) * 100) + '%</td></tr>').join('') + '</tbody></table>';
    window.print();
  };
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
    data.tx.push({ id: uid(), accountId: acc.id, date, time: parseTime(r[c.date]), payee, amount, type, category: cat && cat !== 'None' ? cat : autoCategory(payee, '', type), note: c.note >= 0 ? String(r[c.note]).trim() : '', checkNum: c.check >= 0 ? String(r[c.check]).trim() : '', cleared: c.clear >= 0 ? /^y/i.test(String(r[c.clear])) : false, taxCat: '', receipt: '', source: 'CheckBook' });
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
    toast('Now type the available balance your bank shows, so the balances are right.');
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
// Generic bank words don't make two names the same ("Atu Deposit" isn't "Mobile Deposit").
const STOP = new Set(['deposit', 'payment', 'pmt', 'purchase', 'transfer', 'debit', 'credit', 'mobile', 'online', 'the', 'and', 'inc', 'com', 'bill', 'pos', 'ach', 'card', 'check', 'from', 'payroll', 'payrollt']);
const words = s => String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
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
      '<li>Matches get marked ✓ cleared, and your register amount is set from the bank\'s with your rounding (the exact amount is kept for the 🏦 Bank balance). Anything the bank has that your register doesn\'t is listed so you can add it.</li></ol>' +
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
  bankState = { headers, rows: body, map, file, flip: false, fixCents: true, addEarly: true, skip: {}, add: {} };
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
  // Recurring entries sit on their due date (usually the 1st); the bank can post them a week early or later that month.
  const near7 = (t, l) => String(t.id).startsWith('rec_') ? (l.date >= isoDay(new Date(new Date(t.date + 'T12:00').getTime() - 7 * 864e5)) && days(t.date, l.date) <= 31) : days(t.date, l.date) <= 7;
  const pass = (l, ok) => pool.filter(t => !taken.has(t.id) && t.type === l.type && near7(t, l) && ok(t))
    .sort((a, b) => Number(a.cleared) - Number(b.cleared) || days(a.date, l.date) - days(b.date, l.date))[0];
  const near = (t, l) => Math.min(Math.abs(bankAmt(t) - l.amount), Math.abs(Number(t.amount) - l.amount));
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
  return autoCategory(l.payee, l.desc, l.type) || l.category || '';
}
// Category for a name: a choice she made for that name, else what she used last time, else the name rules.
function autoCategory(payee, desc, type) {
  const k = looseName(payee);
  if (!k && !desc) return '';
  const rules = data.settings.catRules || {};
  const cont = (data.settings.containsRules || []).find(r => r.text && ((payee || '') + ' ' + (desc || '')).toLowerCase().includes(r.text.toLowerCase()));
  if (cont) return cont.category;
  if (rules[k]) return rules[k];
  const mem = autoCategory.mem || payeeMemory();
  const hit = mem[String(payee || '').trim().toLowerCase()];
  if (hit && hit.category) return hit.category;
  const text = (payee || '') + ' ' + (desc || '');
  if (type === 'income') return /payroll|direct dep|salary/i.test(text) ? 'Paycheck' : /transfer|xfer/i.test(text) ? 'Transfer' : /ebay|etsy|mercari|poshmark|booth|y'?\s?all?ternative/i.test(text) ? 'Side income' : '';
  const r = CATEGORY_RULES.find(([re]) => re.test(text));
  return r ? r[1] : '';
}
// Fill in categories on entries that don't have one yet. Returns how many were sorted.
function autoSortAll() {
  autoCategory.mem = payeeMemory();
  let n = 0;
  data.tx.forEach(t => { if (!t.category) { const c = autoCategory(t.payee, t.note, t.type); if (c) { t.category = c; n++; } } });
  autoCategory.mem = null;
  return n;
}
// Most-used categories first, for the one-tap chips.
function topCategories(n) {
  const count = {};
  data.tx.forEach(t => { if (t.category) count[t.category] = (count[t.category] || 0) + 1; });
  return data.settings.categories.slice().sort((a, b) => (count[b] || 0) - (count[a] || 0)).slice(0, n);
}
const signedAmt = (type, amt) => (type === 'income' ? '+' : '−') + money(amt).replace('−', '');
function drawBank() {
  const acc = activeAccount(), m = matchBank(acc), { headers, map } = bankState;
  const matched = m.res.filter(x => x.t), extra = m.res.filter(x => !x.t);
  const fixes = matched.filter(x => Math.abs(Number(x.t.amount) - myRound(x.l.amount, x.l.type)) >= 0.005);
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
          (Math.abs(Number(x.t.amount) - myRound(x.l.amount, x.l.type)) >= 0.005 ? '<span class="sub">You wrote ' + money(x.t.amount) + ', bank says ' + money(x.l.amount) + ' → ' + money(myRound(x.l.amount, x.l.type)) + '</span>' : '') + '</span> <b class="' + x.l.type + '">' + signedAmt(x.l.type, x.l.amount) + '</b></label>'; }).join('') + '</details>' : '') +
    (fixes.length ? '<label class="check"><input type="checkbox" id="bFix"' + (bankState.fixCents ? ' checked' : '') + '> Fix ' + fixes.length + ' register amounts to match the bank, with my rounding <span class="sub">(e.g. ' + esc(money(fixes[0].l.amount)) + ' → ' + esc(money(myRound(fixes[0].l.amount, fixes[0].l.type))) + ')</span></label>' : '') +
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
    const addLine = l => data.tx.push({ id: uid(), accountId: acc.id, date: l.date, time: '', payee: l.payee, amount: myRound(l.amount, l.type), bankAmount: l.amount, type: l.type, category: guessCategory(l, mem), note: l.desc.slice(0, 120), checkNum: l.check, cleared: true, taxCat: '', receipt: '', source: 'Bank' });
    matched.forEach(x => {
      if (bankState.skip[x.l.i]) { addLine(x.l); added++; return; }
      if (!x.t.cleared) { x.t.cleared = true; cleared++; }
      x.t.bankAmount = x.l.amount;
      if (bankState.fixCents && Math.abs(Number(x.t.amount) - myRound(x.l.amount, x.l.type)) >= 0.005) { x.t.amount = myRound(x.l.amount, x.l.type); fixed++; }
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
    toast('Done: ' + cleared + ' marked cleared, ' + added + ' added' + (fixed ? ', ' + fixed + ' amounts fixed' : '') + '.');
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
    '<div class="card pad"><h2>🎯 Budgets &amp; 🧭 Category rules</h2><div class="row-actions"><a class="button ghost" href="#budgets">Budgets</a><a class="button ghost" href="#rules">Category rules</a><a class="button ghost" href="#inbox">🗂 Category inbox</a></div></div>' +
    '<div class="card pad"><h2>⚡ Quick add &amp; #tags</h2><label>Quick-add buttons (one per line; leave empty to use your most-entered places)<textarea id="mFav" rows="4" placeholder="' + esc(favorites().join('\n')) + '">' + esc((data.settings.favorites || []).join('\n')) + '</textarea></label>' +
    '<label>Tags (one per line)<textarea id="mTags" rows="4">' + esc(tagList().join('\n')) + '</textarea></label></div>' +
    '<div class="card pad"><h2>🔁 Recurring bills &amp; income</h2><p class="helper">' + (recList().length ? recList().length + ' set up, added on their day each month.' : 'Set up bills that repeat (added on the 1st).') + '</p><a class="button ghost" href="#recurring">Recurring</a></div>' +
    '<div class="card pad"><h2>🎙 Siri</h2><p class="helper">Say “Hey Siri, add expense” and tell it the amount and where.</p><a class="button ghost" href="#siri">Set up Siri</a></div>' +
    '<div class="card pad"><h2>🪙 Rounding</h2><label>When the bank fills in an amount<select id="mRound"><option value="up5"' + ((data.settings.rounding || 'up5') === 'up5' ? ' selected' : '') + '>Round bills up to the dollar if over 5¢; deposits down</option><option value="none"' + (data.settings.rounding === 'none' ? ' selected' : '') + '>Use the exact amount</option></select></label></div>' +
    '<div class="card pad"><h2>⬆ Import</h2><p class="helper">Bring in your CheckBook app export.</p><a class="button ghost" href="#import">Import CheckBook file</a></div>' +
    '<div class="card pad"><h2>🏷 Categories</h2><p class="helper">New entries are sorted by name automatically. Change one entry\'s category and the app offers to change the rest with that name, and remembers it.</p><div class="row-actions"><button type="button" class="ghost small" id="mSort">✨ Sort entries without a category (' + data.tx.filter(t => !t.category).length + ')</button></div><p class="helper">One per line:</p><textarea id="mCats" rows="6">' + esc(data.settings.categories.join('\n')) + '</textarea>' +
    '<h3>Tax categories</h3><textarea id="mTax" rows="5">' + esc(data.settings.taxCats.join('\n')) + '</textarea></div>' +
    '<div class="card pad"><h2>Account and sync</h2><div data-syncbox></div></div>' +
    '<div class="card pad"><h2>Back up</h2><div class="row-actions"><button type="button" class="ghost" id="mBackup">Download backup</button><button type="button" class="ghost" id="mCsv">Register as CSV</button></div></div>';
  $('view').querySelectorAll('[data-acc]').forEach(a => a.onclick = e => { e.preventDefault(); editAccount(a.dataset.acc); });
  $('accNew').onclick = () => editAccount();
  $('mSort').onclick = () => { const n = autoSortAll(); window.save(); toast(n ? 'Sorted ' + n + ' entries into categories.' : 'Nothing new to sort.'); viewMore(); };
  $('mFav').onchange = e => { data.settings.favorites = lines(e.target.value); window.save(); toast('Saved.'); };
  $('mTags').onchange = e => { data.settings.tags = lines(e.target.value); window.save(); toast('Saved.'); };
  $('mRound').onchange = e => { data.settings.rounding = e.target.value; window.save(); toast('Saved.'); };
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

// Newer default categories show up for people who started with the older list.
DEFAULT_CATEGORIES.forEach(c => { if (!data.settings.categories.includes(c)) data.settings.categories.push(c); });
// The first time, sort the entries already here (only ones without a category are touched).
function firstSort() {
  if (data.settings.autoSorted || !data.tx.length) return;
  const n = autoSortAll(); data.settings.autoSorted = true; window.save();
  if (n) toast('✨ Sorted ' + n + ' entries into categories by name.');
}
firstSort();
runRecurring();
route();
