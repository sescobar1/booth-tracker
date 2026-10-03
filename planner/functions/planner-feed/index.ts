// The planner as a calendar feed, so Google Calendar, Outlook or an iPhone can subscribe to it.
// Calendar apps can't sign in, so the link carries a long secret key instead (checked by planner_feed in the database).
type Item = { id: string; kind: string; title: string; date: string; end_date: string | null; start_time: string; end_time: string; all_day: boolean; done: boolean; notes: string; location: string; repeat: string; driver: string; remind: number | null; updated_at: string };

const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines over 75 characters are folded, as the iCal format asks.
const fold = (line: string) => { const out: string[] = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); };
const day = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const hm = (t: string) => (t || '').replace(':', '').padEnd(4, '0').slice(0, 4) + '00';
const RR: Record<string, string> = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' };

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
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300', 'Access-Control-Allow-Origin': '*' } });
});
