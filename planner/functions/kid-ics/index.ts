// A family member's reminders as a calendar subscription, so their phone pops them up even when no app is open:
//  - their daily reminders (repeat every day, alert at the time),
//  - quick reminders Shaana sends them ("pick up Cece", "football game"), alert 30 minutes before and at the time,
//  - matching events from Shaana's connected calendars (for Salvador: his work and Shaana's work), alert the night before.
// Changes show up on their own when the phone refreshes the calendar.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
const TZID = 'America/Chicago';
const TZ = `BEGIN:VTIMEZONE\r\nTZID:America/Chicago\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:-0600\r\nTZOFFSETTO:-0500\r\nTZNAME:CDT\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600\r\nTZNAME:CST\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE`;
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZID }).format(d).replace(/-/g, '');
const alarm = (text: string, trig: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(text), 'TRIGGER:' + trig, 'END:VALARM'];

// Copy matching events out of an .ics feed, renamed and with our own alert.
function matching(ics: string, rules: { m: string; as: string }[], today: string, horizon: string, tzSeen: Set<string>, out: string[], tzOut: string[]) {
  const text = ics.replace(/\r?\n[ \t]/g, '');
  for (const tz of text.match(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/g) || []) {
    const id = (tz.match(/TZID:([^\r\n]+)/) || [])[1];
    if (id && !tzSeen.has(id)) { tzSeen.add(id); tzOut.push(tz.replace(/\r?\n/g, '\r\n')); }
  }
  for (const ev of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
    const title = unesc(((ev.match(/\nSUMMARY[^:\n]*:([^\r\n]*)/) || [])[1] || '').trim());
    const rule = rules.find((r) => new RegExp(r.m, 'i').test(title)); if (!rule) continue;
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

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') || '';
  const { data: k } = await admin.from('kid_links').select('owner,name,reminders,pings,cal_rules').eq('token', token).maybeSingle();
  if (!k || token.length < 20) return new Response('Not found', { status: 404 });
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', day = ymd(now);
  const yest = ymd(new Date(now.getTime() - 86400000)), horizon = ymd(new Date(now.getTime() + 150 * 86400000));
  const events: string[] = [], tzs: string[] = [], tzSeen = new Set([TZID]);
  (k.reminders || []).forEach((r: { t: string; at: string }, i: number) => {
    const hm = String(r.at || '08:00').replace(':', '').slice(0, 4);
    events.push('BEGIN:VEVENT', 'UID:kidrem-' + token.slice(0, 10) + '-' + i + '@family-planner', 'DTSTAMP:' + stamp, 'DTSTART;TZID=' + TZID + ':' + day + 'T' + hm + '00',
      'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:' + esc(r.t), 'TRANSP:TRANSPARENT', ...alarm(r.t, 'PT0M'), 'END:VEVENT');
  });
  (k.pings || []).filter((p: { date: string }) => p.date.replace(/-/g, '') >= yest).forEach((p: { id: string; t: string; date: string; at?: string; from?: string }) => {
    const d = p.date.replace(/-/g, ''), title = p.t + (p.from ? ' (from ' + p.from + ')' : '');
    events.push('BEGIN:VEVENT', 'UID:ping-' + p.id + '@family-planner', 'DTSTAMP:' + stamp,
      ...(p.at ? ['DTSTART;TZID=' + TZID + ':' + d + 'T' + p.at.replace(':', '') + '00', 'DURATION:PT30M', 'SUMMARY:' + esc(title), ...alarm(title, '-PT30M'), ...alarm(title, 'PT0M')]
        : ['DTSTART;VALUE=DATE:' + d, 'DURATION:P1D', 'SUMMARY:' + esc(title), ...alarm(title, 'PT7H')]), 'END:VEVENT');
  });
  if ((k.cal_rules || []).length) {
    const { data: st } = await admin.from('planner_settings').select('data').eq('owner', k.owner).maybeSingle();
    const cals = ((st?.data?.settings?.calendars) || []).filter((c: { on?: boolean; url?: string }) => c.on !== false && c.url);
    const feeds = await Promise.all(cals.map((c: { url: string }) => fetch(c.url.replace(/^webcal:/, 'https:')).then((r) => r.ok ? r.text() : '').catch(() => '')));
    feeds.forEach((ics) => matching(ics, k.cal_rules, day, horizon, tzSeen, events, tzs));
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Planner//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(k.name + '’s reminders'),
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', TZ, ...tzs, ...events, 'END:VCALENDAR'];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + k.name.toLowerCase() + '-reminders.ics"', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
});
