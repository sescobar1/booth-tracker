// Sends a phone notification to Shaana when Salvador, Eli or Cece add something with their family link.
// Also sends a test notification when Shaana (signed in) asks for one from the Planner.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sendTo(owner: string, payload: Record<string, unknown>) {
  const { data: keys } = await admin.from('app_secrets').select('name,value').in('name', ['vapid_public', 'vapid_private']);
  const k = Object.fromEntries((keys || []).map((r) => [r.name, r.value]));
  webpush.setVapidDetails('mailto:planner@sescobar1.github.io', k.vapid_public, k.vapid_private);
  const { data: subs } = await admin.from('push_subs').select('endpoint,sub').eq('owner', owner);
  let sent = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 86400 }); sent++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    if (body.test) {
      const auth = req.headers.get('Authorization') || '';
      const { data: { user } } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      if (!user) return json({ error: 'Sign in first.' }, 401);
      const sent = await sendTo(user.id, { title: '🔔 Planner alerts are on', body: 'You’ll get a message here when Salvador, Eli or Cece add something.', url: './#today' });
      return json({ sent });
    }
    const { data: link } = await admin.from('kid_links').select('owner,name').eq('token', String(body.token || '')).maybeSingle();
    if (!link) return json({ error: 'bad link' }, 403);
    const { data: act } = await admin.from('kid_activity').select('id,kind,title,pushed').eq('id', String(body.activity || '')).eq('owner', link.owner).eq('who', link.name).maybeSingle();
    if (!act || act.pushed) return json({ sent: 0 });
    await admin.from('kid_activity').update({ pushed: true }).eq('id', act.id);
    const sent = await sendTo(link.owner, {
      title: act.kind === 'event' ? '📅 ' + link.name + ' added to the calendar' : '🛒 ' + link.name + ' added to the shopping list',
      body: act.title, url: act.kind === 'event' ? './#today' : './#meals/shop', tag: 'kid-' + act.id,
    });
    return json({ sent });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
