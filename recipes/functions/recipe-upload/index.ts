// Lets family (who open the cookbook with the share link, not signed in) upload recipe photos.
// Checks the share link, then hands back one-time upload slots in the recipe book owner's folder.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { token, count } = await req.json();
    const n = Math.min(Math.max(Number(count) || 1, 1), 6);
    if (typeof token !== 'string' || token.length < 20) return json({ error: 'This recipe link doesn’t work.' }, 403);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: book } = await admin.from('family_recipe_share').select('owner').eq('token', token).maybeSingle();
    if (!book) return json({ error: 'This recipe link doesn’t work.' }, 403);
    const slots = [];
    for (let i = 0; i < n; i++) {
      const path = book.owner + '/family-' + crypto.randomUUID() + '.jpg';
      const { data, error } = await admin.storage.from('recipes').createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 500);
      slots.push({ path, token: data.token });
    }
    return json({ slots });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
