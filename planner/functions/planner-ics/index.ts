// Fetches a calendar's private iCal (.ics) link for the planner, since browsers can't read those directly.
// Only signed-in users, only calendar hosts (Google, Outlook, iCloud), only https.
const ALLOWED = [/^calendar\.google\.com$/, /^outlook\.office365\.com$/, /^outlook\.live\.com$/, /^outlook\.office\.com$/, /^([a-z0-9-]+\.)*icloud\.com$/];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function allowed(raw: string): URL | null {
  try {
    const u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
    if (u.protocol !== 'https:' || u.port) return null;
    return ALLOWED.some(re => re.test(u.hostname.toLowerCase())) ? u : null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  // The gateway checked the token; make sure it belongs to a signed-in person, not just the public key.
  const auth = req.headers.get('Authorization') || '';
  const who = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' } });
  if (!who.ok) return reply(401, { error: 'Sign in first.' });
  let body: { url?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  let u = allowed(body.url || '');
  if (!u) return reply(400, { error: 'That doesn\'t look like a Google, Outlook or iCloud calendar link.' });
  // Follow a few redirects by hand so each hop stays on a calendar host.
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(u.toString(), { redirect: 'manual', headers: { 'User-Agent': 'Planner/1.0', Accept: 'text/calendar, */*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = allowed(new URL(res.headers.get('location')!, u).toString());
      if (!next) return reply(400, { error: 'The calendar link sent us somewhere unexpected.' });
      u = next; continue;
    }
    break;
  }
  if (!res || !res.ok) return reply(502, { error: 'The calendar answered ' + (res ? res.status : 'nothing') + '. Check the link is the secret/published iCal link.' });
  const text = await res.text();
  if (text.length > 8_000_000) return reply(413, { error: 'That calendar is too big.' });
  if (!/BEGIN:VCALENDAR/i.test(text)) return reply(422, { error: 'That link didn\'t return a calendar. Use the iCal (.ics) address.' });
  return new Response(text, { headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});
