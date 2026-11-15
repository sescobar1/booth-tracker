// Phone alert to Shaana when a student sends an SNA Snack Closet request (pickup order or "something's out").
// Called by the student page right after it sends; it only alerts for requests from the last few minutes that haven't alerted yet.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const token = String(body.token || '');
    if (token.length < 20) return json({ error: 'bad link' }, 403);
    const { data: owners } = await admin.from('planner_settings').select('owner').eq('data->settings->>snaToken', token).limit(1);
    const owner = owners && owners[0] && owners[0].owner;
    if (!owner) return json({ error: 'bad link' }, 403);
    const since = new Date(Date.now() - 5 * 60000).toISOString();
    const { data: reqs } = await admin.from('sna_requests').select('id,name,lines,store,pickup_date').eq('owner', owner).eq('pushed', false).gte('created_at', since).limit(5);
    if (!reqs || !reqs.length) return json({ sent: 0 });
    await admin.from('sna_requests').update({ pushed: true }).in('id', reqs.map((r) => r.id));
    const { data: keys } = await admin.from('app_secrets').select('name,value').in('name', ['vapid_public', 'vapid_private']);
    const k = Object.fromEntries((keys || []).map((r) => [r.name, r.value]));
    webpush.setVapidDetails('mailto:planner@sescobar1.github.io', k.vapid_public, k.vapid_private);
    const { data: subs } = await admin.from('push_subs').select('endpoint,sub').eq('owner', owner);
    let sent = 0;
    for (const r of reqs) {
      const items = (r.lines || []).map((l: { name: string; qty: number }) => (l.qty > 1 ? l.qty + ' × ' : '') + l.name).join(', ');
      const payload = { title: (r.store || r.pickup_date ? '🍿 Snack order from ' : '📢 Snack closet is out – ') + (r.name || 'a student'), body: items.slice(0, 180), url: './#tasks/sna', tag: 'sna-' + r.id };
      for (const s of subs || []) {
        try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 86400 }); sent++; }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
      }
    }
    return json({ sent });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
