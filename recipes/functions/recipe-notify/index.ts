// Phone alert to the cookbook owner when family post on the message board or add, change or delete a recipe.
// Called only by the database (triggers on family_recipe_posts and family_recipes), which signs each call
// with the recipe_hook secret. Alerts go to the same phones as Planner alerts (push_subs).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const { data: keys } = await admin.from('app_secrets').select('name,value').in('name', ['vapid_public', 'vapid_private', 'recipe_hook']);
    const k = Object.fromEntries((keys || []).map((r) => [r.name, r.value]));
    if (!k.recipe_hook || req.headers.get('x-hook') !== k.recipe_hook) return json({ error: 'not allowed' }, 403);
    const { owner, title, body, url, tag } = await req.json();
    webpush.setVapidDetails('mailto:planner@sescobar1.github.io', k.vapid_public, k.vapid_private);
    const { data: subs } = await admin.from('push_subs').select('endpoint,sub').eq('owner', owner);
    let sent = 0;
    for (const s of subs || []) {
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body, url, tag }), { TTL: 86400 }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
    }
    return json({ sent });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
