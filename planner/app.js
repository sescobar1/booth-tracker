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
    await loadPeriods();
    giftCheck(); lunchCheck(); carCheck();
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
// Period days logged on a family link (Cece's), shown on Shaana's calendar: logged days and the next expected ones.
async function loadPeriods() {
  try {
    const { data: rows, error } = await client().from('kid_links').select('name,period_days,period_open').eq('period', true);
    if (!error) cache.set('periods', { at: Date.now(), rows: rows || [] });
  } catch (e) {}
}
// Same guess as the family page: average cycle (28 days until two periods are logged), usual length from ended periods.
function periodGuess(days) {
  const t = today(), set = new Set(days), starts = [...set].sort().filter(d => !set.has(addDays(d, -1)));
  if (!starts.length) return null;
  const between = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
  const lens = starts.map(st => { let n = 0; while (set.has(addDays(st, n))) n++; return n; });
  const gaps = []; for (let i = 1; i < starts.length; i++) { const g = between(starts[i - 1], starts[i]); if (g >= 18 && g <= 45) gaps.push(g); }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length, ended = lens.filter((n, i) => addDays(starts[i], n) <= t);
  const cycle = gaps.length ? Math.round(avg(gaps.slice(-6))) : 28, len = ended.length ? Math.min(8, Math.max(3, Math.round(avg(ended.slice(-6))))) : 5;
  let next = addDays(starts[starts.length - 1], cycle);
  while (addDays(next, len) <= t) next = addDays(next, cycle);
  return { cycle, len, next };
}
function periodEntries(from, to) {
  const out = [], p = cache.get('periods'); if (!p) return out;
  p.rows.forEach(r => {
    const days = [...(r.period_days || [])];
    if (r.period_open && r.period_open <= today()) for (let d = r.period_open, i = 0; d <= today() && i < 10; d = addDays(d, 1), i++) days.push(d);
    const set = new Set(days), color = '#e58fb0';
    [...set].sort().filter(d => !set.has(addDays(d, -1))).forEach(st => {
      let end = st; while (set.has(addDays(end, 1))) end = addDays(end, 1);
      if (end < from || st > to) return;
      const going = r.period_open && st <= r.period_open && r.period_open <= end;
      out.push({ src: 'period', date: st, endDate: end, allDay: true, title: '🌸 ' + r.name + ' – period' + (going ? ' (started ' + fmtDate(r.period_open) + ')' : ''), color, location: '', notes: '' });
    });
    const g = periodGuess(days);
    if (g) for (let c = 0; c < 3; c++) {
      const st = addDays(g.next, c * g.cycle), end = addDays(st, g.len - 1);
      if (end < from || st > to || set.has(st)) continue;
      out.push({ src: 'period', date: st, endDate: end, allDay: true, title: '🌸 ' + r.name + ' – period expected', color, location: '', notes: 'A guess from the days ' + r.name + ' marked (usual cycle ' + g.cycle + ' days).' });
    }
  });
  return out;
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
  data.items.filter(i => (i.kind === 'event' && !i.id.startsWith('medrem-')) || (i.kind === 'task' && i.date)).forEach(i => itemDates(i, from, to).forEach(d => {
    const span = i.endDate && i.endDate > i.date ? Math.round((new Date(i.endDate) - new Date(i.date)) / 864e5) : 0;
    out.push({ src: 'planner', id: i.id, kind: i.kind, listName: i.list, driver: i.driver, who: i.who, date: d, endDate: span ? addDays(d, span) : d, start: i.allDay ? '' : i.start, end: i.allDay ? '' : i.end, allDay: i.kind === 'task' || i.allDay || !i.start, title: i.title, location: i.location, notes: i.notes, done: i.done, color: i.kind === 'task' ? (i.list ? pastel(i.list)[0] : '#c9b8ff') : (i.color || COLORS[0]), list: i.list, priority: i.priority });
  }));
  S().calendars.filter(c => c.on !== false).forEach(c => {
    const got = cache.get('cal_' + c.id); if (!got) return;
    calendarOccurrences(got.events, from, to).forEach(e => out.push(Object.assign(e, { src: 'cal', cal: c.name, color: c.color })));
  });
  if (S().showBand !== false) { const b = cache.get('band'); if (b) b.rows.filter(e => e.date >= from && e.date <= to).forEach(e => out.push({ src: 'band', date: e.date, endDate: e.date, start: e.start_time || '', end: e.end_time || '', allDay: !e.start_time, title: e.name, location: e.location || '', color: '#b59f83', link: '../volunteers/#event/' + e.id })); }
  out.push(...periodEntries(from, to));
  if (S().showBills !== false) { const b = cache.get('bills'); if (b) b.recurring.forEach(r => billDates(r, from, to).forEach(d => out.push({ src: 'bill', date: d, endDate: d, allDay: true, title: r.payee + ' ' + (r.type === 'income' ? '+' : '−') + '$' + Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }), color: r.type === 'income' ? '#7d9b76' : '#c99a8e', link: '../money/#recurring' }))); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}
// Entries that touch a day (multi-day events show on each of their days).
const onDay = (list, d) => list.filter(e => e.date <= d && (e.endDate || e.date) >= d);

function entryRow(e) {
  const when = e.kind === 'task' ? '' : e.allDay ? (e.endDate && e.endDate > e.date ? 'until ' + fmtDate(e.endDate) : 'All day') : fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '');
  const drv = e.driver ? '🚗 ' + e.driver : '';
  const src = e.src === 'cal' ? e.cal : e.src === 'band' ? 'Band Volunteers' : e.src === 'bill' ? 'Money' : e.src === 'period' ? 'Family link' : e.kind === 'task' ? (e.list || 'Task') : '';
  const box = e.kind === 'task' ? '<button type="button" class="tick' + (e.done ? ' on' : '') + '" data-done="' + e.id + '"' + (e.listName ? ' style="--lc:' + pastel(e.listName)[0] + '"' : '') + '>' + (e.done ? '✓' : '') + '</button>' : '<span class="bar" style="background:' + esc(e.color || '#888') + '"></span>';
  const open = e.src === 'planner' ? ' data-item="' + e.id + '"' : e.link ? ' data-link="' + esc(e.link) + '"' : ' data-ext="' + esc(JSON.stringify({ t: e.title, d: e.date, s: e.start, e: e.end, l: e.location, n: e.notes, c: e.cal })) + '"';
  return '<div class="ev' + (e.done ? ' done' : '') + '"' + open + '>' + box + '<div class="who"><b>' + (e.priority >= 2 ? '★ ' : '') + esc(e.title) + '</b><span class="sub">' + esc([when, e.location, drv, whoLabel(e.who), src].filter(Boolean).join(' · ')) + '</span></div></div>';
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
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tab === 'brief' || tab === 'track' || tab === 'gifts' ? 'today' : tab === 'notes' ? 'files' : tab === 'quick' || tab === 'meds' || tab === 'car' || tab === 'kids' ? 'more' : tab)));
  const views = { today: viewToday, brief: viewBrief, track: viewTrack, calendar: viewCalendar, tasks: a => a === 'routines' ? viewRoutines() : a === 'templates' ? viewTemplates() : a === 'cleaning' ? viewCleaning() : a === 'atu' ? viewAtu() : a === 'sna' ? viewSna() : viewTasks(), meals: viewMeals, files: viewFiles, notes: viewNotes, gifts: viewGifts, quick: viewQuick, meds: viewMeds, car: viewCar, kids: viewKids, more: viewMore, calendars: viewCalendars, feed: viewFeed };
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
    '<button type="button" class="ghost tplmenu" id="addImp">📷 Add events from a screenshot, photo or document</button>' +
    '<label>Or just type it<input id="qAdd" placeholder="Dentist friday 3pm · Call Mrs. Abbott tomorrow"></label><p class="helper">Dates and times are picked up from what you type.</p>' +
    '<div class="row-actions"><button type="button" id="qGo">Add</button><button type="button" class="ghost" id="addX">Cancel</button></div>');
  $('addX').onclick = closeModal;
  $('addTpl').onclick = () => { closeModal(); useTemplate(calDay || today()); };
  $('addImp').onclick = () => importEvents();
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
    '<div id="bdayBox"></div><div id="kidBox"></div>' + pingCard() + medCard(sel) + mealsCard(sel) + giftCard() + carDueCard() + cleanCard() +
    '<div class="card pad journal"><h2>Notes</h2><textarea id="dayNote" rows="4" placeholder="Thoughts, reminders, things to remember today…">' + esc(note ? note.notes : '') + '</textarea></div>' +
    '<div class="card pad"><h2>The week ahead</h2>' + (next || '<p class="helper">Nothing coming up.</p>') + '</div>' +
    (S().calendars.length ? '' : '<a class="card pad tip" href="#calendars"><b>Connect your Google and Outlook calendars</b><span class="sub">so everything shows up here →</span></a>');
  wireRows($('view'));
  loadKidNews(); loadBirthdays(); wirePing($('view'));
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
  ((cache.get('periods') || {}).rows || []).forEach(r => parts.push(['#e58fb0', r.name + '’s period']));
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
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks" class="on">To-do</a><a href="#tasks/routines">Routines</a><a href="#tasks/templates">Templates</a><a href="#tasks/cleaning">🧹 Cleaning</a><a href="#tasks/atu">🎓 ATU</a></div>' +
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

// Whose calendar an event goes on: the family links show it to everyone, only one person, or (Auto) by each link's own rules.
const WHO = [['', 'Auto'], ['everyone', '👪 Everyone'], ['Eli', 'Elisha'], ['Cece', 'Cece'], ['Shaana', 'Shaana'], ['Salvador', 'Salvador']];
const whoLabel = w => w === 'everyone' ? '👪 Everyone' : w ? '👤 Just ' + (w === 'Eli' ? 'Elisha' : w) : '';

// ---------- Add / edit an event or task ----------
function editItem(id, preset) {
  const it = id ? data.items.find(i => i.id === id) : Object.assign({ kind: 'event', title: '', date: today(), endDate: null, start: '', end: '', allDay: false, done: false, list: '', priority: 0, notes: '', location: '', repeat: '', color: '' }, preset || {});
  if (!it) return;
  let kind = it.kind;
  const files = id ? data.docs.filter(d => d.itemId === id) : [];
  const freq = id ? [] : quickList();
  openModal('<h2>' + (id ? 'Edit' : 'New') + '</h2>' +
    (id ? '' : '<div class="qadd ev-only"><p class="lbl">Quick add <span class="sub">— one tap, on the date below</span></p>' +
      '<div class="qtrack">' + trackers().map(t => '<button type="button" class="qt" data-qt="' + esc(t.id) + '" title="' + esc(t.name) + '"><span>' + t.icon + '</span><small>' + esc(t.name) + '</small></button>').join('') + '</div>' +
      (freq.length ? '<div class="qfreq">' + freq.map((f, n) => '<button type="button" class="qf' + (f.saved ? ' star' : '') + '" data-qf="' + n + '">' + (f.saved ? '⭐' : '<i class="dot" style="background:' + esc(f.color || COLORS[0]) + '"></i>') + esc(f.title) + '<small>' + (f.start ? fmtTime(f.start) : 'all day') + '</small></button>').join('') + '</div>' : '') +
      '<div class="row-actions tight"><button type="button" class="ghost small" id="qEdit">⭐ My quick adds</button><button type="button" class="ghost small" id="qImport">📷 From a screenshot or document</button></div>' +
      '<p class="lbl or">or fill it in</p></div>') +
    '<div class="segs" id="iKind"><button type="button" class="seg' + (kind === 'event' ? ' on' : '') + '" data-k="event">Event</button><button type="button" class="seg' + (kind === 'task' ? ' on' : '') + '" data-k="task">Task</button></div>' +
    '<label>What<input id="iTitle" value="' + esc(it.title) + '" placeholder="' + (kind === 'task' ? 'Turn in band forms' : 'Dentist') + '" autocapitalize="sentences"></label>' +
    '<div class="grid2"><label><span id="iDateL">' + (kind === 'task' ? 'Due' : 'Date') + '</span><input id="iDate" type="date" value="' + esc(it.date || '') + '"></label><label class="ev-only">Ends (for trips)<input id="iEndDate" type="date" value="' + esc(it.endDate || '') + '"></label></div>' +
    '<label class="check ev-only"><input type="checkbox" id="iAllDay"' + (it.allDay ? ' checked' : '') + '> All day</label>' +
    '<div class="grid2 ev-only times"><label>Starts<input id="iStart" type="time" value="' + esc(it.start) + '"></label><label>Ends<input id="iEnd" type="time" value="' + esc(it.end) + '"></label></div>' +
    '<div class="grid2"><label>Repeats<select id="iRepeat">' + Object.entries(REPEATS).map(([k, l]) => '<option value="' + k + '"' + (it.repeat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>List<select id="iList"><option value="">—</option>' + S().lists.map(l => '<option' + (l === it.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    '<label class="ev-only">Where<input id="iLoc" value="' + esc(it.location) + '" placeholder="Address or place"></label>' +
    '<p class="lbl ev-only">Whose calendar</p><div class="segs ev-only" id="iWho">' + WHO.map(([v, l]) => '<button type="button" class="seg' + ((it.who || '') === v ? ' on' : '') + '" data-who="' + v + '">' + l + '</button>').join('') + '</div>' +
    '<p class="helper ev-only">Auto: each family link decides by the event name (Eli, Cece, work, games…).</p>' +
    '<div class="grid2"><label class="ev-only">Who’s driving<input id="iDriver" list="drivers" value="' + esc(it.driver || '') + '" placeholder="Me, Salvador, carpool…"></label>' +
    '<label>Remind me<select id="iRemind"></select></label></div><datalist id="drivers">' + [...new Set(data.items.map(i => i.driver).filter(Boolean).concat(['Me']))].map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<label class="task-only check"><input type="checkbox" id="iPri"' + (it.priority >= 2 ? ' checked' : '') + '> ❗ Important</label>' +
    '<p class="lbl ev-only">Color</p><div class="colors ev-only">' + COLORS.map(c => '<button type="button" class="cdot' + ((it.color || COLORS[0]) === c ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>').join('') + '</div>' +
    '<label>Notes<textarea id="iNotes" rows="3">' + esc(it.notes) + '</textarea></label>' +
    (id ? '' : '<label class="check ev-only"><input type="checkbox" id="iStar"> ⭐ Save as a quick add (one tap next time)</label>') +
    '<p class="lbl">Documents</p><div id="iFiles">' + files.map(d => '<div class="mini-row"><a href="#" data-open="' + d.id + '">📎 ' + esc(d.title || d.fileName) + '</a></div>').join('') + '</div>' +
    '<label class="button ghost small file">Attach a file<input type="file" id="iFile" hidden></label><p class="helper" id="iFileNote"></p>' +
    (id && kind === 'event' ? '<p class="lbl">Put it on another calendar</p><div class="row-actions"><a class="button ghost small" target="_blank" rel="noopener" href="' + esc(googleLink(it)) + '">Google</a><a class="button ghost small" target="_blank" rel="noopener" href="' + esc(outlookLink(it)) + '">Outlook</a><button type="button" class="ghost small" id="iIcs">iPhone / .ics</button></div>' : '') +
    '<div class="row-actions"><button type="button" id="iSave">Save</button><button type="button" class="ghost" id="iCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="iDel">Delete</button>' : '') + '</div>');
  let color = it.color || COLORS[0], pending = null, who = it.who || '';
  $('iWho').querySelectorAll('[data-who]').forEach(b => b.onclick = () => { who = b.dataset.who; $('iWho').querySelectorAll('[data-who]').forEach(x => x.classList.toggle('on', x === b)); });
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
    Object.assign(it, { kind, title, date: $('iDate').value || null, endDate: kind === 'event' && $('iEndDate').value > $('iDate').value ? $('iEndDate').value : null, allDay, start: allDay ? '' : $('iStart').value, end: allDay ? '' : $('iEnd').value, repeat: $('iRepeat').value, list: $('iList').value, location: $('iLoc').value.trim(), priority: $('iPri').checked ? 2 : 0, notes: $('iNotes').value, color: kind === 'event' ? color : '', driver: kind === 'event' ? $('iDriver').value.trim() : '', who: kind === 'event' ? who : '', remind: $('iRemind').value === '' ? null : Number($('iRemind').value) });
    if (!id) { it.id = uid(); it.done = false; it.sort = 0; data.items.push(it); }
    if (!id && kind === 'event' && $('iStar') && $('iStar').checked) saveQuick({ title, allDay, start: it.start, end: it.end, location: it.location, color: it.color, driver: it.driver, list: it.list, remind: it.remind });
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
    data.items.push(newItem({ kind: 'event', title: f.title, date: d, allDay: !f.start, start: f.start || '', end: f.end || '', location: f.location || '', color: f.color || COLORS[0], driver: f.driver || '', list: f.list || '', remind: f.remind == null || f.remind === '' ? null : Number(f.remind) }));
    window.save(); closeModal(); route();
    toast('✓ ' + f.title + ' added for ' + fmtDate(d, 'rel') + (f.start ? ' at ' + fmtTime(f.start) : '') + (f.remind != null && f.remind !== '' && +f.remind !== -1 ? ' · reminder set' : ''));
  });
  if ($('qEdit')) $('qEdit').onclick = () => manageQuick();
  if ($('qImport')) $('qImport').onclick = () => importEvents();
  if (!id) setTimeout(() => $('iTitle').focus(), 60);
}
// ---------- Saved quick adds ("Work in Conway": all day, reminder the evening before) ----------
const QUICK_DEFAULTS = [{ title: 'Work in Conway', allDay: true, start: '', end: '', location: 'Conway, AR', color: '#7f9fa3', driver: '', list: 'Work', remind: 360 }];
const quickEvents = () => { if (!S().quickEvents) S().quickEvents = QUICK_DEFAULTS.map(q => Object.assign({}, q)); return S().quickEvents; };
// Saved ones first (starred), then the ones learned from the calendars that aren't saved yet.
function quickList() {
  const saved = quickEvents().map(q => Object.assign({ saved: true }, q)), have = new Set(saved.map(q => q.title.toLowerCase()));
  return saved.concat(frequentEvents().filter(f => !have.has(f.title.toLowerCase())).slice(0, Math.max(3, 10 - saved.length)));
}
function saveQuick(q) {
  const list = quickEvents().filter(x => x.title.toLowerCase() !== q.title.toLowerCase());
  S().quickEvents = list.concat([{ title: q.title, allDay: !!q.allDay || !q.start, start: q.allDay ? '' : q.start || '', end: q.allDay ? '' : q.end || '', location: q.location || '', color: q.color || COLORS[0], driver: q.driver || '', list: q.list || '', remind: q.remind == null || q.remind === '' ? null : Number(q.remind) }]);
  window.save();
}
const REMIND_ALLDAY = [['', '9 AM that day'], ['-420', '7 AM that day'], ['-720', 'Noon that day'], ['360', '6 PM the day before'], ['-1', 'No alert']];
const REMIND_TIMED = [['', '30 min before'], ['0', 'At start time'], ['10', '10 min before'], ['60', '1 hour before'], ['120', '2 hours before'], ['1440', '1 day before'], ['-1', 'No alert']];
const remindLabel = q => { const v = q.remind == null ? '' : String(q.remind); const r = (q.allDay || !q.start ? REMIND_ALLDAY : REMIND_TIMED).find(x => x[0] === v); return r ? r[1] : ''; };
// The Quick adds page (More → Quick adds): add, change, reorder or delete the one-tap events.
function manageQuick() { closeModal(); location.hash = 'quick'; }
function viewQuick() {
  const qs = quickEvents(), sug = frequentEvents().filter(f => !qs.some(q => q.title.toLowerCase() === f.title.toLowerCase()));
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>Quick adds</h1>' +
    '<p class="helper">These are the ⭐ buttons at the top of <b>＋ Event</b>. One tap adds the event on the date you picked, with the time, place and reminder already set.</p>' +
    '<div class="row-actions"><button type="button" id="qNew">＋ New quick add</button></div>' +
    '<div class="card pad"><h2>My quick adds</h2>' +
    (qs.length ? qs.map((q, n) => '<div class="qrow"><div class="qinfo"><i class="dot" style="background:' + esc(q.color || COLORS[0]) + '"></i><div><b>⭐ ' + esc(q.title) + '</b><span class="sub">' + esc([q.allDay || !q.start ? 'All day' : fmtTime(q.start) + (q.end ? '–' + fmtTime(q.end) : ''), q.location, q.driver ? '🚗 ' + q.driver : '', remindLabel(q) ? '🔔 ' + remindLabel(q) : ''].filter(Boolean).join(' · ')) + '</span></div></div>' +
      '<div class="qbtns">' + (n ? '<button type="button" class="ghost small" data-qup="' + n + '" aria-label="Move up">↑</button>' : '') + '<button type="button" class="ghost small" data-qe="' + n + '">Edit</button><button type="button" class="danger small" data-qx="' + n + '">Delete</button></div></div>').join('')
      : '<p class="helper">No quick adds yet. Tap ＋ New quick add.</p>') + '</div>' +
    (sug.length ? '<div class="card pad"><h2>Suggested</h2><p class="helper">Things you add often. Tap one to make it a quick add.</p><div class="qfreq">' + sug.map((f, n) => '<button type="button" class="qf" data-qs="' + n + '">＋ ' + esc(f.title) + '<small>' + (f.start ? fmtTime(f.start) : 'all day') + '</small></button>').join('') + '</div></div>' : '') +
    '<a class="card pad tip" href="#track"><b>Tracker icons</b><span class="sub">💅 ❤️ ⚠️ also show in ＋ Event. Change them in Trackers →</span></a>';
  $('qNew').onclick = () => editQuick(null);
  $('view').querySelectorAll('[data-qe]').forEach(b => b.onclick = () => editQuick(+b.dataset.qe));
  $('view').querySelectorAll('[data-qx]').forEach(b => b.onclick = () => { const q = qs[+b.dataset.qx]; if (!confirm('Delete the quick add “' + q.title + '”? (Events already on your calendar stay.)')) return; S().quickEvents = qs.filter(x => x !== q); window.save(); viewQuick(); toast('Deleted'); });
  $('view').querySelectorAll('[data-qup]').forEach(b => b.onclick = () => { const n = +b.dataset.qup, l = qs.slice(); [l[n - 1], l[n]] = [l[n], l[n - 1]]; S().quickEvents = l; window.save(); viewQuick(); });
  $('view').querySelectorAll('[data-qs]').forEach(b => b.onclick = () => { saveQuick(sug[+b.dataset.qs]); toast('⭐ Added to quick adds'); viewQuick(); });
}
function editQuick(n) {
  const q = n == null ? { title: '', allDay: true, start: '', end: '', location: '', color: COLORS[0], driver: '', list: '', remind: null } : quickEvents()[n];
  let color = q.color || COLORS[0];
  openModal('<h2>' + (n == null ? 'New quick add' : 'Edit quick add') + '</h2>' +
    '<label>What<input id="qT" value="' + esc(q.title) + '" placeholder="Work in Conway"></label>' +
    '<label class="check"><input type="checkbox" id="qAll"' + (q.allDay || !q.start ? ' checked' : '') + '> All day</label>' +
    '<div class="grid2" id="qTimes"><label>Starts<input id="qS" type="time" value="' + esc(q.start || '') + '"></label><label>Ends<input id="qE" type="time" value="' + esc(q.end || '') + '"></label></div>' +
    '<label>Where<input id="qL" value="' + esc(q.location || '') + '"></label>' +
    '<div class="grid2"><label>Remind me<select id="qR"></select></label><label>List<select id="qLi"><option value="">—</option>' + S().lists.map(l => '<option' + (l === q.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    '<label>Who’s driving<input id="qD" value="' + esc(q.driver || '') + '"></label>' +
    '<p class="lbl">Color</p><div class="colors">' + COLORS.map(c => '<button type="button" class="cdot' + (c === color ? ' on' : '') + '" data-qc="' + c + '" style="background:' + c + '"></button>').join('') + '</div>' +
    '<div class="row-actions"><button type="button" id="qSave">Save</button><button type="button" class="ghost" id="qBack">Cancel</button>' + (n == null ? '' : '<button type="button" class="danger" id="qDel">Delete</button>') + '</div>');
  const back = () => { closeModal(); if (location.hash.startsWith('#quick')) viewQuick(); else location.hash = 'quick'; };
  if ($('qDel')) $('qDel').onclick = () => { if (!confirm('Delete the quick add “' + q.title + '”?')) return; S().quickEvents = quickEvents().filter((x, k) => k !== n); window.save(); back(); };
  const opts = () => { const all = $('qAll').checked, cur = $('qR').value || (q.remind == null ? '' : String(q.remind)); $('qTimes').hidden = all; $('qR').innerHTML = (all ? REMIND_ALLDAY : REMIND_TIMED).map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join(''); };
  $('qAll').onchange = opts; opts();
  $('modalBody').querySelectorAll('[data-qc]').forEach(b => b.onclick = () => { color = b.dataset.qc; $('modalBody').querySelectorAll('[data-qc]').forEach(x => x.classList.toggle('on', x === b)); });
  $('qBack').onclick = closeModal;
  $('qSave').onclick = () => {
    const title = $('qT').value.trim(); if (!title) { toast('Type what it is.'); return; }
    const all = $('qAll').checked || !$('qS').value;
    const nq = { title, allDay: all, start: all ? '' : $('qS').value, end: all ? '' : $('qE').value, location: $('qL').value.trim(), color, driver: $('qD').value.trim(), list: $('qLi').value, remind: $('qR').value === '' ? null : Number($('qR').value) };
    const list = quickEvents().slice(); if (n == null) list.push(nq); else list[n] = nq;
    S().quickEvents = list; window.save(); back(); toast('⭐ Saved');
  };
}

// ---------- Add events from a screenshot, photo, PDF, Word file or pasted text ----------
// Everything is read on the device: pictures with Tesseract, PDFs with PDF.js, Word files with Mammoth.
const CDN = 'https://cdn.jsdelivr.net/npm/';
const loadScript = (src, test) => new Promise((ok, no) => { if (test()) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Couldn’t load the reader (needs internet the first time).')); document.head.appendChild(s); });
async function ocrImage(img, onProgress) {
  await loadScript(CDN + 'tesseract.js@5/dist/tesseract.min.js', () => window.Tesseract);
  const worker = await Tesseract.createWorker('eng', 1, { workerPath: CDN + 'tesseract.js@5/dist/worker.min.js', corePath: CDN + 'tesseract.js-core@5', langPath: CDN + '@tesseract.js-data/eng/4.0.0_best_int',
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100)); } });
  try { return (await worker.recognize(img)).data.text; } finally { worker.terminate(); }
}
async function pdfText(file, onProgress) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', () => window.pdfjsLib);
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 10); n++) {
    const page = await pdf.getPage(n), tc = await page.getTextContent(), rows = {};
    tc.items.forEach(i => { const y = Math.round(i.transform[5] / 3); (rows[y] = rows[y] || []).push(i); });
    let text = Object.keys(rows).sort((a, b) => b - a).map(y => rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n');
    if (text.replace(/\s/g, '').length < 20) { // A scanned page: draw it and read the picture.
      const vp = page.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      text = await ocrImage(c, onProgress);
    }
    out.push(text);
  }
  return out.join('\n');
}
async function docxText(file) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', () => window.mammoth);
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}
// Pull every dated thing out of the text: "Oct 9 @ 7:30 pm", "10/12 No school", "Fri 9", "November 23-27 Thanksgiving break"…
function findEvents(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/[|•·*]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [], base = today(), M = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  let ctxMonth = 0, ctxYear = 0, cur = null, after = 0;
  const iso = (mo, d, y) => {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return '';
    let yr = y ? (String(y).length === 2 ? 2000 + +y : +y) : ctxYear || +base.slice(0, 4);
    let s = yr + '-' + pad(mo) + '-' + pad(d);
    if (!y && !ctxYear && s < addDays(base, -45)) s = (yr + 1) + s.slice(4);
    return s;
  };
  const tm = (h, m, ap, apEnd) => { h = +h; ap = (ap || apEnd || '').toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; if (!ap && h >= 1 && h <= 6) h += 12; return h > 23 ? '' : pad(h) + ':' + (m || '00'); };
  const timesIn = l => {
    let m = l.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)\b/i);
    if (m) return { start: tm(m[1], m[2], m[3], m[6]), end: tm(m[4], m[5], m[6]), raw: m[0] };
    m = l.match(/(\d{1,2})(?::(\d{2}))\s*(a\.?m\.?|p\.?m\.?)?|(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (m && !/^\d{1,2}\/\d/.test(m[0])) return m[4] ? { start: tm(m[4], '00', m[5]), end: '', raw: m[0] } : { start: tm(m[1], m[2], m[3]), end: '', raw: m[0] };
    if (/\bnoon\b/i.test(l)) return { start: '12:00', end: '', raw: 'noon' };
    return null;
  };
  const dateIn = l => {
    let m = l.match(new RegExp('\\b' + M + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|to|through|thru)\\s*(?:' + M + '\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?', 'i'));
    if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, mo2 = m[3] ? MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1 : mo; return { date: iso(mo, +m[2], m[5]), endDate: iso(mo2, +m[4], m[5]), raw: m[0] }; }
    m = l.match(new RegExp('\\b' + M + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?', 'i'));
    if (m) return { date: iso(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2], m[3]), raw: m[0] };
    m = l.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:-|–|to)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) return { date: iso(+m[1], +m[2], m[3]), endDate: iso(+m[4], +m[5], m[6] || m[3]), raw: m[0] };
    m = l.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) return { date: iso(+m[1], +m[2], m[3]), raw: m[0] };
    m = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return { date: iso(+m[2], +m[3], m[1]), raw: m[0] };
    // "Fri9" / "Friday 9" on a month list, using the month heading above it.
    m = l.match(/^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\.?,?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
    if (m && ctxMonth) return { date: iso(ctxMonth, +m[2]), raw: m[0] };
    return null;
  };
  const junk = l => /^(learn more|read more|more info|details|view|register|tickets?|free|rsvp|share|add to calendar|google calendar|ical|export)\b|https?:\/\/|www\./i.test(l) || l.length < 3;
  const placeish = l => l.length <= 60 && /\b(auditorium|room|hall|center|centre|gym|church|school|campus|field|stadium|park|plaza|library|arena|theat(er|re)|cafeteria|office|building|union|wpn|rhs|rms|st\.?|street|ave|avenue|rd|road|blvd|hwy|dr\.?)\b|^\d+\s+\w+/i.test(l);
  const clean = t => t.replace(/^[\s,;:@\-–—]+|[\s,;:@\-–—]+$/g, '').replace(/\s+/g, ' ').trim();
  lines.forEach(l => {
    const head = l.match(new RegExp('^' + M + '\\s+(\\d{4})$', 'i'));
    if (head) { ctxMonth = MONTHS.indexOf(head[1].slice(0, 3).toLowerCase()) + 1; ctxYear = +head[2]; return; }
    const d = dateIn(l);
    if (d && d.date) {
      const t = timesIn(l.replace(d.raw, ' '));
      let rest = clean(l.replace(d.raw, ' ').replace(t ? t.raw : '', ' ').replace(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|rsday|urday|sday)?\b\.?,?/gi, ' ').replace(/^@|\s@\s/g, ' '));
      // The same day repeated under a title ("October 9 @ 7:30 pm") fills in the open event instead of starting a new one.
      if (cur && cur.date === d.date && !rest && !cur.start) { if (t) { cur.start = t.start; cur.end = t.end; } after = 0; return; }
      cur = { date: d.date, endDate: d.endDate && d.endDate > d.date ? d.endDate : '', start: t ? t.start : '', end: t ? t.end : '', title: junk(rest) ? '' : rest, location: '' };
      if (cur.date.slice(5, 7) && !d.raw.match(/^(sun|mon|tue|wed|thu|fri|sat)/i)) ctxMonth = +cur.date.slice(5, 7);
      out.push(cur); after = 0; return;
    }
    if (!cur || ++after > 4 || junk(l)) return;
    const t = timesIn(l);
    if (t && !cur.start && clean(l.replace(t.raw, '')).length < 4) { cur.start = t.start; cur.end = t.end; return; }
    if (!cur.title) { cur.title = clean(t ? l.replace(t.raw, ' ') : l); if (t && !cur.start) { cur.start = t.start; cur.end = t.end; } return; }
    if (!cur.location && placeish(l)) { cur.location = clean(l); return; }
  });
  const seen = new Set();
  return out.filter(e => e.title && e.title.length <= 120).map(e => Object.assign(e, { title: e.title.charAt(0).toUpperCase() + e.title.slice(1) }))
    .filter(e => { const k = e.date + '|' + e.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
let impFound = [];
function importEvents(prefill) {
  $('modalBody').classList.add('wide');
  openModal('<h2>📷 Add events from a picture or document</h2>' +
    '<p class="helper">Screenshots, photos of a flyer or school calendar, PDFs, Word files or calendar (.ics) files. It finds every date, and you check them before anything is added.</p>' +
    '<div id="impDrop" class="pastebox impdrop"><div class="row-actions"><label class="button file">Choose a picture or file<input type="file" id="impFile" hidden accept="image/*,application/pdf,.pdf,.docx,.txt,.csv,.ics,text/plain,text/calendar"></label><label class="button ghost file">Take a photo<input type="file" id="impCam" accept="image/*" capture="environment" hidden></label><button type="button" class="ghost" id="impPasteBtn">📋 Paste</button></div><p class="sub">or drop it here · on a computer press Ctrl+V</p></div>' +
    '<label>Or paste or type the text<textarea id="impText" rows="4" placeholder="Oct 9 Faculty Recital 7:30 pm&#10;10/12 No school">' + esc(prefill || '') + '</textarea></label><div class="row-actions tight"><button type="button" class="ghost small" id="impRead">Find the dates</button></div>' +
    '<p class="helper" id="impStatus"></p><div id="impList"></div>');
  const go = async (file) => {
    const st = $('impStatus'); st.textContent = 'Reading ' + (file.name || 'the picture') + '…';
    try {
      const name = (file.name || '').toLowerCase(), type = file.type || '';
      let text = '';
      if (type.startsWith('image/')) text = await ocrImage(await shrinkPic(file), p => { if ($('impStatus')) $('impStatus').textContent = 'Reading the picture… ' + p + '%'; });
      else if (type === 'application/pdf' || name.endsWith('.pdf')) text = await pdfText(file, p => { if ($('impStatus')) $('impStatus').textContent = 'Reading the scanned page… ' + p + '%'; });
      else if (name.endsWith('.docx')) text = await docxText(file);
      else if (name.endsWith('.ics') || type === 'text/calendar') { const evs = parseIcs(await file.text()); showFound(evs.filter(e => !e.recurrenceId).map(e => ({ date: e.start.slice(0, 10), endDate: e.allDay && e.end ? addDays(e.end.slice(0, 10), -1) : '', start: e.allDay ? '' : e.start.slice(11, 16), end: e.allDay || !e.end ? '' : e.end.slice(11, 16), title: e.title || '(no title)', location: e.location || '' })).filter(e => e.date >= addDays(today(), -30))); return; }
      else text = await file.text();
      if (!$('impText')) return;
      $('impText').value = text.trim();
      showFound(findEvents(text));
    } catch (e) { if ($('impStatus')) $('impStatus').textContent = '⚠ ' + e.message; }
  };
  impPaste.go = go;
  $('impFile').onchange = e => { const f = e.target.files[0]; if (f) go(f); };
  $('impCam').onchange = e => { const f = e.target.files[0]; if (f) go(f); };
  $('impRead').onclick = () => showFound(findEvents($('impText').value));
  $('impPasteBtn').onclick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        for (const it of await navigator.clipboard.read()) { const type = it.types.find(t => t.startsWith('image/')); if (type) { go(new File([await it.getType(type)], 'screenshot', { type })); return; } }
      }
      const t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : '';
      if (t) { $('impText').value = t; showFound(findEvents(t)); } else toast('Nothing to paste. Copy a screenshot or some text first.');
    } catch (e) { toast('Press and hold in the text box, then tap Paste.'); $('impText').focus(); }
  };
  const drop = $('impDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) go(f); });
  if (prefill) showFound(findEvents(prefill));
}
function impPaste(e) {
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (files.length && impPaste.go) { e.preventDefault(); impPaste.go(files[0]); }
}
// Pictures are shrunk first so reading is quick on a phone.
function shrinkPic(file) {
  return new Promise(ok => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c); };
    img.onerror = () => { URL.revokeObjectURL(url); ok(file); };
    img.src = url;
  });
}
function showFound(list) {
  impFound = list;
  const st = $('impStatus'); if (!st) return;
  st.textContent = list.length ? 'Found ' + list.length + (list.length === 1 ? ' event' : ' events') + '. Check them, fix anything that’s off, then add.' : 'No dates found. Try a clearer picture, or type the events in the box above (one per line, like “Oct 9 Recital 7:30pm”).';
  let color = COLORS[2];
  $('impList').innerHTML = list.length ? '<div class="implist">' + list.map((e, n) => '<div class="impev" data-n="' + n + '"><label class="check"><input type="checkbox" data-ion="' + n + '" checked></label>' +
      '<div class="impf"><input data-if="title" value="' + esc(e.title) + '" aria-label="What">' +
      '<div class="impg"><input type="date" data-if="date" value="' + esc(e.date) + '"><input type="time" data-if="start" value="' + esc(e.start) + '"><input type="time" data-if="end" value="' + esc(e.end) + '"></div>' +
      '<input data-if="location" value="' + esc(e.location) + '" placeholder="Where (optional)"></div></div>').join('') + '</div>' +
    '<div class="grid2"><label>List<select id="impLi"><option value="">—</option>' + S().lists.map(l => '<option>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label>Reminders<select id="impRem"><option value="">Usual (30 min before / 9 AM)</option><option value="1440">1 day before</option><option value="360">6 PM the day before (all-day ones)</option><option value="-1">No alerts</option></select></label></div>' +
    '<p class="lbl">Color</p><div class="colors">' + COLORS.map(c => '<button type="button" class="cdot' + (c === color ? ' on' : '') + '" data-ic="' + c + '" style="background:' + c + '"></button>').join('') + '</div>' +
    '<div class="row-actions"><button type="button" id="impAdd">Add ' + list.length + ' to my calendar</button><button type="button" class="ghost" id="impCancel">Cancel</button></div>' : '<div class="row-actions"><button type="button" class="ghost" id="impCancel">Close</button></div>';
  $('impCancel').onclick = closeModal;
  if (!list.length) return;
  const count = () => { const n = $('impList').querySelectorAll('[data-ion]:checked').length; $('impAdd').textContent = 'Add ' + n + ' to my calendar'; $('impAdd').disabled = !n; };
  $('impList').querySelectorAll('[data-ion]').forEach(c => c.onchange = () => { c.closest('.impev').classList.toggle('off', !c.checked); count(); });
  $('impList').querySelectorAll('[data-ic]').forEach(b => b.onclick = () => { color = b.dataset.ic; $('impList').querySelectorAll('[data-ic]').forEach(x => x.classList.toggle('on', x === b)); });
  $('impAdd').onclick = () => {
    const rem = $('impRem').value, list2 = $('impList').querySelectorAll('.impev'); let added = 0, first = '';
    list2.forEach(row => {
      if (!row.querySelector('[data-ion]').checked) return;
      const f = k => row.querySelector('[data-if="' + k + '"]').value.trim(), e = impFound[+row.dataset.n];
      const title = f('title'), date = f('date'); if (!title || !date) return;
      const start = f('start'), end = f('end'), allDay = !start;
      let remind = rem === '' ? null : Number(rem); if (remind === 360 && !allDay) remind = 1440;
      data.items.push(newItem({ kind: 'event', title, date, endDate: e.endDate && e.endDate > date ? e.endDate : null, allDay, start, end: start ? end || pad(Math.min(23, +start.slice(0, 2) + 1)) + start.slice(2) : '', location: f('location'), list: $('impLi').value, color, remind }));
      added++; if (!first || date < first) first = date;
    });
    if (!added) { toast('Pick at least one, with a name and date.'); return; }
    window.save(); closeModal();
    if (first) { calDay = first; calMonth = first.slice(0, 7); }
    location.hash = 'calendar'; route();
    toast('✓ Added ' + added + (added === 1 ? ' event' : ' events') + ' to your calendar');
  };
}
// The events that come up most often (in the planner and the connected calendars), with their usual time and place.
function frequentEvents() {
  const from = addDays(today(), -180), to = addDays(today(), 60), groups = {};
  const add = (e, color) => {
    const title = (e.title || '').trim(); if (!title || title === '(busy)' || title.length > 40) return;
    const k = title.toLowerCase(), g = groups[k] = groups[k] || { n: 0, list: [] };
    g.n++; g.list.push({ title, date: e.date, start: e.allDay ? '' : e.start || '', end: e.allDay ? '' : e.end || '', location: e.location || '', color: color || e.color || '', driver: e.driver || '', remind: e.remind == null ? null : e.remind, list: e.list || '' });
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
  if ($('impDrop') && !$('modal').hidden) { impPaste(e); return; }
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
// ---------- Freezer inventory ----------
// Each thing in a freezer is an item (kind 'freezer'): title = what it is, list = which freezer, priority = how many,
// location = category, notes = size or notes, date = when it went in, done/endDate = used up and when.
// Food on hand: the pantry and the three freezers.
const FREEZERS_DEFAULT = [{ id: 'pantry', name: 'Pantry', icon: '🥫' }, { id: 'kitchen', name: 'Kitchen freezer', icon: '🧊' }, { id: 'drink', name: 'Drink fridge freezer', icon: '🥤' }, { id: 'deep', name: 'Deep freezer', icon: '❄️' }];
const freezers = () => {
  if (!S().freezers) S().freezers = FREEZERS_DEFAULT.map(f => Object.assign({}, f));
  if (!S().freezers.some(f => f.id === 'pantry')) S().freezers = [Object.assign({}, FREEZERS_DEFAULT[0])].concat(S().freezers);
  if (!S().freezers.some(f => f.id === 'fridge')) { const l = S().freezers.slice(), at = l.findIndex(f => f.id === 'pantry') + 1; l.splice(at, 0, { id: 'fridge', name: 'Fridge', icon: '🥛' }); S().freezers = l; }
  return S().freezers;
};
// Category, icon, how many months it keeps its best quality, and words that point to it.
const FZ_CATS = [
  ['Beef', '🥩', 9, /\b(beef|steak|roast|brisket|ribeye|sirloin|stew meat|hamburger|patties|meatballs?)\b/i],
  ['Ground meat', '🍔', 4, /\bground\b|\bburger\b/i],
  ['Chicken & turkey', '🍗', 9, /\b(chicken|turkey|wings?|drumsticks?|thighs?|breasts?|tenders|nuggets)\b/i],
  ['Pork', '🥓', 6, /\b(pork|bacon|ham|sausage|chops?|ribs|tenderloin|brats?|hot ?dogs?)\b/i],
  ['Fish & seafood', '🐟', 6, /\b(fish|salmon|tilapia|cod|catfish|shrimp|crab|lobster|tuna)\b/i],
  ['Meals & leftovers', '🍲', 3, /\b(leftover|soup|chili|casserole|lasagna|spaghetti|sauce|enchiladas?|pizza|burritos?|meal|stew|gumbo|pot pie)s?\b/i],
  ['Veggies', '🥦', 10, /\b(veg|veggies|vegetables?|peas|corn|green beans|broccoli|spinach|carrots|okra|mixed|stir fry|potatoes|fries|tots|hash ?browns)\b/i],
  ['Fruit', '🍓', 10, /\b(fruit|berries|strawberr|blueberr|peach|mango|banana|cherr|pineapple|smoothie)\w*/i],
  ['Bread & baked', '🍞', 3, /\b(bread|rolls?|buns?|bagels?|tortillas?|biscuits?|muffins?|cookie dough|pie crust|dough|waffles?|pancakes?)\b/i],
  ['Ice cream & treats', '🍦', 2, /\b(ice cream|popsicles?|ice pops?|freeze pops|sherbet|frozen yogurt|treats?|dessert|cake|pie)\b/i],
  ['Drinks & ice', '🧊', 12, /\b(ice|juice|lemonade|drinks?|beer|vodka|margarita|concentrate)\b/i],
  ['Other', '📦', 6, /$^/]
];
// Pantry kinds, with how many months they keep.
const PANTRY_CATS = [
  ['Canned goods', '🥫', 24, /\b(can|canned|cans|soup|beans|tomato(es)?|tomato sauce|tuna|chicken broth|broth|stock|corn|green beans|evaporated|condensed|rotel)\b/i],
  ['Pasta, rice & grains', '🍝', 24, /\b(pasta|spaghetti|noodles?|macaroni|mac|penne|rice|quinoa|grits|oats|oatmeal|ramen|lasagna noodles)\b/i],
  ['Baking', '🧁', 12, /\b(flour|sugar|baking|cake mix|brownie mix|chocolate chips|yeast|cornmeal|vanilla|cocoa|frosting|cornstarch|powdered)\b/i],
  ['Breakfast & cereal', '🥣', 9, /\b(cereal|pancake mix|syrup|granola|pop ?tarts|poptarts|breakfast)\b/i],
  ['Snacks', '🍿', 6, /\b(chips|crackers|cookies|popcorn|pretzels|granola bars|fruit snacks|goldfish|nuts|trail mix|candy)\b/i],
  ['Sauces & condiments', '🍯', 12, /\b(ketchup|mustard|mayo|mayonnaise|sauce|dressing|salsa|peanut butter|jelly|jam|honey|oil|vinegar|ranch|bbq|soy|hot sauce|pickles?)\b/i],
  ['Spices & seasoning', '🧂', 24, /\b(salt|pepper|spice|seasoning|cumin|paprika|garlic powder|onion powder|cinnamon|oregano|taco seasoning|chili powder)\b/i],
  ['Drinks', '🧃', 12, /\b(coffee|tea|juice|soda|water|gatorade|drink mix|kool[- ]?aid|cocoa mix|creamer)\b/i],
  ['Pantry other', '📦', 12, /$^/]
];
// The fridge, with shelf lives in months (0.13 ≈ 4 days for leftovers).
const FRIDGE_CATS = [
  ['Leftovers', '🍱', 0.13, /\bleftovers?\b/i],
  ['Dairy & eggs', '🥛', 0.6, /\b(milk|eggs?|cheese|butter|yogurt|sour cream|cream cheese|half and half|creamer|cottage|whipped)\b/i],
  ['Produce', '🥬', 0.3, /\b(lettuce|tomato(es)?|onions?|peppers?|carrots?|celery|apples?|grapes|berries|strawberries|lemons?|limes?|cucumbers?|salad|spinach|broccoli|fruit|vegetables?|avocados?|bananas?)\b/i],
  ['Deli & meat', '🥓', 0.2, /\b(deli|lunch meat|turkey|ham|bologna|hot ?dogs?|bacon|chicken|beef|sausage|pepperoni|salami)\b/i],
  ['Fridge drinks', '🧃', 1, /\b(juice|soda|water|tea|lemonade|beer|wine|coke|pepsi|dr pepper)\b/i],
  ['Fridge condiments', '🫙', 3, /\b(ketchup|mustard|mayo|dressing|ranch|sauce|salsa|pickles?|jelly|jam|syrup)\b/i],
  ['Fridge other', '📦', 1, /$^/]
];
const catsFor = where => where === 'pantry' ? PANTRY_CATS : where === 'fridge' ? FRIDGE_CATS : FZ_CATS;
const fzCat = name => (FZ_CATS.find(c => c[0] === name) || PANTRY_CATS.find(c => c[0] === name) || FRIDGE_CATS.find(c => c[0] === name) || FZ_CATS[FZ_CATS.length - 1]);
const fzGuess = (text, where) => {
  if (where === 'pantry' || where === 'fridge') { const cs = catsFor(where); return (cs.find(c => c[3].test(text)) || cs[cs.length - 1])[0]; }
  const g = /\bground\b/i.test(text) ? FZ_CATS[1] : FZ_CATS.find(c => c[3].test(text)); return (g || FZ_CATS[FZ_CATS.length - 1])[0];
};
const catOrder = k => { let a = FRIDGE_CATS.findIndex(c => c[0] === k); if (a >= 0) return a; a = PANTRY_CATS.findIndex(c => c[0] === k); return a >= 0 ? 50 + a : 100 + FZ_CATS.findIndex(c => c[0] === k); };
// "3 bags peas" → 3 × peas · bag; "2 lb ground beef" → 1 × ground beef · 2 lb; "Pizza x2" / "Pizza (2)" → 2 × pizza.
function fzParse(line) {
  let t = line.replace(/^[\s\-•*–—☐□▢\[\]✓✔]+/, '').replace(/\s+/g, ' ').trim(), qty = 1, size = '';
  let m = t.match(/\s*(?:x\s?|×\s?|\()\s*(\d{1,3})\s*\)?\s*$/i) || t.match(/\s*[-–:]\s*(\d{1,3})\s*$/);
  if (m) { qty = +m[1]; t = t.slice(0, m.index).trim(); }
  m = t.match(/^(\d+(?:\.\d+)?|one|two|three|four|five|six|a)\s+(lbs?|pounds?|oz|ounces?|kg|g|gallons?|quarts?|qts?)\b\.?\s*(?:of\s+)?/i);
  if (m) { size = m[1] + ' ' + m[2]; t = t.slice(m[0].length); }
  else {
    m = t.match(/^(\d{1,3}|one|two|three|four|five|six|a)\s+(?:(bags?|packs?|packages?|pkgs?|boxes?|cans?|containers?|bottles?|loaves|loaf|cartons?|tubs?|rolls?|trays?|pieces?|pcs?)\b\.?\s*(?:of\s+)?)?/i);
    if (m) { const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1 }; qty = /\d/.test(m[1]) ? +m[1] : words[m[1].toLowerCase()] || 1; if (m[2]) size = m[2].replace(/(es|s)$/i, '').replace(/^loav$/i, 'loaf').replace(/^box$/i, 'box'); t = t.slice(m[0].length); }
  }
  m = t.match(/\(([^)]*\b(lbs?|oz|pound|bag|pack|box)\b[^)]*)\)/i); if (m && !size) { size = m[1]; t = t.replace(m[0], ''); }
  t = t.replace(/\s+/g, ' ').trim();
  return { name: t.charAt(0).toUpperCase() + t.slice(1), qty: Math.max(1, Math.min(999, qty)), size };
}
let fzOn = 'all', fzFind = '', fzShowUsed = false, fzWhereSel = '';
// Common things for each place, for one-tap adding.
const FZ_STAPLES = {
  pantry: ['Canned green beans', 'Canned corn', 'Rice', 'Spaghetti', 'Pasta sauce', 'Mac & cheese', 'Chicken broth', 'Peanut butter', 'Cereal', 'Oatmeal', 'Flour', 'Sugar', 'Ramen', 'Chips', 'Crackers', 'Coffee', 'Canned tomatoes', 'Taco seasoning'],
  fridge: ['Milk', 'Eggs', 'Butter', 'Shredded cheese', 'Sliced cheese', 'Sour cream', 'Lunch meat', 'Lettuce', 'Tomatoes', 'Onions', 'Yogurt', 'Coffee creamer', 'Ketchup', 'Ranch', 'Leftovers'],
  kitchen: ['Frozen pizza', 'Chicken nuggets', 'French fries', 'Mixed veggies', 'Peas', 'Corn', 'Waffles', 'Ice cream', 'Tater tots', 'Broccoli'],
  drink: ['Ice', 'Popsicles', 'Freeze pops', 'Lemonade concentrate', 'Juice'],
  deep: ['Ground beef', 'Chicken breasts', 'Chicken thighs', 'Pork chops', 'Roast', 'Sausage', 'Bacon', 'Brisket', 'Steaks', 'Fish', 'Shrimp', 'Whole turkey']
};
// What to suggest: things you've had in that place before (newest first), then the staples, leaving out what's already there.
function fzSuggest(where) {
  const have = new Set(fzItems().filter(i => !i.done && (i.priority || 0) > 0 && i.list === where).map(i => i.title.toLowerCase()));
  const past = [...new Set(fzItems().filter(i => i.list === where).sort((a, b) => (b.endDate || b.date || '').localeCompare(a.endDate || a.date || '')).map(i => i.title))];
  const out = [], seen = new Set();
  past.concat(FZ_STAPLES[where] || []).forEach((t, k) => { const key = t.toLowerCase(); if (have.has(key) || seen.has(key)) return; seen.add(key); out.push({ title: t, again: k < past.length }); });
  return out.slice(0, 14);
}
const fzItems = () => data.items.filter(i => i.kind === 'freezer');
const fzAge = it => Math.max(0, daysBetween(it.date || today(), today()));
const fzOld = it => fzAge(it) > fzCat(it.location)[2] * 30 * 0.8;
const fzAgeText = it => { const d = fzAge(it); return d < 14 ? (d === 0 ? 'today' : d + (d === 1 ? ' day' : ' days')) : d < 60 ? Math.round(d / 7) + ' wk' : Math.round(d / 30) + ' mo'; };
const fzName = id => (freezers().find(f => f.id === id) || { name: 'Freezer', icon: '🧊' });
const keepMin = it => it.sort || 0; // "Always keep at least" (0 = off); grab-and-go work lunches have color 'work'.
const isLunch = it => it.color === 'work';
// Put something on the shopping list once, in the right aisle.
function addToShop(it, why) {
  if (data.items.some(x => x.kind === 'shop' && !x.done && x.title.toLowerCase() === it.title.toLowerCase())) return false;
  data.items.push(newItem({ kind: 'shop', title: it.title, list: it.list === 'pantry' || it.list === 'fridge' ? aisleOf(it.title) : 'Frozen', notes: [it.notes, why].filter(Boolean).join(' · '), location: (S().walmart || {})[it.title.toLowerCase()] || '' }));
  return true;
}
// Use one: the count goes down; dropping below "always keep" adds it to the shopping list.
function useOne(it, n) {
  it.priority = Math.max(0, (it.priority || 1) - (n || 1));
  if (!it.priority) { it.done = true; it.endDate = today(); }
  const low = keepMin(it) && it.priority < keepMin(it) && addToShop(it, 'keep ' + keepMin(it));
  return low;
}
function viewFreezer() {
  const fz = freezers(), all = fzItems(), have = all.filter(i => !i.done && (i.priority || 0) > 0);
  const q = fzFind.trim().toLowerCase();
  const shown = have.filter(i => (fzOn === 'all' || i.list === fzOn) && (!q || (i.title + ' ' + i.location + ' ' + i.notes).toLowerCase().includes(q)));
  const soon = shown.filter(fzOld).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const used = all.filter(i => i.done).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || '')).slice(0, 15);
  const lunches = have.filter(isLunch);
  const count = id => have.filter(i => id === 'all' || i.list === id).reduce((n, i) => n + (i.priority || 1), 0);
  const row = i => { const c = fzCat(i.location), old = fzOld(i), qn = i.priority || 1, below = keepMin(i) && qn < keepMin(i), low = below || (i.list === 'pantry' && qn <= 1 && !keepMin(i));
    return '<div class="fzrow' + (old ? ' old' : '') + '"><button type="button" class="tick" data-fzuse="' + i.id + '" title="Used one" aria-label="Used one"></button>' +
      '<button type="button" class="fzname" data-fzedit="' + i.id + '"><span>' + c[1] + ' ' + esc(i.title) + (i.notes ? ' <small>' + esc(i.notes) + '</small>' : '') + (isLunch(i) ? ' <em class="cwho">💼 lunch</em>' : '') + '</span><small>' + (fzOn === 'all' ? esc(fzName(i.list).name) + ' · ' : '') + (fzAge(i) === 0 ? 'added today' : 'had ' + fzAgeText(i)) + (below ? ' · below ' + keepMin(i) : low ? ' · low' : keepMin(i) ? ' · keep ' + keepMin(i) : '') + (old ? ' · use soon' : '') + '</small></button>' +
      '<span class="fzqty">' + (low ? '<button type="button" class="ghost small" data-fzshop="' + i.id + '" aria-label="Add to shopping list">🛒</button>' : '') + '<button type="button" class="ghost small" data-fzminus="' + i.id + '" aria-label="One less">−</button><b>' + qn + '</b><button type="button" class="ghost small" data-fzplus="' + i.id + '" aria-label="One more">＋</button></span></div>'; };
  const groups = {}; shown.forEach(i => { const k = fzCat(i.location)[0]; (groups[k] = groups[k] || []).push(i); });
  $('view').innerHTML = mealTabs('freezer') +
    '<div class="fztabs">' + [{ id: 'all', name: 'Everything', icon: '🏠' }].concat(fz).map(f => '<button type="button" class="fztab' + (fzOn === f.id ? ' on' : '') + '" data-fzon="' + f.id + '"><span>' + f.icon + '</span><b>' + esc(f.name) + '</b><small>' + count(f.id) + ' items</small></button>').join('') + '</div>' +
    '<div class="quickbar fzbar"><input id="fzAdd" placeholder="Add: “4 cans corn”, “2 lb ground beef”, “Pizza x2”"><select id="fzWhere" aria-label="Where">' + fz.map(f => '<option value="' + f.id + '"' + ((fzWhereSel || (fzOn === 'all' ? 'pantry' : fzOn)) === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select><button type="button" id="fzGo">Add</button></div>' +
    fzSuggestList(fzWhereSel || (fzOn === 'all' ? 'pantry' : fzOn)) +
    '<div class="row-actions tight fztools"><button type="button" class="ghost small" id="fzScan">▥ Scan a barcode</button><button type="button" class="ghost small" id="fzUp">📷 Upload a list</button><button type="button" class="ghost small" id="fzCheck">✓ Take inventory</button><input id="fzFind" type="search" placeholder="Search food on hand" value="' + esc(fzFind) + '"></div>' +
    (have.length && !q ? '<a class="card pad tip" href="#meals"><b>🍳 What can I make?</b><span class="sub">' + mealIdeas('Dinner').length + ' meal ideas from what you have →</span></a>' : '') +
    (!q && (fzOn === 'all' || lunches.some(i => i.list === fzOn)) ? '<div class="card pad lunchcard"><div class="mini-head"><h2>💼 Work lunches</h2><label class="switch"><input type="checkbox" id="fzLunchRem"' + (S().lunchReminders !== false ? ' checked' : '') + '> pack-lunch reminder</label></div>' +
      (lunches.length ? lunches.map(i => '<div class="mini-row"><span>' + fzCat(i.location)[1] + ' ' + esc(i.title) + ' <small class="sub">' + esc(fzName(i.list).name) + '</small></span><b>' + (i.priority || 1) + ' left</b></div>').join('') : '<p class="helper">Tap any meal below and check “💼 Work lunch” to keep track of grab-and-go lunches.</p>') +
      '<p class="helper">The night before a “Work” day on your calendar you get a 🥡 “Pack lunch” reminder at 8 PM.</p></div>' : '') +
    (soon.length && !q ? '<div class="card pad fzsoon"><h2>⏰ Use these soon</h2>' + soon.slice(0, 6).map(row).join('') + '</div>' : '') +
    (shown.length ? Object.keys(groups).sort((a, b) => catOrder(a) - catOrder(b)).map(k => '<div class="card pad"><h3>' + fzCat(k)[1] + ' ' + esc(k) + ' <small>' + groups[k].reduce((n, i) => n + (i.priority || 1), 0) + '</small></h3>' + groups[k].sort((a, b) => a.title.localeCompare(b.title)).map(row).join('') + '</div>').join('')
      : '<div class="card pad"><p class="helper">' + (q ? 'Nothing matches “' + esc(fzFind) + '”.' : 'Nothing here yet. Type something above, scan a barcode, or tap 📷 Upload a list.') + '</p></div>') +
    (used.length ? '<button type="button" class="linkish" id="fzUsedT">' + (fzShowUsed ? 'Hide' : 'Show') + ' recently used (' + used.length + ')</button>' + (fzShowUsed ? '<div class="card pad">' + used.map(i => '<div class="fzrow used"><span class="fzname"><span>' + fzCat(i.location)[1] + ' ' + esc(i.title) + '</span><small>Used up ' + esc(fmtDate(i.endDate || today(), 'rel')) + ' · ' + esc(fzName(i.list).name) + '</small></span><span class="fzqty"><button type="button" class="ghost small" data-fzshop="' + i.id + '">🛒 Buy again</button><button type="button" class="ghost small" data-fzback="' + i.id + '">↩ Put back</button></span></div>').join('') + '</div>' : '') : '') +
    '<p class="helper">Tap the box when you use one. ＋ and − change how many. Tap a name to edit it, move it, set “always keep at least”, or mark it as a work lunch. Things running low get a 🛒 button.</p>';
  const v = $('view'), find = id => data.items.find(i => i.id === id), redraw = () => { const y = window.scrollY; viewFreezer(); window.scrollTo(0, y); };
  v.querySelectorAll('[data-fzon]').forEach(b => b.onclick = () => { fzOn = b.dataset.fzon; fzWhereSel = ''; viewFreezer(); });
  const add = () => {
    const val = $('fzAdd').value.trim(); if (!val) return;
    const p = fzParse(val); if (!p.name) return;
    const where = $('fzWhere').value, same = have.find(i => i.list === where && i.title.toLowerCase() === p.name.toLowerCase() && (i.notes || '') === p.size);
    if (same) same.priority = (same.priority || 1) + p.qty;
    else data.items.push(newItem({ kind: 'freezer', title: p.name, list: where, priority: p.qty, notes: p.size, location: fzGuess(p.name, where), date: today(), allDay: true }));
    window.save(); toast('✓ Added ' + p.qty + ' × ' + p.name + ' to the ' + fzName(where).name.toLowerCase()); viewFreezer(); setTimeout(() => $('fzAdd') && $('fzAdd').focus(), 50);
  };
  $('fzGo').onclick = add; $('fzAdd').onkeydown = e => { if (e.key === 'Enter') add(); };
  $('fzFind').oninput = e => { fzFind = e.target.value; clearTimeout(viewFreezer.t); viewFreezer.t = setTimeout(() => { viewFreezer(); const f = $('fzFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  $('fzUp').onclick = freezerImport;
  $('fzScan').onclick = scanBarcode;
  $('fzCheck').onclick = () => takeInventory(fzOn);
  if ($('fzLunchRem')) $('fzLunchRem').onchange = e => { S().lunchReminders = e.target.checked; window.save(); if (e.target.checked) lunchCheck(); toast(e.target.checked ? '🥡 Pack-lunch reminders on' : 'Pack-lunch reminders off'); };
  const wireSug = () => v.querySelectorAll('[data-fzsug]').forEach(b => b.onclick = () => {
    const where = $('fzWhere').value, t = b.dataset.fzsug, same = have.find(i => i.list === where && i.title.toLowerCase() === t.toLowerCase());
    if (same) same.priority = (same.priority || 1) + 1;
    else data.items.push(newItem({ kind: 'freezer', title: t, list: where, priority: 1, notes: '', location: fzGuess(t, where), date: today(), allDay: true }));
    window.save(); toast('✓ Added ' + t + ' to the ' + fzName(where).name.toLowerCase() + ' · tap ＋ for more'); redraw();
  });
  wireSug();
  $('fzWhere').onchange = () => { fzWhereSel = $('fzWhere').value; $('fzSug').outerHTML = fzSuggestList($('fzWhere').value); wireSug(); };
  v.querySelectorAll('[data-fzuse],[data-fzminus]').forEach(b => b.onclick = () => {
    const it = find(b.dataset.fzuse || b.dataset.fzminus); if (!it) return;
    const shop = useOne(it);
    toast((it.priority ? '✓ Used 1 ' + it.title + ' · ' + it.priority + ' left' : '✓ Used the last ' + it.title) + (shop ? ' · 🛒 added to your shopping list' : !it.priority ? '. “Buy again” is under Recently used.' : ''));
    if (b.dataset.fzuse) celebrate(b);
    window.save(); redraw();
  });
  v.querySelectorAll('[data-fzplus]').forEach(b => b.onclick = () => { const it = find(b.dataset.fzplus); it.priority = (it.priority || 1) + 1; window.save(); redraw(); });
  v.querySelectorAll('[data-fzedit]').forEach(b => b.onclick = () => editFreezerItem(b.dataset.fzedit));
  if ($('fzUsedT')) $('fzUsedT').onclick = () => { fzShowUsed = !fzShowUsed; viewFreezer(); };
  v.querySelectorAll('[data-fzback]').forEach(b => b.onclick = () => { const it = find(b.dataset.fzback); it.done = false; it.endDate = null; it.priority = 1; window.save(); redraw(); toast('↩ Put back'); });
  v.querySelectorAll('[data-fzshop]').forEach(b => b.onclick = () => { const it = find(b.dataset.fzshop); if (!addToShop(it)) { toast(it.title + ' is already on your shopping list'); return; } window.save(); toast('🛒 ' + it.title + ' added to your shopping list'); });
}
function fzSuggestList(where) {
  const sug = fzSuggest(where);
  return '<div id="fzSug" class="fzsug">' + (sug.length ? '<span class="lbl">Quick add to ' + esc(fzName(where).name.toLowerCase()) + '</span>' + sug.map(x => '<button type="button" class="qf' + (x.again ? ' star' : '') + '" data-fzsug="' + esc(x.title) + '">' + (x.again ? '↺ ' : '＋ ') + esc(x.title) + '</button>').join('') : '') + '</div>';
}
function editFreezerItem(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  const shelf = fzCat(it.location)[2], keeps = shelf < 1 ? Math.round(shelf * 30) + ' days' : shelf + ' months';
  openModal('<h2>' + fzCat(it.location)[1] + ' ' + esc(it.title) + '</h2>' +
    '<label>What<input id="feN" value="' + esc(it.title) + '"></label>' +
    '<div class="grid2"><label>How many<input id="feQ" type="number" min="0" inputmode="numeric" value="' + (it.priority || 1) + '"></label><label>Size / notes<input id="feS" value="' + esc(it.notes || '') + '" placeholder="2 lb, family size…"></label></div>' +
    '<div class="grid2"><label>Where<select id="feF">' + freezers().map(f => '<option value="' + f.id + '"' + (f.id === it.list ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select></label>' +
    '<label>Kind<select id="feC">' + catsFor(it.list).map(c => '<option' + (c[0] === it.location ? ' selected' : '') + '>' + c[0] + '</option>').join('') + '</select></label></div>' +
    '<div class="grid2"><label>Always keep at least<input id="feMin" type="number" min="0" inputmode="numeric" value="' + (keepMin(it) || '') + '" placeholder="0 = off"></label><label>Went in on<input id="feD" type="date" value="' + esc(it.date || '') + '"></label></div>' +
    '<label class="check"><input type="checkbox" id="feLunch"' + (isLunch(it) ? ' checked' : '') + '> 💼 Work lunch (grab-and-go)</label>' +
    '<p class="helper">Best quality for about ' + keeps + ' · ' + (fzAge(it) === 0 ? 'it went in today' : 'you’ve had it ' + fzAgeText(it)) + '. With “always keep”, it goes on the shopping list when you drop below that.' + (it.repeat ? ' · barcode ' + esc(it.repeat) : '') + '</p>' +
    '<div class="row-actions"><button type="button" id="feSave">Save</button><button type="button" class="ghost" id="feX">Cancel</button><button type="button" class="danger" id="feDel">Delete</button></div>');
  $('feX').onclick = closeModal;
  $('feSave').onclick = () => {
    const n = $('feN').value.trim(); if (!n) { toast('Type what it is.'); return; }
    const q = Math.max(0, parseInt($('feQ').value, 10) || 0), min = Math.max(0, parseInt($('feMin').value, 10) || 0);
    const where = $('feF').value, movedKind = !catsFor(where).some(c => c[0] === $('feC').value);
    Object.assign(it, { title: n, priority: q, notes: $('feS').value.trim(), list: where, location: movedKind ? fzGuess(n, where) : $('feC').value, date: $('feD').value || it.date, done: q === 0, endDate: q === 0 ? it.endDate || today() : null, sort: min, color: $('feLunch').checked ? 'work' : '' });
    const shop = min && q < min && addToShop(it, 'keep ' + min);
    window.save(); closeModal(); viewFreezer(); if (shop) toast('🛒 ' + it.title + ' is below ' + min + ', so it’s on your shopping list');
  };
  $('feDel').onclick = () => { if (!confirm('Delete ' + it.title + ' from the list?')) return; data.items = data.items.filter(i => i !== it); window.save(); closeModal(); viewFreezer(); };
}
// Walk through one place (or everything), one thing at a time: still there? how many?
function takeInventory(where) {
  const list = fzItems().filter(i => !i.done && (i.priority || 0) > 0 && (where === 'all' || i.list === where)).sort((a, b) => (a.list + catOrder(a.location) + a.title).localeCompare(b.list + catOrder(b.location) + b.title));
  if (!list.length) { toast('Nothing to check here yet.'); return; }
  let k = 0, changed = 0;
  const step = () => {
    if (k >= list.length) { S().lastInventory = today(); window.save(); closeModal(); viewFreezer(); toast('✓ Inventory done' + (changed ? ' · ' + changed + ' updated' : ' · everything matched')); return; }
    const it = list[k];
    openModal('<p class="sub">' + (k + 1) + ' of ' + list.length + ' · ' + esc(fzName(it.list).name) + '</p><h2>' + fzCat(it.location)[1] + ' ' + esc(it.title) + (it.notes ? ' <small>' + esc(it.notes) + '</small>' : '') + '</h2>' +
      '<div class="invq"><button type="button" class="ghost" id="ivM">−</button><b id="ivN">' + (it.priority || 1) + '</b><button type="button" class="ghost" id="ivP">＋</button></div>' +
      '<div class="row-actions"><button type="button" id="ivOk">✓ That’s right</button><button type="button" class="danger" id="ivGone">All gone</button></div>' +
      '<div class="row-actions tight"><button type="button" class="ghost small" id="ivBack"' + (k ? '' : ' disabled') + '>‹ Back</button><button type="button" class="ghost small" id="ivStop">Stop for now</button></div>');
    let n = it.priority || 1;
    $('ivM').onclick = () => { n = Math.max(0, n - 1); $('ivN').textContent = n; };
    $('ivP').onclick = () => { n++; $('ivN').textContent = n; };
    $('ivOk').onclick = () => { if (n !== (it.priority || 1)) { changed++; if (n) it.priority = n; else useOne(it, it.priority || 1); window.save(); } k++; step(); };
    $('ivGone').onclick = () => { useOne(it, it.priority || 1); changed++; window.save(); k++; step(); };
    $('ivBack').onclick = () => { if (k) { k--; step(); } };
    $('ivStop').onclick = () => { closeModal(); viewFreezer(); };
  };
  step();
}
// Scan a barcode with the camera: a known product gets used/added; a new one is looked up on Open Food Facts.
async function scanBarcode() {
  openModal('<h2>▥ Scan a barcode</h2><div class="scanbox"><video id="scVid" playsinline muted></video><i class="scanline"></i></div><p class="helper" id="scMsg">Starting the camera…</p>' +
    '<label>Or type the number<input id="scCode" inputmode="numeric" placeholder="0 12345 67890 5"></label><div class="row-actions"><button type="button" class="ghost" id="scGo">Look it up</button><button type="button" class="ghost" id="scX">Cancel</button></div>');
  let stream = null, reader = null, done = false;
  const stop = () => { done = true; try { reader && reader.reset && reader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach(t => t.stop()); };
  $('scX').onclick = () => { stop(); closeModal(); };
  $('scGo').onclick = () => { const c = $('scCode').value.replace(/\D/g, ''); if (c.length >= 6) { stop(); gotCode(c); } };
  const msg = t => { if ($('scMsg')) $('scMsg').textContent = t; };
  try {
    const vid = $('scVid');
    if ('BarcodeDetector' in window) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      vid.srcObject = stream; await vid.play(); msg('Point the camera at the barcode.');
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const tick = async () => { if (done || !$('scVid')) return; try { const r = await det.detect(vid); if (r.length) { stop(); gotCode(r[0].rawValue); return; } } catch (e) {} setTimeout(tick, 250); };
      tick();
    } else {
      await loadScript(CDN + '@zxing/library@0.21.3/umd/index.min.js', () => window.ZXing);
      reader = new ZXing.BrowserMultiFormatReader(); msg('Point the camera at the barcode.');
      reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, vid, r => { if (r && !done) { const c = r.getText(); stop(); gotCode(c); } });
    }
  } catch (e) { msg('The camera didn’t start (' + (e.message || e.name) + '). You can type the number under the barcode instead.'); }
}
async function gotCode(code) {
  const known = fzItems().filter(i => i.repeat === code).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0))[0];
  if (known) {
    openModal('<h2>' + fzCat(known.location)[1] + ' ' + esc(known.title) + '</h2><p class="helper">' + esc(fzName(known.list).name) + ' · ' + (known.done ? 'all used up' : (known.priority || 1) + ' on hand') + '</p>' +
      '<div class="row-actions">' + (known.done ? '' : '<button type="button" id="gcUse">✓ Used one</button>') + '<button type="button" class="ghost" id="gcAdd">＋ Add one</button><button type="button" class="ghost" id="gcAgain">Scan another</button></div>');
    if ($('gcUse')) $('gcUse').onclick = () => { const shop = useOne(known); window.save(); closeModal(); viewFreezer(); toast('✓ Used 1 ' + known.title + (shop ? ' · 🛒 added to your shopping list' : '')); };
    $('gcAdd').onclick = () => { if (known.done) { known.done = false; known.endDate = null; known.priority = 0; } known.priority = (known.priority || 0) + 1; window.save(); closeModal(); viewFreezer(); toast('✓ Added 1 ' + known.title); };
    $('gcAgain').onclick = scanBarcode;
    return;
  }
  openModal('<h2>New item</h2><p class="helper" id="gcMsg">Looking up ' + esc(code) + '…</p><label>What<input id="gcN" list="gcHave" placeholder="Name"></label><datalist id="gcHave">' + fzItems().filter(i => !i.done).map(i => '<option value="' + esc(i.title) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Where<select id="gcW">' + freezers().map(f => '<option value="' + f.id + '"' + ((fzWhereSel || (fzOn === 'all' ? 'pantry' : fzOn)) === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select></label><label>How many<input id="gcQ" type="number" min="1" value="1"></label></div>' +
    '<p class="helper">If it’s something already on your list, pick its name and the barcode gets linked to it.</p><div class="row-actions"><button type="button" id="gcSave">Add</button><button type="button" class="ghost" id="gcX">Cancel</button></div>');
  $('gcX').onclick = closeModal;
  $('gcSave').onclick = () => {
    const n = $('gcN').value.trim(), w = $('gcW').value, q = Math.max(1, parseInt($('gcQ').value, 10) || 1); if (!n) { toast('Type what it is.'); return; }
    const same = fzItems().find(i => !i.done && i.list === w && i.title.toLowerCase() === n.toLowerCase());
    if (same) { same.priority = (same.priority || 1) + q; same.repeat = code; }
    else data.items.push(newItem({ kind: 'freezer', title: n, list: w, priority: q, notes: '', location: fzGuess(n, w), date: today(), allDay: true, repeat: code }));
    window.save(); closeModal(); viewFreezer(); toast('✓ Added ' + q + ' × ' + n + ' · next time just scan it');
  };
  try {
    const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=product_name,brands,quantity');
    const j = await r.json(), p = j && j.product;
    if ($('gcN') && p && (p.product_name || p.brands)) { const nm = [(p.brands || '').split(',')[0].trim(), (p.product_name || '').trim()].filter(Boolean).join(' '); if (!$('gcN').value) $('gcN').value = nm; $('gcMsg').textContent = 'Found it' + (p.quantity ? ' · ' + p.quantity : '') + '. Change the name if you like.'; }
    else if ($('gcMsg')) $('gcMsg').textContent = 'Not in the product database. Type what it is.';
  } catch (e) { if ($('gcMsg')) $('gcMsg').textContent = 'Couldn’t look it up. Type what it is.'; }
}
// 🥡 Pack-lunch reminder the night before each "Work" day on the calendar (8 PM).
function lunchCheck() {
  if (S().lunchReminders === false) return;
  const t = today(), made = Object.assign({}, S().lunchMade || {}); let changed = false;
  const lunches = fzItems().filter(i => !i.done && (i.priority || 0) > 0 && isLunch(i));
  const days = [...new Set(agenda(addDays(t, 1), addDays(t, 14)).filter(e => e.kind !== 'task' && /\bwork(ing)?\b/i.test(e.title || '')).map(e => e.date))];
  days.forEach(d => {
    const id = 'lunch-' + d; if (made[id] || data.items.some(i => i.id === id)) return;
    data.items.push(newItem({ id, kind: 'task', title: '🥡 Pack lunch for tomorrow', date: addDays(d, -1), list: 'Home', remind: -1200,
      notes: lunches.length ? 'Grab-and-go: ' + lunches.map(i => i.title + ' (' + (i.priority || 1) + ' left, ' + fzName(i.list).name.toLowerCase() + ')').join(', ') : 'Add grab-and-go lunches in Meals → On hand.' }));
    made[id] = d; changed = true;
  });
  Object.keys(made).forEach(k => { if (made[k] < addDays(t, -30)) delete made[k]; });
  S().lunchMade = made;
  // A monthly "check the pantry and freezers" task, made once (delete it to stop).
  if (!S().stockTask) {
    const first = isoDay(new Date(+t.slice(0, 4), +t.slice(5, 7), 1));
    data.items.push(newItem({ id: 'stock-check', kind: 'task', title: '🧊 Check the pantry, fridge & freezers', date: first, repeat: 'monthly', list: 'Home', notes: 'Meals → 🥫 On hand → ✓ Take inventory' }));
    S().stockTask = true; changed = true;
  }
  if (changed) window.save();
}
// Which freezer a heading line means: "Deep freezer:", "Big freezer", "Drink fridge", "Kitchen".
function fzHeading(l) {
  const h = l.replace(/[:\-–—]+\s*$/, '').trim().toLowerCase();
  if (h.length > 30 || /\d/.test(h)) return null;
  const fz = freezers(), exact = fz.find(f => f.name.toLowerCase() === h); if (exact) return exact;
  if (!/:$/.test(l.trim()) && !/freez|fridge|refrigerator|pantry|cupboard|cabinet/.test(h)) return null;
  if (/pantry|cupboard|cabinet|shelf|shelves/.test(h)) return fz.find(f => f.id === 'pantry');
  if (/deep|chest|big/.test(h)) return fz.find(f => f.id === 'deep');
  if (/drink|beverage|garage|mini/.test(h)) return fz.find(f => f.id === 'drink');
  if (/\bfridge\b|refrigerator/.test(h) && !/freez/.test(h)) return fz.find(f => f.id === 'fridge');
  if (/kitchen|main|top|upstairs/.test(h)) return fz.find(f => f.id === 'kitchen');
  return fz.find(f => h.split(/\s+/).some(w => w.length > 3 && f.name.toLowerCase().includes(w)));
}
// Upload a list (photo, screenshot, PDF, Word or typed). A line naming a freezer ("Deep freezer:") sends the lines under it there.
function freezerImport() {
  const fz = freezers();
  $('modalBody').classList.add('wide');
  openModal('<h2>📷 Upload a list</h2><p class="helper">A photo or screenshot of your list, a PDF or Word file, or type or paste it, one thing per line. Put a place on its own line (like “Pantry:” or “Deep freezer:”) and the things under it go there.</p>' +
    '<div class="impdrop pastebox"><div class="row-actions"><label class="button file">Choose a picture or file<input type="file" id="fiFile" hidden accept="image/*,application/pdf,.pdf,.docx,.txt,.csv,text/plain"></label><label class="button ghost file">Take a photo<input type="file" id="fiCam" accept="image/*" capture="environment" hidden></label></div></div>' +
    '<label>Or type or paste the list<textarea id="fiText" rows="6" placeholder="Pantry:&#10;4 cans green beans&#10;Spaghetti x2&#10;Deep freezer:&#10;2 lb ground beef x3&#10;Chicken breasts (4)&#10;Kitchen freezer:&#10;2 bags peas&#10;Ice cream"></textarea></label>' +
    '<div class="grid2"><label>Things without a place go in<select id="fiDef">' + fz.map(f => '<option value="' + f.id + '"' + (f.id === (fzOn === 'all' ? 'pantry' : fzOn) ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select></label><div class="row-actions"><button type="button" class="ghost" id="fiRead">Read the list</button></div></div>' +
    '<p class="helper" id="fiStatus"></p><div id="fiList"></div>');
  const show = () => {
    const found = []; let cur = $('fiDef').value;
    $('fiText').value.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
      const f = fzHeading(l); if (f) { cur = f.id; return; }
      if (/:$/.test(l) || l.length > 70 || !/[a-z]/i.test(l)) return;
      const p = fzParse(l); if (p.name.length < 2) return;
      found.push(Object.assign(p, { where: cur }));
    });
    $('fiStatus').textContent = found.length ? 'Found ' + found.length + ' things. Check them, fix anything that’s off, then add.' : 'Nothing found yet.';
    $('fiList').innerHTML = found.length ? '<div class="implist">' + found.map((f, n) => '<div class="impev"><label class="check"><input type="checkbox" data-fion="' + n + '" checked></label><div class="impf"><input data-fif="name" value="' + esc(f.name) + '" aria-label="What">' +
        '<div class="impg"><select data-fif="where" aria-label="Freezer">' + fz.map(x => '<option value="' + x.id + '"' + (x.id === f.where ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select><input type="number" min="1" data-fif="qty" value="' + f.qty + '" aria-label="How many"><input data-fif="size" value="' + esc(f.size) + '" placeholder="size"></div></div></div>').join('') + '</div>' +
      '<div class="row-actions"><button type="button" id="fiAdd">Add ' + found.length + ' to food on hand</button><button type="button" class="ghost" id="fiX">Cancel</button></div>' : '';
    if (!found.length) return;
    $('fiList').querySelectorAll('[data-fion]').forEach(c => c.onchange = () => c.closest('.impev').classList.toggle('off', !c.checked));
    $('fiX').onclick = closeModal;
    $('fiAdd').onclick = () => {
      let n = 0;
      $('fiList').querySelectorAll('.impev').forEach(row => {
        if (!row.querySelector('[data-fion]').checked) return;
        const g = f => row.querySelector('[data-fif="' + f + '"]').value.trim(), name = g('name'); if (!name) return;
        data.items.push(newItem({ kind: 'freezer', title: name, list: g('where'), priority: Math.max(1, parseInt(g('qty'), 10) || 1), notes: g('size'), location: fzGuess(name, g('where')), date: today(), allDay: true })); n++;
      });
      window.save(); closeModal(); fzOn = 'all'; viewFreezer(); toast('✓ Added ' + n + ' things to food on hand');
    };
  };
  const go = async file => {
    $('fiStatus').textContent = 'Reading ' + (file.name || 'the picture') + '…';
    try {
      const name = (file.name || '').toLowerCase(), type = file.type || '';
      const text = type.startsWith('image/') ? await ocrImage(await shrinkPic(file), p => { if ($('fiStatus')) $('fiStatus').textContent = 'Reading the picture… ' + p + '%'; })
        : type === 'application/pdf' || name.endsWith('.pdf') ? await pdfText(file) : name.endsWith('.docx') ? await docxText(file) : await file.text();
      if (!$('fiText')) return;
      $('fiText').value = text.trim(); show();
    } catch (e) { if ($('fiStatus')) $('fiStatus').textContent = '⚠ ' + e.message; }
  };
  $('fiFile').onchange = e => e.target.files[0] && go(e.target.files[0]);
  $('fiCam').onchange = e => e.target.files[0] && go(e.target.files[0]);
  $('fiRead').onclick = show;
  $('fiDef').onchange = show;
}
// ---------- ATU: work tasks and the SNA Snack Closet order form ----------
const atuTabs = on => '<div class="toptabs"><a href="#tasks/atu"' + (on === 'atu' ? ' class="on"' : '') + '>🎓 ATU tasks</a><a href="#tasks/sna"' + (on === 'sna' ? ' class="on"' : '') + '>🍿 SNA Snack Closet</a><a href="#tasks">‹ All tasks</a></div>';
function viewAtu() {
  if (!S().lists.includes('ATU')) { S().lists = S().lists.concat('ATU'); window.save(); }
  const t = today(), tasks = data.items.filter(i => i.kind === 'task' && i.list === 'ATU');
  const open = tasks.filter(i => !i.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (b.priority || 0) - (a.priority || 0)), done = tasks.filter(i => i.done).slice(-5);
  const atuCal = S().calendars.filter(c => /atu|outlook/i.test(c.name)).map(c => c.name);
  const events = agenda(t, addDays(t, 14)).filter(e => e.kind !== 'task' && (atuCal.includes(e.cal) || e.listName === 'ATU' || e.listName === 'ATU Music'));
  const sn = snaData(), last = sn.orders[0];
  $('view').innerHTML = '<h1>ATU</h1>' + atuTabs('atu') +
    '<div class="quickbar"><input id="atuAdd" placeholder="Add an ATU task… “Order SNA snacks friday”"><button type="button" id="atuGo">Add</button></div>' +
    '<div class="card pad"><h2 class="section-title">To do <small>' + open.length + '</small></h2>' + (open.length ? open.map(i => entryRow(Object.assign({ src: 'planner', id: i.id, kind: 'task', listName: 'ATU', allDay: true }, i))).join('') : '<p class="helper">Nothing to do. Add ATU tasks above.</p>') +
      (done.length ? '<p class="lbl">Recently done</p>' + done.map(i => entryRow(Object.assign({ src: 'planner', kind: 'task', listName: 'ATU', allDay: true }, i))).join('') : '') + '</div>' +
    '<a class="card pad tip" href="#tasks/sna"><b>🍿 SNA Snack Closet <span id="atuReqN"></span></b><span class="sub">' + sn.items.length + ' items · ' + (last ? 'last order ' + fmtDate(last.date, 'rel') + ' ($' + last.total.toFixed(2) + ')' : 'make an order') + ' →</span></a>' +
    '<div class="card pad"><h2>Next 2 weeks at ATU</h2>' + (events.length ? events.slice(0, 12).map(entryRow).join('') : '<p class="helper">Nothing on your ATU calendar in the next 2 weeks.</p>') + '</div>' +
    '<a class="card pad tip" href="#files" id="atuFiles"><b>📁 ATU files</b><span class="sub">Documents and notes in your ATU folder →</span></a>';
  const go = () => { const v = $('atuAdd').value.trim(); if (!v) return; const p = parseQuick(v); data.items.push(newItem({ kind: 'task', title: p.title || v, date: p.date || null, list: 'ATU' })); window.save(); viewAtu(); toast('✓ ATU task added'); setTimeout(() => $('atuAdd').focus(), 50); };
  $('atuGo').onclick = go; $('atuAdd').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('atuFiles').onclick = () => { fileFolder = 'ATU'; fileFind = ''; };
  wireRows($('view'));
}
// The snack closet catalog (Sam's Club), counts, order quantities and past orders live in settings.sna.
const SNA_CATS = ['Chips & salty', 'Crackers', 'Cookies', 'Snack cakes & pastries', 'Bars & breakfast', 'Candy', 'Quick meals', 'Drinks', 'Other'];
const snaData = () => { const s = S().sna || {}; return { items: s.items || [], orders: s.orders || [], budget: s.budget || 0, pickup: s.pickup || null }; };
const snaSave = d => { S().sna = Object.assign({}, S().sna || {}, d); window.save(); };
const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2);
let snaEdit = false, snaFind = '';
function viewSna() {
  const sn = snaData(), items = sn.items, q = snaFind.trim().toLowerCase();
  const lines = items.filter(i => (i.order || 0) > 0), total = lines.reduce((s, i) => s + (i.order || 0) * (i.price || 0), 0), count = lines.reduce((s, i) => s + (i.order || 0), 0);
  const shown = items.filter(i => !q || (i.name + ' ' + i.cat).toLowerCase().includes(q));
  const row = i => '<div class="snarow' + ((i.order || 0) > 0 ? ' on' : '') + '" data-sid="' + i.id + '"><div class="snainfo"><a href="' + esc(i.url || '#') + '" target="_blank" rel="noopener">' + esc(i.name) + '</a><small>' + [i.size, i.price ? money(i.price) : 'price?', i.aisle ? 'Aisle ' + i.aisle : '', i.note].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
    (snaEdit ? '<div class="snaedit"><button type="button" class="ghost small" data-snaed="' + i.id + '">Edit</button></div>' :
    '<div class="snanums"><label>Have<input type="number" min="0" inputmode="numeric" data-have="' + i.id + '" value="' + (i.have != null && i.have !== '' ? i.have : '') + '" placeholder="–"></label><label>Keep<input type="number" min="0" inputmode="numeric" data-par="' + i.id + '" value="' + (i.par || '') + '" placeholder="–"></label>' +
    '<label class="ord">Order<span class="ordq"><button type="button" class="ghost small" data-om="' + i.id + '">−</button><b>' + (i.order || 0) + '</b><button type="button" class="ghost small" data-op="' + i.id + '">＋</button></span></label></div>') + '</div>';
  $('view').innerHTML = '<h1>ATU</h1>' + atuTabs('sna') +
    '<div class="card pad snasum"><div><h2>🍿 Snack closet order</h2><p class="sub">' + count + ' packs · <b>' + money(total) + '</b>' + (sn.budget ? ' of ' + money(sn.budget) + ' budget' + (total > sn.budget ? ' <span class="over">· ' + money(total - sn.budget) + ' over</span>' : ' · ' + money(sn.budget - total) + ' left') : '') + '</p>' +
      (sn.budget ? '<div class="cprog"><i style="width:' + Math.min(100, Math.round(total / sn.budget * 100)) + '%' + (total > sn.budget ? ';background:#c0675c' : '') + '"></i></div>' : '') + '</div>' +
      (sn.pickup && (sn.pickup.store || sn.pickup.date) ? '<p class="pickupbox">🚗 ' + esc((sn.pickup.store || '') + ' Sam’s Club') + (sn.pickup.date ? ' · ' + esc(fmtDate(sn.pickup.date, 'rel')) : '') + (sn.pickup.time ? ' at ' + esc(fmtTime(sn.pickup.time)) : '') + ' · 🏷 ' + esc(sn.pickup.name || '') + ' <button type="button" class="linkish" id="snaPkX">clear</button></p>' : '') +
      '<div class="row-actions tight"><button type="button" id="snaForm"' + (count ? '' : ' disabled') + '>📄 Order form</button><button type="button" class="ghost small" id="snaSheet">🖨 Count sheet</button><button type="button" class="ghost small" id="snaFill">✨ Fill from counts</button><button type="button" class="ghost small" id="snaLast"' + (sn.orders.length ? '' : ' disabled') + '>↺ Same as last order</button><button type="button" class="ghost small" id="snaClear"' + (count ? '' : ' disabled') + '>Clear</button></div></div>' +
    '<div class="card pad snareq"><div class="mini-head"><h2>📨 Student requests</h2><span><button type="button" class="small" id="snaShare">📤 Share link</button></span></div><div id="snaReqs"><p class="helper">' + (signedIn() ? 'Loading…' : 'Sign in to see requests.') + '</p></div></div>' +
    '<p class="helper">Count what’s in the closet (<b>Have</b>), set how many you like to keep on the shelf (<b>Keep</b>), then tap <b>✨ Fill from counts</b> and the order fills itself. Or tap ＋ to order. Tap a name to open it at Sam’s Club.</p>' +
    '<div class="row-actions tight"><input id="snaFind" type="search" placeholder="Search snacks" value="' + esc(snaFind) + '"><button type="button" class="ghost small" id="snaEditT">' + (snaEdit ? '✓ Done editing' : '✎ Edit items') + '</button>' + (snaEdit ? '<button type="button" class="small" id="snaNew">＋ New item</button>' : '') + '</div>' +
    SNA_CATS.map(c => { const l = shown.filter(i => (i.cat || 'Other') === c); return l.length ? '<div class="card pad"><h3>' + esc(c) + ' <small>' + l.length + '</small></h3>' + l.map(row).join('') + '</div>' : ''; }).join('') +
    '<div class="card pad"><div class="mini-head"><h2>Orders</h2><label class="budget">Budget $<input type="number" min="0" inputmode="decimal" id="snaBudget" value="' + (sn.budget || '') + '" placeholder="none"></label></div>' +
      (sn.orders.length ? sn.orders.slice(0, 10).map((o, k) => '<div class="mini-row"><span><b>' + esc(fmtDate(o.date)) + '</b> · ' + o.lines.reduce((s, l) => s + l.qty, 0) + ' packs · ' + money(o.total) + ' <small class="sub">' + (o.received ? '✓ received' : 'ordered') + '</small></span><span>' + (o.received ? '' : '<button type="button" class="ghost small" data-orec="' + k + '">✓ Got it</button>') + '<button type="button" class="ghost small" data-oview="' + k + '">View</button></span></div>').join('') : '<p class="helper">No orders yet.</p>') +
      '<div class="row-actions tight"><button type="button" class="ghost small" id="snaRemind">' + (data.items.some(i => i.id === 'sna-weekly') ? '✓ Weekly reminder is on' : '⏰ Weekly “count & order” reminder') + '</button></div></div>';
  const v = $('view'), find = id => items.find(i => i.id === id), put = () => snaSave({ items }), redraw = () => { const y = window.scrollY; viewSna(); window.scrollTo(0, y); };
  v.querySelectorAll('[data-have]').forEach(i => i.onchange = () => { find(i.dataset.have).have = i.value === '' ? null : Math.max(0, +i.value); put(); });
  v.querySelectorAll('[data-par]').forEach(i => i.onchange = () => { find(i.dataset.par).par = Math.max(0, +i.value || 0); put(); });
  v.querySelectorAll('[data-op],[data-om]').forEach(b => b.onclick = () => { const it = find(b.dataset.op || b.dataset.om); it.order = Math.max(0, (it.order || 0) + (b.dataset.op ? 1 : -1)); put(); redraw(); });
  v.querySelectorAll('[data-snaed]').forEach(b => b.onclick = () => editSna(b.dataset.snaed));
  $('snaFind').oninput = e => { snaFind = e.target.value; clearTimeout(viewSna.t); viewSna.t = setTimeout(() => { viewSna(); const f = $('snaFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
  $('snaEditT').onclick = () => { snaEdit = !snaEdit; viewSna(); };
  if ($('snaNew')) $('snaNew').onclick = () => editSna(null);
  $('snaFill').onclick = () => {
    let n = 0, skipped = 0;
    items.forEach(i => { if (!i.par) return; if (i.have == null || i.have === '') { skipped++; return; } const want = Math.max(0, i.par - i.have); if (want !== (i.order || 0)) n++; i.order = want; });
    put(); viewSna();
    toast(items.some(i => i.par) ? '✨ Order filled from your counts' + (skipped ? ' · ' + skipped + ' items have no count yet' : '') : 'Set “Keep” on the items first (how many you like on the shelf).');
  };
  $('snaLast').onclick = () => { const o = sn.orders[0]; if (!o) return; items.forEach(i => { const l = o.lines.find(x => x.id === i.id); i.order = l ? l.qty : 0; }); put(); viewSna(); toast('↺ Same as ' + fmtDate(o.date)); };
  $('snaClear').onclick = () => { if (!confirm('Clear the whole order?')) return; items.forEach(i => { i.order = 0; }); put(); viewSna(); };
  $('snaForm').onclick = () => snaForm(null);
  $('snaShare').onclick = snaShare;
  $('snaSheet').onclick = snaCountSheet;
  if ($('snaPkX')) $('snaPkX').onclick = () => { snaSave({ pickup: null }); viewSna(); };
  loadSnaRequests();
  $('snaBudget').onchange = e => { snaSave({ budget: Math.max(0, +e.target.value || 0) }); viewSna(); };
  v.querySelectorAll('[data-oview]').forEach(b => b.onclick = () => snaForm(sn.orders[+b.dataset.oview]));
  v.querySelectorAll('[data-orec]').forEach(b => b.onclick = () => {
    const o = sn.orders[+b.dataset.orec]; o.received = today();
    o.lines.forEach(l => { const it = find(l.id); if (it && it.have != null && it.have !== '') it.have = (+it.have || 0) + l.qty; });
    snaSave({ items, orders: sn.orders }); viewSna(); toast('✓ Received · counts updated');
  });
  $('snaRemind').onclick = () => {
    if (data.items.some(i => i.id === 'sna-weekly')) { toast('It’s in Tasks → ATU. Delete it there to stop.'); return; }
    const day = prompt('Which day do you count the snack closet and order? (Mon, Tue, Wed, Thu, Fri)', 'Mon'); if (!day) return;
    const want = DAYS.indexOf(day.trim().slice(0, 2).toLowerCase()); if (want < 0) { toast('Type a day like Mon or Fri.'); return; }
    let d = today(); while (new Date(d + 'T12:00').getDay() !== want) d = addDays(d, 1);
    data.items.push(newItem({ id: 'sna-weekly', kind: 'task', title: '🍿 Count the SNA snack closet & send the order', date: d, repeat: 'weekly', list: 'ATU', notes: 'Tasks → ATU → 🍿 SNA Snack Closet' }));
    window.save(); viewSna(); toast('⏰ Weekly reminder set for ' + fmtDate(d, 'rel'));
  };
}
// The student link: anyone with it can pick snacks and send a request (they can't see prices or anything else).
function snaLink() {
  if (!S().snaToken) { S().snaToken = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join(''); window.save(); }
  return new URL('sna.html?t=' + S().snaToken, location.href).href;
}
// A printable sheet for counting the closet by hand: every item by kind, with boxes for Have and Order.
function snaCountSheet() {
  const sn = snaData(), items = sn.items.filter(i => !/out of stock/i.test(i.note || ''));
  const head = '<h2>SNA Snack Closet count sheet</h2><p class="sub">Counted by: ______________________ &nbsp; Date: ____________ &nbsp; · Count packs/boxes on the shelf, then enter them in the planner (Tasks → ATU → 🍿 SNA Snack Closet → Have).</p>';
  const table = '<table class="snaform countsheet"><thead><tr><th>Item</th><th>Aisle</th><th>Keep</th><th>Have</th><th>Order</th></tr></thead><tbody>' +
    SNA_CATS.map(c => { const l = items.filter(i => (i.cat || 'Other') === c).sort((a, b) => a.name.localeCompare(b.name)); return l.length ? '<tr class="cat"><td colspan="5">' + esc(c) + '</td></tr>' + l.map(i => '<tr><td>' + esc(i.name) + (i.size ? ' <small>' + esc(i.size) + '</small>' : '') + '</td><td>' + esc(i.aisle || '') + '</td><td>' + (i.par || '') + '</td><td class="box"></td><td class="box"></td></tr>').join('') : ''; }).join('') +
    '</tbody></table><p class="sub">Notes / new snack ideas: _____________________________________________________________</p>';
  $('modalBody').classList.add('wide');
  openModal(head + table + '<div class="row-actions"><button type="button" id="csPrint">🖨 Print / PDF</button><button type="button" class="ghost" id="csX">Close</button></div><p class="helper">After counting, type each number in the <b>Have</b> box on the SNA page and tap <b>✨ Fill from counts</b> to build the order.</p>');
  $('csX').onclick = closeModal;
  $('csPrint').onclick = () => { const d = document.createElement('div'); d.className = 'print-only snaprint'; d.innerHTML = head + table; $('view').appendChild(d); window.print(); setTimeout(() => d.remove(), 1000); };
}
function snaShare() {
  const url = snaLink();
  openModal('<h2>📤 Student link</h2><p class="helper">Send this to students. They tap ＋ on what the snack closet needs, add their name and tap <b>Send list</b>. Their lists show up here under 📨 Student requests. They can’t see prices or anything else in your planner.</p>' +
    '<input id="slUrl" readonly value="' + esc(url) + '"><div class="row-actions"><button type="button" id="slShare">📤 Share</button><button type="button" class="ghost" id="slCopy">Copy link</button><a class="button ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Open it</a></div>' +
    '<div class="row-actions tight"><button type="button" class="ghost small" id="slNew">Make a new link (the old one stops working)</button><button type="button" class="ghost small" id="slX">Close</button></div>');
  $('slX').onclick = closeModal;
  $('slCopy').onclick = () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => { $('slUrl').select(); toast('Press and hold to copy'); });
  $('slShare').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'SNA Snack Closet', text: 'What does the SNA snack closet need? Pick snacks here:', url }); } catch (e) {} } else $('slCopy').click(); };
  $('slNew').onclick = () => { if (!confirm('Make a new link? Students with the old link won’t be able to send lists.')) return; S().snaToken = ''; window.save(); snaShare(); };
}
let snaShowDone = false;
const pickupWhen = r => (r.pickup_date ? fmtDate(r.pickup_date, 'rel') : '') + (r.pickup_time ? ' at ' + fmtTime(r.pickup_time) : '');
function pickupHtml(r) {
  if (!r.store && !r.email && !r.phone) return '';
  const tel = (r.phone || '').replace(/[^\d+]/g, '');
  return '<div class="spick">' + (r.store || r.pickup_date ? '<span>🚗 <b>' + esc(r.store || '') + ' Sam’s Club</b>' + (r.pickup_date ? ' · ' + esc(pickupWhen(r)) : '') + '</span>' : '') +
    '<span>🏷 Name on order: <b>' + esc(r.name || '') + '</b></span>' +
    (r.email ? '<span>✉️ <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></span>' : '') +
    (r.phone ? '<span>📞 <a href="tel:' + esc(tel) + '">' + esc(r.phone) + '</a> · <a href="sms:' + esc(tel) + '">text</a></span>' : '') + '</div>';
}
// When a request is added to the order, its pickup details go on the order form, and the pickup goes on the calendar.
function usePickup(r) {
  if (!r.store && !r.pickup_date) return false;
  snaSave({ pickup: { name: r.name, email: r.email, phone: r.phone, store: r.store, date: r.pickup_date, time: r.pickup_time } });
  if (r.pickup_date) {
    const id = 'snapick-' + r.id.slice(0, 8);
    if (!data.items.some(i => i.id === id)) data.items.push(newItem({ id, kind: 'event', title: '🛒 Sam’s pickup – ' + (r.name || 'SNA order'), date: r.pickup_date, allDay: !r.pickup_time, start: r.pickup_time || '', end: r.pickup_time ? pad(Math.min(23, +r.pickup_time.slice(0, 2) + 1)) + r.pickup_time.slice(2, 5) : '', location: (r.store || '') + ' Sam’s Club', list: 'ATU', color: '#7f9fa3', notes: 'SNA Snack Closet order · name on order: ' + (r.name || '') + (r.phone ? ' · ' + r.phone : '') + (r.email ? ' · ' + r.email : '') }));
    window.save();
  }
  return true;
}
async function loadSnaRequests() {
  const box = $('snaReqs'), c = client(); if (!box || !c || !signedIn()) return;
  let rows, error;
  try { ({ data: rows, error } = await c.from('sna_requests').select('*').order('created_at', { ascending: false }).limit(60)); } catch (e) { error = e; }
  if (!$('snaReqs')) return;
  if (error) { box.innerHTML = '<p class="helper">Couldn’t load requests: ' + esc(error.message) + '</p>'; return; }
  const open = rows.filter(r => !r.handled), done = rows.filter(r => r.handled);
  const sn = snaData(), card = r => '<div class="sreq' + (r.handled ? ' done' : '') + '"><div class="mini-row"><span><b>' + esc(r.name || 'Someone') + '</b> <small class="sub">' + esc(fmtDate(r.created_at.slice(0, 10), 'rel')) + ' ' + new Date(r.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</small></span>' +
    (r.handled ? '<small class="sub">✓ added</small>' : '<span><button type="button" class="small" data-radd="' + r.id + '">＋ Add to order</button><button type="button" class="ghost small" data-rdone="' + r.id + '">Done</button></span>') + '</div>' +
    pickupHtml(r) +
    '<p class="sreql">' + r.lines.map(l => esc(l.name) + (l.qty > 1 ? ' <b>×' + l.qty + '</b>' : '') + (sn.items.some(i => i.id === l.id) ? '' : ' <small>(not on the list anymore)</small>')).join(' · ') + '</p>' + (r.note ? '<p class="sub">💬 ' + esc(r.note) + '</p>' : '') + '</div>';
  box.innerHTML = (open.length ? (open.length > 1 ? '<div class="row-actions tight"><button type="button" class="ghost small" id="raAll">＋ Add all ' + open.length + ' to the order</button></div>' : '') + open.map(card).join('') : '<p class="helper">No new requests. Tap 📤 Share link to send students the form.</p>') +
    (done.length ? '<button type="button" class="linkish" id="raShow">' + (snaShowDone ? 'Hide' : 'Show') + ' earlier requests (' + done.length + ')</button>' + (snaShowDone ? done.slice(0, 20).map(card).join('') : '') : '');
  const mark = async ids => { const r = await c.from('sna_requests').update({ handled: true }).in('id', ids); if (r.error) toast('Couldn’t update: ' + r.error.message); };
  const addLines = reqs => { const d = snaData(); let n = 0; reqs.forEach(r => r.lines.forEach(l => { const it = d.items.find(i => i.id === l.id); if (it) { it.order = (it.order || 0) + (l.qty || 1); n += l.qty || 1; } })); snaSave({ items: d.items }); return n; };
  box.querySelectorAll('[data-radd]').forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.radd); const n = addLines([r]); const pk = usePickup(r); await mark([r.id]); viewSna(); toast('✓ Added ' + n + ' packs from ' + (r.name || 'the request') + (pk ? ' · pickup is on your calendar' : '')); });
  box.querySelectorAll('[data-rdone]').forEach(b => b.onclick = async () => { await mark([b.dataset.rdone]); loadSnaRequests(); });
  if ($('raAll')) $('raAll').onclick = async () => { const n = addLines(open); open.slice().reverse().forEach(usePickup); await mark(open.map(r => r.id)); viewSna(); toast('✓ Added ' + n + ' packs from ' + open.length + ' requests'); };
  if ($('raShow')) $('raShow').onclick = () => { snaShowDone = !snaShowDone; loadSnaRequests(); };
}
function editSna(id) {
  const sn = snaData(), it = id ? sn.items.find(i => i.id === id) : { name: '', size: '', price: '', aisle: '', url: '', cat: 'Chips & salty', note: '' };
  openModal('<h2>' + (id ? 'Edit snack' : 'New snack') + '</h2><label>Name<input id="seN" value="' + esc(it.name) + '"></label>' +
    '<div class="grid2"><label>Size / count<input id="seS" value="' + esc(it.size || '') + '" placeholder="30 pk"></label><label>Price $<input id="seP" type="number" step="0.01" inputmode="decimal" value="' + (it.price || '') + '"></label></div>' +
    '<div class="grid2"><label>Aisle<input id="seA" value="' + esc(it.aisle || '') + '" placeholder="C7"></label><label>Kind<select id="seC">' + SNA_CATS.map(c => '<option' + (c === it.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label></div>' +
    '<label>Sam’s Club link<input id="seU" value="' + esc(it.url || '') + '" placeholder="https://www.samsclub.com/ip/…" autocapitalize="off"></label><label>Note<input id="seNo" value="' + esc(it.note || '') + '" placeholder="out of stock, seasonal…"></label>' +
    '<div class="row-actions"><button type="button" id="seSave">Save</button><button type="button" class="ghost" id="seX">Cancel</button>' + (id ? '<button type="button" class="danger" id="seDel">Delete</button>' : '') + '</div>');
  $('seX').onclick = closeModal;
  $('seSave').onclick = () => {
    const name = $('seN').value.trim(); if (!name) { toast('Type the name.'); return; }
    Object.assign(it, { name, size: $('seS').value.trim(), price: +$('seP').value || 0, aisle: $('seA').value.trim(), cat: $('seC').value, url: $('seU').value.trim(), note: $('seNo').value.trim() });
    if (!id) { it.id = 'sna-' + uid().slice(0, 8); it.order = 0; sn.items.push(it); }
    snaSave({ items: sn.items }); closeModal(); viewSna();
  };
  if (id) $('seDel').onclick = () => { if (!confirm('Delete ' + it.name + '?')) return; snaSave({ items: sn.items.filter(x => x !== it) }); closeModal(); viewSna(); };
}
// The order form: a clean table to print, email, copy, or save for Excel. "Mark as ordered" keeps it in Orders.
function snaForm(past) {
  const sn = snaData(), lines = past ? past.lines : sn.items.filter(i => (i.order || 0) > 0).map(i => ({ id: i.id, name: i.name, size: i.size, aisle: i.aisle, price: i.price || 0, qty: i.order, url: i.url, cat: i.cat }));
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0), date = past ? past.date : today();
  lines.sort((a, b) => SNA_CATS.indexOf(a.cat || 'Other') - SNA_CATS.indexOf(b.cat || 'Other') || a.name.localeCompare(b.name));
  const table = '<table class="snaform"><thead><tr><th>Qty</th><th>Item</th><th>Aisle</th><th>Price</th><th>Total</th></tr></thead><tbody>' + lines.map(l => '<tr><td>' + l.qty + '</td><td>' + esc(l.name) + (l.size ? ' <small>(' + esc(l.size) + ')</small>' : '') + '</td><td>' + esc(l.aisle || '') + '</td><td>' + money(l.price) + '</td><td>' + money(l.qty * l.price) + '</td></tr>').join('') +
    '</tbody><tfoot><tr><td>' + lines.reduce((s, l) => s + l.qty, 0) + '</td><td colspan="3"><b>Total (before tax)</b></td><td><b>' + money(total) + '</b></td></tr></tfoot></table>';
  const pk = past ? past.pickup : sn.pickup;
  const pkLine = pk && (pk.store || pk.date) ? '<p class="pickupbox">🚗 <b>Pickup:</b> ' + esc((pk.store || '') + ' Sam’s Club') + (pk.date ? ' · ' + esc(fmtDate(pk.date, 'long')) : '') + (pk.time ? ' at ' + esc(fmtTime(pk.time)) : '') + '<br>🏷 <b>Name on the order:</b> ' + esc(pk.name || '') + (pk.phone ? ' · 📞 ' + esc(pk.phone) : '') + (pk.email ? ' · ✉️ ' + esc(pk.email) : '') + '</p>' : '';
  const head = '<h2>SNA Snack Closet order</h2><p class="sub">Arkansas Tech University · ' + esc(fmtDate(date, 'long')) + ' · Sam’s Club · ordered by Shaana Escobar</p>' + pkLine;
  const text = 'SNA Snack Closet order – ' + fmtDate(date, 'long') + '\nSam’s Club' + (pk && (pk.store || pk.date) ? '\nPickup: ' + (pk.store || '') + ' Sam’s Club' + (pk.date ? ', ' + fmtDate(pk.date, 'long') : '') + (pk.time ? ' at ' + fmtTime(pk.time) : '') + '\nName on the order: ' + (pk.name || '') + (pk.phone ? ' · ' + pk.phone : '') + (pk.email ? ' · ' + pk.email : '') : '') + '\n\n' + lines.map(l => l.qty + ' × ' + l.name + (l.size ? ' (' + l.size + ')' : '') + (l.aisle ? ' – aisle ' + l.aisle : '') + ' – ' + money(l.price) + ' = ' + money(l.qty * l.price)).join('\n') + '\n\nTotal (before tax): ' + money(total) + '\n\nShaana Escobar';
  $('modalBody').classList.add('wide');
  openModal(head + table + '<div class="row-actions"><button type="button" id="sfPrint">🖨 Print / PDF</button><button type="button" class="ghost" id="sfMail">✉️ Email</button><button type="button" class="ghost" id="sfCopy">Copy</button><button type="button" class="ghost" id="sfCsv">Excel (.csv)</button></div>' +
    (past ? '<div class="row-actions"><button type="button" class="ghost" id="sfX">Close</button></div>' : '<div class="row-actions"><button type="button" id="sfDone">✓ Mark as ordered</button><button type="button" class="ghost" id="sfX">Keep editing</button></div><p class="helper">“Mark as ordered” saves it under Orders and clears the order for next time. When it arrives, tap ✓ Got it.</p>'));
  $('sfX').onclick = closeModal;
  $('sfPrint').onclick = () => { const d = document.createElement('div'); d.className = 'print-only snaprint'; d.innerHTML = head + table; $('view').appendChild(d); window.print(); setTimeout(() => d.remove(), 1000); };
  $('sfMail').onclick = () => { location.href = 'mailto:?subject=' + encodeURIComponent('SNA Snack Closet order – ' + fmtDate(date)) + '&body=' + encodeURIComponent(text); };
  $('sfCopy').onclick = () => navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into an email or Teams.'), () => toast('Could not copy.'));
  $('sfCsv').onclick = () => download('SNA-order-' + date + '.csv', 'Qty,Item,Size,Aisle,Price,Total,Link\n' + lines.map(l => [l.qty, l.name, l.size || '', l.aisle || '', l.price.toFixed(2), (l.qty * l.price).toFixed(2), l.url || ''].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n,Total,,,,' + total.toFixed(2) + ',', 'text/csv');
  if (!past) $('sfDone').onclick = () => {
    const orders = [{ date, pickup: sn.pickup || null, lines: lines.map(l => ({ id: l.id, name: l.name, size: l.size, aisle: l.aisle, price: l.price, qty: l.qty, url: l.url, cat: l.cat })), total: Math.round(total * 100) / 100 }].concat(sn.orders).slice(0, 52);
    sn.items.forEach(i => { i.order = 0; });
    snaSave({ items: sn.items, orders, pickup: null }); closeModal(); viewSna(); toast('✓ Order saved · ' + money(total));
  };
}
// ---------- 💊 Medicines & vitamins ----------
// The list lives in settings.meds; each dose taken is an item (kind 'medlog'). Daily phone alerts are hidden repeating
// events (id 'medrem-…') that only go to the calendar feed, so they don't crowd the planner.
const PEOPLE = ['Shaana', 'Salvador', 'Cecilia', 'Elisha'];
const meds = () => S().meds || [];
const setMeds = l => { S().meds = l; syncMedReminders(); window.save(); };
const medLog = (m, d, t) => data.items.find(i => i.kind === 'medlog' && i.list === m.id && i.date === d && i.location === t);
const dailyDoses = m => (m.times || []).length || 1;
const medLow = m => m.pillsLeft != null && m.pillsLeft !== '' && +m.pillsLeft <= (+m.perDose || 1) * dailyDoses(m) * 7;
function syncMedReminders() {
  const want = new Set();
  meds().filter(m => m.active !== false && m.remind !== false).forEach(m => (m.times || []).forEach((t, k) => {
    const id = 'medrem-' + m.id + '-' + k; want.add(id);
    let it = data.items.find(i => i.id === id);
    if (!it) { it = newItem({ id, kind: 'event', date: m.start || today(), repeat: 'daily', list: 'Medicine', remind: 0, allDay: false }); data.items.push(it); }
    Object.assign(it, { title: '💊 ' + m.name + (m.dose ? ' (' + m.dose + ')' : '') + ' – ' + m.who, start: t, end: t, allDay: false, notes: [m.withFood ? 'Take with food' : '', m.notes].filter(Boolean).join(' · ') });
  }));
  data.items = data.items.filter(i => !(i.id.startsWith('medrem-') && !want.has(i.id)));
}
function takeDose(m, d, t) {
  const have = medLog(m, d, t), list = meds(), med = list.find(x => x.id === m.id);
  if (have) { data.items = data.items.filter(i => i !== have); if (med.pillsLeft != null && med.pillsLeft !== '') med.pillsLeft = +med.pillsLeft + (+med.perDose || 1); }
  else {
    data.items.push(newItem({ kind: 'medlog', list: m.id, date: d, location: t, title: m.name, done: true }));
    if (med.pillsLeft != null && med.pillsLeft !== '') {
      med.pillsLeft = Math.max(0, +med.pillsLeft - (+med.perDose || 1));
      const rid = 'medrefill-' + m.id;
      if (medLow(med) && !data.items.some(i => i.id === rid && !i.done)) { data.items = data.items.filter(i => i.id !== rid); data.items.push(newItem({ id: rid, kind: 'task', title: '💊 Refill ' + med.name + ' for ' + med.who, date: today(), list: 'Home', priority: 2, notes: [med.pharmacy, med.rx ? 'Rx ' + med.rx : ''].filter(Boolean).join(' · ') })); toast('💊 ' + med.name + ' is running low · refill task added'); }
    }
  }
  S().meds = list; window.save();
}
// Today's doses as checkboxes, for Today and the Medicines page.
function medsToday(d) {
  const list = meds().filter(m => m.active !== false && (!m.start || m.start <= d) && (!m.end || m.end >= d));
  const doses = []; list.forEach(m => (m.times && m.times.length ? m.times : ['']).forEach(t => doses.push({ m, t })));
  doses.sort((a, b) => (a.t || '99').localeCompare(b.t || '99') || a.m.who.localeCompare(b.m.who));
  return doses;
}
function medCard(d) {
  const doses = medsToday(d); if (!doses.length) return '';
  const done = doses.filter(x => medLog(x.m, d, x.t)).length;
  return '<div class="card pad medcard"><div class="mini-head"><h2>💊 Medicine' + (d === today() ? ' today' : '') + ' <small>' + done + '/' + doses.length + '</small></h2><a class="linkish" href="#meds">All medicines</a></div>' +
    doses.map(x => { const on = !!medLog(x.m, d, x.t); return '<div class="medrow' + (on ? ' on' : '') + '"><button type="button" class="tick' + (on ? ' on' : '') + '" data-dose="' + x.m.id + '|' + x.t + '|' + d + '">' + (on ? '✓' : '') + '</button><span><b>' + esc(x.m.name) + '</b>' + (x.m.dose ? ' · ' + esc(x.m.dose) : '') + ' <small class="sub">' + esc(x.m.who) + (x.t ? ' · ' + fmtTime(x.t) : '') + (x.m.withFood ? ' · with food' : '') + '</small></span>' + (medLow(x.m) ? '<em class="cwho">refill soon</em>' : '') + '</div>'; }).join('') + '</div>';
}
function wireMeds(root, redraw) {
  root.querySelectorAll('[data-dose]').forEach(b => b.onclick = () => { const [id, t, d] = b.dataset.dose.split('|'), m = meds().find(x => x.id === id); if (!m) return; const was = !!medLog(m, d, t); takeDose(m, d, t); if (!was) celebrate(b); (redraw || route)(); });
}
let medWho = 'all';
// ---------- 👧 Kids' links: Eli and Cece add events and shopping items; Shaana gets a phone alert ----------
const VAPID_PUBLIC = 'BHXwQh1ZPxnPD4wogzI6EhigVplkijPQEjQFMafIB5R4iafFv-JZVo-nqZw5zrNC01nOldzP-kFSMurNO4TL1qE';
const kidLink = t => new URL('kid.html?t=' + t, location.href.split('#')[0]).href;
// What the kids added that Shaana hasn't marked as seen, shown on Today.
async function loadKidNews() {
  const box = $('kidBox'), c = client(); if (!box || !c || !signedIn()) return;
  try {
    const { data } = await c.from('kid_activity').select('id,who,kind,title,created_at').eq('seen', false).order('created_at', { ascending: false }).limit(20);
    if (!$('kidBox') || !data || !data.length) { if ($('kidBox')) box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card pad kidnews"><div class="mini-head"><h2>👨‍👩‍👧‍👦 From the family</h2><button type="button" class="ghost small" id="kidSeen">Got it</button></div>' +
      data.map(a => '<div class="mini-row"><span>' + (a.kind === 'event' ? '📅 ' : '🛒 ') + '<b>' + esc(a.who) + '</b> added ' + esc(a.title) + '</span><span class="sub">' + esc(fmtDate(a.created_at.slice(0, 10), 'rel')) + '</span></div>').join('') + '</div>';
    $('kidSeen').onclick = async () => { await c.from('kid_activity').update({ seen: true }).in('id', data.map(a => a.id)); box.innerHTML = ''; };
  } catch (e) { box.innerHTML = ''; }
}
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, ch => ch.charCodeAt(0)); };
async function turnOnAlerts() {
  const c = client(); if (!c || !signedIn()) { toast('Sign in first (More → Account).'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    toast(/iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone: open the Planner from your Home Screen icon first (Share → Add to Home Screen), then try again.' : 'This browser can’t show alerts.'); return;
  }
  const ok = await Notification.requestPermission(); if (ok !== 'granted') { toast('Alerts are blocked. Allow notifications for the Planner in Settings.'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { error } = await c.from('push_subs').upsert({ endpoint: j.endpoint, sub: j });
    if (error) throw error;
    await c.functions.invoke('kid-notify', { body: { test: true } });
    toast('🔔 Alerts are on. You should get a test message now.');
  } catch (e) { toast('Couldn’t turn on alerts: ' + (e.message || e)); }
}
// Shaana edits anyone's daily reminders (the same list they see and can change on their own page).
function editFamilyReminders(k) {
  let list = (k.reminders || []).map(r => Object.assign({}, r));
  const draw = () => {
    openModal('<h2>⏰ ' + esc(k.name) + '’s reminders</h2><p class="helper">Every day at these times, ' + esc(k.name) + '’s phone pops up the reminder (once they tap “Get pop-up reminders” on their page).</p>' +
      '<div id="frList">' + list.map((r, i) => '<div class="grid2 frrow"><input data-frt="' + i + '" value="' + esc(r.t) + '" placeholder="Brush your teeth"><div class="frtime"><input type="time" data-fra="' + i + '" value="' + esc(r.at) + '"><button type="button" class="ghost small" data-frdel="' + i + '" aria-label="Delete">✕</button></div></div>').join('') + '</div>' +
      '<button type="button" class="ghost small" id="frAdd">＋ Add a reminder</button>' +
      '<div class="row-actions"><button type="button" id="frSave">Save</button><button type="button" class="ghost" id="frX">Cancel</button></div>');
    const grab = () => { list = list.map((r, i) => ({ t: $('modalBody').querySelector('[data-frt="' + i + '"]').value.trim(), at: $('modalBody').querySelector('[data-fra="' + i + '"]').value })); };
    $('frAdd').onclick = () => { grab(); list.push({ t: '', at: '20:00' }); draw(); const f = $('modalBody').querySelector('[data-frt="' + (list.length - 1) + '"]'); if (f) f.focus(); };
    $('modalBody').querySelectorAll('[data-frdel]').forEach(b => b.onclick = () => { grab(); list.splice(+b.dataset.frdel, 1); draw(); });
    $('frX').onclick = closeModal;
    $('frSave').onclick = async () => {
      grab();
      const { data, error } = await client().rpc('kid_set_reminders', { p_token: k.token, p_reminders: list.filter(r => r.t && r.at) });
      if (error) { toast(error.message); return; }
      k.reminders = data; closeModal(); viewKids(); toast('✓ ' + k.name + '’s reminders saved');
    };
  };
  draw();
}
function viewKids() {
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>👨‍👩‍👧‍👦 Family links</h1>' +
    '<div class="card pad"><p class="helper">Salvador, Eli and Cece can <b>add</b> events to the family calendar and things to the shopping list (they can’t change or delete those), and set their own daily reminders. You get a phone alert when they add something, and it shows on Today. Each link page shows how to put it on their Home Screen.</p></div>' +
    '<div class="card pad"><h2>🔔 Phone alerts</h2><p class="helper">Turn this on once on each phone or computer you want alerts on. On iPhone, open the Planner from its Home Screen icon first.</p><button type="button" id="alertsOn">Turn on alerts</button></div>' +
    '<div id="kidLinks"><p class="helper">Loading links…</p></div>';
  $('alertsOn').onclick = turnOnAlerts;
  const c = client(); if (!c || !signedIn()) { $('kidLinks').innerHTML = '<p class="helper">Sign in to see the links.</p>'; return; }
  c.from('kid_links').select('token,name,reminders').order('created_at').then(({ data }) => {
    $('kidLinks').innerHTML = (data || []).map(k => '<div class="card pad"><h2>' + esc(k.name) + '’s link</h2><p class="sub" style="word-break:break-all">' + esc(kidLink(k.token)) + '</p><div class="row-actions tight"><button type="button" class="small" data-kshare="' + esc(k.token) + '" data-kname="' + esc(k.name) + '">Send to ' + esc(k.name) + '</button><button type="button" class="small ghost" data-kcopy="' + esc(k.token) + '">Copy</button><a class="button small ghost" href="' + esc(kidLink(k.token)) + '" target="_blank" rel="noopener">See what they see</a></div>' +
      '<div class="kidrems"><b>⏰ Reminders</b>' + ((k.reminders || []).length ? (k.reminders || []).map(r => '<span class="sub">' + esc(fmtTime(r.at)) + ' · ' + esc(r.t) + '</span>').join('') : '<span class="sub">None yet</span>') + '<div class="row-actions tight"><button type="button" class="small ghost" data-krem="' + esc(k.token) + '">Edit reminders</button><button type="button" class="small ghost" data-kping="' + esc(k.name) + '">📣 Quick reminder</button></div></div></div>').join('') || '<p class="helper">No kid links yet.</p>';
    $('kidLinks').querySelectorAll('[data-kping]').forEach(b => b.onclick = () => sendPing('other', b.dataset.kping));
    $('kidLinks').querySelectorAll('[data-krem]').forEach(b => b.onclick = () => editFamilyReminders((data || []).find(k => k.token === b.dataset.krem)));
    $('kidLinks').querySelectorAll('[data-kcopy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(kidLink(b.dataset.kcopy)); toast('Link copied'); } catch (e) { prompt('Copy this link:', kidLink(b.dataset.kcopy)); } });
    $('kidLinks').querySelectorAll('[data-kshare]').forEach(b => b.onclick = async () => {
      const url = kidLink(b.dataset.kshare), text = 'Here’s your link to add things to our family calendar and shopping list 💛';
      if (navigator.share) { try { await navigator.share({ title: 'Family Planner', text, url }); } catch (e) {} } else location.href = 'sms:?&body=' + encodeURIComponent(text + ' ' + url);
    });
  });
}
// ---------- 📣 Quick reminders to the family (shows on their page + pops up on their phone), and 🎂 birthdays ----------
const PING_PRESETS = [['pickup', '🚗 Pick up Cece', '🚗 Pick up Cece from school'], ['game', '🏈 Football game', '🏈 Football game'], ['event', '📅 Event', '📅 '], ['other', '✏️ Other', '']];
function pingCard() {
  return '<div class="card pad pingcard"><div class="mini-head"><h2>📣 Quick reminder</h2><span class="sub">pops up on their phone</span></div><div class="pingbtns">' +
    PING_PRESETS.map(([k, label]) => '<button type="button" class="ghost small" data-ping="' + k + '">' + label + '</button>').join('') + '</div></div>';
}
function wirePing(root) { root.querySelectorAll('[data-ping]').forEach(b => b.onclick = () => sendPing(b.dataset.ping)); }
async function sendPing(kind, who) {
  const c = client(); if (!c || !signedIn()) { toast('Sign in first (More → Account).'); return; }
  const { data: people } = await c.from('kid_links').select('token,name,pings').order('created_at');
  if (!people || !people.length) { toast('No family links yet.'); return; }
  const preset = PING_PRESETS.find(p => p[0] === kind) || PING_PRESETS[3], phones = S().phones || {};
  const to = who || (people.find(p => p.name === 'Salvador') || people[0]).name;
  openModal('<h2>📣 Quick reminder</h2>' +
    '<label>To<select id="pgTo">' + people.map(p => '<option' + (p.name === to ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' +
    '<label>What<input id="pgT" maxlength="100" value="' + esc(preset[2]) + '" placeholder="What do they need to remember?"></label>' +
    '<div class="grid2"><label>Day<input id="pgD" type="date" value="' + today() + '"></label><label>Time<input id="pgAt" type="time"></label></div>' +
    '<label>Where / notes (optional)<input id="pgW" maxlength="80" placeholder="RHS, stadium, gate 3…"></label>' +
    '<label class="check"><input type="checkbox" id="pgCal" checked> Put it on my calendar too</label>' +
    '<label class="check"><input type="checkbox" id="pgSms" checked> Also send a text now</label>' +
    '<label id="pgPhoneL">Their cell (saved for next time)<input id="pgPhone" type="tel" inputmode="tel" placeholder="479-555-1234"></label>' +
    '<p class="helper">It shows on their page right away and pops up on their phone 30 minutes before (once they’ve turned on pop-up reminders). Give it about an hour to reach their phone, so for something right now, keep “send a text” checked.</p>' +
    '<div class="row-actions"><button type="button" id="pgGo">Send</button><button type="button" class="ghost" id="pgX">Cancel</button></div>');
  const syncPhone = () => { $('pgPhone').value = phones[$('pgTo').value] || ''; $('pgPhoneL').style.display = $('pgSms').checked ? '' : 'none'; };
  $('pgTo').onchange = syncPhone; $('pgSms').onchange = syncPhone; syncPhone();
  $('pgX').onclick = closeModal;
  $('pgGo').onclick = async () => {
    const name = $('pgTo').value, t = $('pgT').value.trim(), date = $('pgD').value || today(), at = $('pgAt').value, where = $('pgW').value.trim();
    if (!t || t === '📅') { toast('Type what it’s for.'); return; }
    if (kind === 'pickup' && !at) { toast('Add the pick-up time.'); $('pgAt').focus(); return; }
    const text = t + (where ? ' · ' + where : ''), person = people.find(p => p.name === name);
    const pings = (person.pings || []).filter(p => p.date >= addDays(today(), -2)).concat({ id: uid(), t: text, date, at, from: 'Shaana' });
    $('pgGo').disabled = true;
    const { error } = await c.from('kid_links').update({ pings }).eq('token', person.token);
    if (error) { $('pgGo').disabled = false; toast(error.message); return; }
    if ($('pgCal').checked) { data.items.push(newItem({ kind: 'event', title: t.replace(/^(\S+ )?/, m => m) + ' – ' + name, date, start: at, end: '', allDay: !at, list: 'Family', driver: /pick ?up|drive|ride/i.test(t) ? name : '', notes: where, location: '' })); window.save(); }
    const phone = $('pgPhone').value.trim();
    if (phone && phone !== phones[name]) { S().phones = Object.assign({}, phones, { [name]: phone }); window.save(); }
    const sms = $('pgSms').checked;
    closeModal(); route(); toast('📣 Sent to ' + name);
    if (sms) {
      const when = (date === today() ? 'today' : fmtDate(date)) + (at ? ' at ' + fmtTime(at) : '');
      location.href = 'sms:' + (phone ? phone.replace(/[^\d+]/g, '') : '') + (/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent('Reminder: ' + text + ' – ' + when + ' 💛');
    }
  };
}
// Birthdays from the family list: a party card on the day, and a heads-up for the next two weeks.
async function loadBirthdays() {
  const box = $('bdayBox'), c = client(); if (!box || !c || !signedIn()) return;
  let list = null;
  try { const { data } = await c.from('family_birthdays').select('name,md'); if (data) { list = data; cache.set('bdays', data); } } catch (e) {}
  list = list || cache.get('bdays'); if (!list) return;
  if (!$('bdayBox')) return;
  const t = today(), y = +t.slice(0, 4);
  const next = list.map(b => { let d = y + '-' + b.md; if (d < t) d = (y + 1) + '-' + b.md; return Object.assign({ date: d, days: Math.round((new Date(d + 'T12:00') - new Date(t + 'T12:00')) / 864e5) }, b); }).sort((a, b) => a.days - b.days);
  const todays = next.filter(b => b.days === 0), soon = next.filter(b => b.days > 0 && b.days <= 14);
  const names = l => l.map(b => esc(b.name)).join(' & ');
  box.innerHTML = (todays.length ? '<div class="card pad bdaycard"><div class="bdbig">🎂🎉🎈</div>' + (todays.some(b => b.name === 'Shaana') ? '<h2>Happy birthday, Shaana!</h2><p>You take care of everyone. Today, let everyone take care of you. 💛</p>' : '') +
      (todays.some(b => b.name !== 'Shaana') ? '<h2>Today is ' + names(todays.filter(b => b.name !== 'Shaana')) + '’s birthday!</h2><p>Time for cake, candles and lots of hugs 🥳</p>' : '') + '</div>' : '') +
    (soon.length ? '<a class="card pad tip" href="#gifts"><b>🎁 Birthdays coming up</b><span class="sub">' + soon.map(b => esc(b.name) + ' in ' + b.days + ' day' + (b.days === 1 ? '' : 's') + ' (' + esc(fmtDate(b.date)) + ')').join(' · ') + ' →</span></a>' : '');
}
function viewMeds() {
  const t = today(), list = meds(), shown = list.filter(m => medWho === 'all' || m.who === medWho);
  const days = [6, 5, 4, 3, 2, 1, 0].map(k => addDays(t, -k));
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>💊 Medicines</h1>' +
    '<div class="segs">' + ['all'].concat(PEOPLE).map(p => '<button type="button" class="seg' + (medWho === p ? ' on' : '') + '" data-mwho="' + p + '">' + (p === 'all' ? 'Everyone' : p === 'Cecilia' ? 'Cece' : p === 'Elisha' ? 'Eli' : p) + '</button>').join('') + '</div>' +
    medCard(t) +
    '<div class="row-actions"><button type="button" id="medNew">＋ Add a medicine or vitamin</button></div>' +
    (shown.length ? shown.map(m => { const doses = dailyDoses(m), taken = days.map(d => (m.times && m.times.length ? m.times : ['']).filter(x => medLog(m, d, x)).length);
      return '<div class="card pad medinfo' + (m.active === false ? ' off' : '') + '"><div class="mini-head"><h2>' + esc(m.name) + (m.dose ? ' <small>' + esc(m.dose) + '</small>' : '') + '</h2><button type="button" class="ghost small" data-medit="' + m.id + '">Edit</button></div>' +
        '<p class="sub">' + esc(m.who) + ' · ' + ((m.times || []).length ? m.times.map(fmtTime).join(', ') : 'as needed') + (m.withFood ? ' · with food' : '') + (m.remind === false ? ' · no phone alert' : ' · 🔔 phone alert') + (m.active === false ? ' · stopped' : '') + '</p>' +
        (m.pillsLeft != null && m.pillsLeft !== '' ? '<p class="' + (medLow(m) ? 'warnc' : 'sub') + '">' + m.pillsLeft + ' left · about ' + Math.floor(m.pillsLeft / ((+m.perDose || 1) * doses)) + ' days' + (medLow(m) ? ' · refill soon' : '') + '</p>' : '') +
        (m.pharmacy || m.rx ? '<p class="sub">' + (m.pharmacy ? '🏥 ' + esc(m.pharmacy) : '') + (m.pharmPhone ? ' · <a href="tel:' + esc(m.pharmPhone.replace(/[^\d+]/g, '')) + '">' + esc(m.pharmPhone) + '</a>' : '') + (m.rx ? ' · Rx ' + esc(m.rx) : '') + '</p>' : '') +
        '<div class="medweek">' + days.map((d, k) => '<span class="' + (taken[k] >= doses ? 'all' : taken[k] ? 'some' : '') + '" title="' + esc(fmtDate(d)) + '">' + new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'narrow' }) + '</span>').join('') + '</div></div>'; }).join('')
      : '<div class="card pad"><p class="helper">No medicines or vitamins yet. Tap ＋ to add one, with the times to take it. Your phone reminds you at those times (through the planner calendar you subscribed to).</p></div>');
  $('view').querySelectorAll('[data-mwho]').forEach(b => b.onclick = () => { medWho = b.dataset.mwho; viewMeds(); });
  $('medNew').onclick = () => editMed(null);
  $('view').querySelectorAll('[data-medit]').forEach(b => b.onclick = () => editMed(b.dataset.medit));
  wireMeds($('view'), viewMeds);
}
function editMed(id) {
  const list = meds().slice(), m = id ? list.find(x => x.id === id) : { who: medWho === 'all' ? 'Shaana' : medWho, name: '', dose: '', times: ['08:00'], withFood: false, pillsLeft: '', perDose: 1, pharmacy: '', pharmPhone: '', rx: '', notes: '', remind: true, active: true };
  openModal('<h2>' + (id ? 'Edit' : 'New') + ' medicine or vitamin</h2>' +
    '<div class="grid2"><label>For<select id="mdWho">' + PEOPLE.map(p => '<option' + (p === m.who ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label><label>Name<input id="mdName" value="' + esc(m.name) + '" placeholder="Vitamin D"></label></div>' +
    '<label>Dose<input id="mdDose" value="' + esc(m.dose || '') + '" placeholder="1 pill, 5 ml, 1000 IU…"></label>' +
    '<label>Times to take it</label><div id="mdTimes">' + (m.times || []).map(t => '<input type="time" class="mdt" value="' + esc(t) + '">').join('') + '</div><div class="row-actions tight"><button type="button" class="ghost small" id="mdAddT">＋ another time</button><button type="button" class="ghost small" id="mdNoT">As needed (no set time)</button></div>' +
    '<label class="check"><input type="checkbox" id="mdFood"' + (m.withFood ? ' checked' : '') + '> Take with food</label>' +
    '<label class="check"><input type="checkbox" id="mdRem"' + (m.remind !== false ? ' checked' : '') + '> 🔔 Remind me on my phone at these times</label>' +
    '<div class="grid2"><label>Pills / doses left<input id="mdLeft" type="number" min="0" inputmode="numeric" value="' + (m.pillsLeft != null ? m.pillsLeft : '') + '" placeholder="optional"></label><label>Per dose<input id="mdPer" type="number" min="1" inputmode="numeric" value="' + (m.perDose || 1) + '"></label></div>' +
    '<div class="grid2"><label>Pharmacy<input id="mdPh" value="' + esc(m.pharmacy || '') + '" placeholder="Walgreens"></label><label>Pharmacy phone<input id="mdPhN" type="tel" value="' + esc(m.pharmPhone || '') + '"></label></div>' +
    '<label>Rx number<input id="mdRx" value="' + esc(m.rx || '') + '"></label><label>Notes<input id="mdNotes" value="' + esc(m.notes || '') + '" placeholder="Prescribed by Dr. Lee, for allergies…"></label>' +
    (id ? '<label class="check"><input type="checkbox" id="mdStop"' + (m.active === false ? ' checked' : '') + '> Stopped taking it</label>' : '') +
    '<div class="row-actions"><button type="button" id="mdSave">Save</button><button type="button" class="ghost" id="mdX">Cancel</button>' + (id ? '<button type="button" class="danger" id="mdDel">Delete</button>' : '') + '</div>');
  $('mdAddT').onclick = () => $('mdTimes').insertAdjacentHTML('beforeend', '<input type="time" class="mdt" value="20:00">');
  $('mdNoT').onclick = () => { $('mdTimes').innerHTML = ''; };
  $('mdX').onclick = closeModal;
  $('mdSave').onclick = () => {
    const name = $('mdName').value.trim(); if (!name) { toast('Type the name.'); return; }
    Object.assign(m, { who: $('mdWho').value, name, dose: $('mdDose').value.trim(), times: [...document.querySelectorAll('#mdTimes .mdt')].map(i => i.value).filter(Boolean).sort(), withFood: $('mdFood').checked, remind: $('mdRem').checked,
      pillsLeft: $('mdLeft').value === '' ? '' : Math.max(0, +$('mdLeft').value), perDose: Math.max(1, +$('mdPer').value || 1), pharmacy: $('mdPh').value.trim(), pharmPhone: $('mdPhN').value.trim(), rx: $('mdRx').value.trim(), notes: $('mdNotes').value.trim(), active: !($('mdStop') && $('mdStop').checked) });
    if (!id) { m.id = 'med' + uid().slice(-6); m.start = today(); list.push(m); }
    setMeds(list); closeModal(); route(); toast('💊 Saved' + (m.remind !== false && m.times.length ? ' · phone alerts at ' + m.times.map(fmtTime).join(', ') : ''));
  };
  if (id) $('mdDel').onclick = () => { if (!confirm('Delete ' + m.name + '?')) return; setMeds(list.filter(x => x !== m)); closeModal(); route(); };
}

// ---------- 🚗 Car care ----------
// Cars, their service schedule and history live in settings.cars. Due items become tasks two weeks ahead.
const CAR_SERVICES = [['Oil change', 6, 5000], ['Tire rotation', 6, 7500], ['Air filter', 12, 15000], ['Cabin air filter', 12, 15000], ['Brake check', 12, 12000], ['Wiper blades', 12, 0], ['Battery check', 12, 0], ['Tags / registration', 12, 0], ['Insurance renewal', 6, 0]];
const cars = () => S().cars || [];
const setCars = l => { S().cars = l; window.save(); };
const addMonths = (d, n) => { const x = new Date(d + 'T12:00'); x.setMonth(x.getMonth() + n); return isoDay(x); };
function svcDue(car, s) {
  const nextDate = s.lastDate && s.everyMonths ? addMonths(s.lastDate, s.everyMonths) : s.nextDate || '';
  const nextMiles = s.lastMiles != null && s.lastMiles !== '' && s.everyMiles ? +s.lastMiles + +s.everyMiles : null;
  const t = today(), miles = +car.mileage || 0;
  const overdue = (nextDate && nextDate < t) || (nextMiles && miles >= nextMiles);
  const soon = !overdue && ((nextDate && nextDate <= addDays(t, 30)) || (nextMiles && miles >= nextMiles - 500));
  return { nextDate, nextMiles, overdue, soon, unknown: !nextDate && !nextMiles };
}
function carCheck() {
  const t = today(); let changed = false;
  cars().forEach(car => (car.services || []).forEach(s => {
    const d = svcDue(car, s); if (!(d.overdue || (d.nextDate && d.nextDate <= addDays(t, 14)) || (d.soon && d.nextMiles))) return;
    const id = 'car-' + car.id + '-' + s.id + '-' + (s.lastDate || s.nextDate || 'x');
    if (data.items.some(i => i.id === id)) return;
    data.items.push(newItem({ id, kind: 'task', title: '🚗 ' + s.type + ' due – ' + car.name, date: d.nextDate && d.nextDate > t ? d.nextDate : t, list: 'Home', notes: [d.nextDate ? 'Due ' + fmtDate(d.nextDate) : '', d.nextMiles ? 'at ' + d.nextMiles.toLocaleString() + ' miles' : ''].filter(Boolean).join(' · ') + '\nMore → Car care' }));
    changed = true;
  }));
  if (changed) window.save();
}
function carDueCard() {
  const due = []; cars().forEach(c => (c.services || []).forEach(s => { const d = svcDue(c, s); if (d.overdue || d.soon) due.push([c, s, d]); }));
  if (!due.length) return '';
  return '<a class="card pad tip" href="#car"><b>🚗 Car care</b><span class="sub">' + due.slice(0, 3).map(([c, s, d]) => s.type + ' (' + c.name + ')' + (d.overdue ? ' overdue' : ' soon')).join(' · ') + ' →</span></a>';
}
function viewCar() {
  const list = cars();
  $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>🚗 Car care</h1>' +
    '<div class="row-actions"><button type="button" id="carNew">＋ Add a car</button></div>' +
    (list.length ? list.map(car => {
      const svcs = (car.services || []).map(s => [s, svcDue(car, s)]).sort((a, b) => (b[1].overdue - a[1].overdue) || (b[1].soon - a[1].soon) || (a[1].nextDate || '9').localeCompare(b[1].nextDate || '9'));
      const spent = (car.history || []).filter(h => h.date >= today().slice(0, 4)).reduce((s, h) => s + (+h.cost || 0), 0);
      return '<div class="card pad carcard"><div class="mini-head"><h2>' + esc(car.name) + '</h2><button type="button" class="ghost small" data-cedit="' + car.id + '">Edit</button></div>' +
        '<p class="sub">' + [car.year, car.plate ? 'Plate ' + car.plate : ''].filter(Boolean).map(esc).join(' · ') + '</p>' +
        '<div class="carmiles"><label>Mileage<input type="number" inputmode="numeric" data-cmiles="' + car.id + '" value="' + (car.mileage || '') + '" placeholder="e.g. 84500"></label><small class="sub">' + (car.mileageDate ? 'updated ' + esc(fmtDate(car.mileageDate, 'rel')) : 'update it now and then') + '</small></div>' +
        svcs.map(([s, d]) => '<div class="svcrow' + (d.overdue ? ' over' : d.soon ? ' soon' : '') + '"><div><b>' + esc(s.type) + '</b><small>' + (d.unknown ? 'Tap ✓ Done to start tracking' : [d.nextDate ? 'next ' + fmtDate(d.nextDate) : '', d.nextMiles ? 'or ' + d.nextMiles.toLocaleString() + ' mi' : ''].filter(Boolean).join(' ') + (d.overdue ? ' · overdue' : d.soon ? ' · soon' : '')) + (s.lastDate ? ' · last ' + esc(fmtDate(s.lastDate)) : '') + '</small></div><button type="button" class="small" data-sdone="' + car.id + '|' + s.id + '">✓ Done</button></div>').join('') +
        '<p class="sub">' + ((car.history || []).length ? (car.history || []).length + ' service' + ((car.history || []).length === 1 ? '' : 's') + ' logged' + (spent ? ' · ' + money(spent) + ' this year' : '') : 'No services logged yet') + ' · <button type="button" class="linkish" data-chist="' + car.id + '">History</button></p></div>';
    }).join('') : '<div class="card pad"><p class="helper">Add your car (and Salvador’s). Then tap ✓ Done when you get the oil changed, tires rotated, tags renewed and so on. The planner reminds you two weeks before the next one is due, by date or by miles.</p></div>');
  $('carNew').onclick = () => editCar(null);
  $('view').querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => editCar(b.dataset.cedit));
  $('view').querySelectorAll('[data-cmiles]').forEach(i => i.onchange = () => { const l = cars(), c = l.find(x => x.id === i.dataset.cmiles); c.mileage = Math.max(0, +i.value || 0); c.mileageDate = today(); setCars(l); carCheck(); viewCar(); toast('Mileage saved'); });
  $('view').querySelectorAll('[data-sdone]').forEach(b => b.onclick = () => { const [cid, sid] = b.dataset.sdone.split('|'); logService(cid, sid); });
  $('view').querySelectorAll('[data-chist]').forEach(b => b.onclick = () => carHistory(b.dataset.chist));
}
function editCar(id) {
  const list = cars().slice(), car = id ? list.find(c => c.id === id) : { name: '', year: '', plate: '', mileage: '', services: [] };
  openModal('<h2>' + (id ? 'Edit car' : 'New car') + '</h2><label>Name<input id="crN" value="' + esc(car.name) + '" placeholder="Honda Pilot, Salvador’s truck…"></label>' +
    '<div class="grid2"><label>Year<input id="crY" value="' + esc(car.year || '') + '"></label><label>Plate<input id="crP" value="' + esc(car.plate || '') + '"></label></div>' +
    '<label>Mileage now<input id="crM" type="number" inputmode="numeric" value="' + (car.mileage || '') + '"></label>' +
    '<p class="lbl">What to track · every how many months / miles</p>' + CAR_SERVICES.map(([t, mo, mi], k) => { const s = (car.services || []).find(x => x.type === t); return '<div class="svcset"><label class="check"><input type="checkbox" data-sv="' + k + '"' + (s || !id ? ' checked' : '') + '> ' + t + '</label><input type="number" data-svm="' + k + '" value="' + (s ? s.everyMonths : mo) + '" title="months"><small>mo</small><input type="number" data-svmi="' + k + '" value="' + (s ? s.everyMiles || '' : mi || '') + '" placeholder="–" title="miles"><small>mi</small></div>'; }).join('') +
    '<div class="row-actions"><button type="button" id="crSave">Save</button><button type="button" class="ghost" id="crX">Cancel</button>' + (id ? '<button type="button" class="danger" id="crDel">Delete</button>' : '') + '</div>');
  $('crX').onclick = closeModal;
  $('crSave').onclick = () => {
    const name = $('crN').value.trim(); if (!name) { toast('Name the car.'); return; }
    const old = car.services || [];
    car.services = CAR_SERVICES.map(([t], k) => { if (!$('modalBody').querySelector('[data-sv="' + k + '"]').checked) return null; const s = old.find(x => x.type === t) || { id: 's' + k + uid().slice(-4), type: t }; s.everyMonths = +$('modalBody').querySelector('[data-svm="' + k + '"]').value || 0; s.everyMiles = +$('modalBody').querySelector('[data-svmi="' + k + '"]').value || 0; return s; }).filter(Boolean);
    Object.assign(car, { name, year: $('crY').value.trim(), plate: $('crP').value.trim() });
    if ($('crM').value && +$('crM').value !== +car.mileage) { car.mileage = +$('crM').value; car.mileageDate = today(); }
    if (!id) { car.id = 'car' + uid().slice(-5); car.history = []; list.push(car); }
    setCars(list); closeModal(); viewCar();
  };
  if (id) $('crDel').onclick = () => { if (!confirm('Delete ' + car.name + ' and its history?')) return; setCars(list.filter(c => c !== car)); closeModal(); viewCar(); };
}
function logService(cid, sid) {
  const list = cars(), car = list.find(c => c.id === cid), s = car.services.find(x => x.id === sid);
  openModal('<h2>✓ ' + esc(s.type) + ' – ' + esc(car.name) + '</h2><div class="grid2"><label>Date<input id="lsD" type="date" value="' + today() + '"></label><label>Mileage<input id="lsM" type="number" inputmode="numeric" value="' + (car.mileage || '') + '"></label></div>' +
    '<div class="grid2"><label>Cost $<input id="lsC" type="number" step="0.01" inputmode="decimal" placeholder="optional"></label><label>Where<input id="lsW" placeholder="Walmart Auto, dealer…"></label></div><label>Notes<input id="lsN"></label>' +
    '<label class="check"><input type="checkbox" id="lsMoney"> Also add the cost to my Money app (category Car)</label>' +
    '<div class="row-actions"><button type="button" id="lsGo">Save</button><button type="button" class="ghost" id="lsX">Cancel</button></div>');
  $('lsX').onclick = closeModal;
  $('lsGo').onclick = async () => {
    const date = $('lsD').value || today(), miles = $('lsM').value === '' ? '' : +$('lsM').value, cost = +$('lsC').value || 0, where = $('lsW').value.trim(), toMoney = $('lsMoney').checked;
    s.lastDate = date; s.lastMiles = miles;
    if (miles !== '' && miles >= (+car.mileage || 0)) { car.mileage = miles; car.mileageDate = date; }
    (car.history = car.history || []).unshift({ date, type: s.type, miles, cost, where, notes: $('lsN').value.trim() });
    data.items.forEach(i => { if (i.kind === 'task' && i.id.startsWith('car-' + car.id + '-' + s.id + '-') && !i.done) i.done = true; });
    setCars(list); closeModal(); viewCar();
    let m = '';
    if (cost && toMoney) m = (await addToMoney({ payee: where || s.type, amount: cost, category: 'Car', date, note: s.type + ' – ' + car.name + ' (from Planner)' })) ? ' · added to Money' : ' · couldn’t reach Money';
    toast('✓ ' + s.type + ' logged' + m);
  };
}
function carHistory(cid) {
  const car = cars().find(c => c.id === cid), h = car.history || [];
  openModal('<h2>' + esc(car.name) + ' history</h2>' + (h.length ? '<table class="mini htable"><thead><tr><th>Date</th><th>Service</th><th>Miles</th><th>Cost</th></tr></thead><tbody>' + h.map(x => '<tr><td>' + esc(fmtDate(x.date)) + '</td><td>' + esc(x.type) + (x.where ? ' <small>' + esc(x.where) + '</small>' : '') + '</td><td>' + (x.miles !== '' && x.miles != null ? (+x.miles).toLocaleString() : '') + '</td><td>' + (x.cost ? money(+x.cost) : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="helper">Nothing logged yet.</p>') + '<div class="row-actions"><button type="button" class="ghost" id="chX">Close</button></div>');
  $('chX').onclick = closeModal;
}

// ---------- 🧾 Money link: grocery trips and costs go into the Money app ----------
// Writes a transaction to the Money app's register (same account, same rounding: expenses round up past 5¢).
async function addToMoney({ payee, amount, category, date, note }) {
  const c = client(); if (!c || !signedIn()) { toast('Sign in (More) to send this to Money.'); return false; }
  try {
    const [{ data: accs }, { data: st }] = await Promise.all([c.from('money_accounts').select('id,sort').order('sort'), c.from('money_settings').select('data').maybeSingle()]);
    if (!accs || !accs.length) { toast('Open the Money app once first.'); return false; }
    const rounding = ((st && st.data && st.data.settings) || {}).rounding || 'up5';
    const a = Math.round(+amount * 100) / 100, whole = Math.floor(a + 1e-9), cents = Math.round((a - whole) * 100);
    const amt = rounding === 'none' ? a : cents > 5 ? whole + 1 : whole;
    const { data: me } = await c.auth.getUser();
    const { error } = await c.from('money_tx').insert({ id: uid(), owner: me.user.id, account_id: accs[0].id, date: date || today(), time: new Date().toTimeString().slice(0, 5), payee, amount: amt, type: 'expense', category, note: note || '', check_num: '', cleared: false, tax_cat: '', receipt: '', source: 'Planner', bank_amount: a, tags: '', updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) { toast('Money: ' + (e.message || e)); return false; }
}
// This month's grocery spending (from Money) against the Groceries budget, shown on the shopping list.
async function loadGroceryMonth() {
  const box = $('grocBox'), c = client(); if (!box || !c || !signedIn()) return;
  try {
    const m0 = today().slice(0, 8) + '01';
    const [{ data: tx }, { data: st }] = await Promise.all([c.from('money_tx').select('amount,type,category,date,payee').gte('date', m0).eq('category', 'Groceries'), c.from('money_settings').select('data').maybeSingle()]);
    const spent = (tx || []).filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0), bud = +((((st || {}).data || {}).settings || {}).budgets || {}).Groceries || 0;
    if (!$('grocBox')) return;
    box.innerHTML = '<b>🧾 Groceries in ' + new Date().toLocaleDateString([], { month: 'long' }) + ':</b> ' + money(spent) + (bud ? ' of ' + money(bud) + ' budget' + (spent > bud ? ' · <span class="over">' + money(spent - bud) + ' over</span>' : ' · ' + money(bud - spent) + ' left') + ' · ' + (tx || []).length + ' trip' + ((tx || []).length === 1 ? '' : 's') + '<div class="cprog"><i style="width:' + Math.min(100, Math.round(spent / bud * 100)) + '%' + (spent > bud ? ';background:#c0675c' : '') + '"></i></div>' : ' · ' + (tx || []).length + ' trip' + ((tx || []).length === 1 ? '' : 's') + ' <small class="sub">(set a Groceries budget in Money → Budgets)</small>');
  } catch (e) { box.textContent = ''; }
}
function logTrip(gotCount) {
  openModal('<h2>🧾 Log this shopping trip</h2><p class="helper">Puts the total in your Money app (rounded your way), so groceries count toward your budget.</p>' +
    '<div class="grid2"><label>Store<select id="ltS">' + ['Walmart', 'Sam’s Club', 'Kroger', 'Aldi', 'Harps', 'Other'].map(x => '<option>' + x + '</option>').join('') + '</select></label><label>Total $<input id="ltA" type="number" step="0.01" inputmode="decimal" placeholder="86.42"></label></div>' +
    '<div class="grid2"><label>Date<input id="ltD" type="date" value="' + today() + '"></label><label>Category<select id="ltC">' + ['Groceries', 'Shopping', 'Eating out', 'Kids & school', 'Other'].map(x => '<option>' + x + '</option>').join('') + '</select></label></div>' +
    (gotCount ? '<label class="check"><input type="checkbox" id="ltClr" checked> Clear the ' + gotCount + ' checked-off items from the list</label>' : '') +
    '<div class="row-actions"><button type="button" id="ltGo">Save to Money</button><button type="button" class="ghost" id="ltX">Cancel</button></div>');
  $('ltX').onclick = closeModal;
  $('ltGo').onclick = async () => {
    const amt = +$('ltA').value; if (!(amt > 0)) { toast('Type the total from the receipt.'); return; }
    $('ltGo').disabled = true; $('ltGo').textContent = 'Saving…';
    const store = $('ltS').value, clear = $('ltClr') && $('ltClr').checked;
    const ok = await addToMoney({ payee: store, amount: amt, category: $('ltC').value, date: $('ltD').value, note: 'Shopping trip (from Planner)' + (gotCount ? ' · ' + gotCount + ' items' : '') });
    if (!ok) { $('ltGo').disabled = false; $('ltGo').textContent = 'Save to Money'; return; }
    if (clear) { data.items = data.items.filter(i => !(i.kind === 'shop' && i.done)); window.save(); }
    closeModal(); viewShop(); toast('✓ ' + money(amt) + ' at ' + store + ' added to Money');
  };
}
// ---------- Cleaning: weekly and monthly chores, room by room ----------
// The rooms and chores live in settings.cleaning; each check-off is an item (kind 'clean', list = chore id, date = the day it was done).
const W = 'week', MO = 'month';
const BED = (name, extra) => ({ name, icon: '🛏️', chores: [['Change the sheets', W], ['Dust dresser and nightstands', W], ['Vacuum the floor', W], ['Put away clothes and tidy up', W], ['Empty the trash', W],
  ['Wash pillows and comforter', MO], ['Dust ceiling fan and blinds', MO], ['Clean under the bed', MO], ['Wipe baseboards and doors', MO], ['Clean mirrors and windows', MO]].concat(extra || []) });
const BATH = name => ({ name, icon: '🛁', chores: [['Clean the toilet', W], ['Clean sink and counter', W], ['Clean the mirror', W], ['Scrub shower and tub', W], ['Fresh towels and bath mat', W], ['Sweep and mop the floor', W], ['Empty the trash', W],
  ['Scrub the grout', MO], ['Wash shower curtain and liner', MO], ['Dust the exhaust fan', MO], ['Clean out the cabinet and drawers', MO], ['Clean the drains', MO]] });
const CLEAN_DEFAULT = [
  { name: 'Kitchen', icon: '🍳', chores: [['Wipe counters and backsplash', W], ['Clean the stovetop', W], ['Clean the microwave', W], ['Scrub the sink', W], ['Wipe appliance fronts and handles', W], ['Toss old food from the fridge', W], ['Sweep and mop the floor', W], ['Take out trash and recycling', W],
    ['Deep-clean the fridge shelves', MO], ['Clean the oven', MO], ['Wipe cabinet fronts', MO], ['Clean dishwasher filter', MO], ['Wash the trash can', MO], ['Clean out the pantry', MO]] },
  { name: 'Laundry room', icon: '🧺', chores: [['Wash towels', W], ['Wipe washer and dryer tops', W], ['Sweep the floor', W], ['Empty the lint and trash', W],
    ['Run a washer cleaning cycle and wipe the seal', MO], ['Clean the dryer vent', MO], ['Organize detergents and supplies', MO]] },
  { name: 'Living room', icon: '🛋️', chores: [['Dust surfaces and TV stand', W], ['Vacuum floors and rugs', W], ['Fluff pillows and fold blankets', W], ['Wipe remotes and light switches', W],
    ['Vacuum under couch cushions', MO], ['Dust ceiling fan, vents and blinds', MO], ['Wash throw blankets', MO], ['Clean windows and mirrors', MO], ['Wipe baseboards', MO]] },
  { name: 'Dining room', icon: '🍽️', chores: [['Wipe table and chairs', W], ['Sweep or vacuum the floor', W], ['Clear the clutter', W],
    ['Dust the light fixture', MO], ['Wipe baseboards', MO], ['Dust the hutch or buffet', MO]] },
  { name: 'Entry way', icon: '🚪', chores: [['Sweep or vacuum', W], ['Shake out the door mat', W], ['Put away shoes, coats and bags', W],
    ['Wipe the front door and handle', MO], ['Clean glass and mirror', MO], ['Dust the light fixture', MO]] },
  { name: 'Hallway', icon: '🚶', chores: [['Vacuum', W], ['Wipe light switches and door handles', W],
    ['Dust baseboards and picture frames', MO], ['Wipe scuffs off the walls', MO], ['Change the air filter', MO], ['Test smoke detectors', MO]] },
  BATH('My bathroom'), BATH('Kids’ bathroom'),
  BED('Our bedroom (me & Salvador)'), BED('Cece’s room'), BED('Eli’s room'),
  { name: 'Office', icon: '💻', chores: [['Dust desk and electronics', W], ['Vacuum the floor', W], ['Empty the trash', W], ['Tidy papers', W],
    ['Wipe keyboard, mouse and screens', MO], ['Dust shelves and blinds', MO], ['File or shred papers', MO], ['Wipe baseboards', MO]] }
];
const cslug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function cleanRooms() {
  if (!S().cleaning) S().cleaning = { rooms: CLEAN_DEFAULT.map(r => ({ id: cslug(r.name), name: r.name, icon: r.icon, chores: r.chores.map(([name, freq]) => ({ id: cslug(r.name) + '--' + cslug(name), name, freq, who: '' })) })) };
  return S().cleaning.rooms;
}
const periodStart = (freq, d) => freq === MO ? d.slice(0, 8) + '01' : weekStart(d);
const periodEnd = (freq, d) => freq === MO ? addDays(isoDay(new Date(+d.slice(0, 4), +d.slice(5, 7), 1)), -1) : addDays(weekStart(d), 6);
const cleanLogs = id => data.items.filter(i => i.kind === 'clean' && i.list === id).sort((a, b) => b.date.localeCompare(a.date));
const doneIn = (c, d) => data.items.find(i => i.kind === 'clean' && i.list === c.id && i.date >= periodStart(c.freq, d) && i.date <= periodEnd(c.freq, d));
let cleanFreq = W, cleanLeft = false, cleanEdit = false, cleanOpen = null;
function cleanStats(freq, d) {
  const all = cleanRooms().flatMap(r => r.chores.filter(c => c.freq === freq));
  return { total: all.length, done: all.filter(c => doneIn(c, d)).length };
}
function cleanCard() {
  const t = today(), w = cleanStats(W, t);
  if (!w.total) return '';
  return '<a class="card pad tip" href="#tasks/cleaning"><b>🧹 Cleaning this week</b><span class="sub">' + w.done + ' of ' + w.total + ' done →</span></a>';
}
function viewCleaning() {
  const t = today(), rooms = cleanRooms(), st = cleanStats(cleanFreq, t), pct = st.total ? Math.round(st.done / st.total * 100) : 0;
  if (!cleanOpen) cleanOpen = new Set();
  // The last 8 weeks (or 6 months) for the tracking chart.
  const hist = [];
  for (let k = cleanFreq === W ? 7 : 5; k >= 0; k--) {
    const d = cleanFreq === W ? addDays(weekStart(t), -7 * k) : isoDay(new Date(+t.slice(0, 4), +t.slice(5, 7) - 1 - k, 1));
    const s2 = cleanStats(cleanFreq, d); hist.push([d, s2.total ? Math.round(s2.done / s2.total * 100) : 0]);
  }
  let streak = 0; for (let k = hist.length - 2; k >= 0 && hist[k][1] >= 75; k--) streak++;
  const label = cleanFreq === W ? 'this week' : 'this month';
  const range = cleanFreq === W ? fmtDate(weekStart(t)) + ' – ' + fmtDate(addDays(weekStart(t), 6)) : new Date(t + 'T12:00').toLocaleDateString([], { month: 'long', year: 'numeric' });
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks">To-do</a><a href="#tasks/routines">Routines</a><a href="#tasks/templates">Templates</a><a href="#tasks/cleaning" class="on">🧹 Cleaning</a><a href="#tasks/atu">🎓 ATU</a></div>' +
    '<div class="segs"><button type="button" class="seg' + (cleanFreq === W ? ' on' : '') + '" data-cf="week">Weekly</button><button type="button" class="seg' + (cleanFreq === MO ? ' on' : '') + '" data-cf="month">Monthly</button></div>' +
    '<div class="card pad cleansum"><div class="cring" style="--p:' + pct + '"><b>' + pct + '%</b></div><div><h2>' + st.done + ' of ' + st.total + ' done ' + label + '</h2><p class="sub">' + esc(range) + (streak ? ' · 🔥 ' + streak + (cleanFreq === W ? ' week' : ' month') + (streak === 1 ? '' : 's') + ' in a row at 75%+' : '') + '</p>' +
      '<div class="chist">' + hist.map(([d, p], k) => '<div class="cbar' + (k === hist.length - 1 ? ' now' : '') + '" title="' + esc(fmtDate(d)) + ': ' + p + '%"><i style="height:' + Math.max(4, p) + '%"></i><small>' + (cleanFreq === W ? (+d.slice(5, 7)) + '/' + (+d.slice(8)) : new Date(d + 'T12:00').toLocaleDateString([], { month: 'short' })) + '</small></div>').join('') + '</div></div></div>' +
    '<div class="row-actions tight"><label class="check"><input type="checkbox" id="cLeft"' + (cleanLeft ? ' checked' : '') + '> Only show what’s left</label><button type="button" class="ghost small" id="cEdit">' + (cleanEdit ? '✓ Done editing' : '✎ Edit rooms & chores') + '</button></div>' +
    rooms.map(r => {
      const list = r.chores.filter(c => c.freq === cleanFreq), done = list.filter(c => doneIn(c, t)).length;
      const show = list.filter(c => !cleanLeft || !doneIn(c, t));
      if (!cleanEdit && !list.length) return '';
      if (!cleanEdit && cleanLeft && !show.length) return '';
      const open = cleanEdit || cleanOpen.has(r.id) || cleanLeft;
      return '<div class="card pad croom' + (list.length && done === list.length ? ' all' : '') + '"><button type="button" class="chead" data-croom="' + esc(r.id) + '"><span>' + esc(r.icon || '🧹') + ' <b>' + esc(r.name) + '</b></span><span class="cprog"><i style="width:' + (list.length ? Math.round(done / list.length * 100) : 0) + '%"></i></span><span class="sub">' + (list.length && done === list.length ? '✨ all done' : done + '/' + list.length) + ' ' + (open ? '▾' : '▸') + '</span></button>' +
        (open ? '<div class="cchores">' + (cleanEdit ? list : show).map(c => {
          const d = doneIn(c, t), last = cleanLogs(c.id)[0];
          const over = !d && last && last.date < periodStart(c.freq, addDays(periodStart(c.freq, t), -1)) ? ' over' : '';
          return '<div class="crow' + (d ? ' on' : '') + over + '">' + (cleanEdit ? '<button type="button" class="ghost small" data-cdel="' + esc(c.id) + '" aria-label="Delete">✕</button>' : '<button type="button" class="tick' + (d ? ' on' : '') + '" data-cdone="' + esc(c.id) + '">' + (d ? '✓' : '') + '</button>') +
            '<div class="cname"><span>' + esc(c.name) + (c.who ? ' <em class="cwho">' + esc(c.who) + '</em>' : '') + '</span><small>' + (d ? '✓ ' + fmtDate(d.date, 'rel') : last ? 'Last done ' + fmtDate(last.date, 'rel') : 'Not done yet') + (over ? ' · overdue' : '') + '</small></div>' +
            (cleanEdit ? '<button type="button" class="ghost small" data-cedit="' + esc(c.id) + '">Edit</button>' : '<button type="button" class="ghost small chist-btn" data-chist="' + esc(c.id) + '" aria-label="History">⋯</button>') + '</div>';
        }).join('') + (cleanEdit ? '<div class="row-actions tight"><button type="button" class="small" data-cadd="' + esc(r.id) + '">＋ Add a chore</button><button type="button" class="ghost small" data-cren="' + esc(r.id) + '">Rename room</button><button type="button" class="danger small" data-crdel="' + esc(r.id) + '">Delete room</button></div>' : '') + '</div>' : '') + '</div>';
    }).join('') +
    (cleanEdit ? '<div class="row-actions"><button type="button" id="cRoom">＋ Add a room</button><button type="button" class="ghost" id="cReset">Reset to the starter list</button></div>' : '') +
    '<p class="helper">Check things off as you go. Weekly chores reset every Sunday, monthly ones on the 1st. Tap ⋯ to see when a chore was done before.</p>';
  const v = $('view');
  v.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { cleanFreq = b.dataset.cf; viewCleaning(); });
  $('cLeft').onchange = e => { cleanLeft = e.target.checked; viewCleaning(); };
  $('cEdit').onclick = () => { cleanEdit = !cleanEdit; viewCleaning(); };
  v.querySelectorAll('[data-croom]').forEach(b => b.onclick = () => { const id = b.dataset.croom; cleanOpen.has(id) ? cleanOpen.delete(id) : cleanOpen.add(id); viewCleaning(); });
  const chore = id => { for (const r of rooms) { const c = r.chores.find(x => x.id === id); if (c) return [r, c]; } return []; };
  v.querySelectorAll('[data-cdone]').forEach(b => b.onclick = () => {
    const [r, c] = chore(b.dataset.cdone), d = doneIn(c, t);
    if (d) data.items = data.items.filter(i => i !== d);
    else { data.items.push(newItem({ kind: 'clean', list: c.id, date: t, title: c.name, location: r.id, done: true })); celebrate(b); }
    window.save(); const y = window.scrollY; viewCleaning(); window.scrollTo(0, y);
    const s3 = cleanStats(cleanFreq, t); if (!d && s3.done === s3.total) toast('🎉 Everything is clean ' + label + '!');
  });
  v.querySelectorAll('[data-chist]').forEach(b => b.onclick = () => cleanHistory(...chore(b.dataset.chist)));
  v.querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => editChore(...chore(b.dataset.cedit)));
  v.querySelectorAll('[data-cadd]').forEach(b => b.onclick = () => editChore(rooms.find(r => r.id === b.dataset.cadd), null));
  v.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { const [r, c] = chore(b.dataset.cdel); if (!confirm('Delete “' + c.name + '” from ' + r.name + '?')) return; r.chores = r.chores.filter(x => x !== c); window.save(); viewCleaning(); });
  v.querySelectorAll('[data-cren]').forEach(b => b.onclick = () => { const r = rooms.find(x => x.id === b.dataset.cren), n = (prompt('Room name:', r.name) || '').trim(); if (n) { r.name = n; window.save(); viewCleaning(); } });
  v.querySelectorAll('[data-crdel]').forEach(b => b.onclick = () => { const r = rooms.find(x => x.id === b.dataset.crdel); if (!confirm('Delete the room “' + r.name + '” and its chores?')) return; S().cleaning.rooms = rooms.filter(x => x !== r); window.save(); viewCleaning(); });
  if ($('cRoom')) $('cRoom').onclick = () => { const n = (prompt('New room name (like “Garage” or “Back porch”):') || '').trim(); if (!n) return; rooms.push({ id: cslug(n) + '-' + uid().slice(0, 4), name: n, icon: '🏠', chores: [] }); window.save(); viewCleaning(); };
  if ($('cReset')) $('cReset').onclick = () => { if (!confirm('Go back to the starter rooms and chores? Your check-off history stays.')) return; delete S().cleaning; cleanRooms(); window.save(); viewCleaning(); };
}
function editChore(r, c) {
  const it = c || { name: '', freq: cleanFreq, who: '' };
  openModal('<h2>' + (c ? 'Edit chore' : 'New chore in ' + esc(r.name)) + '</h2><label>Chore<input id="chN" value="' + esc(it.name) + '" placeholder="Clean the ceiling fan"></label>' +
    '<label>How often<select id="chF"><option value="week"' + (it.freq === W ? ' selected' : '') + '>Every week</option><option value="month"' + (it.freq === MO ? ' selected' : '') + '>Every month</option></select></label>' +
    '<label>Whose job (optional)<input id="chW" list="chWho" value="' + esc(it.who || '') + '" placeholder="Me, Cece, Eli, Salvador"></label><datalist id="chWho"><option value="Me"><option value="Cece"><option value="Eli"><option value="Salvador"></datalist>' +
    '<div class="row-actions"><button type="button" id="chS">Save</button><button type="button" class="ghost" id="chC">Cancel</button></div>');
  $('chC').onclick = closeModal;
  $('chS').onclick = () => {
    const name = $('chN').value.trim(); if (!name) { toast('Type the chore.'); return; }
    if (c) Object.assign(c, { name, freq: $('chF').value, who: $('chW').value.trim() });
    else r.chores.push({ id: r.id + '--' + cslug(name) + '-' + uid().slice(0, 4), name, freq: $('chF').value, who: $('chW').value.trim() });
    window.save(); closeModal(); viewCleaning();
  };
  setTimeout(() => $('chN').focus(), 60);
}
function cleanHistory(r, c) {
  const logs = cleanLogs(c.id);
  openModal('<h2>' + esc(c.name) + '</h2><p class="helper">' + esc(r.name) + ' · ' + (c.freq === W ? 'every week' : 'every month') + '</p>' +
    (logs.length ? '<div class="clog">' + logs.slice(0, 30).map(l => '<div class="mini-row"><span>✓ ' + esc(fmtDate(l.date)) + '</span><button type="button" class="ghost small" data-clx="' + l.id + '">Remove</button></div>').join('') + '</div>' : '<p class="helper">Not checked off yet.</p>') +
    '<label>Did it another day?<input type="date" id="clDay" max="' + today() + '"></label>' +
    '<div class="row-actions"><button type="button" class="ghost" id="clClose">Close</button></div>');
  $('clClose').onclick = closeModal;
  $('clDay').onchange = e => { if (!e.target.value) return; data.items.push(newItem({ kind: 'clean', list: c.id, date: e.target.value, title: c.name, location: r.id, done: true })); window.save(); cleanHistory(r, c); viewCleaning(); };
  $('modalBody').querySelectorAll('[data-clx]').forEach(b => b.onclick = () => { data.items = data.items.filter(i => i.id !== b.dataset.clx); window.save(); cleanHistory(r, c); viewCleaning(); });
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
const PANTRY_FIRST = /goldfish|crackers?|peanut butter|cream of|\bcans?\b|canned|jar|packets?|box(ed)?|seasoning|sauce|\bmix\b|diced|crushed|dried|broth/i;
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
// A saved product link can be from any store (Walmart, Sam's Club, Target…); without one, search Walmart.
const STORES = [[/walmart\.com/i, 'Walmart'], [/samsclub\.com/i, 'Sam’s Club'], [/target\.com/i, 'Target'], [/amazon\./i, 'Amazon'], [/kroger\.com/i, 'Kroger'], [/costco\.com/i, 'Costco'], [/aldi\.us/i, 'Aldi'], [/harps/i, 'Harps']];
const storeOf = url => { if (!url) return 'Walmart'; const s = STORES.find(([re]) => re.test(url)); if (s) return s[1]; try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Store'; } };
const walmartUrl = item => item.location && /^https:\/\//i.test(item.location) ? item.location : 'https://www.walmart.com/search?q=' + encodeURIComponent(item.title);

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
  if (sub === 'freezer' || sub === 'pantry') { if (sub === 'pantry') fzOn = 'pantry'; return viewFreezer(); }
  if (!mealWeek) mealWeek = weekStart(today());
  const days = [0, 1, 2, 3, 4, 5, 6].map(k => addDays(mealWeek, k));
  const planned = data.items.filter(i => i.kind === 'meal' && i.date >= days[0] && i.date <= days[6]).length;
  $('view').innerHTML = mealTabs('plan') +
    '<div class="cal-head"><button type="button" class="ghost small" id="mPrev">‹</button><h2>' + esc(weekTitle(mealWeek)) + '</h2><button type="button" class="ghost small" id="mNext">›</button></div>' +
    '<div class="row-actions center"><button type="button" id="mShop">Add ingredients to shopping list</button><button type="button" class="ghost small" id="mCopy">Copy last week</button><button type="button" class="ghost small" id="mWeek">✨ Plan my week</button></div>' +
    '<p class="helper center">' + planned + ' meals planned · tap any slot to fill it</p>' + ideasCard(days) +
    days.map(d => {
      const dt = new Date(d + 'T12:00'), ms = mealsOn(d);
      return '<div class="card pad mealday' + (d === today() ? ' today' : '') + '"><div class="mini-head"><h2>' + dt.toLocaleDateString([], { weekday: 'long' }) + ' <small>' + dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</small></h2></div>' +
        '<div class="mslots">' + SLOTS.map(s => { const m = ms.find(x => x.list === s); return '<button type="button" class="mslot' + (m ? ' set' : '') + (s === 'Dinner' ? ' main' : '') + '" data-meal="' + s + '" data-mealdate="' + d + '"><span>' + s + '</span><b>' + esc(m ? m.title : '+') + '</b></button>'; }).join('') + '</div></div>';
    }).join('');
  $('mPrev').onclick = () => { mealWeek = addDays(mealWeek, -7); viewMeals(); };
  $('mNext').onclick = () => { mealWeek = addDays(mealWeek, 7); viewMeals(); };
  $('view').querySelectorAll('[data-meal]').forEach(b => b.onclick = () => editMeal(b.dataset.mealdate, b.dataset.meal));
  wireIdeas($('view'), mealIdeas('Dinner').slice(0, 12), days, () => { const y = window.scrollY; viewMeals(); window.scrollTo(0, y); });
  $('mShop').onclick = () => { const n = addWeekToShopping(days), sk = addWeekToShopping.skipped; toast((n ? '✓ Added ' + n + ' items to your shopping list' : 'Nothing new to add (or the meals have no recipes yet).') + (sk ? ' · skipped ' + sk + ' you already have' : '')); if (n) location.hash = 'meals/shop'; };
  $('mWeek').onclick = () => planWeek(days);
  $('mCopy').onclick = () => {
    const prev = data.items.filter(i => i.kind === 'meal' && i.date >= addDays(mealWeek, -7) && i.date < mealWeek);
    if (!prev.length) { toast('Nothing planned last week to copy.'); return; }
    let n = 0;
    prev.forEach(m => { const d = addDays(m.date, 7); if (!data.items.some(i => i.kind === 'meal' && i.date === d && i.list === m.list)) { data.items.push(newItem({ kind: 'meal', date: d, list: m.list, title: m.title, location: m.location, notes: m.notes })); n++; } });
    window.save(); toast('✓ Copied ' + n + ' meals'); viewMeals();
  };
}
const mealTabs = on => '<h1>Meals</h1><div class="toptabs"><a href="#meals"' + (on === 'plan' ? ' class="on"' : '') + '>Meal plan</a><a href="#meals/freezer"' + (on === 'freezer' ? ' class="on"' : '') + '>🥫 On hand</a><a href="#meals/shop"' + (on === 'shop' ? ' class="on"' : '') + '>Shopping list' + (shopCount() ? ' <small>' + shopCount() + '</small>' : '') + '</a><a href="#meals/recipes"' + (on === 'recipes' ? ' class="on"' : '') + '>Recipes</a></div>';
const shopCount = () => data.items.filter(i => i.kind === 'shop' && !i.done).length;
function editMeal(date, slot) {
  const cur = data.items.find(i => i.kind === 'meal' && i.date === date && i.list === slot);
  const rs = recipes(), fit = rs.filter(r => !r.list || r.list === slot), other = rs.filter(r => r.list && r.list !== slot);
  const ideas = mealIdeas(slot).slice(0, 6);
  openModal('<h2>' + esc(slot) + ' · ' + esc(fmtDate(date)) + '</h2>' +
    (ideas.length ? '<p class="lbl">🍳 From what you have</p><div class="catchips">' + ideas.map((m, n) => '<button type="button" class="chipbtn idea-chip' + (m.soon ? ' soon' : '') + '" data-idea="' + n + '">' + (m.soon ? '⏰ ' : '') + esc(m.title) + '<small>' + (m.need.length ? ' · need ' + m.need.length : ' · have it all') + '</small></button>').join('') + '</div>' : '') +
    (rs.length ? '<p class="lbl">From your recipes</p><div class="catchips">' + fit.concat(other).map(r => '<button type="button" class="chipbtn' + (cur && cur.location === r.id ? ' on' : '') + '" data-rec="' + r.id + '">' + esc(r.title) + '</button>').join('') + '</div>' : '<p class="helper">Tip: add recipes (Meals → Recipes) and their ingredients go on the shopping list for you.</p>') +
    '<p class="lbl">Quick picks</p><div class="catchips">' + ['Leftovers', 'Eat out', 'Takeout', 'Sandwiches', 'Cereal', 'School lunch'].map(x => '<button type="button" class="chipbtn" data-quick="' + x + '">' + x + '</button>').join('') + '</div>' +
    '<label>Or type it<input id="mlTitle" value="' + esc(cur ? cur.title : '') + '" placeholder="Pot roast"></label>' +
    '<label>Notes<input id="mlNotes" value="' + esc(cur ? cur.notes : '') + '" placeholder="Thaw meat the night before"></label>' +
    '<div class="row-actions"><button type="button" id="mlSave">Save</button><button type="button" class="ghost" id="mlCancel">Cancel</button>' + (cur ? '<button type="button" class="danger" id="mlDel">Clear</button>' : '') + '</div>' +
    (cur ? '<div class="row-actions"><button type="button" class="' + (cur.done ? 'ghost' : '') + '" id="mlCooked">' + (cur.done ? '✓ Cooked' : '✓ We cooked it') + '</button></div><p class="helper">“We cooked it” takes what you used out of 🥫 On hand.</p>' : ''));
  const put = (title, recipeId) => {
    if (!title) { toast('Pick or type a meal.'); return; }
    const m = cur || newItem({ kind: 'meal', date, list: slot });
    Object.assign(m, { title, location: recipeId || '', notes: $('mlNotes').value.trim() });
    if (!cur) data.items.push(m);
    window.save(); closeModal(); route();
  };
  document.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => { const r = rs.find(x => x.id === b.dataset.rec); put(r.title, r.id); });
  document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => put(b.dataset.quick, ''));
  document.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => {
    const m = ideas[+b.dataset.idea], r = ideaRecipe(m), frozen = m.have.filter(h => needsThaw(h.item));
    if (frozen.length && !$('mlNotes').value.trim()) $('mlNotes').value = 'Thaw ' + frozen.map(h => h.item.title.toLowerCase() + ' (' + fzName(h.item.list).name.toLowerCase() + ')').join(', ') + ' the night before';
    put(m.title, r.id);
  });
  $('mlSave').onclick = () => { const t = $('mlTitle').value.trim(), r = rs.find(x => x.title.toLowerCase() === t.toLowerCase()); put(t, r ? r.id : ''); };
  $('mlCancel').onclick = closeModal;
  if (cur) $('mlCooked').onclick = () => { if (cur.done) { cur.done = false; window.save(); closeModal(); route(); toast('Unmarked'); return; } cookedIt(cur); };
  if (cur) $('mlDel').onclick = () => { data.items = data.items.filter(i => i !== cur); window.save(); closeModal(); route(); };
}
// ---------- Meal ideas from what's on hand ----------
// Your recipes, the starter recipes and these everyday meals are matched against the pantry and freezers.
const MEAL_IDEAS = [
  ['Burgers & fries', 'Dinner', '2 lb ground beef\nHamburger buns\nSliced cheese\nLettuce\nTomato\nFrench fries'],
  ['Sloppy joes', 'Dinner', '1 lb ground beef\n1 can sloppy joe sauce\nHamburger buns\nChips'],
  ['Hamburger Helper', 'Dinner', '1 lb ground beef\n1 box Hamburger Helper\nMilk'],
  ['Chicken alfredo', 'Dinner', '2 chicken breasts\n1 lb fettuccine\n1 jar alfredo sauce\n1 bag broccoli'],
  ['Chicken fajitas', 'Dinner', '2 lb chicken breasts\nTortillas\n2 bell peppers\n1 onion\n1 packet fajita seasoning\nShredded cheese'],
  ['BBQ chicken, corn & potatoes', 'Dinner', '2 lb chicken thighs\nBBQ sauce\nCorn\nPotatoes'],
  ['Chicken stir fry', 'Dinner', '2 chicken breasts\n1 bag stir fry vegetables\n2 cups rice\nSoy sauce'],
  ['Pork chops, potatoes & green beans', 'Dinner', '4 pork chops\nPotatoes\nGreen beans'],
  ['Crockpot pot roast', 'Dinner', '1 roast\n2 lb potatoes\n1 bag carrots\n1 onion\n1 packet onion soup mix'],
  ['Sausage, peppers & rice', 'Dinner', '1 pack sausage\n2 bell peppers\n1 onion\n2 cups rice'],
  ['Breakfast for dinner', 'Dinner', '1 lb bacon\n1 dozen eggs\n1 box pancake mix\nSyrup'],
  ['Brisket & mac and cheese', 'Dinner', '1 brisket\nBBQ sauce\nMac & cheese\nHamburger buns'],
  ['Fish tacos', 'Dinner', '1 lb fish\nTortillas\nCabbage slaw\nLimes'],
  ['Shrimp scampi', 'Dinner', '1 lb shrimp\n1 lb spaghetti\nButter\nGarlic'],
  ['Pizza night', 'Dinner', 'Frozen pizza\nBagged salad'],
  ['Nuggets & fries', 'Dinner', 'Chicken nuggets\nFrench fries'],
  ['Steak night', 'Dinner', '2 steaks\nPotatoes\n1 bag broccoli'],
  ['Roast turkey dinner', 'Dinner', '1 whole turkey\n1 box stuffing\nPotatoes\nGreen beans'],
  ['Chili mac', 'Dinner', '1 lb ground beef\n1 lb macaroni\n1 can chili beans\n1 can diced tomatoes\nShredded cheese'],
  ['Waffles & fruit', 'Breakfast', 'Waffles\nSyrup\nBerries'],
  // Built around what's in Shaana's pantry and freezers.
  ['Roast chicken & veggies', 'Dinner', '1 whole chicken\nPotatoes\nCarrots\nOnion\nButter'],
  ['Homemade chicken & dumplings', 'Dinner', '1 whole chicken\nBisquick\nCream of chicken soup\nCarrots\nCelery'],
  ['Ham & pinto beans with cornbread', 'Dinner', 'Ham\n5 lb pinto beans\nOnion\nCornbread muffins'],
  ['Salmon patties & mac and cheese', 'Dinner', '2 cans salmon\nItalian bread crumbs\n2 eggs\nMac & cheese\nGreen beans'],
  ['Tuna noodle casserole', 'Dinner', '3 cans tuna\nPenne noodles\nCream of mushroom soup\nPeas\nShredded cheese'],
  ['Chicken chili with kidney beans', 'Dinner', 'Shredded chicken\n2 cans kidney beans\nRotel\nCrushed tomatoes\nCorn\nChili seasoning'],
  ['Chicken penne alfredo', 'Dinner', 'Diced chicken breast\nPenne noodles\nAlfredo sauce\nPeas'],
  ['Stuffed manicotti', 'Dinner', 'Manicotti noodles\nRicotta cheese\nMozzarella cheese\nCrushed tomatoes\nTomato sauce'],
  ['BBQ ribs, corn & fries', 'Dinner', 'Ribs\nBBQ sauce\nCorn\nFrench fries'],
  ['Sausage, pancakes & eggs', 'Breakfast', 'Jimmy Dean sausage\nPancake mix\nSyrup\nEggs'],
  ['Homemade tortillas & chicken tacos', 'Dinner', 'Maseca\nShredded chicken\nRefried beans\nShredded cheese\nSalsa'],
  ['Stuffed chicken breasts & potatoes', 'Dinner', 'Broccoli & cheese stuffed chicken breasts\nInstant potatoes\nGreen beans'],
  ['Fish, tater tots & lemon', 'Dinner', 'Whole fish\nTater tots\nLemons'],
  ['Hot dogs & burgers night', 'Dinner', 'Hot dogs & hamburgers\nHamburger buns\nCurly fries'],
  ['Chicken strips & fries', 'Dinner', 'Chicken strips\nFrench fries\nRanch'],
  ['Rotel chicken spaghetti', 'Dinner', 'Spaghetti noodles\nDiced chicken breast\nRotel\nCream of chicken soup\nShredded cheese'],
  ['Chicken & rice casserole', 'Dinner', '1 bag chicken\nRice\nCream of chicken soup\nCream of mushroom soup\nPeas'],
  ['Individual pizzas & salad', 'Dinner', 'Individual pizzas\nBagged salad'],
  ['Ravioli & garlic bread', 'Dinner', 'Cheese ravioli\nTomato sauce\nBread']
];
const ALWAYS_HAVE = /^(salt|pepper|salt (&|and) pepper|black pepper|oil|olive oil|vegetable oil|cooking spray|water|ice)$/i;
const ING_SKIP = /\b(frozen|canned|can|cans|of|fresh|shredded|sliced|diced|chopped|large|small|medium|whole|boneless|skinless|lean|family|size|bag|bags|box|jar|packet|pack|package|bunch|baby|jumbo|regular|lb|lbs|oz)\b/g;
function ingTokens(s) {
  return ingredientName(s).toLowerCase().replace(/&/g, ' and ').replace(/\bveggies\b|\bveg\b/g, 'vegetables').replace(/\b(french )?fries\b/g, 'french fries').replace(/[^a-z\s]/g, ' ').replace(ING_SKIP, ' ')
    .split(/\s+/).filter(w => w.length > 2 && w !== 'and').map(w => w.length > 3 ? w.replace(/ies$/, 'y').replace(/(ch|sh|x|ss)es$/, '$1').replace(/oes$/, 'o').replace(/s$/, '') : w);
}
// Does this ingredient match something on hand? All the words of the shorter name have to be in the longer one.
function onHandFor(line, stock) {
  const a = ingTokens(line); if (!a.length) return null;
  let best = null, gap = 99;
  stock.forEach(i => {
    const b = ingTokens(i.title); if (!b.length) return;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (!s.every(w => l.includes(w)) || (s.length === 1 && l.length > (GENERIC_ING.test(s[0]) ? 1 : 2))) return;
    const g = l.length - s.length; if (g < gap) { gap = g; best = i; }
  });
  return best;
}
// One plain word like “cheese” only matches something named just that (not “Mac & cheese”).
const GENERIC_ING = /^(cheese|sauce|soup|bean|mix|oil|cream|seasoning|syrup|juice|milk|noodle|pasta|bread|meat|fruit|vegetable)$/;
const isFrozenPlace = l => l !== 'pantry' && l !== 'fridge';
// Meat and frozen meals need a night in the fridge to thaw; fries, veggies and bread don't.
const needsThaw = it => isFrozenPlace(it.list) && ['Beef', 'Ground meat', 'Chicken & turkey', 'Pork', 'Fish & seafood', 'Meals & leftovers'].includes(it.location);
const onHand = () => fzItems().filter(i => !i.done && (i.priority || 0) > 0);
const MAIN_KINDS = ['Beef', 'Ground meat', 'Chicken & turkey', 'Pork', 'Fish & seafood', 'Meals & leftovers'];
// Every meal we know, best first: things that use what you have (especially what needs using soon), then fewest to buy.
function mealIdeas(slot) {
  const stock = onHand(); if (!stock.length) return [];
  const saved = recipes(), seen = new Set(saved.map(r => r.title.toLowerCase()));
  const pool = saved.map(r => ({ title: r.title, slot: r.list || 'Dinner', notes: r.notes || '', recipe: r }))
    .concat(STARTER_RECIPES.concat(MEAL_IDEAS).filter(([t]) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).map(([title, sl, notes]) => ({ title, slot: sl, notes })));
  return pool.filter(m => !slot || m.slot === slot || (slot === 'Dinner' && m.slot === 'Lunch')).map(m => {
    const lines = m.notes.split('\n').map(x => x.trim()).filter(Boolean).filter(l => !ALWAYS_HAVE.test(ingredientName(l)));
    const have = [], need = [];
    lines.forEach(l => { const it = onHandFor(l, stock); if (it) have.push({ line: l, item: it }); else { const n = ingredientName(l).replace(/^(box|bag|jar|can|pack|packet|bottle)\s+(of\s+)?/i, ''); need.push(n.charAt(0).toUpperCase() + n.slice(1)); } });
    const main = have.some(h => MAIN_KINDS.includes(h.item.location));
    const soon = have.filter(h => fzOld(h.item)).length;
    return Object.assign(m, { have, need, soon, score: have.length * 10 + (main ? 15 : 0) + soon * 20 - need.length * 3 + (need.length ? 0 : 15) + (m.recipe ? 3 : 0) });
  }).filter(m => m.have.length && (m.have.some(h => MAIN_KINDS.includes(h.item.location)) || m.have.length >= 2)).sort((a, b) => b.score - a.score);
}
// Make sure an idea is a saved recipe (so its ingredients can go on the shopping list), and return it.
function ideaRecipe(m) {
  if (m.recipe) return m.recipe;
  const have = recipes().find(r => r.title.toLowerCase() === m.title.toLowerCase()); if (have) return have;
  const r = newItem({ kind: 'recipe', title: m.title, list: m.slot, notes: m.notes }); data.items.push(r); return r;
}
const ideaHtml = (m, n) => '<div class="idea' + (m.soon ? ' soon' : '') + '"><div class="ideat"><b>' + (m.recipe ? '⭐ ' : '') + esc(m.title) + '</b>' + (m.soon ? '<span class="chip">⏰ uses ' + esc(m.have.find(h => fzOld(h.item)).item.title.toLowerCase()) + '</span>' : '') + '</div>' +
  '<p class="ihave">✓ ' + m.have.map(h => esc(h.item.title) + (needsThaw(h.item) ? ' <small>(' + esc(fzName(h.item.list).name.replace(/ freezer$/i, '').toLowerCase()) + ')</small>' : '')).join(', ') + '</p>' +
  (m.need.length ? '<p class="ineed">Need: ' + m.need.slice(0, 5).map(esc).join(', ') + (m.need.length > 5 ? ' +' + (m.need.length - 5) : '') + '</p>' : '<p class="ineed ok">You have everything!</p>') +
  '<div class="row-actions tight"><button type="button" class="small" data-iplan="' + n + '">＋ Plan it</button>' + (m.need.length ? '<button type="button" class="ghost small" data-ineed="' + n + '">🛒 Add what I need</button>' : '') + '</div></div>';
function ideasCard(days) {
  const all = mealIdeas('Dinner'), more = !!viewMeals.moreIdeas, list = all.slice(0, more ? 12 : 4);
  if (!onHand().length) return '<a class="card pad tip" href="#meals/freezer"><b>🍳 Meal ideas from what you have</b><span class="sub">Add your pantry and freezers in 🥫 On hand, and ideas show up here →</span></a>';
  return '<div class="card pad ideas"><div class="mini-head"><h2>🍳 What can I make?</h2><a class="linkish" href="#meals/freezer">On hand</a></div>' +
    (list.length ? '<p class="helper">From what’s in your pantry and freezers. Things that need using soon come first.</p>' + list.map(ideaHtml).join('') +
      (all.length > 4 ? '<button type="button" class="linkish" id="ideaMore">' + (more ? 'Show fewer' : 'Show ' + (Math.min(12, all.length) - 4) + ' more ideas') + '</button>' : '')
      : '<p class="helper">No matches yet. Add a few recipes, or more to 🥫 On hand.</p>') + '</div>';
}
function wireIdeas(root, ideas, days, redraw) {
  root.querySelectorAll('[data-iplan]').forEach(b => b.onclick = () => planIdea(ideas[+b.dataset.iplan], days, redraw));
  root.querySelectorAll('[data-ineed]').forEach(b => b.onclick = () => {
    const m = ideas[+b.dataset.ineed]; let n = 0;
    m.notes.split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const name = ingredientName(line); if (ALWAYS_HAVE.test(name) || onHandFor(line, onHand())) return;
      if (data.items.some(i => i.kind === 'shop' && !i.done && i.title.toLowerCase() === name.toLowerCase())) return;
      data.items.push(newItem({ kind: 'shop', title: name, list: aisleOf(line), notes: (amountOf(line) ? amountOf(line) + ' · ' : '') + m.title, location: (S().walmart || {})[name.toLowerCase()] || '' })); n++;
    });
    window.save(); toast(n ? '🛒 Added ' + n + ' things for ' + m.title : 'Those are already on your shopping list');
  });
  if ($('ideaMore')) $('ideaMore').onclick = () => { viewMeals.moreIdeas = !viewMeals.moreIdeas; redraw(); };
}
// Pick the day for an idea; it's planned with a thaw reminder if something comes out of a freezer.
function planIdea(m, days, redraw) {
  const t = today(), slot = m.slot === 'Lunch' || m.slot === 'Breakfast' || m.slot === 'Snack' ? m.slot : 'Dinner';
  const choices = (days || []).concat([0, 1, 2, 3, 4, 5, 6].map(k => addDays(t, k))).filter((d, k, a) => d >= t && a.indexOf(d) === k).sort().slice(0, 10);
  const frozen = m.have.filter(h => needsThaw(h.item));
  // Something frozen needs a night to thaw, so start looking tomorrow.
  const firstFree = choices.find(d => (!frozen.length || d > t) && !mealsOn(d).some(x => x.list === slot)) || choices[0];
  openModal('<h2>Plan ' + esc(m.title) + '</h2>' +
    '<div class="daypick">' + choices.map(d => { const taken = mealsOn(d).find(x => x.list === slot); return '<button type="button" class="chipbtn' + (d === firstFree ? ' on' : '') + '" data-pday="' + d + '">' + esc(fmtDate(d, 'rel')) + (taken ? '<small> · ' + esc(taken.title) + '</small>' : '') + '</button>'; }).join('') + '</div>' +
    '<label>Meal<select id="piSlot">' + SLOTS.map(s => '<option' + (s === slot ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>' +
    (frozen.length ? '<label class="check"><input type="checkbox" id="piThaw" checked> Remind me to take out ' + esc(frozen.map(h => h.item.title.toLowerCase()).join(' and ')) + ' the night before</label>' : '') +
    '<div class="row-actions"><button type="button" id="piGo">Plan it</button><button type="button" class="ghost" id="piX">Cancel</button></div>');
  let day = firstFree;
  $('modalBody').querySelectorAll('[data-pday]').forEach(b => b.onclick = () => { day = b.dataset.pday; $('modalBody').querySelectorAll('[data-pday]').forEach(x => x.classList.toggle('on', x === b)); });
  $('piX').onclick = closeModal;
  $('piGo').onclick = () => {
    const sl = $('piSlot').value, cur = data.items.find(i => i.kind === 'meal' && i.date === day && i.list === sl);
    if (cur && !confirm('Replace ' + cur.title + ' on ' + fmtDate(day, 'rel') + '?')) return;
    const thaw = planMeal(m, day, sl, frozen.length && $('piThaw') && $('piThaw').checked);
    window.save(); closeModal(); (redraw || route)();
    toast('✓ ' + m.title + ' planned for ' + fmtDate(day, 'rel') + (thaw ? ' · thaw reminder set' : ''));
  };
}
// Put a meal idea on a day: saved as a recipe, with a thaw note and (optionally) a reminder the night before at 6 PM.
function planMeal(m, day, slot, thaw) {
  const t = today(), r = ideaRecipe(m), frozen = m.have.filter(h => needsThaw(h.item));
  const note = frozen.length ? 'Thaw ' + frozen.map(h => h.item.title.toLowerCase() + ' (' + fzName(h.item.list).name.toLowerCase() + ')').join(', ') + ' the night before' : '';
  const cur = data.items.find(i => i.kind === 'meal' && i.date === day && i.list === slot);
  if (cur) Object.assign(cur, { title: m.title, location: r.id, notes: note, done: false }); else data.items.push(newItem({ kind: 'meal', date: day, list: slot, title: m.title, location: r.id, notes: note }));
  if (thaw && frozen.length) data.items.push(newItem({ kind: 'task', title: '🧊 Take out ' + frozen.map(h => h.item.title.toLowerCase()).join(' & ') + ' for ' + m.title, date: addDays(day, -1) < t ? t : addDays(day, -1), list: 'Home', remind: -1080, notes: note }));
  return !!(thaw && frozen.length);
}
// ✨ Plan my week: fill the empty dinners from what's on hand, oldest first, without using more than you have or repeating a meal.
function planWeek(days) {
  const t = today();
  // Late in the week? Plan the next 7 days instead.
  if (days.filter(d => d >= t).length < 4) days = [0, 1, 2, 3, 4, 5, 6].map(k => addDays(t, k));
  const open = days.filter(d => d >= t && !mealsOn(d).some(x => x.list === 'Dinner'));
  if (!open.length) { toast('Every dinner this week is already planned.'); return; }
  const ideas = mealIdeas('Dinner'), useCount = {}, picks = [], usedTitles = new Set(mealsOn ? days.flatMap(d => mealsOn(d).map(x => x.title.toLowerCase())) : []);
  const fits = m => !usedTitles.has(m.title.toLowerCase()) && m.have.every(h => (useCount[h.item.id] || 0) < (h.item.priority || 1));
  open.forEach(d => {
    // Frozen things need a night to thaw, so today only gets pantry/fridge meals.
    const m = ideas.find(x => fits(x) && (d > t || !x.have.some(h => needsThaw(h.item))));
    if (!m) return;
    usedTitles.add(m.title.toLowerCase()); m.have.forEach(h => { useCount[h.item.id] = (useCount[h.item.id] || 0) + 1; });
    picks.push({ d, m });
  });
  if (!picks.length) { toast('Not enough on hand to plan more dinners. Add to 🥫 On hand or recipes.'); return; }
  openModal('<h2>✨ Plan my week</h2><p class="helper">Dinners from what you have, using the oldest things first. Change any of them, or uncheck one to leave that night open.</p>' +
    '<div class="wkplan">' + picks.map((p, k) => '<div class="wkrow2"><label class="check"><input type="checkbox" data-pwon="' + k + '" checked></label><div><b>' + esc(fmtDate(p.d, 'rel')) + '</b><select data-pwsel="' + k + '">' +
      ideas.filter(x => p.d > t || !x.have.some(h => needsThaw(h.item))).slice(0, 15).map((x, n) => '<option value="' + ideas.indexOf(x) + '"' + (x === p.m ? ' selected' : '') + '>' + esc(x.title) + (x.need.length ? ' (need ' + x.need.length + ')' : ' ✓') + '</option>').join('') + '</select></div></div>').join('') + '</div>' +
    '<label class="check"><input type="checkbox" id="pwThaw" checked> Remind me the night before to take meat out of the freezer</label>' +
    '<div class="row-actions"><button type="button" id="pwGo">Plan ' + picks.length + ' dinners</button><button type="button" class="ghost" id="pwX">Cancel</button></div>');
  $('pwX').onclick = closeModal;
  $('pwGo').onclick = () => {
    let n = 0, need = 0;
    picks.forEach((p, k) => { if (!$('modalBody').querySelector('[data-pwon="' + k + '"]').checked) return; const m = ideas[+$('modalBody').querySelector('[data-pwsel="' + k + '"]').value]; planMeal(m, p.d, 'Dinner', $('pwThaw').checked); n++; need += m.need.length; });
    window.save(); closeModal(); if (picks[0] && picks[0].d > addDays(mealWeek, 6)) mealWeek = weekStart(picks[0].d); viewMeals();
    toast('✨ Planned ' + n + ' dinners' + (need ? ' · tap “Add ingredients to shopping list” for the ' + need + ' things you need' : ''));
  };
}
// ✓ We cooked it: take what was used out of On hand, and put any leftovers in the fridge.
function cookedIt(meal, after) {
  const r = data.items.find(i => i.id === meal.location && i.kind === 'recipe'), stock = onHand();
  const used = r ? r.notes.split('\n').map(x => x.trim()).filter(Boolean).map(l => onHandFor(l, stock)).filter(Boolean).filter((x, k, a) => a.indexOf(x) === k) : [];
  openModal('<h2>✓ We cooked ' + esc(meal.title) + '</h2>' +
    (used.length ? '<p class="lbl">Take these out of On hand</p>' + used.map((it, k) => '<label class="check"><input type="checkbox" data-cku="' + k + '" checked> ' + fzCat(it.location)[1] + ' ' + esc(it.title) + ' <small class="sub">' + esc(fzName(it.list).name) + ' · ' + (it.priority || 1) + ' → ' + Math.max(0, (it.priority || 1) - 1) + '</small></label>').join('') : '<p class="helper">Nothing from On hand is linked to this meal.</p>') +
    '<label class="check"><input type="checkbox" id="ckLeft"> 🍱 We have leftovers (they go in the fridge, “use within 4 days”)</label>' +
    '<div class="row-actions"><button type="button" id="ckGo">Done</button><button type="button" class="ghost" id="ckX">Cancel</button></div>');
  $('ckX').onclick = closeModal;
  $('ckGo').onclick = () => {
    const shop = [];
    used.forEach((it, k) => { if ($('modalBody').querySelector('[data-cku="' + k + '"]').checked && useOne(it)) shop.push(it.title); });
    if ($('ckLeft').checked) data.items.push(newItem({ kind: 'freezer', title: 'Leftover ' + meal.title.toLowerCase(), list: 'fridge', priority: 1, notes: '', location: 'Leftovers', date: today(), allDay: true }));
    meal.done = true; window.save(); closeModal(); (after || route)();
    toast('✓ Marked as cooked' + (used.length ? ' · On hand updated' : '') + (shop.length ? ' · 🛒 ' + shop.join(', ') + ' added to your list' : ''));
  };
}
// Every ingredient from the week's recipes goes on the list once; amounts and meal names are noted.
function addWeekToShopping(days) {
  let added = 0; addWeekToShopping.skipped = 0;
  const stock = onHand();
  const open = () => data.items.filter(i => i.kind === 'shop' && !i.done);
  data.items.filter(i => i.kind === 'meal' && days.includes(i.date) && i.location).sort((a, b) => a.date.localeCompare(b.date)).forEach(m => {
    const r = data.items.find(i => i.id === m.location && i.kind === 'recipe'); if (!r) return;
    const tag = m.title + ' (' + new Date(m.date + 'T12:00').toLocaleDateString([], { weekday: 'short' }) + ')';
    r.notes.split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const name = ingredientName(line), amt = amountOf(line);
      if (ALWAYS_HAVE.test(name) || onHandFor(line, stock)) { addWeekToShopping.skipped++; return; }
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
    '<a class="wm" href="' + esc(walmartUrl(i)) + '" target="_blank" rel="noopener" title="Open on ' + esc(storeOf(i.location)) + '">' + esc(storeOf(i.location)) + (i.location ? ' ✓' : '') + '</a></div>';
  $('view').innerHTML = mealTabs('shop') +
    '<div class="quickbar"><input id="shopAdd" placeholder="Add an item… “paper towels”, “2 gallons milk”"><button type="button" id="shopGo">Add</button></div>' +
    '<div class="card pad grocbox"><div id="grocBox">' + (signedIn() ? '🧾 Loading this month’s grocery spending…' : '🧾 Sign in to see grocery spending.') + '</div><div class="row-actions tight"><button type="button" class="small" id="shopLog">🧾 Log this trip' + (got.length ? ' (' + got.length + ' in the cart)' : '') + '</button></div></div>' +
    usualsHtml(need) +
    '<div class="row-actions"><a class="button" href="https://www.walmart.com/cart" target="_blank" rel="noopener">Open Walmart</a><a class="button ghost" href="https://www.samsclub.com/" target="_blank" rel="noopener">Open Sam’s Club</a><button type="button" class="ghost small" id="shopCopy">Copy list</button><button type="button" class="ghost small" id="shopSend">📤 Send to Salvador</button>' + (got.length ? '<button type="button" class="ghost small" id="shopClear">Clear ' + got.length + ' checked</button>' : '') + '</div>' +
    '<p class="helper">📤 <b>Send to Salvador</b> texts him the list. For a live list he can check off at the store, sign in to this Planner on his phone with your account (More → Account and sync): changes show up on both phones.</p>' +
    '<p class="helper">Tap the store button (Walmart, or the store you saved for that item) to find each item and add it to your cart (pickup or delivery). Check it off here as you go. To always open the exact product you buy, tap an item and paste its Walmart link.</p>' +
    (groups.length ? groups.map(([a, l]) => '<div class="card pad"><h3>' + esc(a) + '</h3>' + l.map(row).join('') + '</div>').join('') : '<div class="card pad"><p class="helper">Your list is empty. Plan meals, then tap <b>Add ingredients to shopping list</b>, or add items above.</p></div>') +
    (got.length ? '<button type="button" class="linkish" id="shopGot">' + (showGot ? 'Hide' : 'Show') + ' ' + got.length + ' in the cart</button>' + (showGot ? '<div class="card pad">' + got.map(row).join('') + '</div>' : '') : '');
  const add = () => {
    const v = $('shopAdd').value.trim(); if (!v) return;
    const name = ingredientName(v), amt = amountOf(v);
    data.items.push(newItem({ kind: 'shop', title: name, list: aisleOf(v), notes: amt, location: (S().walmart || {})[name.toLowerCase()] || '' }));
    window.save(); viewShop(); setTimeout(() => $('shopAdd').focus(), 50);
  };
  $('shopLog').onclick = () => logTrip(got.length);
  loadGroceryMonth();
  $('shopGo').onclick = add; $('shopAdd').onkeydown = e => { if (e.key === 'Enter') add(); };
  $('view').querySelectorAll('[data-usual]').forEach(b => b.onclick = () => {
    const k = b.dataset.usual, name = k.charAt(0).toUpperCase() + k.slice(1);
    data.items.push(newItem({ kind: 'shop', title: name, list: aisleOf(name), notes: storeOf(S().walmart[k]), location: S().walmart[k] }));
    window.save(); viewShop(); toast('✓ ' + name + ' added · ' + storeOf(S().walmart[k]));
  });
  $('view').querySelectorAll('[data-got]').forEach(b => b.onclick = () => { const i = data.items.find(x => x.id === b.dataset.got); i.done = !i.done; window.save(); viewShop(); });
  $('view').querySelectorAll('[data-shopedit]').forEach(b => b.onclick = () => editShop(b.dataset.shopedit));
  $('shopCopy').onclick = () => {
    const text = groups.map(([a, l]) => a + ':\n' + l.map(i => '• ' + i.title + (i.notes ? ' (' + i.notes.split(' · ')[0] + ')' : '')).join('\n')).join('\n\n');
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into a text or note.'), () => toast('Could not copy.'));
  };
  $('shopSend').onclick = async () => {
    const text = '🛒 Shopping list\n\n' + groups.map(([a, l]) => a + ':\n' + l.map(i => '☐ ' + i.title + (i.notes ? ' (' + i.notes.split(' · ')[0] + ')' : '')).join('\n')).join('\n\n');
    if (navigator.share) { try { await navigator.share({ title: 'Shopping list', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    location.href = 'sms:&body=' + encodeURIComponent(text);
  };
  if ($('shopClear')) $('shopClear').onclick = () => { data.items = data.items.filter(i => !(i.kind === 'shop' && i.done)); window.save(); viewShop(); };
  if ($('shopGot')) $('shopGot').onclick = () => { showGot = !showGot; viewShop(); };
}
// Things you always buy at a certain store (saved links), as one-tap buttons, grouped by store.
function usualsHtml(need) {
  const saved = S().walmart || {}, onList = new Set(need.map(i => i.title.toLowerCase()));
  const keys = Object.keys(saved).filter(k => /^https:\/\//.test(saved[k]) && !onList.has(k)).sort();
  if (!keys.length) return '';
  const byStore = {}; keys.forEach(k => { const st = storeOf(saved[k]); (byStore[st] = byStore[st] || []).push(k); });
  return '<div class="card pad usuals"><h3>Your usual items</h3>' + Object.keys(byStore).sort().map(st => '<p class="lbl">' + esc(st) + '</p><div class="qfreq">' + byStore[st].map(k => '<button type="button" class="qf" data-usual="' + esc(k) + '">＋ ' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</button>').join('') + '</div>').join('') +
    '<p class="helper">Tap to add it to the list with its saved link. To save a new one, tap an item on the list and paste its product link.</p></div>';
}
function editShop(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  openModal('<h2>' + esc(it.title) + '</h2><label>Item<input id="shName" value="' + esc(it.title) + '"></label>' +
    '<label>Aisle<select id="shAisle">' + AISLE_ORDER.map(a => '<option' + (a === (it.list || 'Other') ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></label>' +
    '<label>Amount / notes<input id="shNotes" value="' + esc(it.notes) + '"></label>' +
    '<label>Product link (optional)<input id="shUrl" value="' + esc(it.location) + '" placeholder="Walmart, Sam’s Club, Target… link" autocapitalize="off"></label>' +
    '<p class="helper">Find the exact product on any store’s site (Walmart, Sam’s Club, Target…), tap Share → Copy, and paste it here. It’s remembered for next time.</p>' +
    '<div class="row-actions"><button type="button" id="shSave">Save</button><a class="button ghost" href="' + esc(walmartUrl(it)) + '" target="_blank" rel="noopener">Open on ' + esc(storeOf(it.location)) + '</a><button type="button" class="danger" id="shDel">Remove</button></div>');
  $('shSave').onclick = () => {
    const url = $('shUrl').value.trim();
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) { toast('Paste the whole link, starting with https://'); return; }
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
    '<a class="card pad tip" href="../recipes/"><b>📸 Family recipe book</b><span class="sub">Photos of family recipes to share with everyone →</span></a>' +
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
    '<div id="bdayBox"></div><div id="kidBox"></div><div class="bgrid">' +
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
  loadKidNews(); loadBirthdays();
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
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks">To-do</a><a href="#tasks/routines" class="on">Routines</a><a href="#tasks/templates">Templates</a><a href="#tasks/cleaning">🧹 Cleaning</a><a href="#tasks/atu">🎓 ATU</a></div>' +
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
  $('view').innerHTML = '<h1>Tasks</h1><div class="toptabs"><a href="#tasks">To-do</a><a href="#tasks/routines">Routines</a><a href="#tasks/templates" class="on">Templates</a><a href="#tasks/cleaning">🧹 Cleaning</a><a href="#tasks/atu">🎓 ATU</a></div>' +
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
    (() => { const ms = meds().filter(m => m.who === who && m.active !== false); return '<div class="card pad hcard"><div class="mini-head"><h2>💊 Medicines</h2><a class="button small" href="#meds">' + (ms.length ? 'Manage' : '＋ Add') + '</a></div>' + (ms.length ? ms.map(m => '<div class="mini-row"><span><b>' + esc(m.name) + '</b>' + (m.dose ? ' · ' + esc(m.dose) : '') + '</span><span class="sub">' + ((m.times || []).length ? m.times.map(fmtTime).join(', ') : 'as needed') + '</span></div>').join('') : '<p class="helper">No medicines or vitamins yet.</p>') + '</div>'; })() +
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
    '<a class="card pad tip" href="#kids"><b>Family links</b><span class="sub">👨‍👩‍👧‍👦 Salvador, Eli & Cece add events and shopping items · phone alerts →</span></a>' +
    '<a class="card pad tip" href="../recipes/"><b>Family recipes</b><span class="sub">📸 Recipe photos to share with family →</span></a>' +
    '<a class="card pad tip" href="#meds"><b>Medicines</b><span class="sub">💊 Medicine & vitamin reminders for everyone →</span></a>' +
    '<a class="card pad tip" href="#car"><b>Car care</b><span class="sub">🚗 Oil changes, tires, tags & insurance →</span></a>' +
    '<a class="card pad tip" href="#tasks/atu"><b>ATU</b><span class="sub">🎓 ATU tasks and the 🍿 SNA Snack Closet order →</span></a>' +
    '<a class="card pad tip" href="#quick"><b>Quick adds</b><span class="sub">⭐ Add, change or delete your one-tap events →</span></a>' +
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
