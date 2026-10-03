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
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tab === 'brief' ? 'today' : tab)));
  const views = { today: viewToday, brief: viewBrief, calendar: viewCalendar, tasks: a => a === 'routines' ? viewRoutines() : a === 'templates' ? viewTemplates() : viewTasks(), meals: viewMeals, files: viewFiles, more: viewMore, calendars: viewCalendars, feed: viewFeed };
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
    '<div class="row-actions tight"><a class="button ghost small" href="#brief">☀ Morning briefing</a><button type="button" class="ghost small" id="tdTpl">⚡ Use a template</button></div>' +
    (todayRoutines.length ? '<div class="rchips">' + todayRoutines.map(routineChip).join('') + '</div>' : '') +
    (upNext ? '<div class="card upnext" ' + rowOpen(upNext) + ' style="--pc:' + esc(upNext.color || '#b0905a') + '"><span class="eyebrow">Up next · <b id="untilTxt" data-d="' + upNext.date + '" data-t="' + upNext.start + '">' + esc(untilText(upNext.date, upNext.start)) + '</b></span><h2>' + esc(upNext.title) + '</h2><span class="sub">' + esc(fmtDate(upNext.date, 'rel') + ' · ' + fmtTime(upNext.start) + (upNext.end ? '–' + fmtTime(upNext.end) : '') + (upNext.location ? ' · ' + upNext.location : '')) + '</span></div>' : '') +
    '<div class="quickbar"><input id="quick" placeholder="Type it: “Dentist friday 3pm”, “Call Mrs. Abbott”"><button type="button" id="quickGo">Add</button></div>' +
    (overdue.length ? '<div class="card pad warnbox"><h2 class="section-title">Past due <small>' + overdue.length + '</small></h2>' + overdue.map(i => entryRow({ src: 'planner', id: i.id, kind: 'task', listName: i.list, date: i.date, allDay: true, endDate: i.date, title: i.title + ' · ' + fmtDate(i.date), list: i.list, priority: i.priority })).join('') + '</div>' : '') +
    '<div class="strip">' + strip + '</div>' +
    '<div class="card pad"><h2 class="section-title">' + (sel === t ? 'Today' : esc(fmtDate(sel, 'rel'))) + ' <small>' + esc(new Date(sel + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</small></h2>' +
    (selList.length ? selList.map(entryRow).join('') : '<p class="helper">Nothing scheduled' + (sel === t ? ' today' : '') + '. <button type="button" class="linkish" id="addHere">Add something</button></p>') + '</div>' +
    mealsCard(sel) +
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
    cells += '<button type="button" class="cd' + (iso === today() ? ' today' : '') + (iso === calDay ? ' sel' : '') + '" data-day="' + iso + '"><span class="n">' + d + '</span>' +
      es.slice(0, 3).map(e => '<span class="pill" style="--pc:' + esc(e.color || '#888') + '">' + esc(e.title) + '</span>').join('') + (es.length > 3 ? '<span class="more">+' + (es.length - 3) + '</span>' : '') + '</button>';
  }
  const dayList = onDay(list, calDay);
  $('calBody').innerHTML = '<div class="cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => '<div class="cw">' + x + '</div>').join('') + cells + '</div>' +
    '<div class="card pad"><div class="mini-head"><h2>' + esc(fmtDate(calDay, 'long')) + '</h2><button type="button" class="ghost small" data-goday="' + calDay + '">Open day</button></div>' + (dayList.length ? dayList.map(entryRow).join('') : '<p class="helper">Nothing on this day.</p>') + mealsLine(calDay) + '</div>';
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
    boxes += '<div class="pday' + (d === today() ? ' today' : '') + '" style="--tone:' + DAY_TONES[k] + '"><button type="button" class="ptag" data-goday="' + d + '">' + dt.toLocaleDateString([], { weekday: 'long' }) + ' <small>' + dt.getDate() + '</small></button>' +
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
      (allDay.length ? '<div class="alld">' + allDay.map(e => '<span class="hev" ' + rowOpen(e) + ' style="--pc:' + esc(e.color || '#8c7a6b') + '">' + (e.kind === 'task' ? (e.done ? '✓ ' : '○ ') : '') + esc(e.title) + '</span>').join('') + '</div>' : '') +
      '<div class="hours">' + hours + '</div>' +
      '<div class="pbox2"><span>Evening</span><textarea data-dp="evening" rows="2">' + esc(v.evening || '') + '</textarea></div>' +
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
      '<div class="pbox2 writebox"><span>Write it down</span><button type="button" class="ghost small bigwrite" id="inkOpen">Full page ⤢</button><div id="inkHere" class="inkhost"></div></div>' +
    '</div></div>';
  const body = $('calBody'), put = fn => { const nv = dayPage(d); fn(nv); saveDayPage(d, nv); };
  body.querySelectorAll('[data-dday]').forEach(b => b.onclick = () => { calDay = b.dataset.dday; viewCalendar(); });
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
  openModal('<h2>' + (id ? 'Edit' : 'New') + '</h2>' +
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
  if (!id) setTimeout(() => $('iTitle').focus(), 60);
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
let fileFolder = '', fileFind = '';
function viewFiles() {
  const folders = S().folders, q = fileFind.toLowerCase();
  const list = data.docs.filter(d => (!fileFolder || d.folder === fileFolder) && (!q || (d.title + ' ' + d.fileName + ' ' + d.note).toLowerCase().includes(q))).sort((a, b) => b.id.localeCompare(a.id));
  const count = f => data.docs.filter(d => d.folder === f).length;
  $('view').innerHTML = '<h1>Documents</h1>' + (signedIn() ? '' : '<p class="chip warn">Sign in (More) to upload and open documents.</p>') +
    '<div class="row-actions"><label class="button file">Upload<input type="file" id="fUp" multiple hidden></label><label class="button ghost file">Take a photo<input type="file" id="fCam" accept="image/*" capture="environment" hidden></label></div>' +
    '<input id="fFind" type="search" placeholder="Search documents" value="' + esc(fileFind) + '">' +
    '<div class="chips scrollx"><button type="button" class="chipbtn' + (!fileFolder ? ' on' : '') + '" data-ff="">All <b>' + data.docs.length + '</b></button>' + folders.map(f => '<button type="button" class="chipbtn' + (fileFolder === f ? ' on' : '') + '" data-ff="' + esc(f) + '"' + chipStyle(f) + '>' + chipDot(f) + esc(f) + (count(f) ? ' <b>' + count(f) + '</b>' : '') + '</button>').join('') + '</div>' +
    '<div class="card pad">' + (list.map(d => {
      const it = d.itemId && data.items.find(i => i.id === d.itemId);
      return '<div class="doc" data-doc="' + d.id + '"><span class="dicon"' + (d.folder ? ' style="--fc:' + pastel(d.folder)[0] + '"' : '') + '>' + esc(((d.fileName || '').match(/\.(\w{1,4})$/) || ['', 'FILE'])[1].toUpperCase()) + '</span><div class="who"><b>' + esc(d.title || d.fileName) + '</b><span class="sub">' + esc([d.folder, fileSize(d.size || 0), it ? 'with ' + it.title : ''].filter(Boolean).join(' · ')) + '</span></div><button type="button" class="linkish" data-dedit="' + d.id + '">Edit</button></div>';
    }).join('') || '<p class="helper">No documents' + (fileFolder || q ? ' here' : ' yet') + '. Upload permission slips, receipts, schedules, forms…</p>') + '</div>';
  $('view').querySelectorAll('[data-ff]').forEach(b => b.onclick = () => { fileFolder = b.dataset.ff; viewFiles(); });
  $('fFind').oninput = e => { fileFind = e.target.value; clearTimeout(viewFiles.t); viewFiles.t = setTimeout(() => { viewFiles(); const f = $('fFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  const up = async e => {
    const fs = [...e.target.files]; if (!fs.length) return;
    let ok = 0; toast('Uploading ' + fs.length + '…');
    for (const f of fs) { try { await addDoc(f, { folder: fileFolder }); ok++; } catch (err) { toast(f.name + ': ' + err.message); } }
    if (ok) toast('✓ Uploaded ' + ok + (ok === 1 ? ' file' : ' files') + (fileFolder ? ' to ' + fileFolder : '') + '.');
    viewFiles();
  };
  $('fUp').onchange = up; $('fCam').onchange = up;
  $('view').querySelectorAll('[data-doc]').forEach(r => r.onclick = e => { if (!e.target.dataset.dedit) openDoc(r.dataset.doc); });
  $('view').querySelectorAll('[data-dedit]').forEach(b => b.onclick = e => { e.stopPropagation(); editDoc(b.dataset.dedit); });
}
function editDoc(id) {
  const d = data.docs.find(x => x.id === id); if (!d) return;
  const items = data.items.filter(i => i.kind !== 'note').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80);
  openModal('<h2>Document</h2><label>Name<input id="dTitle" value="' + esc(d.title) + '"></label>' +
    '<label>Folder<select id="dFolder"><option value="">—</option>' + S().folders.map(f => '<option' + (f === d.folder ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select></label>' +
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

// ---------- More: calendars, feed, lists ----------
function viewMore() {
  $('view').innerHTML = '<h1>More</h1>' +
    '<a class="card pad tip" href="#calendars"><b>Google &amp; Outlook calendars</b><span class="sub">' + (S().calendars.length ? S().calendars.length + ' connected →' : 'Connect →') + '</span></a>' +
    '<a class="card pad tip" href="#feed"><b>Show my planner in Google, Outlook or iPhone</b><span class="sub">Subscribe →</span></a>' +
    '<div class="card pad"><h2>Also show</h2><label class="check"><input type="checkbox" id="mBand"' + (S().showBand !== false ? ' checked' : '') + '> Band volunteer events (from Band Volunteers)</label>' +
    '<label class="check"><input type="checkbox" id="mBills"' + (S().showBills !== false ? ' checked' : '') + '> Bills and paydays (from Money)</label></div>' +
    '<div class="card pad"><h2>Task lists</h2><textarea id="mLists" rows="5">' + esc(S().lists.join('\n')) + '</textarea>' +
    '<h3>Document folders</h3><textarea id="mFolders" rows="5">' + esc(S().folders.join('\n')) + '</textarea><p class="helper">One per line.</p></div>' +
    '<div class="card pad"><h2>Account and sync</h2><div data-syncbox></div></div>' +
    '<div class="card pad"><h2>Your other apps</h2><div class="row-actions"><a class="button ghost" href="../money/">Money</a><a class="button ghost" href="../volunteers/">Band Volunteers</a><a class="button ghost" href="../">Booth Tracker</a></div></div>' +
    '<div class="card pad"><h2>Back up</h2><button type="button" class="ghost" id="mBackup">Download backup</button></div>';
  const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
  $('mBand').onchange = e => { S().showBand = e.target.checked; window.save(); if (e.target.checked) loadBand(); };
  $('mBills').onchange = e => { S().showBills = e.target.checked; window.save(); if (e.target.checked) loadBills(); };
  $('mLists').onchange = e => { S().lists = lines(e.target.value); window.save(); toast('Saved.'); };
  $('mFolders').onchange = e => { S().folders = lines(e.target.value); window.save(); toast('Saved.'); };
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
