// Reading connected calendars (Google, Outlook) for the hub, the same way the Planner does.
// Copied from planner/app.js so the day page matches the Planner calendar.
(function () {
const pad = n => String(n).padStart(2, '0');
const isoDay = window.isoDay;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
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

// Every connected calendar's events on one day. Feeds are kept for 30 minutes so switching days is quick.
window.calendarDay = async function (sb, cals, day) {
  const out = [];
  for (const c of (cals || []).filter(c => c.on !== false && c.url)) {
    let events = null;
    try { const k = 'hubCal_' + c.id, hit = JSON.parse(sessionStorage.getItem(k) || 'null'); if (hit && Date.now() - hit.at < 30 * 60000) events = hit.events; } catch (e) {}
    if (!events) {
      try {
        const { data: text, error } = await sb.functions.invoke('planner-ics', { body: { url: calendarFeedUrl(c.url) } });
        if (error) throw error;
        events = parseIcs(typeof text === 'string' ? text : await new Response(text).text());
        try { sessionStorage.setItem('hubCal_' + c.id, JSON.stringify({ at: Date.now(), events })); } catch (e) {}
      } catch (e) { continue; }
    }
    calendarOccurrences(events, day, day).forEach(o => out.push(Object.assign(o, { cal: c.name, color: c.color })));
  }
  return out;
};
window.expandRule = expandRule;
})();
