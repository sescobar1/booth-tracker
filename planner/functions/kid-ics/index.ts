// A family member's reminders as a calendar subscription, so their phone pops them up even when no app is open:
//  - their daily reminders (repeat every day, alert at the time),
//  - quick reminders Shaana sends them ("pick up Cece", "football game"), alert 30 minutes before and at the time,
//  - matching events from Shaana's connected calendars (for Salvador: his work and Shaana's work), alert the night before.
//  - for a link with a filter (Cece: her events and work days; Eli: his events, music, and Saturday football),
//    the planner and calendar events that match it,
//  - their to-dos with a day (pop-up at the reminder time, or 8 AM),
//  - with period tracking on, a heads-up 3 days before the next expected period (from Shaana's planner tracker).
// Changes show up on their own when the phone refreshes the calendar.
// With &list=1 it answers with matching events as JSON (next 3 weeks, or &from=&to= up to 62 days) for the page's calendar.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
const TZID = 'America/Chicago';
const TZ = `BEGIN:VTIMEZONE\r\nTZID:America/Chicago\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:-0600\r\nTZOFFSETTO:-0500\r\nTZNAME:CDT\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600\r\nTZNAME:CST\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE`;
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZID }).format(d).replace(/-/g, '');
const alarm = (text: string, trig: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(text), 'TRIGGER:' + trig, 'END:VALARM'];

// Copy matching events out of an .ics feed, renamed and with our own alert.
type Rule = { m: string; as: string; dow?: number[] };
// The event's start day where the family lives (a 7pm game is "20261011T000000Z", still Saturday here).
function localStart(ev: string) {
  const v = (ev.match(/\nDTSTART[^:\n]*:([0-9TZ]+)/) || [])[1] || '';
  const t = /Z$/.test(v) ? icsTime(v) : v.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
  return t.slice(0, 10);
}
function matching(ics: string, rules: Rule[], today: string, horizon: string, tzSeen: Set<string>, out: string[], tzOut: string[]) {
  const text = ics.replace(/\r?\n[ \t]/g, '');
  for (const tz of text.match(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/g) || []) {
    const id = (tz.match(/TZID:([^\r\n]+)/) || [])[1];
    if (id && !tzSeen.has(id)) { tzSeen.add(id); tzOut.push(tz.replace(/\r?\n/g, '\r\n')); }
  }
  for (const ev of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
    const title = unesc(((ev.match(/\nSUMMARY[^:\n]*:([^\r\n]*)/) || [])[1] || '').trim());
    const day = localStart(ev);
    const rule = rules.find((r) => new RegExp(r.m, 'i').test(title) && (!r.dow || r.dow.includes(new Date(day + 'T12:00').getDay()))); if (!rule) continue;
    const start = (ev.match(/\nDTSTART[^:\n]*:(\d{8})/) || [])[1] || '', rr = (ev.match(/\nRRULE:([^\r\n]*)/) || [])[1] || '';
    const until = (rr.match(/UNTIL=(\d{8})/) || [])[1], recId = (ev.match(/\nRECURRENCE-ID[^:\n]*:(\d{8})/) || [])[1];
    const keep = rr ? !until || until >= today : (recId || start) >= today && (recId || start) <= horizon;
    if (!keep || /\nSTATUS:CANCELLED/.test(ev)) continue;
    const allDay = /\nDTSTART;VALUE=DATE:/.test(ev), name = rule.as.replace('{title}', title);
    const lines = ev.replace(/BEGIN:VALARM[\s\S]*?END:VALARM\r?\n?/g, '').split(/\r?\n/).filter((l) => l && !/^(BEGIN|END):VEVENT/.test(l))
      .map((l) => /^SUMMARY[^:]*:/.test(l) ? 'SUMMARY:' + esc(name) : /^UID:/.test(l) ? 'UID:fam-' + l.slice(4) : l)
      .filter((l) => !/^(DESCRIPTION|LOCATION|ATTENDEE|ORGANIZER|URL|X-)/.test(l));
    out.push('BEGIN:VEVENT', ...lines, ...alarm(name, allDay ? '-PT4H' : '-PT60M'), 'END:VEVENT');
  }
}

// ---- Repeating events for the JSON list (same rules as the planner app) ----
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const chicago = (d: Date) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZID, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute; };
function icsTime(v: string) {
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return '';
  if (!m[4]) return m[1] + '-' + m[2] + '-' + m[3];
  if (m[7]) return chicago(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
  return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5];
}
// deno-lint-ignore no-explicit-any
type Ev = any;
function parseIcs(text: string): Ev[] {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: Ev[] = []; let ev: Ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1), name = head.split(';')[0].toUpperCase();
    if (name === 'SUMMARY') ev.title = unesc(val);
    else if (name === 'LOCATION') ev.location = unesc(val);
    else if (name === 'UID') ev.uid = val;
    else if (name === 'STATUS') ev.status = val;
    else if (name === 'RRULE') ev.rrule = val;
    else if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID' || name === 'EXDATE') {
      const vals = val.split(',').map((v) => icsTime(v));
      if (name === 'DTSTART') { ev.start = vals[0]; ev.allDay = /VALUE=DATE(?!-)/i.test(head) || /^\d{8}$/.test(val); }
      else if (name === 'DTEND') ev.end = vals[0];
      else if (name === 'RECURRENCE-ID') ev.recurrenceId = vals[0];
      else ev.exdates.push(...vals.map((v) => v.slice(0, 10)));
    } else if (name === 'DURATION') ev.duration = val;
  }
  return out.filter((e) => !/CANCELLED/i.test(e.status || ''));
}
function durationMin(d: string) { const m = String(d || '').match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/); return m ? ((+m[1] || 0) * 7 * 1440 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; }
const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
const plusMin = (local: string, n: number) => { const d = new Date(local); d.setMinutes(d.getMinutes() + n); return isoDay(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function expandRule(ev: Ev, from: string, to: string) {
  const r: Record<string, string> = {}; ev.rrule.split(';').forEach((p: string) => { const [k, v] = p.split('='); r[k.toUpperCase()] = v; });
  const step = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0, until = r.UNTIL ? icsTime(r.UNTIL).slice(0, 10) : '9999-12-31';
  const time = ev.allDay ? '' : ev.start.slice(10);
  const start = ev.start.slice(0, 10), out: string[] = [];
  const byday = (r.BYDAY || '').split(',').filter(Boolean).map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : 0, d: DAYS.indexOf(m[2].toLowerCase()) } : null; }).filter(Boolean) as { n: number; d: number }[];
  const bymd = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  let n = 0;
  const take = (d: string) => { if (d < start) return true; if (d > until || (count && n >= count)) return false; n++; if (d >= from && d <= to) out.push(d + time); return true; };
  const d0 = new Date(start + 'T12:00');
  if (r.FREQ === 'DAILY') {
    for (let d = new Date(d0), i = 0; i < 4000; i++, d.setDate(d.getDate() + step)) { const s = isoDay(d); if (s > to) break; if (byday.length && !byday.some((b) => b.d === d.getDay())) continue; if (!take(s)) break; }
  } else if (r.FREQ === 'WEEKLY') {
    const days = byday.length ? byday.map((b) => b.d).sort() : [d0.getDay()];
    const wk = new Date(d0); wk.setDate(wk.getDate() - wk.getDay());
    outer: for (let i = 0; i < 1500; i++, wk.setDate(wk.getDate() + 7 * step)) {
      for (const dd of days) { const d = new Date(wk); d.setDate(d.getDate() + dd); const s = isoDay(d); if (s > to) break outer; if (!take(s)) break outer; }
    }
  } else if (r.FREQ === 'MONTHLY' || r.FREQ === 'YEARLY') {
    const months = r.FREQ === 'YEARLY' ? 12 * step : step;
    for (let i = 0; i < 600; i++) {
      const y = d0.getFullYear() + Math.floor((d0.getMonth() + i * months) / 12), m = (d0.getMonth() + i * months) % 12 + 1;
      if (y + '-' + pad(m) + '-01' > to) break;
      let days: number[] = [];
      if (byday.length) {
        byday.forEach((b) => {
          const all: number[] = []; for (let dd = 1; dd <= lastDay(y, m); dd++) if (new Date(y, m - 1, dd).getDay() === b.d) all.push(dd);
          if (b.n > 0 && all[b.n - 1]) days.push(all[b.n - 1]); else if (b.n < 0 && all[all.length + b.n]) days.push(all[all.length + b.n]); else if (!b.n) days.push(...all);
        });
      } else if (bymd.length) days = bymd.map((x) => x < 0 ? lastDay(y, m) + 1 + x : x).filter((x) => x >= 1 && x <= lastDay(y, m));
      else { const dd = d0.getDate(); if (dd <= lastDay(y, m)) days = [dd]; }
      let stop = false;
      days.sort((a, b) => a - b).forEach((dd) => { if (!stop && !take(y + '-' + pad(m) + '-' + pad(dd))) stop = true; });
      if (stop) break;
    }
  } else take(start);
  return out;
}
function occurrences(events: Ev[], from: string, to: string) {
  const out: Ev[] = [], moved: Record<string, Set<string>> = {};
  events.filter((e) => e.recurrenceId).forEach((e) => { (moved[e.uid] = moved[e.uid] || new Set()).add(e.recurrenceId.slice(0, 10)); });
  events.forEach((e) => {
    const len = e.end ? minutesBetween(e.start.length > 10 ? e.start : e.start + 'T00:00', e.end.length > 10 ? e.end : e.end + 'T00:00') : e.duration ? durationMin(e.duration) : e.allDay ? 1440 : 60;
    const starts = e.rrule && !e.recurrenceId ? expandRule(e, addDays(from, -Math.ceil(len / 1440)), to).filter((s) => !e.exdates.includes(s.slice(0, 10)) && !(moved[e.uid] && moved[e.uid].has(s.slice(0, 10)))) : [e.start];
    starts.forEach((s: string) => {
      const st = s.length > 10 ? s : s + 'T00:00', en = plusMin(st, len);
      const lastDate = e.allDay ? addDays(en.slice(0, 10), -1) : en.slice(0, 10);
      if (lastDate < from || st.slice(0, 10) > to) return;
      out.push({ date: st.slice(0, 10), endDate: lastDate > st.slice(0, 10) ? lastDate : '', start: e.allDay ? '' : st.slice(11), end: e.allDay ? '' : en.slice(11), allDay: !!e.allDay, title: e.title || '', location: e.location || '' });
    });
  });
  return out;
}
// Period days logged on the page → the next expected start (average cycle, 28 days until there are two periods logged).
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 864e5);
function periodPlan(days: string[], today: string, fixedCycle = 0) {
  const set = new Set(days), starts = [...set].sort().filter((d) => !set.has(addDays(d, -1)));
  if (!starts.length) return null;
  const lens = starts.map((st) => { let n = 0; while (set.has(addDays(st, n))) n++; return n; });
  const gaps: number[] = []; for (let i = 1; i < starts.length; i++) { const g = daysBetween(starts[i - 1], starts[i]); if (g >= 18 && g <= 45) gaps.push(g); }
  const avg = (a: number[]) => a.reduce((t, x) => t + x, 0) / a.length;
  const cycle = fixedCycle || (gaps.length ? Math.round(avg(gaps.slice(-6))) : 28), ended = lens.filter((n, i) => addDays(starts[i], n) <= today), len = ended.length ? Math.min(8, Math.max(3, Math.round(avg(ended.slice(-6))))) : 5;
  let next = addDays(starts[starts.length - 1], cycle);
  while (addDays(next, len) <= today) next = addDays(next, cycle);
  return { cycle, len, next };
}
const jsonHead = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams, token = params.get('t') || '';
  const { data: k } = await admin.from('kid_links').select('owner,name,tell,reminders,pings,cal_rules,show_rx,show_days,period,period_list,period_open').eq('token', token).maybeSingle();
  if (!k || token.length < 20) return new Response('Not found', { status: 404 });
  const rx = k.show_rx ? new RegExp(k.show_rx, 'i') : null, byDay: Rule[] = k.show_days || [];
  const filtered = !!rx || byDay.length > 0;
  // Same test as kid_shows() in the database.
  const shows = (title: string, list: string, notes: string, date: string, forWho = '') => forWho === 'everyone' || forWho === k.name || (!forWho && (!filtered || (rx && rx.test((title || '') + ' ' + (list || ''))) ||
    byDay.some((r) => new RegExp(r.m, 'i').test(title || '') && (r.dow || []).includes(new Date(date + 'T12:00').getDay())) || (notes || '').includes('Added by ' + k.name)));
  const feedsOf = async () => {
    const { data: st } = await admin.from('planner_settings').select('data').eq('owner', k.owner).maybeSingle();
    const cals = ((st?.data?.settings?.calendars) || []).filter((c: { on?: boolean; url?: string }) => c.on !== false && c.url);
    return Promise.all(cals.map((c: { url: string }) => fetch(c.url.replace(/^webcal:/, 'https:')).then((r) => r.ok ? r.text() : '').catch(() => '')));
  };
  // The page's "Coming up" list: planner events plus calendar events that match the link's filter.
  if (params.get('list')) {
    const now = chicago(new Date()).slice(0, 10), okDay = (d: string | null) => d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const from = okDay(params.get('from')) ? params.get('from')! : now;
    let to = okDay(params.get('to')) ? params.get('to')! : addDays(from, 21);
    if (to < from || daysBetween(from, to) > 62) to = addDays(from, 62);
    const { data: items } = await admin.from('planner_items').select('title,date,start_time,end_time,all_day,location,list,id,repeat,notes,for_who').eq('owner', k.owner).eq('kind', 'event').gte('date', from).lte('date', to);
    const out = (items || []).filter((i) => !i.repeat && !/^medrem-/.test(i.id) && i.list !== 'Medicine' && shows(i.title, i.list, i.notes, i.date, i.for_who))
      .map((i) => ({ title: i.title, date: i.date, start: i.start_time || '', end: i.end_time || '', allDay: !!i.all_day, location: i.location || '' }));
    if (filtered) for (const ics of await feedsOf()) out.push(...occurrences(parseIcs(ics), from, to).filter((e: Ev) => shows(e.title, '', '', e.date)));
    const seen = new Set<string>();
    const events = out.filter((e) => { const key = e.date + e.start + e.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    return new Response(JSON.stringify({ events }), { headers: jsonHead });
  }
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', day = ymd(now);
  const yest = ymd(new Date(now.getTime() - 86400000)), horizon = ymd(new Date(now.getTime() + 150 * 86400000));
  const events: string[] = [], tzs: string[] = [], tzSeen = new Set([TZID]);
  (k.reminders || []).forEach((r: { t: string; at: string }, i: number) => {
    const hm = String(r.at || '08:00').replace(':', '').slice(0, 4);
    events.push('BEGIN:VEVENT', 'UID:kidrem-' + token.slice(0, 10) + '-' + i + '@family-planner', 'DTSTAMP:' + stamp, 'DTSTART;TZID=' + TZID + ':' + day + 'T' + hm + '00',
      'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:' + esc(r.t), 'TRANSP:TRANSPARENT', ...alarm(r.t, 'PT0M'), 'END:VEVENT');
  });
  (k.pings || []).filter((p: { date: string }) => p.date.replace(/-/g, '') >= yest).forEach((p: { id: string; t: string; date: string; at?: string; from?: string; alerts?: string[] }) => {
    const d = p.date.replace(/-/g, ''), title = p.t + (p.from ? ' (from ' + p.from + ')' : '');
    events.push('BEGIN:VEVENT', 'UID:ping-' + p.id + '@family-planner', 'DTSTAMP:' + stamp,
      ...(p.at ? ['DTSTART;TZID=' + TZID + ':' + d + 'T' + p.at.replace(':', '') + '00', 'DURATION:PT30M', 'SUMMARY:' + esc(title), ...(p.alerts || ['-PT30M', 'PT0M']).flatMap((a) => alarm(title, a))]
        : ['DTSTART;VALUE=DATE:' + d, 'DURATION:P1D', 'SUMMARY:' + esc(title), ...alarm(title, 'PT7H')]), 'END:VEVENT');
  });
  const rules: Rule[] = [...(k.cal_rules || []), ...(k.show_rx ? [{ m: k.show_rx, as: '{title}' }] : []), ...byDay.map((r) => ({ m: r.m, as: '{title}', dow: r.dow }))];
  if (rules.length) (await feedsOf()).forEach((ics) => matching(ics, rules, day, horizon, tzSeen, events, tzs));
  // Planner events for this person, with a heads-up before: the filter's matches (Cece's own events), and events
  // marked "Everyone" or "Just <name>" (for every link, including ones without a filter).
  {
    const from = day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6), to = horizon.slice(0, 4) + '-' + horizon.slice(4, 6) + '-' + horizon.slice(6);
    const { data: items } = await admin.from('planner_items').select('id,title,date,start_time,end_time,all_day,list,repeat,notes,for_who').eq('owner', k.owner).eq('kind', 'event').gte('date', from).lte('date', to);
    (items || []).filter((i) => !i.repeat && !/^medrem-/.test(i.id) && i.list !== 'Medicine' && (filtered ? shows(i.title, i.list, i.notes, i.date, i.for_who) : i.for_who === 'everyone' || i.for_who === k.name)).forEach((i) => {
      const d = i.date.replace(/-/g, ''), timed = !i.all_day && i.start_time;
      events.push('BEGIN:VEVENT', 'UID:fam-item-' + i.id + '@family-planner', 'DTSTAMP:' + stamp,
        ...(timed ? ['DTSTART;TZID=' + TZID + ':' + d + 'T' + i.start_time.replace(':', '') + '00', i.end_time ? 'DTEND;TZID=' + TZID + ':' + d + 'T' + i.end_time.replace(':', '') + '00' : 'DURATION:PT1H']
          : ['DTSTART;VALUE=DATE:' + d, 'DURATION:P1D']), 'SUMMARY:' + esc(i.title), ...alarm(i.title, timed ? '-PT60M' : '-PT4H'), 'END:VEVENT');
    });
  }
  // To-dos with a day: a pop-up at the reminder time (or 8 AM when there's no time) until they're checked off.
  {
    const { data: tasks } = await admin.from('family_tasks').select('id,title,due,at,added_by').eq('owner', k.owner).eq('for_who', k.name).eq('done', false).not('due', 'is', null);
    (tasks || []).forEach((t) => {
      const d = t.due.replace(/-/g, ''), title = '✅ ' + t.title + (t.added_by && t.added_by !== k.name ? ' (from ' + (t.added_by === 'Shaana' ? (k.tell || 'Mom') : t.added_by) + ')' : '');
      events.push('BEGIN:VEVENT', 'UID:task-' + t.id + '@family-planner', 'DTSTAMP:' + stamp,
        ...(t.at ? ['DTSTART;TZID=' + TZID + ':' + d + 'T' + t.at.replace(':', '') + '00', 'DURATION:PT15M', 'SUMMARY:' + esc(title), ...alarm(title, 'PT0M')]
          : ['DTSTART;VALUE=DATE:' + d, 'DURATION:P1D', 'SUMMARY:' + esc(title), 'TRANSP:TRANSPARENT', ...alarm(title, 'PT8H')]), 'END:VEVENT');
    });
  }
  // A quiet heads-up 3 days before the next expected period. Periods are the start days logged in Shaana's planner
  // tracker; each note says how many days it lasted ("5 days"), and one with no length yet is still going.
  if (k.period && k.period_list) {
    const today = chicago(now).slice(0, 10), days: string[] = [];
    const { data: logs } = await admin.from('planner_items').select('date,notes').eq('owner', k.owner).eq('kind', 'track').eq('list', k.period_list);
    (logs || []).filter((l) => l.date).forEach((l) => {
      const m = /^\s*(\d+)\s*day/.exec(l.notes || ''), going = !m && l.date <= today && daysBetween(l.date, today) < 10;
      const n = m ? Math.min(14, Math.max(1, +m[1])) : going ? daysBetween(l.date, today) + 1 : 5;
      for (let i = 0; i < n; i++) days.push(addDays(l.date, i));
    });
    // The usual cycle length Shaana set on the tracker, if any.
    const { data: st } = await admin.from('planner_settings').select('data').eq('owner', k.owner).maybeSingle();
    const tr = ((st?.data?.settings?.trackers) || []).find((x: { id: string }) => x.id === k.period_list);
    const plan = periodPlan(days, today, Number(tr?.cycleDays) || 0);
    // 3 days before, or today if that's already past.
    const warn = plan && (addDays(plan.next, -3) >= today ? addDays(plan.next, -3) : today), n = plan ? daysBetween(warn!, plan.next) : 0;
    if (warn && !k.period_open) {
      const t = '🌸 Heads-up: your period may start ' + (n > 1 ? 'in about ' + n + ' days' : n === 1 ? 'tomorrow' : 'any day now');
      events.push('BEGIN:VEVENT', 'UID:period-' + token.slice(0, 10) + '-' + plan!.next + '@family-planner', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + warn.replace(/-/g, ''), 'DURATION:P1D',
        'SUMMARY:' + esc(t), 'TRANSP:TRANSPARENT', ...alarm(t, 'PT8H'), 'END:VEVENT');
    }
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Planner//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(k.name + '’s reminders'),
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', TZ, ...tzs, ...events, 'END:VCALENDAR'];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + k.name.toLowerCase() + '-reminders.ics"', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
});
