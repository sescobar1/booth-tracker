// The planner as a calendar feed, so Google Calendar, Outlook or an iPhone can subscribe to it.
// Calendar apps can't sign in, so the link carries a long secret key instead (checked by planner_feed in the database).
type Item = { id: string; kind: string; list: string; title: string; date: string; end_date: string | null; start_time: string; end_time: string; all_day: boolean; done: boolean; notes: string; location: string; repeat: string; driver: string; remind: number | null; updated_at: string };

const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines over 75 characters are folded, as the iCal format asks.
const fold = (line: string) => { const out: string[] = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); };
const day = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const hm = (t: string) => (t || '').replace(':', '').padEnd(4, '0').slice(0, 4) + '00';
const RR: Record<string, string> = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' };

// Period trackers ("⚠️ Cecilia’s period"): logs are start days with "5 days" in the note. From them, the next expected
// start (average of the last cycles that look like a cycle, 18–45 days; 28 until there are two) and a heads-up 3 days before.
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const between = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
function periodWarnings(items: Item[], today: string) {
  const out: { uid: string; date: string; title: string; next: string }[] = [], lists = new Map<string, Item[]>();
  items.filter((i) => i.kind === 'track' && /period/i.test(i.title || '') && i.date).forEach((i) => { const l = lists.get(i.list) || []; l.push(i); lists.set(i.list, l); });
  lists.forEach((logs, list) => {
    const starts = [...new Set(logs.map((l) => l.date))].sort(), lens = starts.map((d) => { const l = logs.find((x) => x.date === d)!, m = /^\s*(\d+)\s*day/.exec(l.notes || ''); return m ? +m[1] : 0; });
    const gaps: number[] = []; for (let i = 1; i < starts.length; i++) { const g = between(starts[i - 1], starts[i]); if (g >= 18 && g <= 45) gaps.push(g); }
    const done = lens.filter((n) => n > 0).slice(-6);
    const cycle = gaps.length ? Math.round(gaps.slice(-6).reduce((a, b) => a + b, 0) / gaps.slice(-6).length) : 28;
    const len = done.length ? Math.min(8, Math.max(3, Math.round(done.reduce((a, b) => a + b, 0) / done.length))) : 5;
    if (!starts.length) return;
    let next = addDays(starts[starts.length - 1], cycle);
    while (addDays(next, len) <= today) next = addDays(next, cycle);
    // 3 days before, or today if that's already past (the alert day is still today's date).
    const warn = addDays(next, -3) >= today ? addDays(next, -3) : today, n = between(warn, next);
    const who = (logs[0].title || '').replace(/^\W+/u, '').replace(/[’']s period$/i, '').trim() || 'Period';
    out.push({ uid: 'periodwarn-' + list + '-' + next, date: warn, title: '🌸 Heads-up: ' + who + '’s period may start ' + (n > 1 ? 'in about ' + n + ' days' : n === 1 ? 'tomorrow' : 'any day now'), next });
  });
  return out;
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const token = u.searchParams.get('t') || '';
  const tz = /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(u.searchParams.get('tz') || '') ? u.searchParams.get('tz')! : 'America/Chicago';
  if (token.length < 20) return new Response('Missing key', { status: 404 });
  const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/planner_feed', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token }) });
  if (!r.ok) return new Response('Feed unavailable', { status: 502 });
  const items: Item[] = await r.json();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:My Planner', 'X-WR-TIMEZONE:' + tz, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const i of items) {
    const task = i.kind === 'task';
    const timed = !task && !i.all_day && i.start_time;
    lines.push('BEGIN:VEVENT', 'UID:' + i.id + '@planner', 'DTSTAMP:' + stamp);
    if (timed) {
      lines.push('DTSTART;TZID=' + tz + ':' + day(i.date) + 'T' + hm(i.start_time));
      const endDay = i.end_date && i.end_date > i.date ? i.end_date : i.date;
      lines.push('DTEND;TZID=' + tz + ':' + day(endDay) + 'T' + hm(i.end_time && (i.end_time > i.start_time || endDay > i.date) ? i.end_time : String(Math.min(23, Number(i.start_time.slice(0, 2)) + 1)).padStart(2, '0') + i.start_time.slice(2)));
    } else {
      lines.push('DTSTART;VALUE=DATE:' + day(i.date));
      lines.push('DTEND;VALUE=DATE:' + day(nextDay(i.end_date && i.end_date > i.date ? i.end_date : i.date)));
      lines.push('TRANSP:TRANSPARENT');
    }
    lines.push('SUMMARY:' + esc((task ? (i.done ? '✓ ' : '☐ ') : '') + (i.title || '(no title)')));
    if (i.location) lines.push('LOCATION:' + esc(i.location));
    const desc = [i.driver ? 'Driving: ' + i.driver : '', i.notes].filter(Boolean).join('\n');
    if (desc) lines.push('DESCRIPTION:' + esc(desc));
    if (RR[i.repeat]) lines.push('RRULE:' + RR[i.repeat]);
    // Alerts: events default to 30 minutes before; tasks with a due date ring at 9 AM that day. remind = -1 means no alert.
    const mins = i.remind == null ? (timed ? 30 : task ? -540 : null) : i.remind;
    if (mins != null && mins >= -1440 && mins !== -1 && !(task && i.done)) {
      const trig = timed ? (mins >= 0 ? '-PT' + mins + 'M' : 'PT' + (-mins) + 'M') : (mins < 0 ? 'PT' + (-mins) + 'M' : '-PT' + mins + 'M');
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(i.title || 'Reminder'), 'TRIGGER:' + trig, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  const todayHere = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  for (const w of periodWarnings(items, todayHere)) {
    lines.push('BEGIN:VEVENT', 'UID:' + w.uid + '@planner', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + day(w.date), 'DTEND;VALUE=DATE:' + day(nextDay(w.date)), 'TRANSP:TRANSPARENT',
      'SUMMARY:' + esc(w.title), 'DESCRIPTION:' + esc('Expected around ' + w.next + '.'), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(w.title), 'TRIGGER:PT8H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300', 'Access-Control-Allow-Origin': '*' } });
});
