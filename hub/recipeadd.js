// "Add a recipe?" for a meal that doesn't have one yet: type it in, or read it from a file
// (photo of a recipe card, PDF, Word or text file). Saves into Family Recipes, the same book the Recipes app uses.
(function () {
  const SECTIONS = ['Main dishes', 'Soups & stews', 'Sides', 'Salads', 'Breakfast & brunch', 'Appetizers & snacks', 'Breads & rolls', 'Desserts', 'Cookies & bars', 'Cakes & pies', 'Drinks', 'Sauces, dips & dressings', 'Holidays', 'Other'];
  const load = (src, test) => new Promise((ok, no) => { if (test()) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('No internet for the reader')); document.head.appendChild(s); });
  const CDN = 'https://cdn.jsdelivr.net/npm/';

  // Same reader as the Recipes app: amounts and kitchen units mean ingredients, the rest are steps.
  function parseRecipe(text) {
    const all = text.split('\n').map(x => x.replace(/[|_~]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(x => x.length > 1 && /[a-z]/i.test(x));
    const out = { title: '', section: '', servings: '', prep: '', cook: '', temp: '', ingredients: [], steps: [], notes: '' };
    if (!all.length) return out;
    const AMT = /^([\d¼½¾⅓⅔⅛]+|one|two|three|four|a |an |pinch|dash|salt|pepper)/i, UNIT = /\b(cups?|c\.|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|pkg|package|cans?|sticks?|cloves?|quarts?|pints?|grams?|g|ml|eggs?|dash|pinch)\b/i;
    const HEAD_I = /^ingredients?:?$/i, HEAD_S = /^(directions|instructions|method|preparation|steps|to make)\s*:?$/i, META = /^(serves|servings|yield|makes|prep(aration)?( time)?|cook(ing)? time|bake time|total time)\b/i;
    const joined = all.join(' ');
    all.forEach(ln => { const m = ln.match(/^(?:serves|servings|yield|makes)\s*:?\s*(.{1,24})$/i); if (m && !out.servings) out.servings = m[1].trim(); });
    const m2 = joined.match(/\bprep(?:aration)?(?: time)?\s*:?\s*([\d½]+\s*(?:min(?:ute)?s?|hrs?|hours?))/i); if (m2) out.prep = m2[1];
    const m3 = joined.match(/\b(?:cook|bake)(?:ing)?(?: time)?\s*:?\s*(?:for\s*)?([\d½-]+\s*(?:min(?:ute)?s?|hrs?|hours?))/i); if (m3) out.cook = m3[1];
    const m4 = joined.match(/(?:oven|preheat)[^\d]{0,20}(\d{3})/i); if (m4) out.temp = m4[1] + '°F';
    let mode = '';
    for (const ln of all) {
      if (!out.title && !HEAD_I.test(ln) && !HEAD_S.test(ln) && !AMT.test(ln)) { out.title = ln.replace(/^recipe( for)?:?\s*/i, ''); continue; }
      if (HEAD_I.test(ln)) { mode = 'i'; continue; }
      if (HEAD_S.test(ln)) { mode = 's'; continue; }
      if (META.test(ln)) continue;
      const looksIng = (AMT.test(ln) && (UNIT.test(ln) || ln.length < 40)) || (UNIT.test(ln) && ln.length < 40);
      if (mode === 's' || (!looksIng && ln.length > 35)) out.steps.push(ln.replace(/^\d+[.)]\s*/, ''));
      else if (mode === 'i' || looksIng) out.ingredients.push(ln.replace(/^[-•*]\s*/, ''));
      else out.steps.push(ln);
    }
    out.steps = out.steps.join(' ').split(/(?<=[.!])\s+(?=[A-Z])/).map(x => x.trim()).filter(Boolean);
    return out;
  }
  const shrink = (file, max) => new Promise((ok, no) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? ok(b) : no(new Error('photo')), 'image/jpeg', 0.85); }; img.onerror = () => no(new Error('That picture could not be opened.')); img.src = u; });
  const b64 = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  async function ocr(blob, say) {
    await load(CDN + 'tesseract.js@5/dist/tesseract.min.js', () => window.Tesseract);
    const w = await Tesseract.createWorker('eng', 1, { workerPath: CDN + 'tesseract.js@5/dist/worker.min.js', corePath: CDN + 'tesseract.js-core@5', langPath: CDN + '@tesseract.js-data/eng/4.0.0_best_int', logger: m => { if (m.status === 'recognizing text') say('Reading the picture… ' + Math.round(m.progress * 100) + '%'); } });
    try { return (await w.recognize(blob)).data.text; } finally { w.terminate(); }
  }
  // File → recipe fields. Photos go to the Recipes app's reader first (it handles handwriting), then the on-phone reader.
  async function readFile(sb, file, say) {
    const name = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(heic|jpe?g|png|webp)$/.test(name)) {
      const blob = await shrink(file, 1600);
      try {
        say('Reading the recipe…');
        const { data, error } = await sb.functions.invoke('recipe-read', { body: { images: [await b64(blob)] } });
        if (!error && data && data.title !== undefined && !data.error) return { title: data.title, section: data.section, servings: data.servings, prep: data.prep, cook: data.cook, temp: data.temp, ingredients: data.ingredients || [], steps: data.steps || [], notes: data.notes || '' };
      } catch (e) {}
      return parseRecipe(await ocr(blob, say));
    }
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
      say('Reading the PDF…');
      await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', () => window.pdfjsLib);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
      for (let n = 1; n <= Math.min(pdf.numPages, 6); n++) {
        const tc = await (await pdf.getPage(n)).getTextContent(), rows = {};
        tc.items.forEach(i => { const y = Math.round(i.transform[5] / 3); (rows[y] = rows[y] || []).push(i); });
        out.push(Object.keys(rows).sort((a, b) => b - a).map(y => rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n'));
      }
      return parseRecipe(out.join('\n'));
    }
    if (/\.docx$/.test(name)) {
      say('Reading the Word file…');
      await load('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', () => window.mammoth);
      return parseRecipe((await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value);
    }
    return parseRecipe(await file.text());
  }

  // Ask, then show the form. onSaved(recipe) runs after it's in Family Recipes.
  window.askRecipe = function (sb, title, onSaved) {
    const s = document.createElement('div'); s.className = 'sheet';
    const ask = () => {
      s.innerHTML = '<div class="pane"><h2>Add a recipe for ' + esc(title) + '?</h2><p class="muted small">Then it can fill your shopping list next time you make it.</p>' +
        '<div class="acts" style="justify-content:flex-start;flex-direction:column;align-items:stretch"><label class="btn" style="text-align:center;cursor:pointer">📄 Add from a file or photo<input type="file" id="rF" accept="image/*,.pdf,.docx,.txt,text/plain,application/pdf" hidden style="display:none"></label>' +
        '<button class="ghost" id="rT">✍️ Type it in</button><button class="ghost" id="rN">Not now</button></div><p class="muted small" id="rMsg" style="margin-top:8px">Photos of recipe cards, cookbook pages, screenshots, PDFs, Word or text files — or copy a picture and press Ctrl+V (⌘V) to paste it.</p></div>';
      s.querySelector('#rN').onclick = () => s.remove();
      s.querySelector('#rT').onclick = () => form({ title, ingredients: [], steps: [] });
      const go = async f => { const say = t => { const m = s.querySelector('#rMsg'); if (m) m.textContent = t; };
        try { const r = await readFile(sb, f, say); r.title = title || r.title; form(r, true); }
        catch (err) { say('Couldn\'t read that file (' + err.message + '). Try a clearer photo, or type it in.'); } };
      s.querySelector('#rF').onchange = e => { const f = e.target.files[0]; if (f) go(f); };
      // Or paste a copied picture or screenshot (Ctrl+V / ⌘V) while this box is open.
      const onPaste = e => { if (!s.isConnected) return document.removeEventListener('paste', onPaste); if (!s.querySelector('#rF')) return; const i = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.kind === 'file' && x.type.startsWith('image/')); if (!i) return; e.preventDefault(); const b = i.getAsFile(); go(new File([b], 'pasted.' + (b.type.split('/')[1] || 'png'), { type: b.type })); };
      document.addEventListener('paste', onPaste);
    };
    const form = (r, fromFile) => {
      const sec = r.section && SECTIONS.includes(r.section) ? r.section : 'Main dishes';
      s.innerHTML = '<div class="pane"><h2>' + (fromFile ? 'Check the recipe' : 'New recipe') + '</h2>' + (fromFile ? '<p class="muted small">Fix anything the reader got wrong, then save.</p>' : '') +
        '<label class="lb">Name<input id="rTi" value="' + esc(r.title || title) + '"></label><label class="lb">Section<select id="rS">' + SECTIONS.map(x => '<option' + (x === sec ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
        '<label class="lb">Ingredients <small>(one per line)</small><textarea id="rI" rows="7" placeholder="1 lb ground beef&#10;1 can chili beans">' + esc((r.ingredients || []).join('\n')) + '</textarea></label>' +
        '<label class="lb">Directions <small>(one step per line)</small><textarea id="rD" rows="5">' + esc((r.steps || []).join('\n')) + '</textarea></label>' +
        '<div class="acts"><button class="ghost" id="rC">Cancel</button><button class="btn" id="rOK">Save recipe</button></div></div>';
      s.querySelector('#rC').onclick = () => s.remove();
      s.querySelector('#rOK').onclick = async () => {
        const row = { title: s.querySelector('#rTi').value.trim() || title, category: s.querySelector('#rS').value, ingredients: s.querySelector('#rI').value.trim(), steps: s.querySelector('#rD').value.trim(),
          notes: r.notes || '', servings: r.servings || '', prep_time: r.prep || '', cook_time: r.cook || '', oven_temp: r.temp || '', from_who: '' };
        const b = s.querySelector('#rOK'); b.disabled = true; b.textContent = 'Saving…';
        const { error } = await sb.from('family_recipes').insert(row);
        if (error) { b.disabled = false; b.textContent = 'Save recipe'; return alert('Couldn\'t save: ' + error.message); }
        s.remove(); onSaved && onSaved({ title: row.title, src: 'Family Recipes', ing: row.ingredients.split('\n').map(x => x.trim()).filter(Boolean) });
      };
    };
    s.onclick = e => { if (e.target === s) s.remove(); };
    document.body.appendChild(s); ask();
  };
})();
