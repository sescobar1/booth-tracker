// Reads recipe photos (cards, cookbook pages, handwriting) and types them out as recipe fields.
// Needs the ANTHROPIC_API_KEY secret (Supabase → Edge Functions → Secrets). Without it, the page
// falls back to free on-phone text reading.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SECTIONS = ['Appetizers & snacks', 'Breakfast & brunch', 'Soups & stews', 'Salads', 'Main dishes', 'Sides', 'Breads & rolls', 'Desserts', 'Cookies & bars', 'Cakes & pies', 'Drinks', 'Sauces, dips & dressings', 'Holidays', 'Other'];
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'section', 'from', 'servings', 'prep', 'cook', 'temp', 'ingredients', 'steps', 'notes'],
  properties: {
    title: { type: 'string' },
    section: { type: 'string', enum: SECTIONS },
    from: { type: 'string', description: 'Whose recipe it is if written on it (e.g. "From the kitchen of Grandma"), else empty' },
    servings: { type: 'string' },
    prep: { type: 'string' },
    cook: { type: 'string' },
    temp: { type: 'string', description: 'Oven temperature like "350°F", else empty' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};
const PROMPT = `These photos show one family recipe (a handwritten or printed recipe card, a cookbook page, or a screenshot); there may be a front and back. Type it out exactly as written.
- ingredients: one item per entry with its amount, in the order written. Keep sub-headings like "Frosting:" as their own entry.
- steps: one step per entry, in order, without numbering. If the directions are one paragraph, split it into sensible steps.
- Keep the writer's words and amounts; fix only obvious spelling. If a word is unreadable, write your best guess followed by (?).
- Leave a field empty when the recipe doesn't say it. Pick the section that fits best.
- notes: anything else written on the card (tips, memories, "double for parties").`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Only the signed-in owner of a recipe book may use this (it costs a little per photo).
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Sign in first.' }, 401);
    const { data: book } = await sb.from('family_recipe_share').select('owner').maybeSingle();
    if (!book) return json({ error: 'No recipe book for this account.' }, 403);
    if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'no-key' }, 200);

    const { images } = await req.json();
    if (!Array.isArray(images) || !images.length || images.length > 4) return json({ error: 'Send 1 to 4 photos.' }, 400);
    if (images.some((b: unknown) => typeof b !== 'string' || b.length > 6_000_000)) return json({ error: 'Photo too large.' }, 400);

    const client = new Anthropic();
    const content: Anthropic.ContentBlockParam[] = images.map((data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
    content.push({ type: 'text', text: PROMPT });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    } as any) as any;
    if (msg.stop_reason === 'refusal') return json({ error: 'Couldn’t read this one. Try typing it.' }, 200);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'That recipe was too long to read in one go.' }, 200);
    const text = (msg.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return json({ recipe: JSON.parse(text) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Busy right now. Try again in a minute.' }, 200);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The reading key isn’t valid. Check ANTHROPIC_API_KEY.' }, 200);
    if (e instanceof Anthropic.APIError) return json({ error: 'Reading failed (' + e.status + ').' }, 200);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
