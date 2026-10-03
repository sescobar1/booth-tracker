// Planner: one calendar for Google, Outlook, band events and bills, plus tasks, daily notes and documents.
// Everything saves on the device first; db.js keeps it matched with the cloud when signed in.
// Google and Outlook calendars are read through their private iCal links (fetched by the planner-ics function),
// and the planner itself is offered back as a calendar feed so its items show up in Google, Outlook or an iPhone.
const CFG = window.PLANNER_CONFIG || {};
const KEY = CFG.storageKey || 'plannerApp';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDay(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const DEFAULT_LISTS = ['Home', 'Band', 'Booth', 'Work', 'Kids', 'Errands'];
const DEFAULT_FOLDERS = ['Band', 'Booth', 'Home', 'School', 'Medical', 'Taxes', 'Work', 'Other'];
const COLORS = ['#8c7a6b', '#7d9b76', '#c99a8e', '#b59f83', '#9a8fa8', '#7f9fa3', '#d1a3a4', '#6e6a66'];
// Each task list and document folder gets its own muted color (accent, soft background).
const PASTELS = [['#c99a8e', '#f3e6e1'], ['#7d9b76', '#e7efe4'], ['#8c7a6b', '#ece5de'], ['#7f9fa3', '#e5eeee'], ['#b07e6a', '#efe2db'], ['#b59f83', '#f1eadf'], ['#9a8fa8', '#ebe8ef'], ['#6e6a66', '#ebe9e6']];
const NAMED = { home: 0, band: 2, booth: 4, work: 3, kids: 1, errands: 5, school: 1, medical: 7, taxes: 5, other: 6 };
function pastel(name) {
  const k = String(name || '').toLowerCase();
  if (k in NAMED) return PASTELS[NAMED[k]];
  let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PASTELS[h % PASTELS.length];
}
const chipStyle = name => name ? ' style="--cc:' + pastel(name)[0] + ';--cbg:' + pastel(name)[1] + '"' : '';
const chipDot = name => name ? '<span class="sw"></span>' : '';

function blank() {
  return { items: [], docs: [], settings: { lists: DEFAULT_LISTS.slice(), folders: DEFAULT_FOLDERS.slice(), calendars: [], showBand: true, showBills: true } };
}
// `data` is global so db.js can swap in another device's copy.
var data = (() => {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.items) return Object.assign(blank(), d); } catch (e) {}
  return blank();
})();
const S = () => data.settings;
['lists', 'folders', 'calendars'].forEach(k => { if (!S()[k]) S()[k] = blank().settings[k]; });

window.save = function () {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('Could not save on this device: ' + e.message); }
};
const cache = {
  get(k) { try { return JSON.parse(localStorage.getItem(KEY + 'Cache_' + k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(KEY + 'Cache_' + k, JSON.stringify(v)); } catch (e) {} }
};

// ---------- formatting ----------
function fmtDate(iso, style) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d);
  if (style === 'rel') { const t = today(); if (iso === t) return 'Today'; if (iso === addDays(t, 1)) return 'Tomorrow'; if (iso === addDays(t, -1)) return 'Yesterday'; }
  const o = { weekday: style === 'long' || style === 'rel' ? 'long' : 'short', month: style === 'long' ? 'long' : 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) o.year = 'numeric';
  return dt.toLocaleDateString([], o);
}
function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return h + (m ? ':' + pad(m) : '') + ap;
}
const monthName = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }); };
const fileSize = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

// ---------- UI helpers ----------
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400); }
window.toast = toast;
function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; document.body.classList.add('locked'); }
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; $('modalBody').classList.remove('wide'); document.body.classList.remove('locked'); }
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const signedIn = () => !!(window.plannerSync && window.plannerSync.user());
const client = () => window.plannerSync && window.plannerSync.client();
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Calendar files (.ics) ----------
// Reads the parts the planner needs: title, start/end, all-day, place, notes, repeat rules and skipped dates.
function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let ev = null;
  const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1), name = head.split(';')[0].toUpperCase();
    if (name === 'SUMMARY') ev.title = unesc(val);
    else if (name === 'LOCATION') ev.location = unesc(val);
    else if (name === 'DESCRIPTION') ev.notes = unesc(val).slice(0, 2000);
    else if (name === 'UID') ev.uid = val;
    else if (name === 'STATUS') ev.status = val;
    else if (name === 'RRULE') ev.rrule = val;
    else if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID' || name === 'EXDATE') {
      const vals = val.split(',').map(v => icsTime(v, head));
      if (name === 'DTSTART') { ev.start = vals[0]; ev.allDay = /VALUE=DATE(?!-)/i.test(head) || /^\d{8}$/.test(val); }
      else if (name === 'DTEND') ev.end = vals[0];
      else if (name === 'RECURRENCE-ID') ev.recurrenceId = vals[0];
      else ev.exdates.push(...vals.map(v => v.slice(0, 10)));
    } else if (name === 'DURATION') ev.duration = val;
  }
  return out.filter(e => !/CANCELLED/i.test(e.status || ''));
}
// "20261005T090000Z" → local "2026-10-05T04:00"; floating and TZID times are taken as local wall time.
function icsTime(v, head) {
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return '';
  if (!m[4]) return m[1] + '-' + m[2] + '-' + m[3];
  if (m[7]) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])); return isoDay(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5];
}
function durationMin(d) { const m = String(d || '').match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/); return m ? ((+m[1] || 0) * 7 * 1440 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; }
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const plusMin = (local, n) => { const d = new Date(local); d.setMinutes(d.getMinutes() + n); return isoDay(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

// Start times of a repeating event between two days (enough of the iCal repeat rules for real calendars).
function expandRule(ev, from, to) {
  const r = {}; ev.rrule.split(';').forEach(p => { const [k, v] = p.split('='); r[k.toUpperCase()] = v; });
  const step = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0, until = r.UNTIL ? icsTime(r.UNTIL, '').slice(0, 10) : '9999-12-31';
  const time = ev.allDay ? '' : ev.start.slice(10);
  const start = ev.start.slice(0, 10), out = [];
  const byday = (r.BYDAY || '').split(',').filter(Boolean).map(x => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : 0, d: DAYS.indexOf(m[2].toLowerCase()) } : null; }).filter(Boolean);
  const bymd = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  let n = 0;
  const take = d => { if (d < start) return true; if (d > until || (count && n >= count)) return false; n++; if (d >= from && d <= to) out.push(d + time); return true; };
  const d0 = new Date(start + 'T12:00');
  if (r.FREQ === 'DAILY') {
    for (let d = new Date(d0), i = 0; i < 4000; i++, d.setDate(d.getDate() + step)) { const s = isoDay(d); if (s > to) break; if (byday.length && !byday.some(b => b.d === d.getDay())) continue; if (!take(s)) break; }
  } else if (r.FREQ === 'WEEKLY') {
    const days = byday.length ? byday.map(b => b.d).sort() : [d0.getDay()];
    const wk = new Date(d0); wk.setDate(wk.getDate() - wk.getDay());
    outer: for (let i = 0; i < 1500; i++, wk.setDate(wk.getDate() + 7 * step)) {
      for (const dd of days) { const d = new Date(wk); d.setDate(d.getDate() + dd); const s = isoDay(d); if (s > to) break outer; if (!take(s)) break outer; }
    }
  } else if (r.FREQ === 'MONTHLY' || r.FREQ === 'YEARLY') {
    const months = r.FREQ === 'YEARLY' ? 12 * step : step;
    for (let i = 0; i < 600; i++) {
      const y = d0.getFullYear() + Math.floor((d0.getMonth() + i * months) / 12), m = (d0.getMonth() + i * months) % 12 + 1;
      if (y + '-' + pad(m) + '-01' > to) break;
      let days = [];
      if (byday.length) {
        byday.forEach(b => {
          const all = []; for (let dd = 1; dd <= lastDay(y, m); dd++) if (new Date(y, m - 1, dd).getDay() === b.d) all.push(dd);
          if (b.n > 0 && all[b.n - 1]) days.push(all[b.n - 1]); else if (b.n < 0 && all[all.length + b.n]) days.push(all[all.length + b.n]); else if (!b.n) days.push(...all);
        });
      } else if (bymd.length) days = bymd.map(x => x < 0 ? lastDay(y, m) + 1 + x : x).filter(x => x >= 1 && x <= lastDay(y, m));
      else { const dd = d0.getDate(); if (dd <= lastDay(y, m)) days = [dd]; }
      let stop = false;
      days.sort((a, b) => a - b).forEach(dd => { if (!stop && !take(y + '-' + pad(m) + '-' + pad(dd))) stop = true; });
      if (stop) break;
    }
  } else take(start);
  return out;
}
// One calendar's events between two days, with repeats expanded and moved/skipped dates handled.
function calendarOccurrences(events, from, to) {
  const out = [], moved = {};
  events.filter(e => e.recurrenceId).forEach(e => { (moved[e.uid] = moved[e.uid] || new Set()).add(e.recurrenceId.slice(0, 10)); });
  events.forEach(e => {
    const len = e.end ? minutesBetween(e.start.length > 10 ? e.start : e.start + 'T00:00', e.end.length > 10 ? e.end : e.end + 'T00:00') : e.duration ? durationMin(e.duration) : e.allDay ? 1440 : 60;
    const starts = e.rrule && !e.recurrenceId ? expandRule(e, addDays(from, -Math.ceil(len / 1440)), to).filter(s => !e.exdates.includes(s.slice(0, 10)) && !(moved[e.uid] && moved[e.uid].has(s.slice(0, 10)))) : [e.start];
    starts.forEach(s => {
      const st = s.length > 10 ? s : s + 'T00:00', en = plusMin(st, len);
      const lastDate = e.allDay ? addDays(en.slice(0, 10), -1) : (en.slice(11) === '00:00' && en.slice(0, 10) > st.slice(0, 10) ? addDays(en.slice(0, 10), -1) : en.slice(0, 10));
      if (lastDate < from || st.slice(0, 10) > to) return;
      out.push({ date: st.slice(0, 10), endDate: lastDate, start: e.allDay ? '' : st.slice(11), end: e.allDay ? '' : en.slice(11), allDay: !!e.allDay, title: e.title || '(busy)', location: e.location || '', notes: e.notes || '' });
    });
  });
  return out;
}

// ---------- Connected calendars ----------
// Google "embed" or "share" links name the calendar but aren't a feed; turn them into the calendar's iCal address.
// (That address only works if the calendar is public; private ones need the "Secret address in iCal format".)
function calendarFeedUrl(url) {
  // Anything typed after ".ics" by accident ("basic.ics4") is dropped.
  const u = String(url || '').trim().replace(/(\.ics)[^?#\/]*$/i, '$1');
  // Outlook's published "calendar.html" (view in a browser) has a matching "calendar.ics" feed.
  if (/^https:\/\/outlook\.(office365|office|live)\.com\/owa\/calendar\//i.test(u) && /\/calendar\.html?$/i.test(u)) return u.replace(/\/calendar\.html?$/i, '/calendar.ics');
  try {
    const x = new URL(u.replace(/^webcals?:/i, 'https:'));
    if (/calendar\.google\.com$/i.test(x.hostname) && !/\/ical\//.test(x.pathname)) {
      const id = x.searchParams.get('src') || x.searchParams.get('cid');
      if (id) return 'https://calendar.google.com/calendar/ical/' + encodeURIComponent(/@/.test(id) ? id : atobSafe(id)) + '/public/basic.ics';
    }
  } catch (e) {}
  return u;
}
const atobSafe = s => { try { const d = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return /@/.test(d) ? d : s; } catch (e) { return s; } };
async function refreshCalendar(cal, quiet) {
  const sb = client();
  if (!sb || !signedIn()) { if (!quiet) toast('Sign in (More) to connect calendars.'); return false; }
  try {
    const { data: text, error } = await sb.functions.invoke('planner-ics', { body: { url: calendarFeedUrl(cal.url) } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      if (/\/public\/basic\.ics/.test(calendarFeedUrl(cal.url)) && /40[34]|calendar/i.test(msg)) msg = 'Google keeps this calendar private. Paste its “Secret address in iCal format” instead (Edit).';
      throw new Error(msg);
    }
    delete cal.lastError;
    const events = parseIcs(typeof text === 'string' ? text : await new Response(text).text());
    cache.set('cal_' + cal.id, { at: Date.now(), events });
    if (!quiet) toast('✓ ' + cal.name + ': ' + events.length + ' events');
    return true;
  } catch (e) { if (!quiet) toast(cal.name + ': ' + e.message); cal.lastError = e.message; return false; }
}
let refreshing = false;
async function refreshAll(force) {
  if (refreshing || !signedIn()) return;
  refreshing = true;
  try {
    const stale = c => force || !cache.get('cal_' + c.id) || Date.now() - cache.get('cal_' + c.id).at > 30 * 60000;
    const cals = S().calendars.filter(c => c.on !== false && stale(c));
    for (const c of cals) await refreshCalendar(c, true);
    if (S().showBand !== false) await loadBand();
    if (S().showBills !== false) await loadBills();
    giftCheck();
  } finally { refreshing = false; }
  route();
}
// Band volunteer events (from the Band Volunteers app) and monthly bills (from the Money app), read-only here.
async function loadBand() {
  try {
    const { data: rows, error } = await client().from('vol_events').select('id,name,date,start_time,end_time,location').gte('date', addDays(today(), -60));
    if (!error) cache.set('band', { at: Date.now(), rows });
  } catch (e) {}
}
async function loadBills() {
  try {
    const { data: row, error } = await client().from('money_settings').select('data').maybeSingle();
    if (!error && row) cache.set('bills', { at: Date.now(), recurring: ((row.data || {}).settings || {}).recurring || [] });
  } catch (e) {}
}
function billDates(r, from, to) {
  const out = [];
  if (r.paused) return out;
  if (r.every === 'month' || r.every === 'year' || !r.every) {
    const [y0, m0] = from.split('-').map(Number);
    for (let k = 0; k < 400; k++) {
      const mm = ((m0 - 1 + k) % 12) + 1, yy = y0 + Math.floor((m0 - 1 + k) / 12);
      if (r.every === 'year' && mm !== Number(r.start.slice(5, 7))) continue;
      const d = yy + '-' + pad(mm) + '-' + pad(Math.min(r.every === 'year' ? Number(r.start.slice(8, 10)) : (r.day || 1), lastDay(yy, mm)));
      if (d > to) break;
      if (d >= from && d >= (r.start || '')) out.push(d);
    }
  } else {
    const d = new Date((r.start || from) + 'T12:00'), step = r.every === 'week' ? 7 : 14;
    for (let k = 0; k < 2000; k++) { const s = isoDay(d); if (s > to) break; if (s >= from) out.push(s); d.setDate(d.getDate() + step); }
  }
  return out;
}

// ---------- Everything on the calendar ----------
const REPEATS = { '': 'Does not repeat', daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year' };
function itemDates(it, from, to) {
  if (!it.date) return [];
  if (!it.repeat) return it.date <= to && (it.endDate || it.date) >= from ? [it.date] : [];
  const ev = { start: it.date, allDay: true, rrule: { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[it.repeat] };
  return ev.rrule ? expandRule(ev, from, to) : [it.date];
}
// Every entry between two days from every source, each shaped the same way.
function agenda(from, to) {
  const out = [];
  data.items.filter(i => i.kind === 'event' || (i.kind === 'task' && i.date)).forEach(i => itemDates(i, from, to).forEach(d => {
    const span = i.endDate && i.endDate > i.date ? Math.round((new Date(i.endDate) - new Date(i.date)) / 864e5) : 0;
    out.push({ src: 'planner', id: i.id, kind: i.kind, listName: i.list, driver: i.driver, date: d, endDate: span ? addDays(d, span) : d, start: i.allDay ? '' : i.start, end: i.allDay ? '' : i.end, allDay: i.kind === 'task' || i.allDay || !i.start, title: i.title, location: i.location, notes: i.notes, done: i.done, color: i.kind === 'task' ? (i.list ? pastel(i.list)[0] : '#c9b8ff') : (i.color || COLORS[0]), list: i.list, priority: i.priority });
  }));
  S().calendars.filter(c => c.on !== false).forEach(c => {
    const got = cache.get('cal_' + c.id); if (!got) return;
    calendarOccurrences(got.events, from, to).forEach(e => out.push(Object.assign(e, { src: 'cal', cal: c.name, color: c.color })));
  });
  if (S().showBand !== false) { const b = cache.get('band'); if (b) b.rows.filter(e => e.date >= from && e.date <= to).forEach(e => out.push({ src: 'band', date: e.date, endDate: e.date, start: e.start_time || '', end: e.end_time || '', allDay: !e.start_time, title: e.name, location: e.location || '', color: '#b59f83', link: '../volunteers/#event/' + e.id })); }
  if (S().showBills !== false) { const b = cache.get('bills'); if (b) b.recurring.forEach(r => billDates(r, from, to).forEach(d => out.push({ src: 'bill', date: d, endDate: d, allDay: true, title: r.payee + ' ' + (r.type === 'income' ? '+' : '−') + '$' + Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }), color: r.type === 'income' ? '#7d9b76' : '#c99a8e', link: '../money/#recurring' }))); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}
// Entries that touch a day (multi-day events show on each of their days).
const onDay = (list, d) => list.filter(e => e.date <= d && (e.endDate || e.date) >= d);

function entryRow(e) {
  const when = e.kind === 'task' ? '' : e.allDay ? (e.endDate && e.endDate > e.date ? 'until ' + fmtDate(e.endDate) : 'All day') : fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '');
  const drv = e.driver ? '🚗 ' + e.driver : '';
  const src = e.src === 'cal' ? e.cal : e.src === 'band' ? 'Band Volunteers' : e.src === 'bill' ? 'Money' : e.kind === 'task' ? (e.list || 'Task') : '';
  const box = e.kind === 'task' ? '<button type="button" class="tick' + (e.done ? ' on' : '') + '" data-done="' + e.id + '"' + (e.listName ? ' style="--lc:' + pastel(e.listName)[0] + '"' : '') + '>' + (e.done ? '✓' : '') + '</button>' : '<span class="bar" style="background:' + esc(e.color || '#888') + '"></span>';
  const open = e.src === 'planner' ? ' data-item="' + e.id + '"' : e.link ? ' data-link="' + esc(e.link) + '"' : ' data-ext="' + esc(JSON.stringify({ t: e.title, d: e.date, s: e.start, e: e.end, l: e.location, n: e.notes, c: e.cal })) + '"';
  return '<div class="ev' + (e.done ? ' done' : '') + '"' + open + '>' + box + '<div class="who"><b>' + (e.priority >= 2 ? '★ ' : '') + esc(e.title) + '</b><span class="sub">' + esc([when, e.location, drv, src].filter(Boolean).join(' · ')) + '</span></div></div>';
}
function wireRows(root) {
  root.querySelectorAll('[data-done]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const it = data.items.find(i => i.id === b.dataset.done);
    // A little burst when something gets checked off, then the list updates.
    if (it && !it.done) { b.classList.add('on', 'pop'); b.textContent = '✓'; const row = b.closest('.ev'); if (row) row.classList.add('done', 'fading'); celebrate(b); setTimeout(() => toggleDone(b.dataset.done), 420); }
    else toggleDone(b.dataset.done);
  });
  root.querySelectorAll('[data-item]').forEach(r => r.onclick = () => editItem(r.dataset.item));
  root.querySelectorAll('[data-link]').forEach(r => r.onclick = () => { location.href = r.dataset.link; });
  root.querySelectorAll('[data-ext]').forEach(r => r.onclick = () => {
    const x = JSON.parse(r.dataset.ext);
    openModal('<h2>' + esc(x.t) + '</h2><p><b>' + esc(fmtDate(x.d, 'long')) + '</b>' + (x.s ? ' · ' + fmtTime(x.s) + (x.e ? '–' + fmtTime(x.e) : '') : '') + '</p>' +
      (x.l ? '<p>' + esc(x.l) + '</p>' : '') + (x.n ? '<p class="notes">' + esc(x.n) + '</p>' : '') + '<p class="helper">From your ' + esc(x.c) + ' calendar. Change it there; it updates here.</p>' +
      '<div class="row-actions"><button type="button" class="ghost" id="xCopy">Copy into planner</button><button type="button" id="xClose">Close</button></div>');
    $('xClose').onclick = closeModal;
    $('xCopy').onclick = () => { closeModal(); editItem(null, { kind: 'event', title: x.t, date: x.d, start: x.s, end: x.e, location: x.l, notes: x.n || '' }); };
  });
}
const CHEERS = ['Nice work!', 'Done!', 'One less thing!', 'Look at you go!', 'Checked off!', 'Great job!'];
function celebrate(el) {
  const r = el.getBoundingClientRect();
  for (let k = 0; k < 10; k++) {
    const s = document.createElement('i'); s.className = 'spark';
    s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top + r.height / 2) + 'px';
    s.style.setProperty('--dx', (Math.cos(k / 10 * 6.28) * (26 + Math.random() * 14)).toFixed(1) + 'px');
    s.style.setProperty('--dy', (Math.sin(k / 10 * 6.28) * (26 + Math.random() * 14)).toFixed(1) + 'px');
    s.style.background = ['#b0905a', '#7c9a82', '#c08497', '#5a8a9a', '#c47a5a'][k % 5];
    document.body.appendChild(s); setTimeout(() => s.remove(), 700);
  }
  toast('✓ ' + CHEERS[Math.floor(Math.random() * CHEERS.length)]);
}
function toggleDone(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  if (it.repeat && !it.done && it.date) {
    // A repeating task moves on to its next date instead of staying done.
    const next = itemDates(it, addDays(it.date, 1), addDays(it.date, 400))[0];
    if (next) { it.date = next; window.save(); toast('✓ Done. Next one: ' + fmtDate(next)); route(); return; }
  }
  it.done = !it.done; window.save(); route();
}

// ---------- Routing ----------
function route() {
  const [tab, arg] = (location.hash.slice(1) || 'today').split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tab === 'brief' || tab === 'track' || tab === 'gifts' ? 'today' : tab === 'notes' ? 'files' : tab)));
  const views = { today: viewToday, brief: viewBrief, track: viewTrack, calendar: viewCalendar, tasks: a => a === 'routines' ? viewRoutines() : a === 'templates' ? viewTemplates() : viewTasks(), meals: viewMeals, files: viewFiles, notes: viewNotes, gifts: viewGifts, more: viewMore, calendars: viewCalendars, feed: viewFeed };
  (views[tab] || viewToday)(arg);
}
// Load connected calendars, band events and bills the first time the planner is signed in (it may open signed out).
window.render = () => { const y = window.scrollY; route(); window.scrollTo(0, y); if (!render.started && signedIn()) { render.started = true; refreshAll(); } };
window.addEventListener('hashchange', () => { const v = $('view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); route(); window.scrollTo(0, 0); });
$('topEvent').onclick = () => editItem(null, { kind: 'event', date: location.hash.startsWith('#calendar') ? calDay || today() : todaySel || today() });
$('topTask').onclick = () => editItem(null, { kind: 'task', date: location.hash.startsWith('#calendar') ? calDay || today() : null });
$('fab').onclick = () => {
  openModal('<h2>Add</h2><div class="addgrid"><button type="button" data-addk="event"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>Event<span>on the calendar</span></button><button type="button" data-addk="task"><svg viewBox="0 0 24 24"><path d="M9 11.5l2.5 2.5L20 5.5"/><path d="M20 12v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3H15"/></svg>Task<span>to-do</span></button>' +
    '<button type="button" data-addk="note"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>Note<span>for today</span></button><button type="button" data-addk="file"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>Document<span>upload a file</span></button></div>' +
    '<button type="button" class="ghost tplmenu" id="addTpl">⚡ Use a template — set up a whole day</button>' +
    '<label>Or just type it<input id="qAdd" placeholder="Dentist friday 3pm · Call Mrs. Abbott tomorrow"></label><p class="helper">Dates and times are picked up from what you type.</p>' +
    '<div class="row-actions"><button type="button" id="qGo">Add</button><button type="button" class="ghost" id="addX">Cancel</button></div>');
  $('addX').onclick = closeModal;
  $('addTpl').onclick = () => { closeModal(); useTemplate(calDay || today()); };
  document.querySelectorAll('[data-addk]').forEach(b => b.onclick = () => {
    const k = b.dataset.addk; closeModal();
    if (k === 'note') { location.hash = 'today'; setTimeout(() => $('dayNote') && $('dayNote').focus(), 100); }
    else if (k === 'file') { location.hash = 'files'; setTimeout(() => $('fUp') && $('fUp').click(), 100); }
    else editItem(null, { kind: k, date: calDay || today() });
  });
  const go = () => { const v = $('qAdd').value.trim(); if (!v) return; closeModal(); quickAdd(v, true); };
  $('qGo').onclick = go; $('qAdd').onkeydown = e => { if (e.key === 'Enter') go(); };
  setTimeout(() => $('qAdd').focus(), 60);
};

// "Dentist friday 3pm", "call Mrs. Abbott tomorrow", "band trip 10/24 to 10/26", "pay water bill on the 15th".
function parseQuick(text) {
  let t = ' ' + text + ' ', date = '', endDate = '', start = '', end = '';
  const now = new Date(), base = today();
  const found = (re, fn) => { const m = t.match(re); if (m) { const r = fn(m); if (r !== false) t = t.replace(m[0], ' '); } };
  // A date without a year that has already passed means next year.
  const toIso = (mo, d, y) => { const yr = y ? (String(y).length === 2 ? 2000 + +y : +y) : now.getFullYear(); let s = yr + '-' + pad(mo) + '-' + pad(d); if (!y && s < base) s = (yr + 1) + '-' + pad(mo) + '-' + pad(d); return s; };
  found(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:-|to|through|thru)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i, m => { date = toIso(+m[1], +m[2], m[3]); endDate = toIso(+m[4], +m[5], m[6]); });
  if (!date) found(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => { if (+m[1] > 12) return false; date = toIso(+m[1], +m[2], m[3]); });
  if (!date) found(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i, m => { date = toIso(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]); });
  if (!date) found(/\btoday|tonight\b/i, () => { date = base; });
  if (!date) found(/\btomorrow\b/i, () => { date = addDays(base, 1); });
  if (!date) found(/\bnext week\b/i, () => { date = addDays(base, 7 - now.getDay() + 1); });
  if (!date) found(/\bin (\d+) days?\b/i, m => { date = addDays(base, +m[1]); });
  if (!date) found(/\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i, m => { const d = +m[1]; let s = base.slice(0, 8) + pad(d); if (s < base) { const x = new Date(now.getFullYear(), now.getMonth() + 1, d); s = isoDay(x); } date = s; });
  if (!date) found(/\b(next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/i, m => { const want = DAYS.indexOf(m[2].slice(0, 2).toLowerCase()); let n = (want - now.getDay() + 7) % 7 || 7; if (m[1]) n += n < 7 ? 7 : 0; date = addDays(base, n); });
  const tm = s => { const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/i); if (!m) return ''; let h = +m[1]; const ap = (m[3] || '').toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; if (!ap && h >= 1 && h <= 7) h += 12; return pad(h) + ':' + (m[2] || '00'); };
  found(/\b(?:at |@ ?)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|to|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p))\b/i, m => { end = tm(m[2]); start = tm(m[1] + (/[ap]/i.test(m[1]) ? '' : m[2].replace(/[\d:\s]/g, ''))); });
  if (!start) found(/\b(?:at |@ ?)(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\b|\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|\b(noon)\b/i, m => { start = m[3] ? '12:00' : tm(m[1] || m[2]); });
  const title = t.replace(/\s+(on|at|by|due)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), date, endDate, start, end };
}
function quickAdd(text, openAfter) {
  const p = parseQuick(text);
  const kind = p.start || p.endDate ? 'event' : 'task';
  const it = { id: uid(), kind, title: p.title || text, date: p.date || (kind === 'event' ? today() : null), endDate: p.endDate || null, start: p.start, end: p.end || (p.start ? pad(Math.min(23, +p.start.slice(0, 2) + 1)) + p.start.slice(2) : ''), allDay: !p.start, done: false, list: '', priority: 0, notes: '', location: '', repeat: '', color: '', sort: 0 };
  data.items.push(it); window.save(); route();
  toast('✓ ' + (kind === 'event' ? 'Event' : 'Task') + ' added' + (it.date ? ' for ' + fmtDate(it.date, 'rel') + (it.start ? ' at ' + fmtTime(it.start) : '') : '') + '. Tap it to change.');
  return it;
}

// ---------- Today ----------
let todaySel = '';
const TILE_ICONS = {
  event: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v5M9.5 15.5h5"/></svg>',
  task: '<svg viewBox="0 0 24 24"><path d="M9 11.5l2.5 2.5L20 5.5"/><path d="M20 12v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3H15"/></svg>',
  meal: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2.2 1-3.5 3.5-3.5 7 0 2 1 3 3.5 3"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>'
};
// "in 25 min", "in 2 hr 10 min", "now"
function untilText(date, time) {
  const mins = Math.round((new Date(date + 'T' + time) - new Date()) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return 'in ' + mins + ' min';
  if (mins < 24 * 60) { const h = Math.floor(mins / 60), m = mins % 60; return 'in ' + h + ' hr' + (m ? ' ' + m + ' min' : ''); }
  return fmtDate(date, 'rel') + ' at ' + fmtTime(time);
}
function viewToday() {
  const t = today();
  if (!todaySel) todaySel = t;
  const ws = weekStart(t), week = agenda(addDays(t, -60), addDays(ws, 13));
  const sel = todaySel, selList = onDay(week, sel);
  const overdue = data.items.filter(i => i.kind === 'task' && !i.done && i.date && i.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const note = data.items.find(i => i.kind === 'note' && i.date === t);
  const hr = new Date().getHours(), nowHm = pad(hr) + ':' + pad(new Date().getMinutes());
  const todayTasks = data.items.filter(i => i.kind === 'task' && i.date && (i.date === t || (i.date < t && !i.done)));
  const doneToday = todayTasks.filter(i => i.done).length;
  const eventsToday = onDay(week, t).filter(e => e.kind !== 'task');
  // Up next: the next timed event today, else the first one in the coming week.
  let upNext = eventsToday.find(e => !e.allDay && e.start && (e.end || e.start) > nowHm);
  if (!upNext) for (let k = 1; k <= 7 && !upNext; k++) upNext = onDay(week, addDays(t, k)).find(e => e.kind !== 'task' && !e.allDay && e.start);
  let next = '';
  for (let k = 1; k <= 7; k++) {
    const d = addDays(t, k), es = onDay(week, d).filter(e => !(e.kind === 'task' && e.done));
    if (es.length) next += '<div class="day">' + esc(fmtDate(d, 'rel')) + '</div>' + es.map(entryRow).join('');
  }
  const strip = [0, 1, 2, 3, 4, 5, 6].map(k => {
    const d = addDays(ws, k), n = onDay(week, d).length + mealsOn(d).length, dt = new Date(d + 'T12:00');
    return '<button type="button" class="sday' + (d === sel ? ' on' : '') + (d === t ? ' now' : '') + '" data-sday="' + d + '"><span>' + dt.toLocaleDateString([], { weekday: 'narrow' }) + '</span><b>' + dt.getDate() + '</b><i>' + '•'.repeat(Math.min(3, n)) + '</i></button>';
  }).join('');
  const pinned = dayPage(t).pinned || [];
  const todayRoutines = routines().filter(r => routineFor(r, hr) || pinned.includes(r.id));
  const nextSlot = hr < 10 ? 'Breakfast' : hr < 14 ? 'Lunch' : hr < 20 ? 'Dinner' : 'Snack';
  $('view').innerHTML = (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') +
    '<div class="hello">' + VINE + '<span class="eyebrow">' + (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', Shaana</span><h1>' + esc(fmtDate(t, 'long')) + '</h1>' +
    '<span class="sub">' + eventsToday.length + (eventsToday.length === 1 ? ' event' : ' events') + ' · ' + todayTasks.length + (todayTasks.length === 1 ? ' task' : ' tasks') + ' today</span>' +
    (todayTasks.length ? '<div class="prog">' + doneToday + ' of ' + todayTasks.length + ' tasks complete' + (doneToday && doneToday === todayTasks.length ? ' — all done!' : '') + '<div class="bar"><i style="width:' + Math.round(doneToday / todayTasks.length * 100) + '%"></i></div></div>' : '') + '</div>' +
    '<div class="tiles">' +
    '<button type="button" class="tile t-event" data-tile="event">' + TILE_ICONS.event + '<b>Event</b></button>' +
    '<button type="button" class="tile t-task" data-tile="task">' + TILE_ICONS.task + '<b>Task</b></button>' +
    '<button type="button" class="tile t-meal" data-tile="meal">' + TILE_ICONS.meal + '<b>Meal</b></button>' +
    '<button type="button" class="tile t-note" data-tile="note">' + TILE_ICONS.note + '<b>Write</b></button></div>' +
    trackButtons(sel) +
    '<div class="row-actions tight"><a class="button ghost small" href="#brief">☀ Morning briefing</a><button type="button" class="ghost small" id="tdTpl">⚡ Use a template</button></div>' +
    (todayRoutines.length ? '<div class="rchips">' + todayRoutines.map(routineChip).join('') + '</div>' : '') +
    (upNext ? '<div class="card upnext" ' + rowOpen(upNext) + ' style="--pc:' + esc(upNext.color || '#b0905a') + '"><span class="eyebrow">Up next · <b id="untilTxt" data-d="' + upNext.date + '" data-t="' + upNext.start + '">' + esc(untilText(upNext.date, upNext.start)) + '</b></span><h2>' + esc(upNext.title) + '</h2><span class="sub">' + esc(fmtDate(upNext.date, 'rel') + ' · ' + fmtTime(upNext.start) + (upNext.end ? '–' + fmtTime(upNext.end) : '') + (upNext.location ? ' · ' + upNext.location : '')) + '</span></div>' : '') +
    '<div class="quickbar"><input id="quick" placeholder="Type it: “Dentist friday 3pm”, “Call Mrs. Abbott”"><button type="button" id="quickGo">Add</button></div>' +
    (overdue.length ? '<div class="card pad warnbox"><h2 class="section-title">Past due <small>' + overdue.length + '</small></h2>' + overdue.map(i => entryRow({ src: 'planner', id: i.id, kind: 'task', listName: i.list, date: i.date, allDay: true, endDate: i.date, title: i.title + ' · ' + fmtDate(i.date), list: i.list, priority: i.priority })).join('') + '</div>' : '') +
    '<div class="strip">' + strip + '</div>' +
    '<div class="card pad"><h2 class="section-title">' + (sel === t ? 'Today' : esc(fmtDate(sel, 'rel'))) + ' <small>' + esc(new Date(sel + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</small></h2>' +
    (selList.length ? selList.map(entryRow).join('') : '<p class="helper">Nothing scheduled' + (sel === t ? ' today' : '') + '. <button type="button" class="linkish" id="addHere">Add something</button></p>') + '</div>' +
    mealsCard(sel) + giftCard() +
    '<div class="card pad journal"><h2>Notes</h2><textarea id="dayNote" rows="4" placeholder="Thoughts, reminders, things to remember today…">' + esc(note ? note.notes : '') + '</textarea></div>' +
    '<div class="card pad"><h2>The week ahead</h2>' + (next || '<p class="helper">Nothing coming up.</p>') + '</div>' +
    (S().calendars.length ? '' : '<a class="card pad tip" href="#calendars"><b>Connect your Google and Outlook calendars</b><span class="sub">so everything shows up here →</span></a>');
  wireRows($('view'));
  $('view').querySelectorAll('[data-meal]').forEach(b => b.onclick = () => editMeal(b.dataset.mealdate, b.dataset.meal));
  $('view').querySelectorAll('[data-sday]').forEach(b => b.onclick = () => { todaySel = b.dataset.sday; viewToday(); });
  $('view').querySelectorAll('[data-tile]').forEach(b => b.onclick = () => {
    const k = b.dataset.tile;
    if (k === 'event' || k === 'task') editItem(null, { kind: k, date: sel });
    else if (k === 'meal') editMeal(sel, nextSlot);
    else openInkPage(sel);
  });
  $('view').querySelectorAll('[data-routine]').forEach(b => b.onclick = () => openRoutine(b.dataset.routine));
  $('tdTpl').onclick = () => useTemplate(sel);
  wireTrack($('view'), viewToday);
  if ($('addHere')) $('addHere').onclick = () => editItem(null, { kind: 'event', date: sel });
  const go = () => { const v = $('quick').value.trim(); if (v) quickAdd(v); };
  $('quickGo').onclick = go; $('quick').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('dayNote').onchange = e => {
    let n = data.items.find(i => i.kind === 'note' && i.date === t);
    if (!n) { n = { id: 'note-' + t, kind: 'note', title: 'Notes', date: t, notes: '' }; data.items.push(n); }
    n.notes = e.target.value; window.save(); toast('Note saved.');
  };
  if (window.plannerSync) window.plannerSync.renderBox();
}
// Keep the "Up next" countdown current while Today is open.
setInterval(() => { const u = $('untilTxt'); if (u) u.textContent = untilText(u.dataset.d, u.dataset.t); }, 30000);

// ---------- Calendar ----------
let calMonth = '', calDay = '';
let calMode = (() => { try { return localStorage.getItem(KEY + 'CalMode') || 'month'; } catch (e) { return 'month'; } })();
const weekStart = iso => addDays(iso, -new Date(iso + 'T12:00').getDay());
function viewCalendar() {
  if (!calDay) calDay = today();
  calMonth = calDay.slice(0, 7);
  const seg = '<div class="segs viewseg">' + [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => '<button type="button" class="seg' + (calMode === k ? ' on' : '') + '" data-mode="' + k + '">' + l + '</button>').join('') + '</div>';
  const title = calMode === 'month' ? monthName(calMonth) : calMode === 'week' ? weekTitle(weekStart(calDay)) : fmtDate(calDay, 'long');
  $('view').innerHTML = seg + '<div class="cal-head"><button type="button" class="ghost small" id="cPrev">‹</button><h2>' + esc(title) + '</h2><button type="button" class="ghost small" id="cNext">›</button></div>' +
    '<div class="row-actions center"><button type="button" class="ghost small" id="cToday">Today</button>' + (S().calendars.length ? '<button type="button" class="ghost small" id="cRefresh">Refresh</button>' : '<a class="button ghost small" href="#calendars">Connect Google or Outlook</a>') + '<button type="button" class="small" id="cAdd">＋ Add</button></div>' +
    '<div id="calBody"></div>' + legend();
  ({ month: drawMonth, week: drawWeek, day: drawDay })[calMode]();
  const step = calMode === 'day' ? 1 : calMode === 'week' ? 7 : 0;
  const move = dir => {
    if (step) calDay = addDays(calDay, dir * step);
    else { const [y, m] = calMonth.split('-').map(Number), d = new Date(y, m - 1 + dir, 1); calDay = isoDay(d); }
    viewCalendar();
  };
  $('cPrev').onclick = () => move(-1); $('cNext').onclick = () => move(1);
  $('cToday').onclick = () => { calDay = today(); viewCalendar(); };
  if ($('cRefresh')) $('cRefresh').onclick = () => { toast('Refreshing…'); refreshAll(true); };
  $('cAdd').onclick = () => editItem(null, { kind: 'event', date: calDay });
  $('view').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { calMode = b.dataset.mode; try { localStorage.setItem(KEY + 'CalMode', calMode); } catch (e) {} viewCalendar(); });
}
function weekTitle(ws) {
  const we = addDays(ws, 6), a = new Date(ws + 'T12:00'), b = new Date(we + 'T12:00');
  return a.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' + (a.getMonth() === b.getMonth() ? b.getDate() : b.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ', ' + b.getFullYear();
}
function drawMonth() {
  const [y, m] = calMonth.split('-').map(Number), n = lastDay(y, m), first = new Date(y, m - 1, 1).getDay();
  const list = agenda(calMonth + '-01', calMonth + '-' + pad(n));
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cd blank"></div>';
  for (let d = 1; d <= n; d++) {
    const iso = calMonth + '-' + pad(d), es = onDay(list, iso);
    cells += '<button type="button" class="cd' + (iso === today() ? ' today' : '') + (iso === calDay ? ' sel' : '') + '" data-day="' + iso + '"><span class="n">' + d + trackIcons(iso) + '</span>' +
      es.slice(0, 3).map(e => '<span class="pill" style="--pc:' + esc(e.color || '#888') + '">' + esc(e.title) + '</span>').join('') + (es.length > 3 ? '<span class="more">+' + (es.length - 3) + '</span>' : '') + '</button>';
  }
  const dayList = onDay(list, calDay);
  $('calBody').innerHTML = '<div class="cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => '<div class="cw">' + x + '</div>').join('') + cells + '</div>' +
    '<div class="card pad"><div class="mini-head"><h2>' + esc(fmtDate(calDay, 'long')) + '</h2><button type="button" class="ghost small" data-goday="' + calDay + '">Open day</button></div>' + (dayList.length ? dayList.map(entryRow).join('') : '<p class="helper">Nothing on this day.</p>') + mealsLine(calDay) + trackButtons(calDay) + '</div>';
  $('calBody').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { calDay = b.dataset.day; viewCalendar(); });
  wireCal();
}
// A little vine of leaves, like the top of a paper planner page.
const VINE = '<svg class="vine" viewBox="0 0 240 40" aria-hidden="true"><path d="M2 8 C 50 34, 90 30, 120 14 S 190 2, 238 20" fill="none" stroke="#6f8f66" stroke-width="1.6"/>' +
  [[22, 18, -30], [44, 26, 25], [66, 29, -20], [88, 26, 30], [110, 18, -35], [134, 11, 20], [158, 7, -25], [182, 8, 30], [206, 12, -20], [226, 17, 25]].map(([x, y, r], i) =>
    '<ellipse cx="' + x + '" cy="' + (y + (i % 2 ? 7 : -7)) + '" rx="8" ry="4" transform="rotate(' + r + ' ' + x + ' ' + (y + (i % 2 ? 7 : -7)) + ')" fill="' + (i % 3 ? '#8fb48a' : '#a9c7a2') + '" stroke="#5f7d57" stroke-width=".8"/>').join('') + '</svg>';
const DAY_TONES = ['#cdbdb0', '#dccbc1', '#ece8e2', '#ece8e2', '#cdbdb0', '#dccbc1', '#dccbc1'];
// The week laid out like a printed planner page: reminders, seven day boxes and a notes box.
function drawWeek() {
  const ws = weekStart(calDay), we = addDays(ws, 6), list = agenda(ws, we);
  const reminders = data.items.filter(i => i.kind === 'task' && !i.done && (!i.date || i.date <= we)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 8);
  const noteId = 'wnote-' + ws, wn = data.items.find(i => i.id === noteId);
  let boxes = '';
  for (let k = 0; k < 7; k++) {
    const d = addDays(ws, k), es = onDay(list, d), dt = new Date(d + 'T12:00');
    boxes += '<div class="pday' + (d === today() ? ' today' : '') + '" style="--tone:' + DAY_TONES[k] + '"><button type="button" class="ptag" data-goday="' + d + '">' + dt.toLocaleDateString([], { weekday: 'long' }) + ' <small>' + dt.getDate() + '</small></button>' + trackIcons(d) +
      '<div class="pitems">' + es.map(e => '<div class="pev' + (e.done ? ' done' : '') + '" ' + rowOpen(e) + '><i style="background:' + esc(e.color || '#8c7a6b') + '"></i><span>' + esc((e.kind === 'task' ? '' : e.allDay ? '' : fmtTime(e.start) + ' ') + e.title) + '</span></div>').join('') + mealsLine(d, true) + '</div>' +
      '<button type="button" class="padd" data-addday="' + d + '" aria-label="Add">＋</button>' + (d === today() ? '<span class="heart">♥</span>' : '') + '</div>';
  }
  $('calBody').innerHTML = '<div class="ppage"><div class="phead"><div class="ptitle">' + VINE + '<h1>Weekly<br>Planner</h1></div>' +
    '<div class="plines"><p><span>Month:</span> ' + esc(new Date(ws + 'T12:00').toLocaleDateString([], { month: 'long' })) + '</p><p><span>Week:</span> ' + esc(weekTitle(ws).replace(/, \d{4}$/, '')) + '</p>' +
    '<div class="pbox prem"><span class="ptag">Reminders:</span>' + (reminders.length ? reminders.map(i => '<div class="pev" data-item="' + i.id + '"><i></i><span>' + esc(i.title) + (i.date ? ' <small>' + esc(new Date(i.date + 'T12:00').toLocaleDateString([], { weekday: 'short' })) + '</small>' : '') + '</span></div>').join('') : '<p class="helper">Nothing to remember yet.</p>') + '</div></div></div>' +
    '<div class="pgrid">' + boxes + '<div class="pday pnotes" style="--tone:#cdbdb0"><span class="ptag">Notes:</span><textarea id="weekNote" placeholder="Anything for this week…">' + esc(wn ? wn.notes : '') + '</textarea></div></div></div>';
  $('weekNote').onchange = e => {
    let n = data.items.find(i => i.id === noteId);
    if (!n) { n = { id: noteId, kind: 'note', title: 'Week notes', date: ws, notes: '' }; data.items.push(n); }
    n.notes = e.target.value; window.save(); toast('Note saved.');
  };
  $('calBody').querySelectorAll('[data-addday]').forEach(b => b.onclick = ev => { ev.stopPropagation(); editItem(null, { kind: 'event', date: b.dataset.addday }); });
  wireCal();
}
// ---------- Handwriting (Apple Pencil or finger) ----------
// Strokes are kept as small lists of points scaled to the pad's width, so they redraw sharply at any size.
// Each stroke: { c: color, w: width, h: 1 if highlighter, p: [x, y, pressure, x, y, pressure, ...] } with x/y in 0–1000 units of width.
const INK_COLORS = ['#2b2522', '#7d9b76', '#c99a8e', '#5b7fa6', '#b07e6a'];
function inkPad(host, strokes, onChange, opts) {
  opts = opts || {};
  let color = INK_COLORS[0], size = 2.2, mode = 'pen', fingerOk = !('ontouchstart' in window) || !!opts.finger, penSeen = false;
  host.innerHTML = '<div class="inkbar">' + INK_COLORS.map((c, k) => '<button type="button" class="inkc' + (k ? '' : ' on') + '" data-ic="' + c + '" style="background:' + c + '" aria-label="Color"></button>').join('') +
    '<span class="sep"></span><button type="button" class="inkt on" data-it="pen" title="Pen">✎</button><button type="button" class="inkt" data-it="hi" title="Highlighter">▬</button><button type="button" class="inkt" data-it="erase" title="Eraser">⌫</button>' +
    '<span class="sep"></span><button type="button" class="inkt" data-is="1.4" title="Fine">•</button><button type="button" class="inkt on" data-is="2.2" title="Medium">●</button><button type="button" class="inkt" data-is="4" title="Bold">⬤</button>' +
    '<span class="sep"></span><button type="button" class="inkt" data-iu title="Undo">↶</button><button type="button" class="inkt" data-ix title="Clear">✕</button>' +
    '<label class="fing"><input type="checkbox"' + (fingerOk ? ' checked' : '') + '> finger</label></div><div class="inkwrap"><canvas class="ink"></canvas></div>';
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d'), undo = [];
  const scale = () => cv.clientWidth / 1000;
  function size2() {
    const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r); ctx.setTransform(r, 0, 0, r, 0, 0); redraw();
  }
  function drawStroke(s) {
    const k = scale(), p = s.p;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c;
    if (s.h) { ctx.globalAlpha = .32; ctx.lineCap = 'butt'; }
    if (p.length <= 3) { ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, s.w * k * 1.6, 0, 7); ctx.fill(); ctx.restore(); return; }
    for (let i = 3; i < p.length; i += 3) {
      ctx.lineWidth = Math.max(.6, s.w * (s.h ? 6 : .55 + (p[i + 2] || .5)) * k * 1.6);
      ctx.beginPath(); ctx.moveTo(p[i - 3] * k, p[i - 2] * k); ctx.lineTo(p[i] * k, p[i + 1] * k); ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); }
  let cur = null;
  const pt = e => { const r = cv.getBoundingClientRect(), k = scale(); return [Math.round((e.clientX - r.left) / k * 10) / 10, Math.round((e.clientY - r.top) / k * 10) / 10, Math.round((e.pressure || .5) * 100) / 100]; };
  const allowed = e => { if (e.pointerType === 'pen') { penSeen = true; return true; } return e.pointerType === 'mouse' || fingerOk; };
  function eraseAt(x, y) {
    const before = strokes.length;
    for (let i = strokes.length - 1; i >= 0; i--) { const p = strokes[i].p; for (let j = 0; j < p.length; j += 3) if (Math.abs(p[j] - x) < 14 && Math.abs(p[j + 1] - y) < 14) { undo.push(['add', strokes[i], i]); strokes.splice(i, 1); break; } }
    if (strokes.length !== before) { redraw(); onChange(strokes); }
  }
  cv.addEventListener('pointerdown', e => {
    if (!allowed(e)) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const [x, y, pr] = pt(e);
    if (mode === 'erase') { cur = { erase: true }; eraseAt(x, y); return; }
    cur = { c: color, w: size, p: [x, y, pr] }; if (mode === 'hi') cur.h = 1;
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    evs.forEach(ev => {
      const [x, y, pr] = pt(ev);
      if (cur.erase) { eraseAt(x, y); return; }
      const p = cur.p, lx = p[p.length - 3], ly = p[p.length - 2];
      if (Math.abs(x - lx) + Math.abs(y - ly) < 1.2) return;
      p.push(x, y, pr);
      const k = scale(); ctx.save(); ctx.lineCap = cur.h ? 'butt' : 'round'; ctx.strokeStyle = cur.c; if (cur.h) ctx.globalAlpha = .32;
      ctx.lineWidth = Math.max(.6, cur.w * (cur.h ? 6 : .55 + pr) * k * 1.6); ctx.beginPath(); ctx.moveTo(lx * k, ly * k); ctx.lineTo(x * k, y * k); ctx.stroke(); ctx.restore();
    });
  });
  const end = () => { if (!cur) return; if (!cur.erase) { strokes.push(cur); undo.push(['del']); if (cur.h) redraw(); else drawStroke(cur); onChange(strokes); } cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  // Stop the page from scrolling while writing with the pencil (fingers still scroll unless finger writing is on).
  cv.addEventListener('touchstart', e => { if (fingerOk || (e.touches[0] && e.touches[0].touchType === 'stylus')) e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { if (cur) e.preventDefault(); }, { passive: false });
  host.querySelectorAll('[data-ic]').forEach(b => b.onclick = () => { color = b.dataset.ic; if (mode === 'erase') setMode('pen'); host.querySelectorAll('[data-ic]').forEach(x => x.classList.toggle('on', x === b)); });
  const setMode = m => { mode = m; host.querySelectorAll('[data-it]').forEach(x => x.classList.toggle('on', x.dataset.it === m)); };
  host.querySelectorAll('[data-it]').forEach(b => b.onclick = () => setMode(b.dataset.it));
  host.querySelectorAll('[data-is]').forEach(b => b.onclick = () => { size = +b.dataset.is; host.querySelectorAll('[data-is]').forEach(x => x.classList.toggle('on', x === b)); });
  host.querySelector('[data-iu]').onclick = () => {
    const u = undo.pop(); if (!u) return;
    if (u[0] === 'del') strokes.pop(); else strokes.splice(u[2], 0, u[1]);
    redraw(); onChange(strokes);
  };
  host.querySelector('[data-ix]').onclick = () => { if (!strokes.length || !confirm('Clear this page?')) return; strokes.length = 0; undo.length = 0; redraw(); onChange(strokes); };
  host.querySelector('.fing input').onchange = e => { fingerOk = e.target.checked; cv.style.touchAction = fingerOk ? 'none' : 'pan-y'; };
  cv.style.touchAction = fingerOk ? 'none' : 'pan-y';
  new ResizeObserver(size2).observe(cv);
  return { redraw };
}
// A big writing page for any day, opened from the daily spread.
function openInkPage(d) {
  const v = dayPage(d), strokes = v.ink || [];
  openModal('<div class="mini-head"><h2>Write · ' + esc(fmtDate(d)) + '</h2><button type="button" class="ghost small" id="inkDone">Done</button></div><div id="inkBig" class="inkhost big"></div>');
  $('modalBody').classList.add('wide');
  let t;
  inkPad($('inkBig'), strokes, s => { clearTimeout(t); t = setTimeout(() => { const nv = dayPage(d); nv.ink = s; saveDayPage(d, nv); }, 400); });
  $('inkDone').onclick = () => { $('modalBody').classList.remove('wide'); closeModal(); route(); };
}

// One day as a two-page planner spread (side by side on an iPad or computer, stacked on a phone).
// Left: month, date dots, weekday and an hour-by-hour schedule she can write on (events fill in at their hour).
// Right: the vibe, priorities, to-do/notes, mindfulness boxes, water, mood and tomorrow.
// Everything she writes is kept in one "daypage" item per date (as JSON in its notes); the to-do/notes box is the
// same note as on the Today screen.
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function dayPage(d) {
  let it = data.items.find(i => i.kind === 'daypage' && i.date === d), v = {};
  try { v = it ? JSON.parse(it.notes || '{}') : {}; } catch (e) { v = {}; }
  v.pri = v.pri || [{}, {}, {}, {}, {}]; v.hours = v.hours || {};
  return v;
}
function saveDayPage(d, v) {
  let it = data.items.find(i => i.kind === 'daypage' && i.date === d);
  if (!it) { it = { id: 'page-' + d, kind: 'daypage', title: 'Day page', date: d, notes: '' }; data.items.push(it); }
  it.notes = JSON.stringify(v); window.save();
}
function drawDay() {
  const d = calDay, dt = new Date(d + 'T12:00'), es = onDay(agenda(addDays(d, -30), addDays(d, 1)), d);
  const v = dayPage(d), note = data.items.find(i => i.kind === 'note' && i.date === d);
  const allDay = es.filter(e => e.allDay || !e.start), timed = es.filter(e => !e.allDay && e.start);
  const [y, m] = d.split('-').map(Number), n = lastDay(y, m);
  const firstH = Math.min(5, ...timed.map(e => +e.start.slice(0, 2))), lastH = Math.max(21, ...timed.map(e => +e.start.slice(0, 2)));
  const dots = Array.from({ length: n }, (_, k) => { const iso = d.slice(0, 8) + pad(k + 1); return '<button type="button" class="ddot' + (iso === d ? ' on' : '') + (iso === today() ? ' now' : '') + '" data-dday="' + iso + '">' + (k + 1) + '</button>'; }).join('');
  // Monday-to-Sunday row, like the paper planner.
  const mon = addDays(d, -((dt.getDay() + 6) % 7)), days = [0, 1, 2, 3, 4, 5, 6].map(k => addDays(mon, k));
  let hours = '';
  for (let h = firstH; h <= lastH; h++) {
    const hh = pad(h), here = timed.filter(e => e.start.slice(0, 2) === hh);
    hours += '<div class="hrow"><span class="hl">' + (h % 12 || 12) + ' ' + (h < 12 ? 'AM' : 'PM') + '</span><div class="hc">' +
      here.map(e => '<span class="hev" ' + rowOpen(e) + ' style="--pc:' + esc(e.color || '#8c7a6b') + '">' + esc(fmtTime(e.start) + ' ' + e.title) + '</span>').join('') +
      '<input class="hin" data-hour="' + hh + '" value="' + esc(v.hours[hh] || '') + '" aria-label="' + (h % 12 || 12) + (h < 12 ? 'am' : 'pm') + ' notes"></div></div>';
  }
  const box = (k, label) => '<div class="mbox"><span>' + label + '</span><textarea data-dp="' + k + '" rows="3">' + esc(v[k] || '') + '</textarea></div>';
  $('calBody').innerHTML = '<div class="spread">' +
    '<div class="pg left"><div class="pgtop"><div class="mon">' + esc(dt.toLocaleDateString([], { month: 'short' }).toUpperCase()) + '<small>' + dt.getDate() + '</small></div>' +
      '<div class="ddots">' + dots + '</div></div>' +
      '<div class="wkrow"><span class="todaylbl">' + (d === today() ? 'TODAY' : esc(dt.toLocaleDateString([], { weekday: 'long' }).toUpperCase())) + '</span>' +
      days.map(x => '<button type="button" class="wd' + (x === d ? ' on' : '') + '" data-dday="' + x + '">' + new Date(x + 'T12:00').toLocaleDateString([], { weekday: 'short' }).toUpperCase() + '</button>').join('') + '</div>' +
      trackButtons(d) +
      (allDay.length ? '<div class="alld">' + allDay.map(e => '<span class="hev" ' + rowOpen(e) + ' style="--pc:' + esc(e.color || '#8c7a6b') + '">' + (e.kind === 'task' ? (e.done ? '✓ ' : '○ ') : '') + esc(e.title) + '</span>').join('') + '</div>' : '') +
      '<div class="hours">' + hours + '</div>' +
      '<div class="pbox2"><span>Evening</span><textarea data-dp="evening" rows="2">' + esc(v.evening || '') + '</textarea></div>' + dayStickies(d, 'left') +
    '</div>' +
    '<div class="rings" aria-hidden="true"></div>' +
    '<div class="pg right">' +
      '<div class="pbox2 vibe"><span>The vibe</span><input data-dp="vibe" value="' + esc(v.vibe || '') + '" placeholder="Calm & focused"></div>' +
      '<div class="cols"><div class="pbox2"><span>Priority</span>' + v.pri.map((p, k) => '<div class="pri"><button type="button" class="pc' + (p.done ? ' on' : '') + '" data-pri="' + k + '">' + (p.done ? '✓' : '') + '</button><input data-prit="' + k + '" value="' + esc(p.t || '') + '"></div>').join('') + '</div>' +
      '<div class="pbox2 todo"><span>To do / notes</span><textarea id="dpNote" rows="7">' + esc(note ? note.notes : '') + '</textarea></div></div>' +
      '<h3 class="mh">Mindfulness</h3><div class="mgrid">' + box('affirm', 'Affirmations') + box('grat', 'Gratitude') + box('refl', 'Reflection') + box('high', 'Highlight') + '</div>' +
      '<div class="trackers"><div><span>Hydration</span><div class="drops">' + Array.from({ length: 8 }, (_, k) => '<button type="button" class="drop' + (k < (v.water || 0) ? ' on' : '') + '" data-water="' + (k + 1) + '" aria-label="' + (k + 1) + ' glasses"></button>').join('') + '</div></div>' +
      '<div><span>Mood</span><div class="moods">' + MOODS.map((e, k) => '<button type="button" class="mood' + (v.mood === k + 1 ? ' on' : '') + '" data-mood="' + (k + 1) + '">' + e + '</button>').join('') + '</div></div></div>' +
      '<div class="pbox2"><span>Tomorrow</span><textarea data-dp="tomorrow" rows="3">' + esc(v.tomorrow || '') + '</textarea></div>' +
      dayStickies(d, 'right') +
      '<div class="pbox2 writebox"><span>Write it down</span><button type="button" class="ghost small bigwrite" id="inkOpen">Full page ⤢</button><div id="inkHere" class="inkhost"></div></div>' +
    '</div></div>';
  const body = $('calBody'), put = fn => { const nv = dayPage(d); fn(nv); saveDayPage(d, nv); };
  body.querySelectorAll('[data-dday]').forEach(b => b.onclick = () => { calDay = b.dataset.dday; viewCalendar(); });
  wireStickies(body, drawDay);
  body.querySelectorAll('[data-dsadd]').forEach(b => b.onclick = () => editSticky(null, '', drawDay, { date: d, location: b.dataset.dsadd, color: b.dataset.dscolor || 'yellow' }));
  body.querySelectorAll('[data-hour]').forEach(i => i.onchange = () => put(nv => { nv.hours[i.dataset.hour] = i.value; }));
  body.querySelectorAll('[data-dp]').forEach(i => i.onchange = () => put(nv => { nv[i.dataset.dp] = i.value; }));
  body.querySelectorAll('[data-prit]').forEach(i => i.onchange = () => put(nv => { nv.pri[+i.dataset.prit] = Object.assign({}, nv.pri[+i.dataset.prit], { t: i.value }); }));
  body.querySelectorAll('[data-pri]').forEach(b => b.onclick = () => { put(nv => { const p = nv.pri[+b.dataset.pri] || {}; p.done = !p.done; nv.pri[+b.dataset.pri] = p; if (p.done && p.t) celebrate(b); }); drawDay(); });
  body.querySelectorAll('[data-water]').forEach(b => b.onclick = () => { put(nv => { const w = +b.dataset.water; nv.water = nv.water === w ? w - 1 : w; }); drawDay(); });
  body.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => { put(nv => { nv.mood = nv.mood === +b.dataset.mood ? 0 : +b.dataset.mood; }); drawDay(); });
  $('dpNote').onchange = e => {
    let nn = data.items.find(i => i.kind === 'note' && i.date === d);
    if (!nn) { nn = { id: 'note-' + d, kind: 'note', title: 'Notes', date: d, notes: '' }; data.items.push(nn); }
    nn.notes = e.target.value; window.save(); toast('Saved.');
  };
  let inkT;
  inkPad($('inkHere'), v.ink || [], s => { clearTimeout(inkT); inkT = setTimeout(() => { const nv = dayPage(d); nv.ink = s; saveDayPage(d, nv); }, 400); });
  $('inkOpen').onclick = () => openInkPage(d);
  const sel = body.querySelector('.ddot.on'), strip = body.querySelector('.ddots'); if (sel && strip) strip.scrollLeft = sel.offsetLeft - strip.clientWidth / 2;
  wireCal();
}
const rowOpen = e => e.src === 'planner' ? 'data-item="' + e.id + '"' : e.link ? 'data-link="' + esc(e.link) + '"' : 'data-ext="' + esc(JSON.stringify({ t: e.title, d: e.date, s: e.start, e: e.end, l: e.location, n: e.notes, c: e.cal })) + '"';
function wireCal() {
  wireRows($('calBody'));
  wireTrack($('calBody'), viewCalendar);
  $('calBody').querySelectorAll('[data-goday]').forEach(b => b.onclick = () => { calDay = b.dataset.goday; calMode = 'day'; viewCalendar(); });
  $('calBody').querySelectorAll('[data-meal]').forEach(b => b.onclick = e => { e.stopPropagation(); editMeal(b.dataset.mealdate, b.dataset.meal); });
}
function legend() {
  const parts = [[COLORS[0], 'Planner']].concat(S().calendars.filter(c => c.on !== false).map(c => [c.color, c.name]));
  if (S().showBand !== false && cache.get('band')) parts.push(['#b59f83', 'Band']);
  if (S().showBills !== false && cache.get('bills')) parts.push(['#c99a8e', 'Bills']);
  return '<p class="helper legend">' + parts.map(([c, n]) => '<span><i style="background:' + esc(c) + '"></i>' + esc(n) + '</span>').join('') + '</p>';
}

// ---------- Tasks ----------
let taskFilter = 'open', showDone = false;
function viewTasks() {
  const t = today(), lists = S().lists;
  const tasks = data.items.filter(i => i.kind === 'task');
  const match = i => taskFilter === 'open' ? true : taskFilter === 'today' ? i.date && i.date <= t : taskFilter === 'upcoming' ? i.date && i.date > t : taskFilter === 'someday' ? !i.date : i.list === taskFilter;
  const open = tasks.filter(i => !i.done && match(i)).sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title));
  const done = tasks.filter(i => i.done && match(i));
  const count = f => tasks.filter(i => !i.done && (f === 'today' ? i.date && i.date <= t : f === 'upcoming' ? i.date && i.date > t : f === 'someday' ? !i.date : i.list === f)).length;
  const fixed = { open: ['#9b7bff', '#ece5ff'], today: ['#f5b82e', '#fff4c7'], upcoming: ['#4aa8ff', '#dcefff'], someday: ['#4cc4c4', '#d8f5f5'] };
  const chip = (k, l) => '<button type="button" class="chipbtn' + (taskFilter === k ? ' on' : '') + '" data-tf="' + esc(k) + '"' + (fixed[k] ? '' : chipStyle(k)) + '>' + (fixed[k] ? '' : chipDot(k)) + esc(l) + (k !== 'open' && count(k) ? ' <b>' + count(k) + '</b>' : '') + '</button>';
  const row = i => entryRow({ src: 'planner', id: i.id, kind: 'task', listName: i.list, date: i.date, endDate: i.date, allDay: true, done: i.done, title: i.title, list: [i.list, i.date ? (i.date < t && !i.done ? '⚠ ' : '') + fmtDate(i.date, 'rel') : '', REPEATS[i.repeat] && i.repeat ? '🔁' : ''].filter(Boolean).join(' · '), priority: i.priority });
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks" class="on">To-do</a><a href="#tasks/routines">Routines</a><a href="#tasks/templates">Templates</a></div>' +
    '<div class="quickbar"><input id="quick" placeholder="Add a task… “Turn in band forms friday”"><button type="button" id="quickGo">Add</button></div>' +
    '<div class="chips scrollx">' + chip('open', 'All') + chip('today', 'Today') + chip('upcoming', 'Upcoming') + chip('someday', 'Someday') + lists.map(l => chip(l, l)).join('') + '</div>' +
    '<div class="card pad">' + (open.map(row).join('') || '<p class="helper">All clear.</p>') + '</div>' +
    (done.length ? '<button type="button" class="linkish" id="tShowDone">' + (showDone ? 'Hide' : 'Show') + ' ' + done.length + ' done</button>' + (showDone ? '<div class="card pad">' + done.map(row).join('') + '<div class="row-actions"><button type="button" class="ghost small" id="tClear">Delete done tasks</button></div></div>' : '') : '');
  wireRows($('view'));
  $('view').querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { taskFilter = b.dataset.tf; viewTasks(); });
  const go = () => {
    const v = $('quick').value.trim(); if (!v) return;
    const p = parseQuick(v);
    const it = { id: uid(), kind: 'task', title: p.title || v, date: p.date || (taskFilter === 'today' ? t : null), endDate: null, start: '', end: '', allDay: true, done: false, list: lists.includes(taskFilter) ? taskFilter : '', priority: 0, notes: '', location: '', repeat: '', color: '', sort: 0 };
    data.items.push(it); window.save(); viewTasks(); toast('✓ Task added' + (it.date ? ' for ' + fmtDate(it.date, 'rel') : '') + '.');
    setTimeout(() => $('quick').focus(), 50);
  };
  $('quickGo').onclick = go; $('quick').onkeydown = e => { if (e.key === 'Enter') go(); };
  if ($('tShowDone')) $('tShowDone').onclick = () => { showDone = !showDone; viewTasks(); };
  if ($('tClear')) $('tClear').onclick = () => { if (!confirm('Delete ' + done.length + ' done tasks?')) return; const ids = new Set(done.map(i => i.id)); data.items = data.items.filter(i => !ids.has(i.id)); window.save(); viewTasks(); };
}

// ---------- Add / edit an event or task ----------
function editItem(id, preset) {
  const it = id ? data.items.find(i => i.id === id) : Object.assign({ kind: 'event', title: '', date: today(), endDate: null, start: '', end: '', allDay: false, done: false, list: '', priority: 0, notes: '', location: '', repeat: '', color: '' }, preset || {});
  if (!it) return;
  let kind = it.kind;
  const files = id ? data.docs.filter(d => d.itemId === id) : [];
  const freq = id ? [] : frequentEvents();
  openModal('<h2>' + (id ? 'Edit' : 'New') + '</h2>' +
    (id ? '' : '<div class="qadd ev-only"><p class="lbl">Quick add <span class="sub">— one tap, on the date below</span></p>' +
      '<div class="qtrack">' + trackers().map(t => '<button type="button" class="qt" data-qt="' + esc(t.id) + '" title="' + esc(t.name) + '"><span>' + t.icon + '</span><small>' + esc(t.name) + '</small></button>').join('') + '</div>' +
      (freq.length ? '<div class="qfreq">' + freq.map((f, n) => '<button type="button" class="qf" data-qf="' + n + '"><i class="dot" style="background:' + esc(f.color || COLORS[0]) + '"></i>' + esc(f.title) + '<small>' + (f.start ? fmtTime(f.start) : 'all day') + '</small></button>').join('') + '</div>' : '') +
      '<p class="lbl or">or fill it in</p></div>') +
    '<div class="segs" id="iKind"><button type="button" class="seg' + (kind === 'event' ? ' on' : '') + '" data-k="event">Event</button><button type="button" class="seg' + (kind === 'task' ? ' on' : '') + '" data-k="task">Task</button></div>' +
    '<label>What<input id="iTitle" value="' + esc(it.title) + '" placeholder="' + (kind === 'task' ? 'Turn in band forms' : 'Dentist') + '" autocapitalize="sentences"></label>' +
    '<div class="grid2"><label><span id="iDateL">' + (kind === 'task' ? 'Due' : 'Date') + '</span><input id="iDate" type="date" value="' + esc(it.date || '') + '"></label><label class="ev-only">Ends (for trips)<input id="iEndDate" type="date" value="' + esc(it.endDate || '') + '"></label></div>' +
    '<label class="check ev-only"><input type="checkbox" id="iAllDay"' + (it.allDay ? ' checked' : '') + '> All day</label>' +
    '<div class="grid2 ev-only times"><label>Starts<input id="iStart" type="time" value="' + esc(it.start) + '"></label><label>Ends<input id="iEnd" type="time" value="' + esc(it.end) + '"></label></div>' +
    '<div class="grid2"><label>Repeats<select id="iRepeat">' + Object.entries(REPEATS).map(([k, l]) => '<option value="' + k + '"' + (it.repeat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>List<select id="iList"><option value="">—</option>' + S().lists.map(l => '<option' + (l === it.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    '<label class="ev-only">Where<input id="iLoc" value="' + esc(it.location) + '" placeholder="Address or place"></label>' +
    '<div class="grid2"><label class="ev-only">Who’s driving<input id="iDriver" list="drivers" value="' + esc(it.driver || '') + '" placeholder="Me, Salvador, carpool…"></label>' +
    '<label>Remind me<select id="iRemind"></select></label></div><datalist id="drivers">' + [...new Set(data.items.map(i => i.driver).filter(Boolean).concat(['Me']))].map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<label class="task-only check"><input type="checkbox" id="iPri"' + (it.priority >= 2 ? ' checked' : '') + '> ❗ Important</label>' +
    '<p class="lbl ev-only">Color</p><div class="colors ev-only">' + COLORS.map(c => '<button type="button" class="cdot' + ((it.color || COLORS[0]) === c ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>').join('') + '</div>' +
    '<label>Notes<textarea id="iNotes" rows="3">' + esc(it.notes) + '</textarea></label>' +
    '<p class="lbl">Documents</p><div id="iFiles">' + files.map(d => '<div class="mini-row"><a href="#" data-open="' + d.id + '">📎 ' + esc(d.title || d.fileName) + '</a></div>').join('') + '</div>' +
    '<label class="button ghost small file">Attach a file<input type="file" id="iFile" hidden></label><p class="helper" id="iFileNote"></p>' +
    (id && kind === 'event' ? '<p class="lbl">Put it on another calendar</p><div class="row-actions"><a class="button ghost small" target="_blank" rel="noopener" href="' + esc(googleLink(it)) + '">Google</a><a class="button ghost small" target="_blank" rel="noopener" href="' + esc(outlookLink(it)) + '">Outlook</a><button type="button" class="ghost small" id="iIcs">iPhone / .ics</button></div>' : '') +
    '<div class="row-actions"><button type="button" id="iSave">Save</button><button type="button" class="ghost" id="iCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="iDel">Delete</button>' : '') + '</div>');
  let color = it.color || COLORS[0], pending = null;
  const sync = () => {
    document.querySelectorAll('#modalBody .ev-only').forEach(x => { x.hidden = kind !== 'event'; });
    document.querySelectorAll('#modalBody .task-only').forEach(x => { x.hidden = kind !== 'task'; });
    document.querySelectorAll('#modalBody .times').forEach(x => { x.hidden = kind !== 'event' || $('iAllDay').checked; });
    $('iDateL').textContent = kind === 'task' ? 'Due (optional)' : 'Date';
  };
  $('iKind').querySelectorAll('.seg').forEach(b => b.onclick = () => { kind = b.dataset.k; $('iKind').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); sync(); remindOpts(); });
  // Remind options depend on whether there's a time: minutes before, or a time of day for all-day items and tasks.
  const remindOpts = () => {
    const timed = kind === 'event' && !$('iAllDay').checked && $('iStart').value, cur = $('iRemind').value || (it.remind == null ? '' : String(it.remind));
    const opts = timed ? [['', '30 min before (default)'], ['0', 'At start time'], ['10', '10 min before'], ['60', '1 hour before'], ['120', '2 hours before'], ['1440', '1 day before'], ['-1', 'No alert']]
      : [['', '9 AM that day (default)'], ['-420', '7 AM that day'], ['-720', 'Noon that day'], ['-1080', '6 PM that day'], ['360', '6 PM the day before'], ['-1', 'No alert']];
    $('iRemind').innerHTML = opts.map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join('');
  };
  $('iAllDay').onchange = () => { sync(); remindOpts(); }; $('iStart').addEventListener('change', remindOpts); sync(); remindOpts();
  $('iStart').onchange = () => { if ($('iStart').value && (!$('iEnd').value || $('iEnd').value <= $('iStart').value)) $('iEnd').value = pad(Math.min(23, +$('iStart').value.slice(0, 2) + 1)) + $('iStart').value.slice(2); };
  document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; document.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); });
  $('iFile').onchange = e => { pending = e.target.files[0] || null; $('iFileNote').textContent = pending ? '📎 ' + pending.name + ' will be saved with this.' : ''; };
  document.querySelectorAll('#iFiles [data-open]').forEach(a => a.onclick = ev => { ev.preventDefault(); openDoc(a.dataset.open); });
  if ($('iIcs')) $('iIcs').onclick = () => download((it.title || 'event').replace(/[^\w]+/g, '-') + '.ics', icsFor([it]), 'text/calendar');
  $('iCancel').onclick = closeModal;
  $('iSave').onclick = async () => {
    const title = $('iTitle').value.trim();
    if (!title) { toast('Type what it is.'); return; }
    if (kind === 'event' && !$('iDate').value) { toast('Pick the date.'); return; }
    if (pending && !signedIn()) { toast('Sign in (More) to attach files.'); return; }
    const allDay = kind === 'task' || $('iAllDay').checked || !$('iStart').value;
    Object.assign(it, { kind, title, date: $('iDate').value || null, endDate: kind === 'event' && $('iEndDate').value > $('iDate').value ? $('iEndDate').value : null, allDay, start: allDay ? '' : $('iStart').value, end: allDay ? '' : $('iEnd').value, repeat: $('iRepeat').value, list: $('iList').value, location: $('iLoc').value.trim(), priority: $('iPri').checked ? 2 : 0, notes: $('iNotes').value, color: kind === 'event' ? color : '', driver: kind === 'event' ? $('iDriver').value.trim() : '', remind: $('iRemind').value === '' ? null : Number($('iRemind').value) });
    if (!id) { it.id = uid(); it.done = false; it.sort = 0; data.items.push(it); }
    if (pending) {
      $('iSave').disabled = true; $('iSave').textContent = 'Uploading…';
      try { await addDoc(pending, { itemId: it.id, folder: it.list || '' }); } catch (e) { toast('Saved, but the file didn\'t upload: ' + e.message); }
    }
    window.save(); closeModal(); route();
    if (!id) toast('✓ Saved' + (it.date ? ' for ' + fmtDate(it.date, 'rel') : ''));
  };
  if (id) $('iDel').onclick = () => {
    if (!confirm('Delete “' + it.title + '”' + (it.repeat ? ' (every time it repeats)' : '') + '?')) return;
    data.items = data.items.filter(i => i.id !== id); window.save(); closeModal(); route();
  };
  // Quick add: a tracker icon or one of the usual events, on whatever date is picked.
  const qDate = () => $('iDate').value || today();
  document.querySelectorAll('#modalBody [data-qt]').forEach(b => b.onclick = () => {
    const t = trackers().find(x => x.id === b.dataset.qt);
    if (loggedOn(t.id, qDate())) { toast(t.icon + ' Already logged for ' + fmtDate(qDate(), 'rel')); return; }
    toggleTrack(t.id, qDate()); closeModal(); route();
  });
  document.querySelectorAll('#modalBody [data-qf]').forEach(b => b.onclick = () => {
    const f = freq[+b.dataset.qf], d = qDate();
    data.items.push(newItem({ kind: 'event', title: f.title, date: d, allDay: !f.start, start: f.start, end: f.end, location: f.location, color: f.color || COLORS[0], driver: f.driver || '' }));
    window.save(); closeModal(); route();
    toast('✓ ' + f.title + ' added for ' + fmtDate(d, 'rel') + (f.start ? ' at ' + fmtTime(f.start) : ''));
  });
  if (!id) setTimeout(() => $('iTitle').focus(), 60);
}
// The events that come up most often (in the planner and the connected calendars), with their usual time and place.
function frequentEvents() {
  const from = addDays(today(), -180), to = addDays(today(), 60), groups = {};
  const add = (e, color) => {
    const title = (e.title || '').trim(); if (!title || title === '(busy)' || title.length > 40) return;
    const k = title.toLowerCase(), g = groups[k] = groups[k] || { n: 0, list: [] };
    g.n++; g.list.push({ title, date: e.date, start: e.allDay ? '' : e.start || '', end: e.allDay ? '' : e.end || '', location: e.location || '', color: color || e.color || '', driver: e.driver || '' });
  };
  data.items.filter(i => i.kind === 'event' && i.date >= from && i.date <= to).forEach(i => add(i));
  (S().calendars || []).filter(c => c.on !== false).forEach(c => { const got = cache.get('cal_' + c.id); if (got) calendarOccurrences(got.events, from, to).forEach(e => add(e, c.color)); });
  const t = today();
  return Object.values(groups).filter(g => g.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8).map(g => {
    // Use the latest time it happened (or the next one, if it hasn't happened yet).
    const past = g.list.filter(x => x.date <= t).sort((a, b) => a.date < b.date ? 1 : -1);
    const f = past[0] || g.list.sort((a, b) => a.date < b.date ? -1 : 1)[0];
    // The most common time wins over a one-off change.
    const times = {}; g.list.forEach(x => { const k = x.start + '|' + x.end; times[k] = (times[k] || 0) + 1; });
    const [st, en] = Object.entries(times).sort((a, b) => b[1] - a[1])[0][0].split('|');
    return Object.assign({}, f, { start: st, end: en, location: f.location || (g.list.find(x => x.location) || {}).location || '' });
  });
}
// One-tap links that open Google or Outlook with the event filled in.
function googleLink(it) {
  const d = it.date.replace(/-/g, ''), t = s => s.replace(':', '') + '00';
  const dates = it.allDay || !it.start ? d + '/' + addDays(it.endDate || it.date, 1).replace(/-/g, '') : d + 'T' + t(it.start) + '/' + (it.endDate || it.date).replace(/-/g, '') + 'T' + t(it.end || it.start);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(it.title) + '&dates=' + dates + '&details=' + encodeURIComponent(it.notes || '') + '&location=' + encodeURIComponent(it.location || '') + '&ctz=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
}
function outlookLink(it) {
  const s = it.allDay || !it.start ? it.date : it.date + 'T' + it.start + ':00', e = it.allDay || !it.start ? addDays(it.endDate || it.date, 1) : (it.endDate || it.date) + 'T' + (it.end || it.start) + ':00';
  return 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=' + encodeURIComponent(it.title) + '&startdt=' + s + '&enddt=' + e + (it.allDay || !it.start ? '&allday=true' : '') + '&body=' + encodeURIComponent(it.notes || '') + '&location=' + encodeURIComponent(it.location || '');
}
function icsFor(items) {
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner//EN'];
  items.forEach(it => {
    L.push('BEGIN:VEVENT', 'UID:' + it.id + '@planner', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''));
    if (it.allDay || !it.start) L.push('DTSTART;VALUE=DATE:' + it.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(it.endDate || it.date, 1).replace(/-/g, ''));
    else L.push('DTSTART:' + it.date.replace(/-/g, '') + 'T' + it.start.replace(':', '') + '00', 'DTEND:' + (it.endDate || it.date).replace(/-/g, '') + 'T' + (it.end || it.start).replace(':', '') + '00');
    L.push('SUMMARY:' + e(it.title)); if (it.location) L.push('LOCATION:' + e(it.location)); if (it.notes) L.push('DESCRIPTION:' + e(it.notes));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

// ---------- Documents ----------
async function addDoc(file, extra) {
  const sb = client(), user = window.plannerSync && window.plannerSync.user();
  if (!sb || !user) throw new Error('Sign in first.');
  if (file.size > 50e6) throw new Error('That file is over 50 MB.');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-70);
  const path = user.id + '/' + uid() + '-' + safe;
  const { error } = await sb.storage.from(CFG.bucket || 'planner').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  const d = Object.assign({ id: uid(), title: file.name.replace(/\.[^.]+$/, ''), folder: '', file: path, fileName: file.name, size: file.size, itemId: null, note: '' }, extra || {});
  data.docs.push(d); window.save();
  return d;
}
async function openDoc(id) {
  const d = data.docs.find(x => x.id === id); if (!d) return;
  if (!signedIn()) { toast('Sign in to open files.'); return; }
  const w = window.open('', '_blank');
  const { data: r, error } = await client().storage.from(CFG.bucket || 'planner').createSignedUrl(d.file, 600);
  if (error) { if (w) w.close(); toast('Could not open: ' + error.message); return; }
  if (w) w.location = r.signedUrl; else location.href = r.signedUrl;
}
// Folders are paths like "Cecilia/School/Report cards"; settings.folders lists every folder (parents before children).
// A document's folder is the path it lives in ('' = not in a folder).
let fileFolder = '', fileFind = '';
const FOLDER_ICON = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4.5l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const folderList = () => S().folders || [];
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
const childFolders = p => folderList().filter(f => parentOf(f) === p).sort((a, b) => folderList().indexOf(a) - folderList().indexOf(b));
const inTree = (doc, p) => doc.folder === p || (doc.folder || '').startsWith(p + '/');
const topOf = p => p.split('/')[0];
// Keep the list tidy: every parent of a folder exists, no duplicates, parents before children.
// Nicknames, so searching "CC" or "Cece" also finds Cecilia (and the other way round).
const NICKNAMES = { Cecilia: ['CC', 'Cece'] };
const nicknames = () => Object.assign({}, NICKNAMES, S().nicknames || {});
function matchesName(text, q) {
  const t = String(text || '').toLowerCase(); q = q.toLowerCase().trim();
  if (t.includes(q)) return true;
  const word = w => new RegExp('(^|[^a-z])' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])').test(t);
  return Object.entries(nicknames()).some(([name, nicks]) => {
    const all = [name].concat(nicks);
    if (!all.some(n => n.toLowerCase() === q || (q.length >= 3 && n.toLowerCase().startsWith(q)))) return false;
    return all.some(word);
  });
}
function setFolders(list) {
  const out = [];
  list.forEach(f => { const parts = f.split('/').map(x => x.trim()).filter(Boolean); for (let k = 1; k <= parts.length; k++) { const p = parts.slice(0, k).join('/'); if (!out.includes(p)) out.push(p); } });
  S().folders = out; window.save();
}
function viewFiles() {
  if (fileFolder && !folderList().includes(fileFolder)) fileFolder = '';
  const q = fileFind.toLowerCase(), searching = !!q;
  const here = searching ? data.docs.filter(d => matchesName(d.title + ' ' + d.fileName + ' ' + d.note + ' ' + d.folder, q))
    : data.docs.filter(d => (d.folder || '') === fileFolder || (!fileFolder && d.folder && !folderList().includes(d.folder)));
  here.sort((a, b) => b.id.localeCompare(a.id));
  const subs = searching ? [] : childFolders(fileFolder);
  const crumbs = [['', 'All folders']].concat(fileFolder ? fileFolder.split('/').map((x, k, a) => [a.slice(0, k + 1).join('/'), x]) : []);
  const docRow = d => {
    const it = d.itemId && data.items.find(i => i.id === d.itemId);
    return '<div class="doc" data-doc="' + d.id + '"><span class="dicon"' + (d.folder ? ' style="--fc:' + pastel(topOf(d.folder))[0] + '"' : '') + '>' + esc(((d.fileName || '').match(/\.(\w{1,4})$/) || ['', 'FILE'])[1].toUpperCase()) + '</span><div class="who"><b>' + esc(d.title || d.fileName) + '</b><span class="sub">' + esc([searching ? d.folder.replace(/\//g, ' › ') : '', fileSize(d.size || 0), it ? 'with ' + it.title : ''].filter(Boolean).join(' · ')) + '</span></div><button type="button" class="linkish" data-dedit="' + d.id + '">Edit</button></div>';
  };
  $('view').innerHTML = notesTabs('files') + '<h1>Documents</h1>' + (signedIn() ? '' : '<p class="chip warn">Sign in (More) to upload and open documents.</p>') +
    '<p class="helper">Save photos, PDFs, Word and Excel files, and more. Copied a screenshot? Tap <b>📋 Paste</b> (or press Ctrl+V on a computer). You can also drag files onto this page. Everything stays private to your account.</p>' +
    '<input id="fFind" type="search" placeholder="Search all documents" value="' + esc(fileFind) + '">' +
    (searching ? '' : '<nav class="crumbs">' + crumbs.map(([p, n], k) => k === crumbs.length - 1 ? '<b>' + esc(n) + '</b>' : '<button type="button" class="linkish" data-ff="' + esc(p) + '">' + esc(n) + '</button><span>›</span>').join('') + '</nav>') +
    '<div class="row-actions"><label class="button file">Add files' + (fileFolder ? ' here' : '') + '<input type="file" id="fUp" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.pages,.numbers,.key,.rtf,image/*,application/pdf"></label><label class="button ghost file">Photos<input type="file" id="fPics" multiple hidden accept="image/*"></label><label class="button ghost file">Take a photo<input type="file" id="fCam" accept="image/*" capture="environment" hidden></label>' +
    '<button type="button" class="ghost" id="fPaste">📋 Paste</button><button type="button" class="ghost" id="fNew">＋ New folder' + (fileFolder ? ' inside' : '') + '</button>' + '<button type="button" class="ghost small" id="fSticky">📝 Sticky note</button>' + (fileFolder ? '<button type="button" class="ghost small" id="fMenu">⋯ This folder</button>' : '') + '</div>' +
    (!searching && /^Gift ideas/.test(fileFolder) ? '<a class="card pad tip" href="#gifts"><b>🎁 Gift planner</b><span class="sub">Who’s coming up, reminders and the buying guide →</span></a>' : '') +
    (!searching && stickiesIn(fileFolder).length ? '<div class="stickies">' + stickiesIn(fileFolder).map(i => stickyCard(i)).join('') + '</div>' : '') +
    (!searching && /\/Medical$/i.test(fileFolder) ? healthPanel(topOf(fileFolder)) + '<h3 class="filesh">' + esc(topOf(fileFolder)) + '’s medical files</h3>' : '') +
    (subs.length ? '<div class="fgrid">' + subs.map(f => {
      const n = data.docs.filter(d => inTree(d, f)).length, kids = childFolders(f).length, c = pastel(topOf(f));
      return '<button type="button" class="ftile" data-ff="' + esc(f) + '" style="--fc:' + c[0] + ';--fb:' + c[1] + '">' + FOLDER_ICON + '<b>' + esc(leafOf(f)) + '</b><span>' + (n ? n + (n === 1 ? ' file' : ' files') : 'Empty') + (kids ? ' · ' + kids + (kids === 1 ? ' folder' : ' folders') : '') + (stickiesIn(f).length ? ' · 📝' : '') + '</span></button>';
    }).join('') + '</div>' : '') +
    (here.length ? '<div class="card pad">' + (searching ? '<h3>' + here.length + ' found</h3>' : fileFolder && subs.length ? '<h3>Files in ' + esc(leafOf(fileFolder)) + '</h3>' : !fileFolder ? '<h3>Not in a folder</h3>' : '') + here.map(docRow).join('') + '</div>'
      : (!subs.length ? '<div class="card pad"><p class="helper">' + (searching ? 'Nothing matches.' : 'This folder is empty. Upload a file, or make a folder inside it.') + '</p></div>' : ''));
  $('view').querySelectorAll('[data-ff]').forEach(b => b.onclick = () => { fileFolder = b.dataset.ff; viewFiles(); window.scrollTo(0, 0); });
  $('fFind').oninput = e => { fileFind = e.target.value; clearTimeout(viewFiles.t); viewFiles.t = setTimeout(() => { viewFiles(); const f = $('fFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  const up = async e => {
    const fs = [...e.target.files]; if (!fs.length) return;
    let ok = 0; toast('Uploading ' + fs.length + '…');
    for (const f of fs) { try { await addDoc(f, { folder: fileFolder }); ok++; } catch (err) { toast(f.name + ': ' + err.message); } }
    if (ok) toast('✓ Uploaded ' + ok + (ok === 1 ? ' file' : ' files') + (fileFolder ? ' to ' + leafOf(fileFolder) : '') + '.');
    viewFiles();
  };
  $('fUp').onchange = up; $('fCam').onchange = up; $('fPics').onchange = up;
  $('fPaste').onclick = pasteButton;
  $('fNew').onclick = () => {
    const n = (prompt(fileFolder ? 'New folder inside “' + leafOf(fileFolder) + '”:' : 'New folder name:') || '').trim().replace(/\//g, '-');
    if (!n) return;
    const p = fileFolder ? fileFolder + '/' + n : n;
    if (folderList().includes(p)) { toast('That folder already exists.'); return; }
    const list = folderList().slice(), at = fileFolder ? Math.max(...list.map((f, k) => f === fileFolder || f.startsWith(fileFolder + '/') ? k : -1)) + 1 : list.length;
    list.splice(at, 0, p); setFolders(list); toast('✓ Folder “' + n + '” made'); viewFiles();
  };
  if ($('fMenu')) $('fMenu').onclick = () => folderMenu(fileFolder);
  if ($('fSticky')) $('fSticky').onclick = () => editSticky(null, fileFolder);
  wireStickies($('view'), viewFiles);
  if (/\/Medical$/i.test(fileFolder) && !searching) wireHealth($('view'), topOf(fileFolder));
  $('view').querySelectorAll('[data-doc]').forEach(r => r.onclick = e => { if (!e.target.dataset.dedit) openDoc(r.dataset.doc); });
  $('view').querySelectorAll('[data-dedit]').forEach(b => b.onclick = e => { e.stopPropagation(); editDoc(b.dataset.dedit); });
}
// Paste a screenshot (Snipping Tool, Print Screen, a copied photo) or drop files onto the Files page to save them here.
async function saveBlobs(files, how) {
  if (!files.length) return;
  if (!signedIn()) { toast('Sign in (More) to save files.'); return; }
  let ok = 0; toast((how || 'Saving') + ' ' + files.length + (files.length === 1 ? ' file' : ' files') + '…');
  for (let f of files) {
    if (!f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
      const n = new Date(), ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      f = new File([f], 'Screenshot ' + isoDay(n) + ' ' + pad(n.getHours()) + '.' + pad(n.getMinutes()) + '.' + pad(n.getSeconds()) + '.' + ext, { type: f.type || 'image/png' });
    }
    try { await addDoc(f, { folder: fileFolder }); ok++; } catch (err) { toast(f.name + ': ' + err.message); }
  }
  if (ok) toast('✓ Saved ' + ok + (ok === 1 ? ' file' : ' files') + (fileFolder ? ' to ' + leafOf(fileFolder) : '') + '. Tap Edit to rename.');
  if (location.hash.startsWith('#files')) viewFiles();
}
document.addEventListener('paste', e => {
  if (!location.hash.startsWith('#files') || !$('modal').hidden) return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!files.length) return;
  e.preventDefault(); saveBlobs(files, 'Pasting');
});
document.addEventListener('dragover', e => { if (location.hash.startsWith('#files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', e => {
  document.body.classList.remove('dropping');
  if (!location.hash.startsWith('#files')) return;
  e.preventDefault(); saveBlobs([...e.dataTransfer.files], 'Saving');
});
// The Paste button (iPhone/iPad and computers): asks the browser for what's on the clipboard.
async function pasteButton() {
  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read(), files = [];
      for (const it of items) { const type = it.types.find(t => t.startsWith('image/')) || it.types.find(t => t === 'application/pdf'); if (type) files.push(new File([await it.getType(type)], '', { type })); }
      if (files.length) { saveBlobs(files, 'Pasting'); return; }
      toast('There’s no picture on the clipboard. Copy a screenshot first.'); return;
    } catch (e) { /* fall through to the paste box */ }
  }
  openModal('<h2>Paste here</h2><div id="pasteBox" class="pastebox" contenteditable="true" aria-label="Paste area">Press and hold here, then tap <b>Paste</b> (or press Ctrl+V / ⌘V).</div><div class="row-actions"><button type="button" class="ghost" id="pbClose">Cancel</button></div>');
  $('pbClose').onclick = closeModal;
  const box = $('pasteBox'); box.focus();
  box.addEventListener('paste', e => { const files = [...(e.clipboardData ? e.clipboardData.files : [])]; e.preventDefault(); if (!files.length) { toast('That wasn’t a picture or file.'); return; } closeModal(); saveBlobs(files, 'Pasting'); });
}
// ---------- Gifts: birthdays and anniversaries ----------
// Found on every calendar by name ("Mia’s birthday", "Birthday - Dad", "Our anniversary"). Each person gets a folder under Gift ideas,
// and gift reminders become tasks (so they also ring on the phone through the planner feed).
const FAMILY = ['Cecilia', 'Salvador', 'Shaana', 'Elisha'];
function occasionOf(e) {
  if (e.kind === 'task' || e.src === 'bill' || e.src === 'band') return null;
  const t = e.title || '', anniv = /anniversary/i.test(t), bday = /\b(birthday|bday|b-day)\b|🎂/i.test(t);
  if (!anniv && !bday) return null;
  let n = t.replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, ' ').replace(/[’']s\b/gi, '')
    .replace(/\b(happy|birthday|bday|b-day|anniversary|wedding|party|celebration|dinner|lunch|day|of|the|for|to|and)\b/gi, m => /^and$/i.test(m) ? '&' : ' ')
    .replace(/\b\d+(st|nd|rd|th)?\b/gi, ' ').replace(/[()\-–—:!.,#|/]/g, ' ').replace(/\s*&\s*$|^\s*&\s*/g, '').replace(/\s+/g, ' ').trim();
  n = n.replace(/^(our|my|us)\b\s*/i, '').trim();
  if (!n) { if (!anniv) return null; n = ''; }
  if (n.length > 30) return null;
  n = n.replace(/\b\w/g, c => c.toUpperCase());
  const full = Object.entries(nicknames()).find(([name, nicks]) => nicks.some(x => x.toLowerCase() === n.toLowerCase())); if (full) n = full[0];
  return { type: anniv ? 'anniversary' : 'birthday', name: n, date: e.date, title: t,
    folder: n || 'Anniversary', label: anniv ? (n ? n + '’s anniversary' : 'your anniversary') : n + '’s birthday', icon: anniv ? '💍' : '🎂' };
}
function occasions(from, to) {
  const seen = new Set();
  return agenda(from, to).map(occasionOf).filter(o => { if (!o) return false; const k = o.folder.toLowerCase() + o.date; if (seen.has(k)) return false; seen.add(k); return true; });
}
const giftSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function giftCheck() {
  const t = today(); let changed = false;
  // A Gift ideas folder for the family and for everyone with a birthday or anniversary in the next year.
  const people = [...new Set(FAMILY.concat(occasions(t, addDays(t, 366)).map(o => o.folder)))];
  const want = ['Gift ideas'].concat(people.map(n => 'Gift ideas/' + n)).filter(f => !folderList().some(x => x.toLowerCase() === f.toLowerCase()));
  if (want.length) { setFolders(folderList().concat(want)); changed = true; }
  if (S().giftReminders !== false) {
    const made = Object.assign({}, S().giftMade || {}), lead = S().giftLead || 14;
    occasions(addDays(t, 1), addDays(t, 60)).forEach(o => {
      const key = giftSlug(o.folder) + '-' + o.date;
      [['buy', '🎁 Buy a gift for ' + o.label, addDays(o.date, -lead), 2], ['wrap', '🎀 Wrap it + get a card for ' + o.label, addDays(o.date, -2), 0]].forEach(([k, title, due, pri]) => {
        const id = 'gift-' + k + '-' + key;
        if (made[id] || data.items.some(i => i.id === id)) return;
        data.items.push(newItem({ id, kind: 'task', title, date: due < t ? t : due, list: 'Gifts', priority: pri,
          notes: o.icon + ' ' + o.label + ' is ' + fmtDate(o.date) + '.\nIdeas: Files → Gift ideas → ' + o.folder + '\nBuying guide: Today → More → Gifts' }));
        made[id] = o.date; changed = true;
      });
    });
    Object.keys(made).forEach(k => { if (made[k] < addDays(t, -60)) delete made[k]; });
    S().giftMade = made;
    if (changed && !S().lists.includes('Gifts')) S().lists = S().lists.concat('Gifts');
  }
  if (changed) window.save();
}
const giftIdeas = folder => stickiesIn('Gift ideas/' + folder).concat(data.docs.filter(d => d.folder === 'Gift ideas/' + folder));
function giftCard() {
  const t = today(), soon = occasions(t, addDays(t, 21));
  if (!soon.length) return '';
  return '<a class="card pad giftcard" href="#gifts"><h2>🎁 Coming up</h2>' + soon.slice(0, 4).map(o => { const n = daysBetween(t, o.date), ideas = giftIdeas(o.folder).length;
    return '<div class="mini-row"><span>' + o.icon + ' <b>' + esc(o.label.charAt(0).toUpperCase() + o.label.slice(1)) + '</b></span><span class="sub">' + (n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days') + (ideas ? ' · ' + ideas + (ideas === 1 ? ' idea' : ' ideas') : ' · no ideas yet') + '</span></div>'; }).join('') + '</a>';
}
const GIFT_GUIDE = [
  ['3 weeks before', 'Think: what have they mentioned wanting? What are they into right now? Jot ideas on a sticky note in their Gift ideas folder.'],
  ['2 weeks before', 'Pick one and set a budget. Order online now so shipping isn’t a worry (Walmart pickup works for last-minute).'],
  ['1 week before', 'Grab a card, gift bag or wrapping paper. Plan the day: dinner, cake, who’s coming.'],
  ['2 days before', 'Wrap it, sign the card, and put it somewhere you won’t forget.']
];
const GIFT_STARTERS = ['Something they said they wanted', 'An experience: tickets, a class, a day out', 'Personalized: name, photo, initials', 'Their hobby: band, sports, crafts, books', 'Treats: favorite snacks, candy, coffee', 'Practical upgrade: something they use every day', 'Time together: a planned outing with you', 'Gift card to their favorite place'];
function viewGifts() {
  const t = today(), list = occasions(t, addDays(t, 120)), lead = S().giftLead || 14;
  const taskFor = (k, o) => data.items.find(i => i.id === 'gift-' + k + '-' + giftSlug(o.folder) + '-' + o.date);
  $('view').innerHTML = '<a class="back" href="#today">‹ Today</a><h1>Gifts</h1>' +
    '<p class="helper">Birthdays and anniversaries are picked up from all your calendars. Each person has a folder in <b>Files → Gift ideas</b> for ideas, links and photos.</p>' +
    '<div class="row-actions"><button type="button" id="gAdd">＋ Add a birthday or anniversary</button><a class="button ghost" href="#files" id="gFolder">📁 Gift ideas folder</a></div>' +
    '<h3 class="filesh">Coming up</h3>' +
    (list.length ? list.map((o, k) => {
      const n = daysBetween(t, o.date), ideas = giftIdeas(o.folder), buy = taskFor('buy', o), wrap = taskFor('wrap', o);
      const first = ideas.find(i => i.kind === 'sticky');
      const q = first ? (first.notes || '').split('\n')[0] : 'gift ideas';
      return '<div class="card pad gift"><div class="mini-head"><h2>' + o.icon + ' ' + esc(o.label.charAt(0).toUpperCase() + o.label.slice(1)) + '</h2><span class="chip">' + (n === 0 ? 'Today!' : n === 1 ? 'Tomorrow' : 'in ' + n + ' days') + '</span></div>' +
        '<p class="sub">' + esc(fmtDate(o.date, 'long')) + '</p>' +
        '<div class="gsteps">' + [['💡', 'Ideas', ideas.length > 0], ['🎁', 'Bought', buy && buy.done], ['🎀', 'Wrapped', wrap && wrap.done]].map(([i, l, on]) => '<span class="gstep' + (on ? ' on' : '') + '">' + i + ' ' + l + (on ? ' ✓' : '') + '</span>').join('') + '</div>' +
        (ideas.length ? '<div class="stickies">' + ideas.filter(i => i.kind === 'sticky').map(i => stickyCard(i)).join('') + '</div>' + (ideas.some(i => i.kind !== 'sticky') ? '<p class="helper">+ ' + ideas.filter(i => i.kind !== 'sticky').length + ' saved files in the folder</p>' : '') : '<p class="helper">No ideas yet.</p>') +
        '<div class="row-actions"><button type="button" class="small" data-gidea="' + esc(o.folder) + '">💡 Add idea</button>' +
        (buy ? '<button type="button" class="ghost small" data-gdone="' + buy.id + '">' + (buy.done ? '✓ Bought' : 'Mark bought') + '</button>' : '') +
        (wrap ? '<button type="button" class="ghost small" data-gdone="' + wrap.id + '">' + (wrap.done ? '✓ Wrapped' : 'Mark wrapped') + '</button>' : '') +
        '<a class="button ghost small" target="_blank" rel="noopener" href="https://www.walmart.com/search?q=' + encodeURIComponent(q) + '">🛒 Walmart</a>' +
        '<a class="button ghost small" target="_blank" rel="noopener" href="https://www.amazon.com/s?k=' + encodeURIComponent(q) + '">Amazon</a>' +
        '<a class="button ghost small" href="#files" data-gf="' + esc(o.folder) + '">📁 Folder</a></div></div>';
    }).join('') : '<div class="card pad"><p class="helper">No birthdays or anniversaries in the next 4 months. Add one above, or put “Birthday” in the event name on any calendar.</p></div>') +
    '<div class="card pad guide"><h2>🎁 Present buying guide</h2>' + GIFT_GUIDE.map(([w, d]) => '<div class="gline"><b>' + w + '</b><span>' + d + '</span></div>').join('') +
      '<h3>Idea starters</h3><ul class="starters">' + GIFT_STARTERS.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="card pad"><h2>Reminders</h2><label class="check"><input type="checkbox" id="gOn"' + (S().giftReminders !== false ? ' checked' : '') + '> Add gift reminders to my tasks</label>' +
      '<label>Remind me to buy<select id="gLead">' + [[7, '1 week before'], [14, '2 weeks before'], [21, '3 weeks before'], [28, '4 weeks before']].map(([v, l]) => '<option value="' + v + '"' + (v === lead ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<p class="helper">You get two tasks for each one: “Buy a gift” and, 2 days before, “Wrap it + get a card”. They show in Tasks (list: Gifts) and ring on your phone at 9 AM. New reminders use the time you pick here.</p></div>';
  $('gAdd').onclick = () => editItem(null, { kind: 'event', title: 'Birthday: ', allDay: true, repeat: 'yearly', color: '#d1a3a4' });
  $('gFolder').onclick = () => { fileFolder = 'Gift ideas'; fileFind = ''; };
  $('view').querySelectorAll('[data-gf]').forEach(a => a.onclick = () => { fileFolder = 'Gift ideas/' + a.dataset.gf; fileFind = ''; });
  $('view').querySelectorAll('[data-gidea]').forEach(b => b.onclick = () => editSticky(null, 'Gift ideas/' + b.dataset.gidea, viewGifts, { color: 'pink' }));
  $('view').querySelectorAll('[data-gdone]').forEach(b => b.onclick = () => { const it = data.items.find(i => i.id === b.dataset.gdone); if (!it) return; it.done = !it.done; window.save(); if (it.done) celebrate(b); viewGifts(); });
  $('gOn').onchange = e => { S().giftReminders = e.target.checked; window.save(); if (e.target.checked) giftCheck(); viewGifts(); };
  $('gLead').onchange = e => { S().giftLead = +e.target.value; window.save(); };
  wireStickies($('view'), viewGifts);
}
// ---------- Sticky notes ----------
// A sticky is a planner item (kind 'sticky'): notes = the text, list = its folder ('' = general), color = paper color.
const STICKY_COLORS = { yellow: '#fbefb4', lemon: '#fff6cf', peach: '#fbe2cb', coral: '#f6cbbf', pink: '#f8dcd8', rose: '#f2c9d6', lilac: '#e7def0', sky: '#cfe3f6', blue: '#d8e7ee', mint: '#d3efe4', green: '#e0ecd6', sage: '#cfdcc7' };
const stickiesIn = p => data.items.filter(i => i.kind === 'sticky' && !i.date && (i.list || '') === p).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id.localeCompare(b.id));
function stickyCard(it, showFolder) {
  const lines = (it.notes || '').split('\n'), many = lines.filter(l => l.trim()).length > 1;
  return '<div class="sticky" data-sticky="' + esc(it.id) + '" role="button" title="Tap to edit" style="--sn:' + (STICKY_COLORS[it.color] || STICKY_COLORS.yellow) + '">' +
    (showFolder && it.list ? '<span class="sfold">' + esc(it.list.replace(/\//g, ' › ')) + '</span>' : '') +
    lines.map((l, k) => {
      const t = l.trim(); if (!t) return '<div class="sgap"></div>';
      const m = /^([^:]{1,25}):\s+(.+)$/.exec(t), val = m ? m[2] : t;
      const em = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(val), ph = /^[\d\s().+-]{7,}$/.test(val) && /\d{7}/.test(val.replace(/\D/g, ''));
      const pre = esc(t.slice(0, t.length - val.length));
      const shown = em ? pre + '<a href="mailto:' + esc(val) + '">' + esc(val) + '</a>' : ph ? pre + '<a href="tel:' + esc(val.replace(/[^\d+]/g, '')) + '">' + esc(val) + '</a>' : esc(t);
      const copy = em || ph || (!/\s/.test(val) && val.length >= 4 && /\d/.test(val));
      return '<div class="sline' + (k === 0 && many ? ' stitle' : '') + '"><span>' + shown + '</span>' + (copy ? '<button type="button" class="scopy" data-copy="' + esc(val) + '" title="Copy">⧉</button>' : '') + '</div>';
    }).join('') + '</div>';
}
function wireStickies(root, redraw) {
  root.querySelectorAll('[data-sticky]').forEach(b => b.onclick = () => editSticky(b.dataset.sticky, null, redraw));
  root.querySelectorAll('.sticky a').forEach(a => a.onclick = e => e.stopPropagation());
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied ' + b.dataset.copy); } catch (err) { toast('Couldn’t copy. Press and hold to select it.'); } });
}
function editSticky(id, folder, redraw, preset) {
  const it = id ? data.items.find(i => i.id === id) : Object.assign({ notes: '', list: folder || '', color: 'yellow' }, preset || {});
  if (!it) return;
  let color = STICKY_COLORS[it.color] ? it.color : 'yellow';
  openModal('<h2>📝 ' + (id ? 'Sticky note' : 'New sticky note') + '</h2>' +
    '<textarea id="snText" rows="8" placeholder="First line is the title&#10;ID: 123456&#10;email@school.edu">' + esc(it.notes) + '</textarea>' +
    '<p class="lbl">Color</p><div class="colors">' + Object.entries(STICKY_COLORS).map(([k, c]) => '<button type="button" class="cdot' + (k === color ? ' on' : '') + '" data-sc="' + k + '" style="background:' + c + '"></button>').join('') + '</div>' +
    (it.date ? '<p class="helper">On the daily page for ' + esc(fmtDate(it.date)) + ' (' + (it.location === 'left' ? 'left' : 'right') + ' side).</p><select id="snFolder" hidden><option value="" selected></option></select>' : '<label>Folder<select id="snFolder"><option value="">General (no folder)</option>' + folderOptions(it.list).replace('<option value="">— not in a folder —</option>', '') + '</select></label>') +
    '<div class="row-actions"><button type="button" id="snSave">Save</button><button type="button" class="ghost" id="snCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="snDel">Delete</button>' : '') + '</div>');
  const done = () => { window.save(); closeModal(); (redraw || route)(); };
  document.querySelectorAll('#modalBody [data-sc]').forEach(b => b.onclick = () => { color = b.dataset.sc; document.querySelectorAll('#modalBody [data-sc]').forEach(x => x.classList.toggle('on', x === b)); });
  $('snSave').onclick = () => {
    const text = $('snText').value.trim(); if (!text) { toast('Type something on it.'); return; }
    Object.assign(it, { notes: text, title: text.split('\n')[0].slice(0, 80), list: $('snFolder').value, color });
    if (!id) data.items.push(newItem(Object.assign({ kind: 'sticky', sort: Math.max(0, ...data.items.filter(i => i.kind === 'sticky').map(i => i.sort || 0)) + 1 }, it)));
    done();
  };
  $('snCancel').onclick = closeModal;
  if (id) $('snDel').onclick = () => { if (!confirm('Delete this sticky note?')) return; data.items = data.items.filter(i => i !== it); done(); };
  setTimeout(() => $('snText').focus(), 60);
}
// Sticky notes on the daily planner page, on the left or right side. Tap a color to start one in that color.
function dayStickies(d, side) {
  const list = data.items.filter(i => i.kind === 'sticky' && i.date === d && (i.location || 'right') === side).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const quick = side === 'left' ? ['yellow', 'pink', 'mint', 'sky'] : ['peach', 'lilac', 'green', 'coral'];
  return '<div class="daysticks">' + (list.length ? '<div class="stickies">' + list.map(i => stickyCard(i)).join('') + '</div>' : '') +
    '<div class="dsadd"><button type="button" class="ghost small" data-dsadd="' + side + '">📝 Sticky note</button>' +
    quick.map(c => '<button type="button" class="dsdot" data-dsadd="' + side + '" data-dscolor="' + c + '" style="background:' + STICKY_COLORS[c] + '" aria-label="' + c + ' sticky note"></button>').join('') + '</div></div>';
}
// Switch between the folders and the board of notes.
const notesTabs = on => '<div class="segs ntabs"><a class="seg' + (on === 'files' ? ' on' : '') + '" href="#files">📁 Folders</a><a class="seg' + (on === 'notes' ? ' on' : '') + '" href="#notes">📝 Notes</a></div>';
let noteFind = '';
function viewNotes() {
  const q = noteFind.trim(), found = data.items.filter(i => i.kind === 'sticky' && (!q || matchesName(i.notes + ' ' + i.list, q)));
  const all = found.filter(i => !i.date), dayNotes = found.filter(i => i.date).sort((a, b) => b.date.localeCompare(a.date));
  const groups = [''].concat(folderList()).concat([...new Set(all.map(i => i.list || ''))].filter(f => f && !folderList().includes(f)));
  const empty = folderList().filter(f => !f.includes('/') && !stickiesIn(f).length);
  $('view').innerHTML = notesTabs('notes') + '<h1>Notes</h1>' +
    '<p class="helper">Sticky notes for quick info: ID numbers, school emails, schedules, codes. Put one in a folder, or keep it here in General. Tap a note to change it.</p>' +
    '<div class="row-actions"><button type="button" id="nNew">＋ New note</button></div>' +
    '<input id="nFind" type="search" placeholder="Search notes" value="' + esc(noteFind) + '">' +
    groups.map(g => { const list = all.filter(i => (i.list || '') === g).sort((a, b) => (a.sort || 0) - (b.sort || 0)); if (!list.length && g) return '';
      return '<section class="nsec"><div class="mini-head"><h2>' + (g ? '<a href="#files" data-nf="' + esc(g) + '">📁 ' + esc(g.replace(/\//g, ' › ')) + '</a>' : 'General') + '</h2><button type="button" class="ghost small" data-nadd="' + esc(g) + '">＋</button></div>' +
        (list.length ? '<div class="stickies">' + list.map(i => stickyCard(i)).join('') + '</div>' : '<p class="helper">' + (q ? 'Nothing matches.' : 'No general notes yet.') + '</p>') + '</section>'; }).join('') +
    (dayNotes.length ? '<section class="nsec"><div class="mini-head"><h2>📅 On the daily planner</h2></div><div class="stickies">' + dayNotes.map(i => '<div><a class="sdate" href="#calendar" data-ndate="' + i.date + '">' + esc(fmtDate(i.date)) + '</a>' + stickyCard(i) + '</div>').join('') + '</div></section>' : '') +
    (!q && empty.length ? '<div class="card pad"><h3>Add a note to a folder</h3><div class="chips">' + empty.map(f => '<button type="button" class="ghost small" data-nadd="' + esc(f) + '">＋ ' + esc(f) + '</button>').join('') + '</div></div>' : '');
  $('nNew').onclick = () => editSticky(null, '', viewNotes);
  $('view').querySelectorAll('[data-nadd]').forEach(b => b.onclick = () => editSticky(null, b.dataset.nadd, viewNotes));
  $('view').querySelectorAll('[data-ndate]').forEach(a => a.onclick = () => { calDay = a.dataset.ndate; calMode = 'day'; });
  $('view').querySelectorAll('[data-nf]').forEach(a => a.onclick = () => { fileFolder = a.dataset.nf; fileFind = ''; });
  $('nFind').oninput = e => { noteFind = e.target.value; clearTimeout(viewNotes.t); viewNotes.t = setTimeout(() => { viewNotes(); const f = $('nFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  wireStickies($('view'), viewNotes);
}
function folderMenu(p) {
  const n = data.docs.filter(d => inTree(d, p)).length, sub = folderList().filter(f => f.startsWith(p + '/')).length;
  const moveTo = folderList().filter(f => f !== p && !f.startsWith(p + '/') && f !== parentOf(p));
  openModal('<h2>' + esc(leafOf(p)) + '</h2><p class="helper">' + esc(p.replace(/\//g, ' › ')) + ' · ' + n + (n === 1 ? ' file' : ' files') + (sub ? ' · ' + sub + ' folders inside' : '') + '</p>' +
    '<label>Rename<input id="fmName" value="' + esc(leafOf(p)) + '"></label>' +
    '<label>Move into<select id="fmMove"><option value="__keep">— keep where it is —</option>' + (parentOf(p) ? '<option value="">Top level</option>' : '') + moveTo.map(f => '<option value="' + esc(f) + '">' + esc(f.replace(/\//g, ' › ')) + '</option>').join('') + '</select></label>' +
    '<div class="row-actions"><button type="button" id="fmSave">Save</button><button type="button" class="ghost" id="fmCancel">Cancel</button><button type="button" class="danger" id="fmDel">Delete folder</button></div>' +
    '<p class="helper">Deleting a folder keeps its files: they move up to ' + esc(parentOf(p) ? leafOf(parentOf(p)) : 'the top level') + '.</p>');
  $('fmCancel').onclick = closeModal;
  $('fmSave').onclick = () => {
    const name = $('fmName').value.trim().replace(/\//g, '-'), mv = $('fmMove').value;
    if (!name) { toast('Give it a name.'); return; }
    const np = (mv === '__keep' ? parentOf(p) : mv) ? (mv === '__keep' ? parentOf(p) : mv) + '/' + name : name;
    if (np !== p && folderList().includes(np)) { toast('There’s already a folder there with that name.'); return; }
    const swap = f => f === p ? np : f.startsWith(p + '/') ? np + f.slice(p.length) : f;
    setFolders(folderList().map(swap));
    data.docs.forEach(d => { if (d.folder) d.folder = swap(d.folder); });
    data.items.forEach(i => { if (i.kind === 'sticky' && i.list) i.list = swap(i.list); });
    window.save();
    fileFolder = np; closeModal(); viewFiles();
  };
  $('fmDel').onclick = () => {
    if (!confirm('Delete the folder “' + leafOf(p) + '”' + (sub ? ' and the ' + sub + ' folders inside it' : '') + '? Its files move up, nothing is deleted.')) return;
    const up = parentOf(p);
    data.docs.forEach(d => { if (inTree(d, p)) d.folder = up; });
    data.items.forEach(i => { if (i.kind === 'sticky' && (i.list === p || (i.list || '').startsWith(p + '/'))) i.list = up; });
    setFolders(folderList().filter(f => f !== p && !f.startsWith(p + '/'))); fileFolder = up; closeModal(); viewFiles();
  };
}
function folderOptions(sel) {
  return '<option value="">— not in a folder —</option>' + folderList().map(f => '<option value="' + esc(f) + '"' + (f === sel ? ' selected' : '') + '>' + '  '.repeat(f.split('/').length - 1) + (f.includes('/') ? '└ ' : '') + esc(leafOf(f)) + '</option>').join('');
}
function editDoc(id) {
  const d = data.docs.find(x => x.id === id); if (!d) return;
  const items = data.items.filter(i => i.kind !== 'note' && i.kind !== 'sticky').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80);
  openModal('<h2>Document</h2><label>Name<input id="dTitle" value="' + esc(d.title) + '"></label>' +
    '<label>Folder<select id="dFolder">' + folderOptions(d.folder) + '</select></label>' +
    '<label>Goes with<select id="dItem"><option value="">— nothing —</option>' + items.map(i => '<option value="' + i.id + '"' + (i.id === d.itemId ? ' selected' : '') + '>' + esc(i.title + (i.date ? ' (' + fmtDate(i.date) + ')' : '')) + '</option>').join('') + '</select></label>' +
    '<label>Note<textarea id="dNote" rows="2">' + esc(d.note) + '</textarea></label><p class="helper">' + esc(d.fileName) + ' · ' + fileSize(d.size || 0) + '</p>' +
    '<div class="row-actions"><button type="button" id="dSave">Save</button><button type="button" class="ghost" id="dOpen">Open</button><button type="button" class="danger" id="dDel">Delete</button></div>');
  $('dSave').onclick = () => { Object.assign(d, { title: $('dTitle').value.trim() || d.fileName, folder: $('dFolder').value, itemId: $('dItem').value || null, note: $('dNote').value }); window.save(); closeModal(); route(); };
  $('dOpen').onclick = () => openDoc(id);
  $('dDel').onclick = async () => {
    if (!confirm('Delete ' + (d.title || d.fileName) + '?')) return;
    data.docs = data.docs.filter(x => x !== d); window.save(); closeModal(); route();
    try { await client().storage.from(CFG.bucket || 'planner').remove([d.file]); } catch (e) {}
  };
}

// ---------- Meals, recipes and the shopping list ----------
// Stored as planner items (so they sync like everything else), using these fields:
//   recipe: title, notes = ingredients (one per line), location = recipe link, list = meal type
//   meal:   date, list = slot (Breakfast/Lunch/Dinner/Snack), title = what's for that meal, location = recipe id
//   shop:   title = item, done = in the cart, list = aisle, notes = amounts and which meals, location = Walmart product link
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const AISLES = [
  ['Produce', /lettuce|tomato|onion|garlic|pepper|potato|carrot|celery|banana|apple|berr|grape|lemon|lime|avocado|cilantro|spinach|broccoli|corn|cucumber|fruit|vegetable|salad|mushroom|zucchini|green bean|orange|herb|parsley|jalape/i],
  ['Meat & seafood', /beef|chicken|pork|turkey|sausage|bacon|ham|steak|shrimp|fish|salmon|tuna|ground|hot dog|pepperoni|meat/i],
  ['Dairy & eggs', /milk|cheese|butter|egg|yogurt|cream|sour cream|half.and.half|creamer/i],
  ['Bakery & bread', /bread|bun|tortilla|roll|bagel|muffin|biscuit|croissant|pita/i],
  ['Frozen', /frozen|ice cream|pizza|fries|tater|waffle/i],
  ['Pantry', /rice|pasta|spaghetti|noodle|sauce|bean|soup|broth|stock|flour|sugar|oil|vinegar|spice|seasoning|salt|pepper|cereal|oat|peanut butter|jelly|syrup|can|taco shell|chip|cracker|ketchup|mustard|mayo|dressing|honey|pancake mix|salsa|cookie|snack|granola/i],
  ['Drinks', /water|soda|juice|coffee|tea|gatorade|drink/i],
  ['Household', /paper|towel|toilet|soap|detergent|trash|foil|wrap|bag|dish|cleaner|wipes|shampoo|toothpaste|diaper|napkin|plate|cup/i]
];
// Canned/boxed things are pantry and "garlic bread" is bakery, so those are checked before produce.
const AISLE_CHECK = ['Frozen', 'Bakery & bread', 'Pantry*', 'Meat & seafood', 'Dairy & eggs', 'Produce', 'Pantry', 'Drinks', 'Household'];
const PANTRY_FIRST = /peanut butter|cream of|\bcans?\b|canned|jar|packets?|box(ed)?|seasoning|sauce|\bmix\b|diced|crushed|dried|broth/i;
function aisleOf(text) {
  for (const a of AISLE_CHECK) {
    if (a === 'Pantry*') { if (PANTRY_FIRST.test(text)) return 'Pantry'; continue; }
    if (AISLES.find(x => x[0] === a)[1].test(text)) return a;
  }
  return 'Other';
}
const AISLE_ORDER = AISLES.map(a => a[0]).concat(['Other']);
// "2 lb ground beef" → "Ground beef" (amount kept separately).
function ingredientName(line) {
  const t = String(line).replace(/\(.*?\)/g, ' ').trim();
  const name = t.replace(/^[\d\s\/.,½¼¾⅓⅔⅛-]+/, '').replace(/^(cups?|c\.|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|cans?|pkgs?|packages?|packets?|bags?|boxes?|jars?|bunch(es)?|cloves?|heads?|large|small|medium|dozen|slices?|sticks?|bottles?|containers?|pints?|quarts?|gallons?|loaf|loaves)\.?\s+(of\s+)?/i, '').replace(/,.*$/, '').trim();
  return (name || t).charAt(0).toUpperCase() + (name || t).slice(1);
}
const amountOf = line => (String(line).match(/^[\d\s\/.,½¼¾⅓⅔⅛-]+(?:\s*(?:cups?|c\.|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|cans?|pkgs?|packages?|packets?|bags?|boxes?|jars?|bunch(?:es)?|cloves?|heads?|dozen|slices?|sticks?|bottles?|containers?|pints?|quarts?|gallons?|loaf|loaves)\.?)?/i) || [''])[0].trim();
const walmartUrl = item => item.location && /^https:\/\/(www\.)?walmart\.com\//i.test(item.location) ? item.location : 'https://www.walmart.com/search?q=' + encodeURIComponent(item.title);

const STARTER_RECIPES = [
  ['Tacos', 'Dinner', '1 lb ground beef\n1 packet taco seasoning\n12 taco shells\n1 head lettuce\n2 tomatoes\n8 oz shredded cheese\nSour cream\nSalsa'],
  ['Spaghetti & meat sauce', 'Dinner', '1 lb spaghetti\n1 lb ground beef\n1 jar pasta sauce\nParmesan cheese\nGarlic bread'],
  ['Crockpot chili', 'Dinner', '2 lb ground beef\n2 cans chili beans\n1 can diced tomatoes\n1 onion\n1 packet chili seasoning\nShredded cheese\nCrackers'],
  ['Sheet-pan chicken & veggies', 'Dinner', '2 lb chicken breasts\n1 lb baby potatoes\n1 bag broccoli\nOlive oil\nItalian seasoning'],
  ['Chicken & rice', 'Dinner', '2 lb chicken thighs\n2 cups rice\n1 can cream of chicken soup\n1 bag frozen mixed vegetables'],
  ['Grilled cheese & tomato soup', 'Lunch', '1 loaf bread\n1 pack sliced cheese\nButter\n2 cans tomato soup'],
  ['Breakfast burritos', 'Breakfast', '1 dozen eggs\n1 lb breakfast sausage\n10 tortillas\n8 oz shredded cheese\nSalsa'],
  ['Pancakes & bacon', 'Breakfast', '1 box pancake mix\n1 lb bacon\nSyrup\nMilk\nButter'],
  ['Sandwiches', 'Lunch', '1 loaf bread\n1 lb deli turkey\n1 pack sliced cheese\nLettuce\nChips'],
  ['Fruit & yogurt', 'Snack', 'Yogurt\nGranola\nBerries\nBananas']
];
const recipes = () => data.items.filter(i => i.kind === 'recipe').sort((a, b) => a.title.localeCompare(b.title));
const mealsOn = d => data.items.filter(i => i.kind === 'meal' && i.date === d).sort((a, b) => SLOTS.indexOf(a.list) - SLOTS.indexOf(b.list));
const newItem = o => Object.assign({ id: uid(), kind: 'task', title: '', date: null, endDate: null, start: '', end: '', allDay: true, done: false, list: '', priority: 0, notes: '', location: '', repeat: '', color: '', sort: 0 }, o);

// Small summaries used on Today and the calendar.
function mealsLine(d, compact) {
  const ms = mealsOn(d); if (!ms.length) return '';
  return '<div class="mealline">' + ms.map(m => '<button type="button" class="mchip" data-meal="' + esc(m.list) + '" data-mealdate="' + d + '"><i>' + esc(compact ? m.list.charAt(0) : m.list) + '</i>' + esc(m.title) + '</button>').join('') + '</div>';
}
function mealsCard(d) {
  const ms = mealsOn(d);
  return '<div class="card pad meals-today"><div class="mini-head"><h2>Meals</h2><a class="linkish" href="#meals">Plan the week</a></div>' +
    SLOTS.map(s => { const m = ms.find(x => x.list === s); return '<button type="button" class="mslot' + (m ? ' set' : '') + '" data-meal="' + s + '" data-mealdate="' + d + '"><span>' + s + '</span><b>' + esc(m ? m.title : '+ Add') + '</b></button>'; }).join('') + '</div>';
}

// ---------- Meal plan (the week) ----------
let mealWeek = '';
function viewMeals(sub) {
  if (sub === 'recipes') return viewRecipes();
  if (sub === 'shop') return viewShop();
  if (!mealWeek) mealWeek = weekStart(today());
  const days = [0, 1, 2, 3, 4, 5, 6].map(k => addDays(mealWeek, k));
  const planned = data.items.filter(i => i.kind === 'meal' && i.date >= days[0] && i.date <= days[6]).length;
  $('view').innerHTML = mealTabs('plan') +
    '<div class="cal-head"><button type="button" class="ghost small" id="mPrev">‹</button><h2>' + esc(weekTitle(mealWeek)) + '</h2><button type="button" class="ghost small" id="mNext">›</button></div>' +
    '<div class="row-actions center"><button type="button" id="mShop">Add ingredients to shopping list</button><button type="button" class="ghost small" id="mCopy">Copy last week</button></div>' +
    '<p class="helper center">' + planned + ' meals planned · tap any slot to fill it</p>' +
    days.map(d => {
      const dt = new Date(d + 'T12:00'), ms = mealsOn(d);
      return '<div class="card pad mealday' + (d === today() ? ' today' : '') + '"><div class="mini-head"><h2>' + dt.toLocaleDateString([], { weekday: 'long' }) + ' <small>' + dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</small></h2></div>' +
        '<div class="mslots">' + SLOTS.map(s => { const m = ms.find(x => x.list === s); return '<button type="button" class="mslot' + (m ? ' set' : '') + (s === 'Dinner' ? ' main' : '') + '" data-meal="' + s + '" data-mealdate="' + d + '"><span>' + s + '</span><b>' + esc(m ? m.title : '+') + '</b></button>'; }).join('') + '</div></div>';
    }).join('');
  $('mPrev').onclick = () => { mealWeek = addDays(mealWeek, -7); viewMeals(); };
  $('mNext').onclick = () => { mealWeek = addDays(mealWeek, 7); viewMeals(); };
  $('view').querySelectorAll('[data-meal]').forEach(b => b.onclick = () => editMeal(b.dataset.mealdate, b.dataset.meal));
  $('mShop').onclick = () => { const n = addWeekToShopping(days); toast(n ? '✓ Added ' + n + ' items to your shopping list' : 'Those ingredients are already on the list (or the meals have no recipes yet).'); if (n) location.hash = 'meals/shop'; };
  $('mCopy').onclick = () => {
    const prev = data.items.filter(i => i.kind === 'meal' && i.date >= addDays(mealWeek, -7) && i.date < mealWeek);
    if (!prev.length) { toast('Nothing planned last week to copy.'); return; }
    let n = 0;
    prev.forEach(m => { const d = addDays(m.date, 7); if (!data.items.some(i => i.kind === 'meal' && i.date === d && i.list === m.list)) { data.items.push(newItem({ kind: 'meal', date: d, list: m.list, title: m.title, location: m.location, notes: m.notes })); n++; } });
    window.save(); toast('✓ Copied ' + n + ' meals'); viewMeals();
  };
}
const mealTabs = on => '<h1>Meals</h1><div class="toptabs"><a href="#meals"' + (on === 'plan' ? ' class="on"' : '') + '>Meal plan</a><a href="#meals/shop"' + (on === 'shop' ? ' class="on"' : '') + '>Shopping list' + (shopCount() ? ' <small>' + shopCount() + '</small>' : '') + '</a><a href="#meals/recipes"' + (on === 'recipes' ? ' class="on"' : '') + '>Recipes</a></div>';
const shopCount = () => data.items.filter(i => i.kind === 'shop' && !i.done).length;
function editMeal(date, slot) {
  const cur = data.items.find(i => i.kind === 'meal' && i.date === date && i.list === slot);
  const rs = recipes(), fit = rs.filter(r => !r.list || r.list === slot), other = rs.filter(r => r.list && r.list !== slot);
  openModal('<h2>' + esc(slot) + ' · ' + esc(fmtDate(date)) + '</h2>' +
    (rs.length ? '<p class="lbl">From your recipes</p><div class="catchips">' + fit.concat(other).map(r => '<button type="button" class="chipbtn' + (cur && cur.location === r.id ? ' on' : '') + '" data-rec="' + r.id + '">' + esc(r.title) + '</button>').join('') + '</div>' : '<p class="helper">Tip: add recipes (Meals → Recipes) and their ingredients go on the shopping list for you.</p>') +
    '<p class="lbl">Quick picks</p><div class="catchips">' + ['Leftovers', 'Eat out', 'Takeout', 'Sandwiches', 'Cereal', 'School lunch'].map(x => '<button type="button" class="chipbtn" data-quick="' + x + '">' + x + '</button>').join('') + '</div>' +
    '<label>Or type it<input id="mlTitle" value="' + esc(cur ? cur.title : '') + '" placeholder="Pot roast"></label>' +
    '<label>Notes<input id="mlNotes" value="' + esc(cur ? cur.notes : '') + '" placeholder="Thaw meat the night before"></label>' +
    '<div class="row-actions"><button type="button" id="mlSave">Save</button><button type="button" class="ghost" id="mlCancel">Cancel</button>' + (cur ? '<button type="button" class="danger" id="mlDel">Clear</button>' : '') + '</div>');
  const put = (title, recipeId) => {
    if (!title) { toast('Pick or type a meal.'); return; }
    const m = cur || newItem({ kind: 'meal', date, list: slot });
    Object.assign(m, { title, location: recipeId || '', notes: $('mlNotes').value.trim() });
    if (!cur) data.items.push(m);
    window.save(); closeModal(); route();
  };
  document.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => { const r = rs.find(x => x.id === b.dataset.rec); put(r.title, r.id); });
  document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => put(b.dataset.quick, ''));
  $('mlSave').onclick = () => { const t = $('mlTitle').value.trim(), r = rs.find(x => x.title.toLowerCase() === t.toLowerCase()); put(t, r ? r.id : ''); };
  $('mlCancel').onclick = closeModal;
  if (cur) $('mlDel').onclick = () => { data.items = data.items.filter(i => i !== cur); window.save(); closeModal(); route(); };
}
// Every ingredient from the week's recipes goes on the list once; amounts and meal names are noted.
function addWeekToShopping(days) {
  let added = 0;
  const open = () => data.items.filter(i => i.kind === 'shop' && !i.done);
  data.items.filter(i => i.kind === 'meal' && days.includes(i.date) && i.location).sort((a, b) => a.date.localeCompare(b.date)).forEach(m => {
    const r = data.items.find(i => i.id === m.location && i.kind === 'recipe'); if (!r) return;
    const tag = m.title + ' (' + new Date(m.date + 'T12:00').toLocaleDateString([], { weekday: 'short' }) + ')';
    r.notes.split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const name = ingredientName(line), amt = amountOf(line);
      const have = open().find(i => i.title.toLowerCase() === name.toLowerCase());
      if (have) { if (!have.notes.includes(tag)) have.notes = [have.notes, (amt ? amt + ' · ' : '') + tag].filter(Boolean).join('; '); return; }
      data.items.push(newItem({ kind: 'shop', title: name, list: aisleOf(line), notes: (amt ? amt + ' · ' : '') + tag, location: (S().walmart || {})[name.toLowerCase()] || '' }));
      added++;
    });
  });
  window.save();
  return added;
}

// ---------- Shopping list ----------
let showGot = false;
function viewShop() {
  const items = data.items.filter(i => i.kind === 'shop'), need = items.filter(i => !i.done), got = items.filter(i => i.done);
  const groups = AISLE_ORDER.map(a => [a, need.filter(i => (i.list || 'Other') === a)]).filter(([, l]) => l.length);
  const row = i => '<div class="shoprow' + (i.done ? ' got' : '') + '"><button type="button" class="tick' + (i.done ? ' on' : '') + '" data-got="' + i.id + '">' + (i.done ? '✓' : '') + '</button>' +
    '<div class="who" data-shopedit="' + i.id + '"><b>' + esc(i.title) + '</b>' + (i.notes ? '<span class="sub">' + esc(i.notes) + '</span>' : '') + '</div>' +
    '<a class="wm" href="' + esc(walmartUrl(i)) + '" target="_blank" rel="noopener" title="Find on Walmart">' + (i.location ? 'Walmart ✓' : 'Walmart') + '</a></div>';
  $('view').innerHTML = mealTabs('shop') +
    '<div class="quickbar"><input id="shopAdd" placeholder="Add an item… “paper towels”, “2 gallons milk”"><button type="button" id="shopGo">Add</button></div>' +
    '<div class="row-actions"><a class="button" href="https://www.walmart.com/cart" target="_blank" rel="noopener">Open Walmart</a><button type="button" class="ghost small" id="shopCopy">Copy list</button>' + (got.length ? '<button type="button" class="ghost small" id="shopClear">Clear ' + got.length + ' checked</button>' : '') + '</div>' +
    '<p class="helper">Tap <b>Walmart</b> to find each item and add it to your cart (pickup or delivery). Check it off here as you go. To always open the exact product you buy, tap an item and paste its Walmart link.</p>' +
    (groups.length ? groups.map(([a, l]) => '<div class="card pad"><h3>' + esc(a) + '</h3>' + l.map(row).join('') + '</div>').join('') : '<div class="card pad"><p class="helper">Your list is empty. Plan meals, then tap <b>Add ingredients to shopping list</b>, or add items above.</p></div>') +
    (got.length ? '<button type="button" class="linkish" id="shopGot">' + (showGot ? 'Hide' : 'Show') + ' ' + got.length + ' in the cart</button>' + (showGot ? '<div class="card pad">' + got.map(row).join('') + '</div>' : '') : '');
  const add = () => {
    const v = $('shopAdd').value.trim(); if (!v) return;
    const name = ingredientName(v), amt = amountOf(v);
    data.items.push(newItem({ kind: 'shop', title: name, list: aisleOf(v), notes: amt, location: (S().walmart || {})[name.toLowerCase()] || '' }));
    window.save(); viewShop(); setTimeout(() => $('shopAdd').focus(), 50);
  };
  $('shopGo').onclick = add; $('shopAdd').onkeydown = e => { if (e.key === 'Enter') add(); };
  $('view').querySelectorAll('[data-got]').forEach(b => b.onclick = () => { const i = data.items.find(x => x.id === b.dataset.got); i.done = !i.done; window.save(); viewShop(); });
  $('view').querySelectorAll('[data-shopedit]').forEach(b => b.onclick = () => editShop(b.dataset.shopedit));
  $('shopCopy').onclick = () => {
    const text = groups.map(([a, l]) => a + ':\n' + l.map(i => '• ' + i.title + (i.notes ? ' (' + i.notes.split(' · ')[0] + ')' : '')).join('\n')).join('\n\n');
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into a text or note.'), () => toast('Could not copy.'));
  };
  if ($('shopClear')) $('shopClear').onclick = () => { data.items = data.items.filter(i => !(i.kind === 'shop' && i.done)); window.save(); viewShop(); };
  if ($('shopGot')) $('shopGot').onclick = () => { showGot = !showGot; viewShop(); };
}
function editShop(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  openModal('<h2>' + esc(it.title) + '</h2><label>Item<input id="shName" value="' + esc(it.title) + '"></label>' +
    '<label>Aisle<select id="shAisle">' + AISLE_ORDER.map(a => '<option' + (a === (it.list || 'Other') ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></label>' +
    '<label>Amount / notes<input id="shNotes" value="' + esc(it.notes) + '"></label>' +
    '<label>Walmart product link (optional)<input id="shUrl" value="' + esc(it.location) + '" placeholder="https://www.walmart.com/ip/…" autocapitalize="off"></label>' +
    '<p class="helper">Find the exact product on Walmart, tap Share → Copy, and paste it here. It’s remembered for next time.</p>' +
    '<div class="row-actions"><button type="button" id="shSave">Save</button><a class="button ghost" href="' + esc(walmartUrl(it)) + '" target="_blank" rel="noopener">Open on Walmart</a><button type="button" class="danger" id="shDel">Remove</button></div>');
  $('shSave').onclick = () => {
    const url = $('shUrl').value.trim();
    if (url && !/^https:\/\/(www\.)?walmart\.com\//i.test(url)) { toast('That isn’t a walmart.com link.'); return; }
    Object.assign(it, { title: $('shName').value.trim() || it.title, list: $('shAisle').value, notes: $('shNotes').value.trim(), location: url });
    const w = S().walmart = Object.assign({}, S().walmart); if (url) w[it.title.toLowerCase()] = url; else delete w[it.title.toLowerCase()];
    window.save(); closeModal(); viewShop();
  };
  $('shDel').onclick = () => { data.items = data.items.filter(i => i !== it); window.save(); closeModal(); viewShop(); };
}

// ---------- Recipe box ----------
function viewRecipes() {
  const rs = recipes();
  $('view').innerHTML = mealTabs('recipes') +
    '<div class="row-actions"><button type="button" id="rNew">＋ New recipe</button>' + (rs.length ? '' : '<button type="button" class="ghost" id="rStarter">Add 10 family favorites</button>') + '</div>' +
    (SLOTS.map(s => { const l = rs.filter(r => (r.list || 'Dinner') === s); return l.length ? '<div class="card pad"><h3>' + s + '</h3>' + l.map(r => '<div class="recrow" data-redit="' + r.id + '"><div class="who"><b>' + esc(r.title) + '</b><span class="sub">' + r.notes.split('\n').filter(Boolean).length + ' ingredients' + (r.location ? ' · has link' : '') + '</span></div><span class="chev">›</span></div>').join('') + '</div>' : ''; }).join('') ||
      '<div class="card pad"><p class="helper">Save your go-to meals with their ingredients. When you plan them, the shopping list fills itself in.</p></div>');
  $('rNew').onclick = () => editRecipe();
  if ($('rStarter')) $('rStarter').onclick = () => { STARTER_RECIPES.forEach(([t, l, n]) => data.items.push(newItem({ kind: 'recipe', title: t, list: l, notes: n }))); window.save(); toast('✓ Added 10 recipes. Edit them to match how you cook.'); viewRecipes(); };
  $('view').querySelectorAll('[data-redit]').forEach(b => b.onclick = () => editRecipe(b.dataset.redit));
}
function editRecipe(id) {
  const r = id ? data.items.find(i => i.id === id) : newItem({ kind: 'recipe', list: 'Dinner' });
  openModal('<h2>' + (id ? 'Edit recipe' : 'New recipe') + '</h2><label>Name<input id="rcTitle" value="' + esc(r.title) + '" placeholder="Taco night"></label>' +
    '<label>Usually for<select id="rcType">' + SLOTS.map(s => '<option' + (s === (r.list || 'Dinner') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>' +
    '<label>Ingredients (one per line)<textarea id="rcIng" rows="8" placeholder="1 lb ground beef\n12 taco shells\nShredded cheese">' + esc(r.notes) + '</textarea></label>' +
    '<label>Recipe link (optional)<input id="rcLink" value="' + esc(r.location) + '" placeholder="https://…" autocapitalize="off"></label>' +
    (r.location ? '<p><a href="' + esc(r.location) + '" target="_blank" rel="noopener">Open recipe ›</a></p>' : '') +
    '<div class="row-actions"><button type="button" id="rcSave">Save</button><button type="button" class="ghost" id="rcCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="rcDel">Delete</button>' : '') + '</div>');
  $('rcCancel').onclick = closeModal;
  $('rcSave').onclick = () => {
    const t = $('rcTitle').value.trim(); if (!t) { toast('Name the recipe.'); return; }
    const link = $('rcLink').value.trim();
    Object.assign(r, { title: t, list: $('rcType').value, notes: $('rcIng').value.trim(), location: /^https?:\/\//i.test(link) ? link : '' });
    if (!id) data.items.push(r);
    window.save(); closeModal(); route();
  };
  if (id) $('rcDel').onclick = () => { if (!confirm('Delete ' + r.title + '?')) return; data.items = data.items.filter(i => i !== r); window.save(); closeModal(); route(); };
}

// ---------- Morning briefing ----------
// Weather comes from Open-Meteo (free, no key). Default spot is Russellville, AR; "Use my location" changes it.
const WMO = { 0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫', 'Fog'], 48: ['🌫', 'Fog'], 51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌧', 'Drizzle'], 61: ['🌦', 'Light rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'], 71: ['🌨', 'Light snow'], 73: ['🌨', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦', 'Showers'], 81: ['🌧', 'Showers'], 82: ['⛈', 'Heavy showers'], 95: ['⛈', 'Thunderstorms'], 96: ['⛈', 'Storms & hail'], 99: ['⛈', 'Storms & hail'] };
async function loadWeather(force) {
  const w = cache.get('weather'), loc = S().weatherLoc || { lat: 35.28, lon: -93.13, name: 'Russellville' };
  if (!force && w && Date.now() - w.at < 45 * 60000 && w.name === loc.name) return w;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=temperature_2m,weather_code&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&forecast_days=3');
    if (!r.ok) throw new Error();
    const j = await r.json();
    const v = { at: Date.now(), name: loc.name, now: Math.round(j.current.temperature_2m), code: j.current.weather_code, hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]), rain: j.daily.precipitation_probability_max[0], tmr: { code: j.daily.weather_code[1], hi: Math.round(j.daily.temperature_2m_max[1]), rain: j.daily.precipitation_probability_max[1] },
      rainHours: (j.hourly.time || []).map((t, k) => [t, j.hourly.precipitation_probability[k]]).filter(([t, p]) => t.startsWith(today()) && p >= 50).map(([t]) => +t.slice(11, 13)) };
    cache.set('weather', v); return v;
  } catch (e) { return w; }
}
function weatherAdvice(w) {
  if (!w) return '';
  if (w.rain >= 60) return 'Grab an umbrella' + (w.rainHours.length ? ' — rain likely around ' + fmtTime(pad(w.rainHours[0]) + ':00') : '') + '.';
  if (w.hi >= 92) return 'Hot one — send extra water to the game.';
  if (w.lo <= 45) return 'Chilly start — jackets for the kids.';
  return '';
}
function viewBrief() {
  const t = today(), hr = new Date().getHours(), list = agenda(t, addDays(t, 3)), todays = onDay(list, t);
  const events = todays.filter(e => e.kind !== 'task' && e.src !== 'bill'), tasks = data.items.filter(i => i.kind === 'task' && !i.done && i.date && i.date <= t);
  const drives = events.filter(e => e.driver || /pick ?up|drop ?off|carpool|drive|practice|game|rehearsal|appointment/i.test(e.title));
  const bills = list.filter(e => e.src === 'bill' && e.date <= addDays(t, 3));
  const meals = mealsOn(t), dinner = meals.find(m => m.list === 'Dinner');
  const page = dayPage(t), pri = (page.pri || []).filter(p => p.t);
  const routs = routines().filter(r => routineFor(r, hr));
  const w = cache.get('weather');
  const sec = (title, body) => body ? '<div class="card pad bsec"><h3>' + title + '</h3>' + body + '</div>' : '';
  $('view').innerHTML = '<div class="brief-hero">' + VINE + '<span class="eyebrow">' + (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', Shaana</span><h1>' + esc(fmtDate(t, 'long')) + '</h1>' +
    '<div id="wx" class="wx">' + (w ? wxHtml(w) : '<span class="helper">Checking the weather…</span>') + '</div></div>' +
    '<div class="bgrid">' +
    sec('Today’s schedule', events.length ? events.map(e => '<div class="bline2" ' + rowOpen(e) + '><b>' + esc(e.allDay ? 'All day' : fmtTime(e.start)) + '</b><span>' + esc(e.title) + (e.location ? ' <small>· ' + esc(e.location) + '</small>' : '') + '</span></div>').join('') : '<p class="helper">A clear day — nothing on the calendar.</p>') +
    sec('Who’s driving', drives.length ? drives.map(e => '<div class="bline2" ' + rowOpen(e) + '><b>' + esc(e.allDay ? '' : fmtTime(e.start)) + '</b><span>' + esc(e.title) + ' — <em>' + esc(e.driver || 'not set') + '</em></span></div>').join('') + (drives.some(e => !e.driver && e.src === 'planner') ? '<p class="helper">Tap one to set who’s driving.</p>' : '') : '') +
    sec('Dinner tonight', dinner ? '<div class="bline2 dinner" data-meal="Dinner" data-mealdate="' + t + '"><b>🍽</b><span>' + esc(dinner.title) + (dinner.notes ? ' <small>· ' + esc(dinner.notes) + '</small>' : '') + '</span></div>' : '<button type="button" class="ghost small" data-meal="Dinner" data-mealdate="' + t + '">Pick dinner</button>') +
    sec('Bills due', bills.length ? bills.map(e => '<div class="bline2"><b>' + esc(fmtDate(e.date, 'rel')) + '</b><span>' + esc(e.title) + '</span></div>').join('') : '') +
    sec('Top priorities', (pri.length ? pri.map(p => '<div class="bline2"><b>' + (p.done ? '✓' : '○') + '</b><span>' + esc(p.t) + '</span></div>').join('') : '') + (tasks.length ? tasks.slice(0, 6).map(i => '<div class="bline2" data-item="' + i.id + '"><b>' + (i.date < t ? '⚠' : '•') + '</b><span>' + esc(i.title) + '</span></div>').join('') : '') || '<p class="helper">No tasks due. 🌿</p>') +
    sec('Routines', routs.length ? routs.map(r => routineChip(r)).join('') : '') +
    '</div><div class="row-actions center"><a class="button" href="#today">Start my day</a><a class="button ghost" href="#calendar">Open calendar</a></div>' +
    '<p class="helper center">This briefing opens the first time you open the planner each morning. <button type="button" class="linkish" id="bOff">' + (S().autoBrief === false ? 'Turn it on' : 'Turn that off') + '</button></p>';
  wireRows($('view'));
  $('view').querySelectorAll('[data-meal]').forEach(b => b.onclick = () => editMeal(b.dataset.mealdate, b.dataset.meal));
  $('view').querySelectorAll('[data-routine]').forEach(b => b.onclick = () => openRoutine(b.dataset.routine));
  $('bOff').onclick = () => { S().autoBrief = S().autoBrief === false; window.save(); viewBrief(); };
  loadWeather().then(v => { const el = $('wx'); if (el && v) el.innerHTML = wxHtml(v); wireWx(); });
  wireWx();
}
function wxHtml(w) {
  const [ic, label] = WMO[w.code] || ['🌡', ''];
  const [tic] = WMO[w.tmr.code] || ['🌡'];
  const adv = weatherAdvice(w);
  return '<div class="wxnow"><span class="wxi">' + ic + '</span><b>' + w.now + '°</b><span>' + esc(label) + '<br><small>H ' + w.hi + '° · L ' + w.lo + '° · ' + w.rain + '% rain</small></span></div>' +
    (adv ? '<p class="wxadv">' + esc(adv) + '</p>' : '') + '<p class="wxtmr">Tomorrow ' + tic + ' ' + w.tmr.hi + '°, ' + w.tmr.rain + '% rain · <button type="button" class="linkish" id="wxLoc">' + esc(w.name) + '</button></p>';
}
function wireWx() {
  const b = $('wxLoc'); if (!b) return;
  b.onclick = () => {
    if (!navigator.geolocation) { toast('Location isn’t available here.'); return; }
    navigator.geolocation.getCurrentPosition(p => { S().weatherLoc = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), name: 'My location' }; window.save(); loadWeather(true).then(() => viewBrief()); }, () => toast('Location was not allowed. Using Russellville.'));
  };
}
// The first time the planner opens each morning (before noon), show the briefing.
function maybeBrief() {
  if (S().autoBrief === false || new Date().getHours() >= 12) return false;
  let last = ''; try { last = localStorage.getItem(KEY + 'Briefed'); } catch (e) {}
  if (last === today() || (location.hash && location.hash !== '#today')) return false;
  try { localStorage.setItem(KEY + 'Briefed', today()); } catch (e) {}
  location.hash = 'brief'; return true;
}

// ---------- Routines and checklists ----------
// A routine is a reusable checklist (steps one per line). What's checked is kept per day, so it starts fresh each day.
const STARTER_ROUTINES = [
  ['Morning', 'Morning', 'Make bed\nTake vitamins\nCheck the briefing\nKids’ lunches & water bottles\nBackpacks & band instruments by the door\nStart the dishwasher'],
  ['After school', 'Afternoon', 'Unpack lunch boxes\nSnack\nHomework check\nSign forms / read folder\nPractice instrument 20 min\nPack tomorrow’s bags'],
  ['Game night', 'Evening', 'Band uniform & shoes\nInstrument & music\nWater bottles & snacks\nConcession apron & money pouch\nPhone charged\nGas in the car'],
  ['Booth setup', 'Any time', 'Price new inventory\nCash box & change ($100)\nCard reader charged\nBags & tissue paper\nTable cover & signs\nUpdate Booth Tracker'],
  ['Bedtime', 'Evening', 'Lock doors\nSet out clothes\nCharge phones\nCheck tomorrow’s calendar\nLights out by 10']
];
const routines = () => data.items.filter(i => i.kind === 'routine').sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.title.localeCompare(b.title));
const routineFor = (r, hr) => r.list === 'Any time' || (r.list === 'Morning' && hr < 12) || (r.list === 'Afternoon' && hr >= 11 && hr < 18) || (r.list === 'Evening' && hr >= 16);
const routineSteps = r => r.notes.split('\n').map(x => x.trim()).filter(Boolean);
function routineDone(r, d) { const v = dayPage(d || today()); return (v.routines || {})[r.id] || []; }
function routineChip(r) {
  const steps = routineSteps(r), done = routineDone(r).filter(k => k < steps.length).length;
  return '<button type="button" class="rchip' + (done === steps.length && steps.length ? ' full' : '') + '" data-routine="' + r.id + '"><span>' + esc(r.title) + '</span><i style="--p:' + Math.round(done / Math.max(1, steps.length) * 100) + '%"></i><small>' + done + '/' + steps.length + '</small></button>';
}
function openRoutine(id, d) {
  d = d || today();
  const r = data.items.find(i => i.id === id); if (!r) return;
  const steps = routineSteps(r);
  const draw = () => {
    const done = routineDone(r, d);
    $('modalBody').innerHTML = '<div class="mini-head"><h2>' + esc(r.title) + '</h2><span class="helper">' + done.filter(k => k < steps.length).length + ' of ' + steps.length + '</span></div>' +
      steps.map((s, k) => '<button type="button" class="rstep' + (done.includes(k) ? ' on' : '') + '" data-step="' + k + '"><i>' + (done.includes(k) ? '✓' : '') + '</i><span>' + esc(s) + '</span></button>').join('') +
      '<div class="row-actions"><button type="button" id="rtClose">Done</button><button type="button" class="ghost" id="rtReset">Start over</button><button type="button" class="ghost" id="rtEdit">Edit steps</button></div>';
    document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
      const k = +b.dataset.step, v = dayPage(d); v.routines = v.routines || {}; const list = v.routines[r.id] = v.routines[r.id] || [];
      const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k);
      saveDayPage(d, v);
      if (list.filter(x => x < steps.length).length === steps.length) { celebrate(b); }
      draw();
    });
    $('rtClose').onclick = () => { closeModal(); route(); };
    $('rtReset').onclick = () => { const v = dayPage(d); if (v.routines) delete v.routines[r.id]; saveDayPage(d, v); draw(); };
    $('rtEdit').onclick = () => editRoutine(r.id);
  };
  openModal(''); draw();
}
function editRoutine(id) {
  const r = id ? data.items.find(i => i.id === id) : newItem({ kind: 'routine', list: 'Morning' });
  openModal('<h2>' + (id ? 'Edit routine' : 'New routine') + '</h2><label>Name<input id="roTitle" value="' + esc(r.title) + '" placeholder="Saturday chores"></label>' +
    '<label>Shows up<select id="roWhen">' + ['Morning', 'Afternoon', 'Evening', 'Any time'].map(x => '<option' + (x === r.list ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label>Steps (one per line)<textarea id="roSteps" rows="8">' + esc(r.notes) + '</textarea></label>' +
    '<div class="row-actions"><button type="button" id="roSave">Save</button><button type="button" class="ghost" id="roCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="roDel">Delete</button>' : '') + '</div>');
  $('roCancel').onclick = closeModal;
  $('roSave').onclick = () => { const t = $('roTitle').value.trim(); if (!t) { toast('Name it.'); return; } Object.assign(r, { title: t, list: $('roWhen').value, notes: $('roSteps').value.trim() }); if (!id) data.items.push(r); window.save(); closeModal(); route(); };
  if (id) $('roDel').onclick = () => { if (!confirm('Delete ' + r.title + '?')) return; data.items = data.items.filter(i => i !== r); window.save(); closeModal(); route(); };
}
function viewRoutines() {
  const rs = routines(), hr = new Date().getHours();
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks">To-do</a><a href="#tasks/routines" class="on">Routines</a><a href="#tasks/templates">Templates</a></div>' +
    '<div class="row-actions"><button type="button" id="roNew">＋ New routine</button>' + (rs.length ? '' : '<button type="button" class="ghost" id="roStart">Add 5 starter routines</button>') + '</div>' +
    (rs.length ? '<div class="card pad">' + rs.map(r => '<div class="rrow"><div class="who" data-routine="' + r.id + '"><b>' + esc(r.title) + (routineFor(r, hr) ? ' <span class="chip">now</span>' : '') + '</b><span class="sub">' + esc(r.list) + ' · ' + routineSteps(r).length + ' steps</span></div>' + routineChip(r) + '</div>').join('') + '</div>' :
      '<div class="card pad"><p class="helper">Checklists you use over and over — they reset every day. Start with the five below and change them to fit your family.</p></div>');
  $('roNew').onclick = () => editRoutine();
  if ($('roStart')) $('roStart').onclick = () => { STARTER_ROUTINES.forEach(([t, l, n], k) => data.items.push(newItem({ kind: 'routine', title: t, list: l, notes: n, sort: k }))); window.save(); toast('✓ Added 5 routines'); viewRoutines(); };
  $('view').querySelectorAll('[data-routine]').forEach(b => b.onclick = () => openRoutine(b.dataset.routine));
}

// ---------- Smart templates ----------
// A template is a list of steps applied to a chosen day. Each step: { type: event|task|meal|routine, title, start, end, where, off (days from the day), slot, driver }.
const STARTER_TEMPLATES = [
  ['Football Friday', [
    { type: 'event', title: 'Concession stand volunteer', start: '17:45', end: '21:30', where: 'Cyclone Stadium' },
    { type: 'event', title: 'Football game', start: '19:00', end: '21:30', where: 'Cyclone Stadium' },
    { type: 'task', title: 'Pack snack bags', off: -1 },
    { type: 'task', title: 'Start the crockpot', start: '08:00' },
    { type: 'task', title: 'Gas up the car' },
    { type: 'meal', slot: 'Dinner', title: 'Crockpot chili' },
    { type: 'routine', title: 'Game night' }]],
  ['Booth day', [
    { type: 'event', title: 'Booth at Y’allternative', start: '09:00', end: '16:00' },
    { type: 'task', title: 'Price new items', off: -1 },
    { type: 'task', title: 'Load the car', off: -1 },
    { type: 'meal', slot: 'Lunch', title: 'Sandwiches' },
    { type: 'routine', title: 'Booth setup' }]],
  ['Band trip', [
    { type: 'event', title: 'Band trip', start: '07:00', end: '18:00' },
    { type: 'task', title: 'Turn in permission slip', off: -3 },
    { type: 'task', title: 'Pack uniform, instrument & snacks', off: -1 },
    { type: 'task', title: 'Send lunch money', off: -1 },
    { type: 'meal', slot: 'Dinner', title: 'Takeout' }]]
];
const templates = () => data.items.filter(i => i.kind === 'template').sort((a, b) => a.title.localeCompare(b.title));
const tplSteps = t => { try { return JSON.parse(t.notes || '[]'); } catch (e) { return []; } };
function stepText(s) {
  const when = (s.off ? (s.off < 0 ? Math.abs(s.off) + (s.off === -1 ? ' day' : ' days') + ' before' : s.off + ' after') + ' · ' : '') + (s.start ? fmtTime(s.start) : '');
  return ({ event: '🗓', task: '✓', meal: '🍽', routine: '☰' }[s.type] || '•') + ' ' + (s.type === 'meal' ? s.slot + ': ' : s.type === 'routine' ? 'Routine: ' : '') + s.title + (when ? ' — ' + when.replace(/ · $/, '') : '');
}
function applyTemplate(t, d) {
  let n = 0;
  tplSteps(t).forEach(s => {
    const day = addDays(d, s.off || 0);
    if (s.type === 'event') { data.items.push(newItem({ kind: 'event', title: s.title, date: day, start: s.start || '', end: s.end || '', allDay: !s.start, location: s.where || '', driver: s.driver || '', color: COLORS[0] })); n++; }
    else if (s.type === 'task') { data.items.push(newItem({ kind: 'task', title: s.title, date: day, remind: s.start ? -(+s.start.slice(0, 2) * 60 + +s.start.slice(3, 5)) : null, notes: 'From “' + t.title + '”' })); n++; }
    else if (s.type === 'meal') { const cur = data.items.find(i => i.kind === 'meal' && i.date === day && i.list === s.slot); const r = recipes().find(x => x.title.toLowerCase() === s.title.toLowerCase()); if (cur) Object.assign(cur, { title: s.title, location: r ? r.id : '' }); else data.items.push(newItem({ kind: 'meal', date: day, list: s.slot || 'Dinner', title: s.title, location: r ? r.id : '' })); n++; }
    else if (s.type === 'routine') { const r = routines().find(x => x.title.toLowerCase() === s.title.toLowerCase()); if (r) { const v = dayPage(day); v.pinned = Array.from(new Set((v.pinned || []).concat([r.id]))); saveDayPage(day, v); n++; } }
  });
  window.save();
  return n;
}
function useTemplate(preDate) {
  const ts = templates();
  if (!ts.length) { location.hash = 'tasks/templates'; toast('Add a template first (starters are one tap).'); return; }
  openModal('<h2>Use a template</h2><label>For which day?<input id="utDate" type="date" value="' + esc(preDate || today()) + '"></label>' +
    ts.map(t => '<button type="button" class="tplbtn" data-ut="' + t.id + '"><b>' + esc(t.title) + '</b><span>' + tplSteps(t).map(s => esc(s.title)).join(' · ') + '</span></button>').join('') +
    '<div class="row-actions"><button type="button" class="ghost" id="utCancel">Cancel</button><a class="button ghost" href="#tasks/templates" id="utManage">Edit templates</a></div>');
  $('utCancel').onclick = closeModal; $('utManage').onclick = closeModal;
  document.querySelectorAll('[data-ut]').forEach(b => b.onclick = () => {
    const t = data.items.find(i => i.id === b.dataset.ut), d = $('utDate').value || today();
    const n = applyTemplate(t, d); closeModal(); calDay = d; route();
    toast('✓ ' + t.title + ' added ' + n + ' things for ' + fmtDate(d, 'rel'));
  });
}
function viewTemplates() {
  const ts = templates();
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks">To-do</a><a href="#tasks/routines">Routines</a><a href="#tasks/templates" class="on">Templates</a></div>' +
    '<p class="helper">One tap sets up a whole day: events, tasks, dinner and checklists.</p>' +
    '<div class="row-actions"><button type="button" id="tpUse">⚡ Use a template</button><button type="button" class="ghost" id="tpNew">＋ New template</button>' + (ts.length ? '' : '<button type="button" class="ghost" id="tpStart">Add Football Friday, Booth day & Band trip</button>') + '</div>' +
    ts.map(t => '<div class="card pad tplcard"><div class="mini-head"><h2>' + esc(t.title) + '</h2><button type="button" class="ghost small" data-tpe="' + t.id + '">Edit</button></div>' + tplSteps(t).map(s => '<div class="sub">' + esc(stepText(s)) + '</div>').join('') + '</div>').join('');
  $('tpUse').onclick = () => useTemplate();
  $('tpNew').onclick = () => editTemplate();
  if ($('tpStart')) $('tpStart').onclick = () => { STARTER_TEMPLATES.forEach(([t, steps]) => data.items.push(newItem({ kind: 'template', title: t, notes: JSON.stringify(steps) }))); if (!routines().length) STARTER_ROUTINES.forEach(([t, l, n], k) => data.items.push(newItem({ kind: 'routine', title: t, list: l, notes: n, sort: k }))); window.save(); toast('✓ Added 3 templates'); viewTemplates(); };
  $('view').querySelectorAll('[data-tpe]').forEach(b => b.onclick = () => editTemplate(b.dataset.tpe));
}
function editTemplate(id) {
  const t = id ? data.items.find(i => i.id === id) : newItem({ kind: 'template' });
  let steps = tplSteps(t);
  const row = (s, k) => '<div class="tstep" data-k="' + k + '"><select data-f="type">' + [['event', 'Event'], ['task', 'Task'], ['meal', 'Meal'], ['routine', 'Routine']].map(([v, l]) => '<option value="' + v + '"' + (s.type === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<input data-f="title" value="' + esc(s.title || '') + '" placeholder="What">' +
    '<select data-f="off">' + [[-3, '3 days before'], [-2, '2 days before'], [-1, 'Day before'], [0, 'That day'], [1, 'Day after']].map(([v, l]) => '<option value="' + v + '"' + ((s.off || 0) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    (s.type === 'meal' ? '<select data-f="slot">' + SLOTS.map(x => '<option' + (x === (s.slot || 'Dinner') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' : s.type === 'routine' ? '' : '<input data-f="start" type="time" value="' + esc(s.start || '') + '" title="' + (s.type === 'task' ? 'Remind at' : 'Starts') + '">') +
    (s.type === 'event' ? '<input data-f="end" type="time" value="' + esc(s.end || '') + '" title="Ends"><input data-f="where" value="' + esc(s.where || '') + '" placeholder="Where">' : '') +
    '<button type="button" class="linkish" data-rm="' + k + '">✕</button></div>';
  const draw = () => {
    $('modalBody').innerHTML = '<h2>' + (id ? 'Edit template' : 'New template') + '</h2><label>Name<input id="tpTitle" value="' + esc(t.title) + '" placeholder="Football Friday"></label>' +
      '<p class="lbl">Steps</p><div id="tpSteps">' + steps.map(row).join('') + '</div><div class="row-actions"><button type="button" class="ghost small" id="tpAdd">＋ Add a step</button></div>' +
      '<div class="row-actions"><button type="button" id="tpSave">Save</button><button type="button" class="ghost" id="tpCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="tpDel">Delete</button>' : '') + '</div>';
    const read = () => { const title = $('tpTitle').value; steps = [...document.querySelectorAll('.tstep')].map(r => { const o = {}; r.querySelectorAll('[data-f]').forEach(f => { o[f.dataset.f] = f.dataset.f === 'off' ? +f.value : f.value.trim(); }); return o; }); t.title = title; };
    document.querySelectorAll('.tstep [data-f="type"]').forEach(s => s.onchange = () => { read(); draw(); });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(); steps.splice(+b.dataset.rm, 1); draw(); });
    $('tpAdd').onclick = () => { read(); steps.push({ type: 'task', title: '', off: 0 }); draw(); };
    $('tpCancel').onclick = closeModal;
    $('tpSave').onclick = () => { read(); if (!t.title.trim()) { toast('Name the template.'); return; } t.title = t.title.trim(); t.notes = JSON.stringify(steps.filter(s => s.title)); if (!id) data.items.push(t); window.save(); closeModal(); route(); };
    if (id) $('tpDel').onclick = () => { if (!confirm('Delete ' + t.title + '?')) return; data.items = data.items.filter(i => i !== t); window.save(); closeModal(); route(); };
  };
  openModal(''); draw();
}

// ---------- Trackers (habits and personal logs) ----------
// Each log is a planner item of kind "track" (list = tracker id, date = the day). Trackers never go to the calendar feed.
// They also show on the subscribed Google/iPhone calendars (as all-day entries without alerts).
const DEFAULT_TRACKERS = [
  { id: 'nails', name: 'Nails', icon: '💅', cycle: false },
  { id: 'us', name: 'Us', icon: '❤️', cycle: false },
  { id: 'cecilia-period', name: 'Cecilia’s period', icon: '⚠️', cycle: true }
];
const TRACK_ICONS = ['💅', '❤️', '⚠️', '🩸', '💊', '💇‍♀️', '🦷', '🏃‍♀️', '💧', '📖', '🙏', '🐶', '🛁', '🧹', '⭐', '😴'];
const trackers = () => { if (!S().trackers) S().trackers = DEFAULT_TRACKERS.map(t => Object.assign({}, t)); return S().trackers; };
const logsOf = id => data.items.filter(i => i.kind === 'track' && i.list === id && i.date).sort((a, b) => a.date.localeCompare(b.date));
const loggedOn = (id, d) => data.items.find(i => i.kind === 'track' && i.list === id && i.date === d);
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
// How often something happens: the average gap between logs (for a cycle, only gaps that look like a cycle).
function trackStats(t) {
  const logs = logsOf(t.id), dates = [...new Set(logs.map(l => l.date))], tdy = today();
  const gaps = dates.slice(1).map((d, k) => daysBetween(dates[k], d)).filter(g => !t.cycle || (g >= 18 && g <= 45));
  const recent = gaps.slice(-6), avg = recent.length ? Math.round(recent.reduce((s, g) => s + g, 0) / recent.length) : null;
  const last = dates[dates.length - 1] || null;
  const month = dates.filter(d => d.startsWith(tdy.slice(0, 7))).length;
  const next = t.cycle && last && avg ? addDays(last, avg) : null;
  return { dates, last, since: last ? daysBetween(last, tdy) : null, avg, month, next };
}
function toggleTrack(id, d, quiet) {
  const t = trackers().find(x => x.id === id), have = loggedOn(id, d);
  if (have) { data.items = data.items.filter(i => i !== have); if (!quiet) toast('Removed ' + t.icon + ' for ' + fmtDate(d, 'rel')); }
  else { data.items.push(newItem({ kind: 'track', list: id, date: d, title: t.icon + ' ' + t.name })); if (!quiet) toast(t.icon + ' Logged for ' + fmtDate(d, 'rel')); }
  window.save();
}
// Little icons for a day on the calendar (and a faint one on a predicted cycle day).
function trackIcons(d) {
  const ts = trackers().filter(t => t.show !== false);
  let out = ts.filter(t => loggedOn(t.id, d)).map(t => '<i class="tk" title="' + esc(t.name) + '">' + t.icon + '</i>').join('');
  ts.filter(t => t.cycle).forEach(t => { const s = trackStats(t); if (s.next && !loggedOn(t.id, d) && Math.abs(daysBetween(s.next, d)) <= 1 && d >= today()) out += '<i class="tk soon" title="' + esc(t.name) + ' expected">' + t.icon + '</i>'; });
  return out ? '<span class="tks">' + out + '</span>' : '';
}
// One-tap buttons for Today (or any chosen day).
function trackButtons(d) {
  const ts = trackers(); if (!ts.length) return '';
  return '<div class="trackrow"><a class="trackh" href="#track">Track</a>' + ts.map(t => '<button type="button" class="trk' + (loggedOn(t.id, d) ? ' on' : '') + '" data-trk="' + esc(t.id) + '" data-trkd="' + d + '" title="' + esc(t.name) + '"><span>' + t.icon + '</span><small>' + esc(t.name.replace(/’s period$/, '')) + '</small></button>').join('') + '</div>';
}
function wireTrack(root, after) {
  root.querySelectorAll('[data-trk]').forEach(b => b.onclick = e => { e.stopPropagation(); toggleTrack(b.dataset.trk, b.dataset.trkd); b.classList.add('pop'); setTimeout(after || route, 200); });
}
function viewTrack() {
  const ts = trackers(), tdy = today();
  $('view').innerHTML = '<a class="back" href="#today">‹ Today</a><h1>Trackers</h1><p class="helper">Tap to log today. Logged days also show on your Google and iPhone “My Planner” calendars.</p>' +
    ts.map(t => {
      const s = trackStats(t), weeks = [];
      for (let k = 55; k >= 0; k--) { const d = addDays(tdy, -k); weeks.push('<i class="dot' + (s.dates.includes(d) ? ' on' : '') + (d === tdy ? ' now' : '') + '" title="' + esc(fmtDate(d)) + '"></i>'); }
      const facts = [s.last ? 'Last time: ' + (s.since === 0 ? 'today' : s.since === 1 ? 'yesterday' : s.since + ' days ago') : 'Not logged yet',
        s.avg ? (t.cycle ? 'Cycle about ' + s.avg + ' days' : 'About every ' + s.avg + ' days') : '', !t.cycle ? s.month + ' this month' : ''].filter(Boolean);
      return '<div class="card pad tcard"><div class="mini-head"><h2><span class="ticon">' + t.icon + '</span> ' + esc(t.name) + '</h2><button type="button" class="trk big' + (loggedOn(t.id, tdy) ? ' on' : '') + '" data-trk="' + esc(t.id) + '" data-trkd="' + tdy + '">' + (loggedOn(t.id, tdy) ? '✓ Today' : '+ Today') + '</button></div>' +
        '<p class="tfacts">' + facts.map(esc).join(' · ') + '</p>' +
        (t.cycle && s.next ? '<p class="tnext">' + t.icon + ' Next one expected around <b>' + esc(fmtDate(s.next, 'rel')) + '</b>' + (daysBetween(tdy, s.next) > 0 ? ' (in ' + daysBetween(tdy, s.next) + ' days)' : daysBetween(tdy, s.next) === 0 ? ' (today)' : ' (' + -daysBetween(tdy, s.next) + ' days late)') + '</p>' : t.cycle ? '<p class="helper">Log 2 or more start days and it will predict the next one.</p>' : '') +
        (t.cycle ? '<p><a href="#files" data-goto-med="' + esc(t.name) + '">Open health record ›</a></p>' : '') +
        '<div class="dots" title="Last 8 weeks">' + weeks.join('') + '</div>' +
        '<div class="row-actions"><label class="tother">Log another day<input type="date" data-tday="' + esc(t.id) + '" max="' + tdy + '"></label><button type="button" class="ghost small" data-thist="' + esc(t.id) + '">History</button><button type="button" class="ghost small" data-tedit="' + esc(t.id) + '">Edit</button></div></div>';
    }).join('') +
    '<div class="row-actions"><button type="button" id="tNew">＋ New tracker</button></div>';
  wireTrack($('view'), viewTrack);
  $('view').querySelectorAll('[data-tday]').forEach(i => i.onchange = () => { if (i.value) { if (!loggedOn(i.dataset.tday, i.value)) toggleTrack(i.dataset.tday, i.value); else toast('Already logged that day.'); viewTrack(); } });
  $('view').querySelectorAll('[data-thist]').forEach(b => b.onclick = () => trackHistory(b.dataset.thist));
  $('view').querySelectorAll('[data-tedit]').forEach(b => b.onclick = () => editTracker(b.dataset.tedit));
  $('tNew').onclick = () => editTracker();
  $('view').querySelectorAll('[data-goto-med]').forEach(a => a.onclick = () => { const who = (folderList().find(f => /\/Medical$/i.test(f) && a.dataset.gotoMed.toLowerCase().includes(topOf(f).toLowerCase())) || ''); fileFolder = who; });
}
function trackHistory(id) {
  const t = trackers().find(x => x.id === id), logs = logsOf(id).reverse();
  openModal('<h2>' + t.icon + ' ' + esc(t.name) + '</h2>' + (logs.length ? logs.map((l, k) => { const prev = logs[k + 1]; return '<div class="mini-row"><span>' + esc(fmtDate(l.date, 'long')) + (prev ? ' <small class="sub">· ' + daysBetween(prev.date, l.date) + ' days after the one before</small>' : '') + '</span><button type="button" class="linkish" data-hdel="' + l.id + '">Remove</button></div>'; }).join('') : '<p class="helper">Nothing logged yet.</p>') +
    '<div class="row-actions"><button type="button" id="thClose">Done</button></div>');
  $('thClose').onclick = () => { closeModal(); route(); };
  document.querySelectorAll('[data-hdel]').forEach(b => b.onclick = () => { data.items = data.items.filter(i => i.id !== b.dataset.hdel); window.save(); trackHistory(id); });
}
function editTracker(id) {
  const list = trackers(), t = id ? list.find(x => x.id === id) : { id: '', name: '', icon: '⭐', cycle: false, show: true };
  let icon = t.icon;
  openModal('<h2>' + (id ? 'Edit tracker' : 'New tracker') + '</h2><label>Name<input id="tkName" value="' + esc(t.name) + '" placeholder="Workout, vitamins, haircut…"></label>' +
    '<p class="lbl">Icon</p><div class="iconpick">' + TRACK_ICONS.map(x => '<button type="button" class="ipk' + (x === icon ? ' on' : '') + '" data-ipk="' + x + '">' + x + '</button>').join('') + '</div>' +
    '<label class="check"><input type="checkbox" id="tkCycle"' + (t.cycle ? ' checked' : '') + '> Predict the next one (for a monthly cycle)</label>' +
    '<label class="check"><input type="checkbox" id="tkShow"' + (t.show !== false ? ' checked' : '') + '> Show the icon on my calendar</label>' +
    '<div class="row-actions"><button type="button" id="tkSave">Save</button><button type="button" class="ghost" id="tkCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="tkDel">Delete</button>' : '') + '</div>');
  document.querySelectorAll('[data-ipk]').forEach(b => b.onclick = () => { icon = b.dataset.ipk; document.querySelectorAll('[data-ipk]').forEach(x => x.classList.toggle('on', x === b)); });
  $('tkCancel').onclick = closeModal;
  $('tkSave').onclick = () => {
    const name = $('tkName').value.trim(); if (!name) { toast('Name it.'); return; }
    Object.assign(t, { name, icon, cycle: $('tkCycle').checked, show: $('tkShow').checked });
    if (!id) { t.id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(-4); list.push(t); }
    S().trackers = list.slice(); window.save(); closeModal(); route();
  };
  if (id) $('tkDel').onclick = () => {
    const n = logsOf(id).length;
    if (!confirm('Delete the ' + t.name + ' tracker' + (n ? ' and its ' + n + ' logged days' : '') + '?')) return;
    S().trackers = list.filter(x => x.id !== id); data.items = data.items.filter(i => !(i.kind === 'track' && i.list === id)); window.save(); closeModal(); route();
  };
}

// ---------- Health records ----------
// Opening any "<Person>/Medical" folder shows that person's record above their medical files.
// Stored as planner items of kind "health" (list = person): title "growth" (weight/height), "visit" (doctor visit),
// or "info" (one card of key facts). Details are JSON in notes.
const hj = i => { try { return JSON.parse(i.notes || '{}'); } catch (e) { return {}; } };
const healthOf = (who, type) => data.items.filter(i => i.kind === 'health' && i.list === who && i.title === type).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const cycleTrackerFor = who => trackers().find(t => t.cycle && t.name.toLowerCase().includes(who.toLowerCase()));
const inches = v => { const s = String(v || '').trim(); const m = s.match(/^(\d+)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?/i); if (m) return +m[1] * 12 + (+m[2] || 0); const n = parseFloat(s); return isNaN(n) ? null : n; };
const feetIn = n => n == null ? '' : Math.floor(n / 12) + '′ ' + (Math.round((n % 12) * 10) / 10) + '″';
function sparkline(points, color) {
  if (points.length < 2) return '';
  const xs = points.map(p => new Date(p[0]).getTime()), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), W = 260, H = 60;
  const pt = (x, y) => (8 + (x - x0) / Math.max(1, x1 - x0) * (W - 16)).toFixed(1) + ',' + (H - 8 - (y - y0) / Math.max(.01, y1 - y0) * (H - 16)).toFixed(1);
  return '<svg class="sparkln" viewBox="0 0 ' + W + ' ' + H + '"><polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + points.map(p => pt(new Date(p[0]).getTime(), p[1])).join(' ') + '"/>' + points.map(p => '<circle cx="' + pt(new Date(p[0]).getTime(), p[1]).split(',')[0] + '" cy="' + pt(new Date(p[0]).getTime(), p[1]).split(',')[1] + '" r="3" fill="' + color + '"/>').join('') + '</svg>';
}
// How many days a period lasted (kept in the start day's note, like "5 days").
const periodLog = (ct, d) => logsOf(ct.id).find(l => l.date === d);
const periodDays = (ct, d) => { const l = periodLog(ct, d), m = l && /^(\d+)\s*day/.exec(l.notes || ''); return m ? +m[1] : null; };
// Like Flo: previous cycle, previous period and how much the cycle varies.
function periodSummary(ct, starts) {
  const gaps = starts.slice(0, -1).map((d, k) => daysBetween(starts[k + 1], d));
  const lens = starts.map(d => periodDays(ct, d)).filter(Boolean);
  const box = (k, v, note) => '<div class="pstat"><small>' + k + '</small><b>' + v + '</b>' + (note ? '<em>' + note + '</em>' : '') + '</div>';
  const lastLen = periodDays(ct, starts[0]) || lens[0];
  return '<div class="pstats">' +
    (gaps.length ? box('Previous cycle', gaps[0] + ' days', gaps[0] >= 21 && gaps[0] <= 45 ? '✓ normal' : '') : '') +
    (lastLen ? box('Previous period', lastLen + ' days', lastLen >= 2 && lastLen <= 7 ? '✓ normal' : '') : '') +
    (gaps.length > 1 ? box('Cycle range', Math.min(...gaps) + '–' + Math.max(...gaps) + ' days') : '') +
    '</div>' + (gaps.some(g => g > 45) ? '<p class="helper">Cycles can vary a lot for 2–3 years after a first period. The prediction leaves out the very long gaps.</p>' : '');
}
function healthPanel(who) {
  const info = healthOf(who, 'info')[0], iv = info ? hj(info) : {};
  const growth = healthOf(who, 'growth'), visits = healthOf(who, 'visit');
  const ct = cycleTrackerFor(who), cs = ct ? trackStats(ct) : null, starts = ct ? logsOf(ct.id).map(l => l.date).reverse() : [];
  const tdy = today();
  const g = growth.map(x => Object.assign({ date: x.date, id: x.id }, hj(x)));
  const wPts = g.filter(x => x.weight).map(x => [x.date, +x.weight]).reverse(), hPts = g.filter(x => inches(x.height) != null).map(x => [x.date, inches(x.height)]).reverse();
  const infoRows = [['Doctor', iv.doctor], ['Doctor’s phone', iv.phone], ['Allergies', iv.allergies], ['Medications', iv.meds], ['Conditions', iv.conditions], ['Blood type', iv.blood], ['Insurance', iv.insurance], ['Other', iv.other]].filter(r => r[1]);
  return '<div class="health">' +
    '<div class="card pad hcard"><div class="mini-head"><h2>' + esc(who) + '’s health record' + (nicknames()[who] ? ' <small class="nick">' + esc(nicknames()[who].join(' · ')) + '</small>' : '') + '</h2><button type="button" class="ghost small" data-hinfo="' + esc(who) + '">Edit info</button></div>' +
      (infoRows.length ? '<dl class="hinfo">' + infoRows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + (k === 'Doctor’s phone' ? '<a href="tel:' + esc(String(v).replace(/[^\d+]/g, '')) + '">' + esc(v) + '</a>' : esc(v)) + '</dd>').join('') + '</dl>' : '<p class="helper">Add her doctor, allergies, medications and insurance so it’s all in one place.</p>') + '</div>' +
    (ct ? '<div class="card pad hcard"><div class="mini-head"><h2>' + ct.icon + ' Period</h2><button type="button" class="trk big' + (loggedOn(ct.id, tdy) ? ' on' : '') + '" data-trk="' + esc(ct.id) + '" data-trkd="' + tdy + '">' + (loggedOn(ct.id, tdy) ? '✓ Started today' : '+ Started today') + '</button></div>' +
      (cs.next ? '<p class="tnext">Next one expected around <b>' + esc(fmtDate(cs.next, 'rel')) + '</b>' + (daysBetween(tdy, cs.next) > 0 ? ' (in ' + daysBetween(tdy, cs.next) + ' days)' : daysBetween(tdy, cs.next) === 0 ? ' (today)' : ' (' + -daysBetween(tdy, cs.next) + ' days late)') + (cs.avg ? ' · cycle about ' + cs.avg + ' days' : '') + '</p>' : '<p class="helper">Log two or more start days to see a prediction.</p>') +
      (starts.length ? periodSummary(ct, starts) + '<table class="mini htable"><thead><tr><th>Started</th><th>Lasted</th><th>Cycle</th></tr></thead><tbody>' + starts.slice(0, 12).map((d, k) => { const n = periodDays(ct, d); return '<tr><td>' + esc(fmtDate(d)) + '</td><td><button type="button" class="linkish" data-plen="' + esc(ct.id) + '" data-pd="' + d + '">' + (n ? n + ' days' : '＋ add') + '</button></td><td>' + (k ? daysBetween(d, starts[k - 1]) + ' days' : 'now ' + (daysBetween(d, today()) + 1) + ' days') + '</td></tr>'; }).join('') + '</tbody></table><p class="helper">Tap “Lasted” to change how many days it lasted.</p>' : '') +
      '<div class="row-actions"><label class="tother">Started on another day<input type="date" data-tday="' + esc(ct.id) + '" max="' + tdy + '"></label><button type="button" class="ghost small" data-thist="' + esc(ct.id) + '">Edit list</button></div></div>' : '') +
    '<div class="card pad hcard"><div class="mini-head"><h2>Height &amp; weight</h2><button type="button" class="small" data-hgrow="' + esc(who) + '">＋ Add</button></div>' +
      (g.length ? '<div class="grow"><div><span>Weight</span><b>' + esc(g.find(x => x.weight) ? g.find(x => x.weight).weight + ' lb' : '—') + '</b>' + sparkline(wPts, '#c99a8e') + '</div><div><span>Height</span><b>' + esc(feetIn(hPts.length ? hPts[hPts.length - 1][1] : null) || '—') + '</b>' + sparkline(hPts, '#7d9b76') + '</div></div>' +
        '<table class="mini htable"><thead><tr><th>Date</th><th>Weight</th><th>Height</th></tr></thead><tbody>' + g.map(x => '<tr data-hedit="' + x.id + '"><td>' + esc(fmtDate(x.date)) + '</td><td>' + esc(x.weight ? x.weight + ' lb' : '') + '</td><td>' + esc(inches(x.height) != null ? feetIn(inches(x.height)) : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="helper">Add her height and weight at each check-up to see how she’s growing.</p>') + '</div>' +
    '<div class="card pad hcard"><div class="mini-head"><h2>Doctor visits</h2><button type="button" class="small" data-hvisit="' + esc(who) + '">＋ Add visit</button></div>' +
      (visits.length ? visits.map(v => { const o = hj(v); return '<div class="hvisit" data-hedit="' + v.id + '"><b>' + esc(fmtDate(v.date)) + ' · ' + esc(o.reason || 'Visit') + '</b><span class="sub">' + esc([o.doctor, o.followup ? 'Next: ' + fmtDate(o.followup) : ''].filter(Boolean).join(' · ')) + '</span>' + (o.notes ? '<p class="notes">' + esc(o.notes) + '</p>' : '') + (o.meds ? '<p class="sub">💊 ' + esc(o.meds) + '</p>' : '') + '</div>'; }).join('') : '<p class="helper">Write down what the doctor said, medicines and the next appointment.</p>') + '</div>' +
    '</div>';
}
function wireHealth(root, who) {
  wireTrack(root, viewFiles);
  root.querySelectorAll('[data-tday]').forEach(i => i.onchange = () => { if (i.value) { if (!loggedOn(i.dataset.tday, i.value)) toggleTrack(i.dataset.tday, i.value); viewFiles(); } });
  root.querySelectorAll('[data-thist]').forEach(b => b.onclick = () => trackHistory(b.dataset.thist));
  root.querySelectorAll('[data-plen]').forEach(b => b.onclick = () => {
    const ct = trackers().find(t => t.id === b.dataset.plen), l = ct && periodLog(ct, b.dataset.pd); if (!l) return;
    const v = prompt('How many days did the period that started ' + fmtDate(l.date) + ' last?', periodDays(ct, l.date) || '');
    if (v === null) return;
    const n = parseInt(v, 10), rest = (l.notes || '').replace(/^\d+\s*days?\s*/, '');
    l.notes = n > 0 && n < 30 ? n + ' days' + (rest ? ' ' + rest : '') : rest;
    window.save(); viewFiles();
  });
  root.querySelectorAll('[data-hinfo]').forEach(b => b.onclick = () => editHealthInfo(who));
  root.querySelectorAll('[data-hgrow]').forEach(b => b.onclick = () => editHealth(who, 'growth'));
  root.querySelectorAll('[data-hvisit]').forEach(b => b.onclick = () => editHealth(who, 'visit'));
  root.querySelectorAll('[data-hedit]').forEach(b => b.onclick = () => { const it = data.items.find(i => i.id === b.dataset.hedit); if (it) editHealth(who, it.title, it); });
}
function editHealthInfo(who) {
  let it = healthOf(who, 'info')[0]; const v = it ? hj(it) : {};
  const f = (k, l, ph) => '<label>' + l + '<input data-hi="' + k + '" value="' + esc(v[k] || '') + '" placeholder="' + esc(ph || '') + '"></label>';
  openModal('<h2>' + esc(who) + '’s key info</h2>' + f('doctor', 'Doctor / clinic', 'Dr. …, Russellville Pediatrics') + f('phone', 'Doctor’s phone', '479-…') + f('allergies', 'Allergies', 'None known') + f('meds', 'Medications', '') + f('conditions', 'Conditions', '') + f('blood', 'Blood type', '') + f('insurance', 'Insurance (plan & member #)', '') +
    '<label>Other<textarea data-hi="other" rows="3">' + esc(v.other || '') + '</textarea></label><div class="row-actions"><button type="button" id="hiSave">Save</button><button type="button" class="ghost" id="hiCancel">Cancel</button></div>');
  $('hiCancel').onclick = closeModal;
  $('hiSave').onclick = () => {
    const o = {}; document.querySelectorAll('[data-hi]').forEach(i => { if (i.value.trim()) o[i.dataset.hi] = i.value.trim(); });
    if (!it) { it = newItem({ kind: 'health', list: who, title: 'info', date: today() }); data.items.push(it); }
    it.notes = JSON.stringify(o); window.save(); closeModal(); viewFiles();
  };
}
function editHealth(who, type, it) {
  const v = it ? hj(it) : {}, growth = type === 'growth';
  openModal('<h2>' + (growth ? 'Height & weight' : 'Doctor visit') + '</h2><label>Date<input id="hDate" type="date" value="' + esc(it ? it.date : today()) + '"></label>' +
    (growth ? '<div class="grid2"><label>Weight (lb)<input id="hW" inputmode="decimal" value="' + esc(v.weight || '') + '" placeholder="98.5"></label><label>Height<input id="hH" value="' + esc(v.height || '') + '" placeholder="4 ft 11 in, or 59"></label></div><label>Note<input id="hN" value="' + esc(v.note || '') + '" placeholder="From the check-up"></label>'
      : '<label>Doctor / clinic<input id="hDoc" value="' + esc(v.doctor || (hj(healthOf(who, 'info')[0] || {}).doctor || '')) + '"></label><label>Reason<input id="hR" value="' + esc(v.reason || '') + '" placeholder="Well check, sick visit, sports physical…"></label>' +
        '<label>What the doctor said<textarea id="hNotes" rows="5">' + esc(v.notes || '') + '</textarea></label><label>Medicines<input id="hM" value="' + esc(v.meds || '') + '" placeholder="Amoxicillin 2x a day for 10 days"></label>' +
        '<label>Next appointment<input id="hF" type="date" value="' + esc(v.followup || '') + '"></label><label class="check"><input type="checkbox" id="hCal"' + (it ? '' : ' checked') + '> Put the next appointment on my calendar</label>') +
    '<div class="row-actions"><button type="button" id="hSave">Save</button><button type="button" class="ghost" id="hCancel">Cancel</button>' + (it ? '<button type="button" class="danger" id="hDel">Delete</button>' : '') + '</div>');
  $('hCancel').onclick = closeModal;
  $('hSave').onclick = () => {
    const o = growth ? { weight: $('hW').value.trim(), height: $('hH').value.trim(), note: $('hN').value.trim() } : { doctor: $('hDoc').value.trim(), reason: $('hR').value.trim(), notes: $('hNotes').value.trim(), meds: $('hM').value.trim(), followup: $('hF').value };
    if (growth && !o.weight && !o.height) { toast('Add a weight or height.'); return; }
    const rec = it || newItem({ kind: 'health', list: who, title: type });
    Object.assign(rec, { date: $('hDate').value || today(), notes: JSON.stringify(o) });
    if (!it) data.items.push(rec);
    if (!growth && o.followup && $('hCal') && $('hCal').checked) data.items.push(newItem({ kind: 'event', title: who + ' – ' + (o.doctor || 'doctor') + ' appointment', date: o.followup, allDay: true, notes: o.reason ? 'Follow-up: ' + o.reason : '', color: COLORS[2] }));
    window.save(); closeModal(); viewFiles(); toast('✓ Saved' + (!growth && o.followup && $('hCal') && $('hCal').checked ? ' · appointment added to your calendar (set the time there)' : ''));
  };
  if (it) $('hDel').onclick = () => { if (!confirm('Delete this entry?')) return; data.items = data.items.filter(i => i !== it); window.save(); closeModal(); viewFiles(); };
}

// ---------- More: calendars, feed, lists ----------
function viewMore() {
  $('view').innerHTML = '<h1>More</h1>' +
    '<a class="card pad tip" href="#calendars"><b>Google &amp; Outlook calendars</b><span class="sub">' + (S().calendars.length ? S().calendars.length + ' connected →' : 'Connect →') + '</span></a>' +
    '<a class="card pad tip" href="#gifts"><b>Gifts</b><span class="sub">🎁 Birthdays, anniversaries and gift ideas →</span></a>' +
    '<a class="card pad tip" href="#notes"><b>Notes</b><span class="sub">📝 Sticky notes →</span></a>' +
    '<a class="card pad tip" href="#track"><b>Trackers</b><span class="sub">💅 ❤️ ⚠️ and more →</span></a>' +
    '<a class="card pad tip" href="#feed"><b>Show my planner in Google, Outlook or iPhone</b><span class="sub">Subscribe →</span></a>' +
    '<div class="card pad"><h2>Also show</h2><label class="check"><input type="checkbox" id="mBand"' + (S().showBand !== false ? ' checked' : '') + '> Band volunteer events (from Band Volunteers)</label>' +
    '<label class="check"><input type="checkbox" id="mBills"' + (S().showBills !== false ? ' checked' : '') + '> Bills and paydays (from Money)</label></div>' +
    '<div class="card pad"><h2>Task lists</h2><textarea id="mLists" rows="5">' + esc(S().lists.join('\n')) + '</textarea>' +
    '<h3>Document folders</h3><textarea id="mFolders" rows="6">' + esc(S().folders.join('\n')) + '</textarea><p class="helper">One per line. Use / for a folder inside a folder, like Cecilia/School. (Easier: Files → ＋ New folder.)</p></div>' +
    '<div class="card pad"><h2>Account and sync</h2><div data-syncbox></div></div>' +
    '<div class="card pad"><h2>Your other apps</h2><div class="row-actions"><a class="button ghost" href="../money/">Money</a><a class="button ghost" href="../volunteers/">Band Volunteers</a><a class="button ghost" href="../">Booth Tracker</a></div></div>' +
    '<div class="card pad"><h2>Back up</h2><button type="button" class="ghost" id="mBackup">Download backup</button></div>';
  const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
  $('mBand').onchange = e => { S().showBand = e.target.checked; window.save(); if (e.target.checked) loadBand(); };
  $('mBills').onchange = e => { S().showBills = e.target.checked; window.save(); if (e.target.checked) loadBills(); };
  $('mLists').onchange = e => { S().lists = lines(e.target.value); window.save(); toast('Saved.'); };
  $('mFolders').onchange = e => { setFolders(lines(e.target.value)); toast('Saved.'); };
  $('mBackup').onclick = () => download('planner-backup-' + today() + '.json', JSON.stringify(data, null, 1), 'application/json');
  if (window.plannerSync) window.plannerSync.renderBox();
}
function viewCalendars() {
  const cals = S().calendars;
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>Your calendars</h1>' +
    '<p class="helper">Paste each calendar\'s private iCal link. The planner checks them when you open it (and every 30 minutes). To change an event from Google or Outlook, change it there.</p>' +
    (cals.map(c => { const got = cache.get('cal_' + c.id); return '<div class="card pad calrow"><div class="mini-row"><span><i class="dot" style="background:' + esc(c.color) + '"></i><b>' + esc(c.name) + '</b><span class="sub">' + (got ? got.events.length + ' events · checked ' + new Date(got.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : c.lastError ? '⚠ ' + esc(c.lastError) : 'not loaded yet') + '</span></span>' +
      '<label class="switch"><input type="checkbox" data-con="' + c.id + '"' + (c.on !== false ? ' checked' : '') + '> show</label></div>' +
      '<div class="row-actions"><button type="button" class="ghost small" data-cref="' + c.id + '">↻ Refresh</button><button type="button" class="ghost small" data-cedit="' + c.id + '">Edit</button></div></div>'; }).join('') || '') +
    '<div class="row-actions"><button type="button" id="calAddG">+ Google Calendar</button><button type="button" id="calAddO">+ Outlook</button><button type="button" class="ghost" id="calAddI">+ iPhone (iCloud)</button></div>' +
    '<details class="card pad"' + (cals.length ? '' : ' open') + '><summary>How to find the private link</summary>' +
    '<h3>Google Calendar (on a computer)</h3><ol class="steps"><li>Go to <b>calendar.google.com</b> → the ⚙ gear → <b>Settings</b>.</li><li>On the left, under <b>Settings for my calendars</b>, click your calendar.</li><li>Scroll to <b>Integrate calendar</b> → copy <b>Secret address in iCal format</b> (ends in <i>basic.ics</i>).</li><li>Here: <b>+ Google Calendar</b> → paste.</li></ol>' +
    '<h3>Outlook</h3><ol class="steps"><li>Go to <b>outlook.com</b> (or Outlook on the web) → ⚙ Settings → <b>Calendar</b> → <b>Shared calendars</b>.</li><li>Under <b>Publish a calendar</b>, pick your calendar and <b>Can view all details</b> → <b>Publish</b>.</li><li>Copy the <b>ICS</b> link.</li><li>Here: <b>+ Outlook</b> → paste.</li></ol>' +
    '<h3>iPhone (iCloud) calendar</h3><ol class="steps"><li>In the iPhone <b>Calendar</b> app → <b>Calendars</b> → tap ⓘ next to a calendar.</li><li>Turn on <b>Public Calendar</b> → <b>Share Link…</b> → <b>Copy</b>.</li><li>Here: <b>+ iPhone</b> → paste.</li></ol>' +
    '<p class="helper">These links are private keys to your calendar. They\'re saved only in your account.</p></details>';
  $('view').querySelectorAll('[data-con]').forEach(x => x.onchange = () => { const c = cals.find(c => c.id === x.dataset.con); c.on = x.checked; window.save(); });
  $('view').querySelectorAll('[data-cref]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Checking…'; const c = cals.find(c => c.id === b.dataset.cref); await refreshCalendar(c); window.save(); viewCalendars(); });
  $('view').querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => editCalendar(b.dataset.cedit));
  $('calAddG').onclick = () => editCalendar(null, 'Google');
  $('calAddO').onclick = () => editCalendar(null, 'Outlook');
  $('calAddI').onclick = () => editCalendar(null, 'iPhone');
}
function editCalendar(id, kind) {
  const cals = S().calendars, c = id ? cals.find(x => x.id === id) : { name: kind === 'Outlook' ? 'Outlook' : kind === 'iPhone' ? 'iPhone' : 'Google', url: '', color: COLORS[(cals.length + 1) % COLORS.length], on: true };
  openModal('<h2>' + (id ? 'Edit calendar' : 'Add ' + esc(kind) + ' calendar') + '</h2><label>Name<input id="kName" value="' + esc(c.name) + '" placeholder="Work, Family, School…"></label>' +
    '<label>Private iCal link<input id="kUrl" value="' + esc(c.url) + '" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
    '<p class="lbl">Color</p><div class="colors">' + COLORS.map(x => '<button type="button" class="cdot' + (c.color === x ? ' on' : '') + '" data-color="' + x + '" style="background:' + x + '"></button>').join('') + '</div>' +
    '<div class="row-actions"><button type="button" id="kSave">Save &amp; load</button><button type="button" class="ghost" id="kCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="kDel">Remove</button>' : '') + '</div>');
  let color = c.color;
  document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; document.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); });
  $('kCancel').onclick = closeModal;
  $('kSave').onclick = async () => {
    const url = $('kUrl').value.trim();
    if (!/^(https?|webcals?):\/\//i.test(url)) { toast('Paste the whole link (starts with https:// or webcal://).'); return; }
    Object.assign(c, { name: $('kName').value.trim() || c.name, url, color });
    if (!id) { c.id = uid(); S().calendars = cals.concat([c]); }
    window.save();
    $('kSave').disabled = true; $('kSave').textContent = 'Loading…';
    const ok = await refreshCalendar(c);
    window.save(); closeModal();
    if (ok) { location.hash = 'calendar'; } else viewCalendars();
  };
  if (id) $('kDel').onclick = () => { if (!confirm('Remove ' + c.name + ' from the planner? (Nothing is deleted in Google or Outlook.)')) return; S().calendars = cals.filter(x => x.id !== id); window.save(); closeModal(); viewCalendars(); };
}
function viewFeed() {
  if (!S().feedToken) { S().feedToken = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join(''); window.save(); }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  const url = (CFG.sync && CFG.sync.url) + '/functions/v1/planner-feed?t=' + S().feedToken + '&tz=' + encodeURIComponent(tz);
  const webcal = url.replace(/^https:/, 'webcal:');
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>Share your planner</h1>' +
    '<p class="helper">Subscribe once, and everything you add here (events, and tasks with a due date) shows up in that calendar too. Google refreshes it every few hours; iPhone and Outlook more often.</p>' +
    '<div class="card pad"><h2>Your planner\'s link</h2><div class="linkbox"><code id="feedUrl">' + esc(url) + '</code></div><div class="row-actions"><button type="button" class="ghost small" id="feedCopy">Copy link</button><a class="button ghost small" href="' + esc(webcal) + '">Subscribe on this iPhone</a></div>' +
    '<p class="helper">Keep this link private. <button type="button" class="linkish" id="feedNew">Make a new link</button> (the old one stops working).</p></div>' +
    '<div class="card pad"><h3>iPhone</h3><p>Tap <b>Subscribe on this iPhone</b> above → <b>Subscribe</b> → <b>Add</b>.</p>' +
    '<h3>Google Calendar (on a computer)</h3><p>calendar.google.com → next to <b>Other calendars</b> click <b>+</b> → <b>From URL</b> → paste the link → <b>Add calendar</b>.</p>' +
    '<h3>Outlook</h3><p>Outlook on the web → Calendar → <b>Add calendar</b> → <b>Subscribe from web</b> → paste → name it “Planner” → <b>Import</b>.</p></div>';
  $('feedCopy').onclick = () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Copied.'), () => toast('Press and hold the link to copy it.'));
  $('feedNew').onclick = () => { if (!confirm('Make a new link? Calendars subscribed to the old one will stop updating.')) return; S().feedToken = ''; window.save(); viewFeed(); };
}

if (!maybeBrief()) route();
// Keep connected calendars fresh while the planner is open.
setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 10 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
