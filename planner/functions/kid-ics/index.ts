// A family member's daily reminders as a calendar subscription. Each reminder repeats daily with an alarm,
// so the phone pops it up even when no app is open; edits show up when the phone refreshes the calendar.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const TZ = `BEGIN:VTIMEZONE\r\nTZID:America/Chicago\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:-0600\r\nTZOFFSETTO:-0500\r\nTZNAME:CDT\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600\r\nTZNAME:CST\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE`;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') || '';
  const { data: k } = await admin.from('kid_links').select('name,reminders').eq('token', token).maybeSingle();
  if (!k || token.length < 20) return new Response('Not found', { status: 404 });
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now).replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Planner//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(k.name + '’s reminders'), 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', TZ];
  (k.reminders || []).forEach((r: { t: string; at: string }, i: number) => {
    const hm = String(r.at || '08:00').replace(':', '').padEnd(4, '0').slice(0, 4);
    lines.push('BEGIN:VEVENT', 'UID:kidrem-' + token.slice(0, 10) + '-' + i + '@family-planner', 'DTSTAMP:' + stamp,
      'DTSTART;TZID=America/Chicago:' + day + 'T' + hm + '00', 'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:' + esc(r.t), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(r.t), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + k.name.toLowerCase() + '-reminders.ics"', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
});
