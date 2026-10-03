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
const COLORS = ['#3d4a63', '#7c9a82', '#c47a5a', '#b0905a', '#8a6a8f', '#5a8a9a', '#c08497', '#6b7280'];
// Each task list and document folder gets its own muted color (accent, soft background).
const PASTELS = [['#c08497', '#f6ecef'], ['#7c9a82', '#edf3ee'], ['#3d4a63', '#eceef2'], ['#5a8a9a', '#e9f1f3'], ['#c47a5a', '#f7ede8'], ['#b0905a', '#f3ecdf'], ['#8a6a8f', '#f1ecf2'], ['#6b7280', '#eeeff1']];
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
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; document.body.classList.remove('locked'); }
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
  const u = String(url || '').trim();
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
    out.push({ src: 'planner', id: i.id, kind: i.kind, listName: i.list, date: d, endDate: span ? addDays(d, span) : d, start: i.allDay ? '' : i.start, end: i.allDay ? '' : i.end, allDay: i.kind === 'task' || i.allDay || !i.start, title: i.title, location: i.location, notes: i.notes, done: i.done, color: i.kind === 'task' ? (i.list ? pastel(i.list)[0] : '#c9b8ff') : (i.color || COLORS[0]), list: i.list, priority: i.priority });
  }));
  S().calendars.filter(c => c.on !== false).forEach(c => {
    const got = cache.get('cal_' + c.id); if (!got) return;
    calendarOccurrences(got.events, from, to).forEach(e => out.push(Object.assign(e, { src: 'cal', cal: c.name, color: c.color })));
  });
  if (S().showBand !== false) { const b = cache.get('band'); if (b) b.rows.filter(e => e.date >= from && e.date <= to).forEach(e => out.push({ src: 'band', date: e.date, endDate: e.date, start: e.start_time || '', end: e.end_time || '', allDay: !e.start_time, title: e.name, location: e.location || '', color: '#b0905a', link: '../volunteers/#event/' + e.id })); }
  if (S().showBills !== false) { const b = cache.get('bills'); if (b) b.recurring.forEach(r => billDates(r, from, to).forEach(d => out.push({ src: 'bill', date: d, endDate: d, allDay: true, title: r.payee + ' ' + (r.type === 'income' ? '+' : '−') + '$' + Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }), color: r.type === 'income' ? '#7c9a82' : '#c47a5a', link: '../money/#recurring' }))); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}
// Entries that touch a day (multi-day events show on each of their days).
const onDay = (list, d) => list.filter(e => e.date <= d && (e.endDate || e.date) >= d);

function entryRow(e) {
  const when = e.kind === 'task' ? '' : e.allDay ? (e.endDate && e.endDate > e.date ? 'until ' + fmtDate(e.endDate) : 'All day') : fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '');
  const src = e.src === 'cal' ? e.cal : e.src === 'band' ? 'Band Volunteers' : e.src === 'bill' ? 'Money' : e.kind === 'task' ? (e.list || 'Task') : '';
  const box = e.kind === 'task' ? '<button type="button" class="tick' + (e.done ? ' on' : '') + '" data-done="' + e.id + '"' + (e.listName ? ' style="--lc:' + pastel(e.listName)[0] + '"' : '') + '>' + (e.done ? '✓' : '') + '</button>' : '<span class="bar" style="background:' + esc(e.color || '#888') + '"></span>';
  const open = e.src === 'planner' ? ' data-item="' + e.id + '"' : e.link ? ' data-link="' + esc(e.link) + '"' : ' data-ext="' + esc(JSON.stringify({ t: e.title, d: e.date, s: e.start, e: e.end, l: e.location, n: e.notes, c: e.cal })) + '"';
  return '<div class="ev' + (e.done ? ' done' : '') + '"' + open + '>' + box + '<div class="who"><b>' + (e.priority >= 2 ? '★ ' : '') + esc(e.title) + '</b><span class="sub">' + esc([when, e.location, src].filter(Boolean).join(' · ')) + '</span></div></div>';
}
function wireRows(root) {
  root.querySelectorAll('[data-done]').forEach(b => b.onclick = ev => { ev.stopPropagation(); toggleDone(b.dataset.done); });
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
function toggleDone(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  if (it.repeat && !it.done && it.date) {
    // A repeating task moves on to its next date instead of staying done.
    const next = itemDates(it, addDays(it.date, 1), addDays(it.date, 400))[0];
    if (next) { it.date = next; window.save(); toast('✓ Done. Next one: ' + fmtDate(next)); route(); return; }
  }
  it.done = !it.done; window.save(); if (it.done) toast('✓ Done'); route();
}

// ---------- Routing ----------
function route() {
  const [tab, arg] = (location.hash.slice(1) || 'today').split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const views = { today: viewToday, calendar: viewCalendar, tasks: viewTasks, files: viewFiles, more: viewMore, calendars: viewCalendars, feed: viewFeed };
  (views[tab] || viewToday)(arg);
}
// Load connected calendars, band events and bills the first time the planner is signed in (it may open signed out).
window.render = () => { const y = window.scrollY; route(); window.scrollTo(0, y); if (!render.started && signedIn()) { render.started = true; refreshAll(); } };
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
$('topAdd').onclick = $('fab').onclick = () => {
  openModal('<h2>Add</h2><div class="addgrid"><button type="button" data-addk="event"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>Event<span>on the calendar</span></button><button type="button" data-addk="task"><svg viewBox="0 0 24 24"><path d="M9 11.5l2.5 2.5L20 5.5"/><path d="M20 12v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3H15"/></svg>Task<span>to-do</span></button>' +
    '<button type="button" data-addk="note"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>Note<span>for today</span></button><button type="button" data-addk="file"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>Document<span>upload a file</span></button></div>' +
    '<label>Or just type it<input id="qAdd" placeholder="Dentist friday 3pm · Call Mrs. Abbott tomorrow"></label><p class="helper">Dates and times are picked up from what you type.</p>' +
    '<div class="row-actions"><button type="button" id="qGo">Add</button><button type="button" class="ghost" id="addX">Cancel</button></div>');
  $('addX').onclick = closeModal;
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
function viewToday() {
  const t = today(), week = agenda(addDays(t, -60), addDays(t, 14));
  const todays = onDay(week, t);
  const overdue = data.items.filter(i => i.kind === 'task' && !i.done && i.date && i.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const note = data.items.find(i => i.kind === 'note' && i.date === t);
  const hr = new Date().getHours();
  const todayTasks = data.items.filter(i => i.kind === 'task' && i.date && (i.date === t || (i.date < t && !i.done)));
  const doneToday = todayTasks.filter(i => i.done).length;
  let next = '';
  for (let k = 1; k <= 7; k++) {
    const d = addDays(t, k), es = onDay(week, d).filter(e => !(e.kind === 'task' && e.done));
    if (es.length) next += '<div class="day">' + esc(fmtDate(d, 'rel')) + '</div>' + es.map(entryRow).join('');
  }
  $('view').innerHTML = (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') +
    '<div class="hello"><span class="eyebrow">' + (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', Shaana</span><h1>' + esc(fmtDate(t, 'long')) + '</h1>' +
    '<span class="sub">' + [todays.filter(e => e.kind !== 'task').length, todayTasks.length].map((n, k) => n + (k ? (n === 1 ? ' task' : ' tasks') : (n === 1 ? ' event' : ' events'))).join(' · ') + ' today</span>' +
    (todayTasks.length ? '<div class="prog">' + doneToday + ' of ' + todayTasks.length + ' tasks complete<div class="bar"><i style="width:' + Math.round(doneToday / todayTasks.length * 100) + '%"></i></div></div>' : '') + '</div>' +
    '<div class="quickbar"><input id="quick" placeholder="Add: “Dentist friday 3pm” or “Call Mrs. Abbott”"><button type="button" id="quickGo">Add</button></div>' +
    (overdue.length ? '<div class="card pad warnbox"><h2 class="section-title">Past due <small>' + overdue.length + '</small></h2>' + overdue.map(i => entryRow({ src: 'planner', id: i.id, kind: 'task', listName: i.list, date: i.date, allDay: true, endDate: i.date, title: i.title + ' · ' + fmtDate(i.date), list: i.list, priority: i.priority })).join('') + '</div>' : '') +
    '<div class="card pad"><h2 class="section-title">Today <small>' + esc(new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</small></h2>' + (todays.length ? todays.map(entryRow).join('') : '<p class="helper">Nothing scheduled today.</p>') + '</div>' +
    '<div class="card pad journal"><h2>Notes</h2><textarea id="dayNote" rows="4" placeholder="Thoughts, reminders, things to remember today…">' + esc(note ? note.notes : '') + '</textarea></div>' +
    '<div class="card pad"><h2>The week ahead</h2>' + (next || '<p class="helper">Nothing coming up.</p>') + '</div>' +
    (S().calendars.length ? '' : '<a class="card pad tip" href="#calendars"><b>Connect your Google and Outlook calendars</b><span class="sub">so everything shows up here →</span></a>');
  wireRows($('view'));
  const go = () => { const v = $('quick').value.trim(); if (v) quickAdd(v); };
  $('quickGo').onclick = go; $('quick').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('dayNote').onchange = e => {
    let n = data.items.find(i => i.kind === 'note' && i.date === t);
    if (!n) { n = { id: 'note-' + t, kind: 'note', title: 'Notes', date: t, notes: '' }; data.items.push(n); }
    n.notes = e.target.value; window.save(); toast('Note saved.');
  };
  if (window.plannerSync) window.plannerSync.renderBox();
}

// ---------- Calendar ----------
let calMonth = '', calDay = '';
function viewCalendar() {
  if (!calMonth) calMonth = today().slice(0, 7);
  if (!calDay || !calDay.startsWith(calMonth)) calDay = today().startsWith(calMonth) ? today() : calMonth + '-01';
  const [y, m] = calMonth.split('-').map(Number), n = lastDay(y, m), first = new Date(y, m - 1, 1).getDay();
  const list = agenda(calMonth + '-01', calMonth + '-' + pad(n));
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cd blank"></div>';
  for (let d = 1; d <= n; d++) {
    const iso = calMonth + '-' + pad(d), es = onDay(list, iso);
    cells += '<button type="button" class="cd' + (iso === today() ? ' today' : '') + (iso === calDay ? ' sel' : '') + '" data-day="' + iso + '"><span class="n">' + d + '</span>' +
      es.slice(0, 3).map(e => '<span class="pill" style="--pc:' + esc(e.color || '#888') + '">' + esc(e.title.replace(/^[🎺🧾💵] /u, '')) + '</span>').join('') + (es.length > 3 ? '<span class="more">+' + (es.length - 3) + '</span>' : '') + '</button>';
  }
  const dayList = onDay(list, calDay);
  $('view').innerHTML = '<div class="cal-head"><button type="button" class="ghost small" id="cPrev">‹</button><h2>' + esc(monthName(calMonth)) + '</h2><button type="button" class="ghost small" id="cNext">›</button></div>' +
    '<div class="row-actions center"><button type="button" class="ghost small" id="cToday">Today</button>' + (S().calendars.length ? '<button type="button" class="ghost small" id="cRefresh">Refresh</button>' : '<a class="button ghost small" href="#calendars">Connect Google or Outlook</a>') + '</div>' +
    '<div class="cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => '<div class="cw">' + x + '</div>').join('') + cells + '</div>' +
    '<div class="card pad"><div class="mini-head"><h2>' + esc(fmtDate(calDay, 'long')) + '</h2><button type="button" class="small" id="cAdd">＋ Add</button></div>' + (dayList.length ? dayList.map(entryRow).join('') : '<p class="helper">Nothing on this day.</p>') + '</div>' + legend();
  $('cPrev').onclick = () => { calMonth = isoDay(new Date(y, m - 2, 1)).slice(0, 7); viewCalendar(); };
  $('cNext').onclick = () => { calMonth = isoDay(new Date(y, m, 1)).slice(0, 7); viewCalendar(); };
  $('cToday').onclick = () => { calMonth = today().slice(0, 7); calDay = today(); viewCalendar(); };
  if ($('cRefresh')) $('cRefresh').onclick = () => { toast('Refreshing…'); refreshAll(true); };
  $('cAdd').onclick = () => editItem(null, { kind: 'event', date: calDay });
  $('view').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { calDay = b.dataset.day; viewCalendar(); });
  wireRows($('view'));
}
function legend() {
  const parts = [[COLORS[0], 'Planner']].concat(S().calendars.filter(c => c.on !== false).map(c => [c.color, c.name]));
  if (S().showBand !== false && cache.get('band')) parts.push(['#b0905a', 'Band']);
  if (S().showBills !== false && cache.get('bills')) parts.push(['#c47a5a', 'Bills']);
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
  $('view').innerHTML = '<h1>Tasks</h1>' +
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
    '<div class="segs" id="iKind"><button type="button" class="seg' + (kind === 'event' ? ' on' : '') + '" data-k="event">🗓 Event</button><button type="button" class="seg' + (kind === 'task' ? ' on' : '') + '" data-k="task">✅ Task</button></div>' +
    '<label>What<input id="iTitle" value="' + esc(it.title) + '" placeholder="' + (kind === 'task' ? 'Turn in band forms' : 'Dentist') + '" autocapitalize="sentences"></label>' +
    '<div class="grid2"><label><span id="iDateL">' + (kind === 'task' ? 'Due' : 'Date') + '</span><input id="iDate" type="date" value="' + esc(it.date || '') + '"></label><label class="ev-only">Ends (for trips)<input id="iEndDate" type="date" value="' + esc(it.endDate || '') + '"></label></div>' +
    '<label class="check ev-only"><input type="checkbox" id="iAllDay"' + (it.allDay ? ' checked' : '') + '> All day</label>' +
    '<div class="grid2 ev-only times"><label>Starts<input id="iStart" type="time" value="' + esc(it.start) + '"></label><label>Ends<input id="iEnd" type="time" value="' + esc(it.end) + '"></label></div>' +
    '<div class="grid2"><label>Repeats<select id="iRepeat">' + Object.entries(REPEATS).map(([k, l]) => '<option value="' + k + '"' + (it.repeat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>List<select id="iList"><option value="">—</option>' + S().lists.map(l => '<option' + (l === it.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    '<label class="ev-only">Where<input id="iLoc" value="' + esc(it.location) + '" placeholder="Address or place"></label>' +
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
  $('iKind').querySelectorAll('.seg').forEach(b => b.onclick = () => { kind = b.dataset.k; $('iKind').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); sync(); });
  $('iAllDay').onchange = sync; sync();
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
    Object.assign(it, { kind, title, date: $('iDate').value || null, endDate: kind === 'event' && $('iEndDate').value > $('iDate').value ? $('iEndDate').value : null, allDay, start: allDay ? '' : $('iStart').value, end: allDay ? '' : $('iEnd').value, repeat: $('iRepeat').value, list: $('iList').value, location: $('iLoc').value.trim(), priority: $('iPri').checked ? 2 : 0, notes: $('iNotes').value, color: kind === 'event' ? color : '' });
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

route();
// Keep connected calendars fresh while the planner is open.
setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 10 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
