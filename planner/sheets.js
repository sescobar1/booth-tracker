// Printable fridge pages for one week (Monday through Sunday) (Calendar → 🖨️ Printable pages):
//  - "This Week": each day's events and to-dos, breakfast/lunch/dinner, the week's to-dos, the shopping list and week notes.
//  - "Our Week": a column for each person in the family with their times, plus each day's to-dos and dinner.
// Both pages leave out bills and the period tracker, since they're meant to hang on the fridge.
// Loaded before app.js; everything here runs only when the #sheet page opens, so app.js helpers are ready by then.
const SHEET_DAYS = 7;
// The Monday that starts the week a day is in (a Sunday belongs to the week before it).
const sheetMonday = d => addDays(weekStart(addDays(d, -1)), 1);
const SHEET_PEOPLE = [['Shaana', 'Shaana'], ['Salvador', 'Salvador'], ['Eli', 'Elisha'], ['Cece', 'Cece']];
// Used until the family links' own rules load (same as what the links had in Nov 2026).
const SHEET_RULES_FALLBACK = {
  Eli: { show_rx: '(^|[^a-z])(eli|elisha)([^a-z]|$)|music|concert|recital', show_days: [{ m: 'football|(^|[^a-z])vs\\.?([^a-z]|$)', dow: [6] }] },
  Cece: { show_rx: '(^|[^a-z])(cece|cecilia|cc)([^a-z]|$)', show_days: [] }
};
// Shaana's own work days ("Work in Conway", "I work") are hers, even though Cece's link also shows them.
const SHEET_MINE = /shaana|(^|[^a-z])i work|^\s*work (in|at) /i;
const SHEET_SALVADOR = /(^|[^a-z])salva/i;

function sheetRules() {
  const got = cache.get('sheetRules');
  if (!sheetRules.loading && signedIn() && client()) {
    sheetRules.loading = true;
    client().from('kid_links').select('name,show_rx,show_days').then(({ data: rows }) => {
      if (!rows) return;
      const r = {}; rows.forEach(k => { r[k.name] = { show_rx: k.show_rx || '', show_days: k.show_days || [] }; });
      const changed = JSON.stringify(r) !== JSON.stringify(got);
      cache.set('sheetRules', r);
      if (changed && location.hash.startsWith('#sheet')) viewSheet();
    }, () => {});
  }
  return got || SHEET_RULES_FALLBACK;
}
const sheetRx = s => { try { return s ? new RegExp(s, 'i') : null; } catch (e) { return null; } };
// Whose column an entry goes in. "Everyone" events go with the day's to-dos instead of in every column.
function sheetWho(e, rules) {
  if (e.who === 'everyone') return ['everyone'];
  if (e.who && SHEET_PEOPLE.some(p => p[0] === e.who)) return [e.who];
  const t = (e.title || '') + ' ' + (e.list || ''), dow = new Date(e.date + 'T12:00').getDay(), hits = [];
  if (SHEET_SALVADOR.test(e.title || '')) hits.push('Salvador');
  ['Eli', 'Cece'].forEach(k => {
    const r = rules[k]; if (!r) return;
    if (hits.includes('Salvador') || SHEET_MINE.test(e.title || '')) return;
    const rx = sheetRx(r.show_rx);
    if ((rx && rx.test(t)) || (r.show_days || []).some(x => { const m = sheetRx(x.m); return m && m.test(e.title || '') && (x.dow || []).includes(dow); })) hits.push(k);
  });
  return hits.length ? hits : ['Shaana'];
}

const sheetEsc = s => esc(s);
const sheetTime = e => e.kind === 'task' || e.allDay ? '' : fmtTime(e.start);
const sheetMD = d => { const x = new Date(d + 'T12:00'); return (x.getMonth() + 1) + '/' + x.getDate(); };
const sheetDay = d => new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'long' });
const sheetRange = ws => { const f = d => new Date(d + 'T12:00').toLocaleDateString([], { month: 'long', day: 'numeric' }); return f(ws) + ' – ' + f(addDays(ws, SHEET_DAYS - 1)); };
// A short list that fits its box, with "+2 more" when it doesn't.
const sheetFit = (lines, max) => lines.length > max ? lines.slice(0, max - 1).concat('<div class="ws-more">+' + (lines.length - max + 1) + ' more</div>') : lines;
const sheetLine = (e, chip) => '<div class="ws-l' + (e.done ? ' done' : '') + (chip ? ' ws-chip' : '') + '">' + (e.kind === 'task' ? '<span class="ws-box">' + (e.done ? '✓' : '') + '</span>' : '') +
  (sheetTime(e) ? '<b>' + esc(sheetTime(e)) + '</b> ' : '') + esc(e.title) + '</div>';

function sheetEntries(ws) {
  // Bills and the period tracker stay off the fridge.
  return agenda(ws, addDays(ws, SHEET_DAYS - 1)).filter(e => e.src !== 'bill' && e.src !== 'period');
}
function sheetMeal(d, slot) { const m = mealsOn(d).find(x => x.list === slot); return m ? m.title : ''; }

function drawThisWeek(ws) {
  const we = addDays(ws, SHEET_DAYS - 1), list = sheetEntries(ws);
  let rows = '';
  for (let k = 0; k < SHEET_DAYS; k++) {
    const d = addDays(ws, k), es = onDay(list, d);
    rows += '<div class="ws-day' + (k % 2 ? ' alt' : '') + '"><div class="ws-dl">' + esc(sheetDay(d)) + ' <span>' + sheetMD(d) + '</span></div>' +
      sheetFit(es.map(e => sheetLine(e, e.kind === 'task')), 6).join('') + '</div>' +
      '<div class="ws-meal' + (k % 2 ? ' alt' : '') + '">' + ['Breakfast', 'Lunch', 'Dinner'].map(s => '<div class="ws-ml"><i>' + s + '</i><span>' + esc(sheetMeal(d, s)) + '</span></div>').join('') + '</div>';
  }
  const todos = data.items.filter(i => i.kind === 'task' && ((!i.done && (!i.date || i.date <= we)) || (i.done && i.date >= ws && i.date <= we)))
    .sort((a, b) => (a.done - b.done) || (b.priority || 0) - (a.priority || 0) || (a.date || '9999').localeCompare(b.date || '9999'));
  const shop = data.items.filter(i => i.kind === 'shop' && !i.done).sort((a, b) => AISLE_ORDER.indexOf(a.list || 'Other') - AISLE_ORDER.indexOf(b.list || 'Other'));
  const note = data.items.find(i => i.id === 'wnote-' + ws);
  const check = (t, done) => '<div class="ws-ck' + (done ? ' done' : '') + '"><span class="ws-box">' + (done ? '✓' : '') + '</span>' + esc(t) + '</div>';
  const blanks = n => Array.from({ length: Math.max(0, n) }, () => '<div class="ws-ck ws-blank"><span class="ws-box"></span></div>').join('');
  const td = sheetFit(todos.map(i => check(i.title, i.done)), 14), gr = sheetFit(shop.map(i => check(i.title, false)), 18);
  return '<div class="ws-page ws-this"><div class="ws-head"><h1>This week:</h1><div class="ws-range">' + esc(sheetRange(ws)) + '</div></div>' +
    '<div class="ws-grid">' +
    '<div class="ws-ch">Day</div><div class="ws-ch">Meals</div><div class="ws-side">' +
    '<div class="ws-sec"><div class="ws-ch">To-dos</div>' + td.join('') + blanks(6 - td.length) + '</div>' +
    '<div class="ws-sec"><div class="ws-ch">Groceries</div>' + gr.join('') + blanks(8 - gr.length) + '</div>' +
    '<div class="ws-sec ws-notes"><div class="ws-ch">Notes</div><div class="ws-nt">' + esc(note ? note.notes : '') + '</div></div></div>' +
    rows + '</div></div>';
}

function drawOurWeek(ws) {
  const list = sheetEntries(ws), rules = sheetRules();
  let rows = '';
  for (let k = 0; k < SHEET_DAYS; k++) {
    const d = addDays(ws, k), es = onDay(list, d), cols = {}, todo = [];
    SHEET_PEOPLE.forEach(([p]) => { cols[p] = []; });
    es.forEach(e => {
      if (e.kind === 'task') { todo.push(sheetLine(e, true)); return; }
      const who = sheetWho(e, rules);
      if (who[0] === 'everyone') todo.push('<div class="ws-l ws-chip fam">👪 ' + (sheetTime(e) ? '<b>' + esc(sheetTime(e)) + '</b> ' : '') + esc(e.title) + '</div>');
      else who.forEach(w => cols[w].push(sheetLine(e)));
    });
    const dinner = sheetMeal(d, 'Dinner');
    rows += '<div class="ws-left' + (k % 2 ? ' alt' : '') + '"><div class="ws-dl">' + esc(sheetDay(d)) + ' <span>' + sheetMD(d) + '</span></div><div class="ws-todo">' + sheetFit(todo, 4).join('') + '</div>' +
      '<div class="ws-dinner"><i>Dinner</i> ' + esc(dinner) + '</div></div>' +
      SHEET_PEOPLE.map(([p]) => '<div class="ws-pc' + (k % 2 ? ' alt' : '') + '">' + sheetFit(cols[p], 6).join('') + '</div>').join('');
  }
  return '<div class="ws-page ws-our"><div class="ws-head"><h1>Our week:</h1><div class="ws-range">' + esc(sheetRange(ws)) + '</div></div>' +
    '<div class="ws-grid ws-fam"><div class="ws-ch ws-band">Day</div>' + SHEET_PEOPLE.map(([, l]) => '<div class="ws-ch ws-band">' + esc(l) + '</div>').join('') +
    rows + '</div></div>';
}

// #sheet/week/2026-11-15 or #sheet/family/2026-11-15
function viewSheet() {
  const parts = location.hash.slice(1).split('/'), kind = parts[1] === 'family' ? 'family' : 'week';
  const ws = sheetMonday(/^\d{4}-\d{2}-\d{2}$/.test(parts[2] || '') ? parts[2] : (typeof calDay !== 'undefined' && calDay) || today());
  const go = (k, w) => { location.hash = 'sheet/' + k + '/' + w; };
  $('view').innerHTML = '<div class="no-print ws-bar">' +
    '<div class="segs viewseg"><button type="button" class="seg' + (kind === 'week' ? ' on' : '') + '" data-wk="week">This Week</button><button type="button" class="seg' + (kind === 'family' ? ' on' : '') + '" data-wk="family">Our Week</button></div>' +
    '<div class="cal-head"><button type="button" class="ghost small" id="wsPrev">‹</button><h2>' + esc(fmtDate(ws) + ' – ' + fmtDate(addDays(ws, SHEET_DAYS - 1))) + '</h2><button type="button" class="ghost small" id="wsNext">›</button></div>' +
    '<div class="row-actions center"><button type="button" class="small" id="wsPrint">🖨️ Print</button><a class="button ghost small" href="#calendar">Back to calendar</a></div>' +
    '<p class="helper">Prints on one letter-size page. To save a PDF, tap Print, then share or save from the print preview. Bills and the period tracker are left off.</p></div>' +
    '<div class="wsheet print-only">' + (kind === 'family' ? drawOurWeek(ws) : drawThisWeek(ws)) + '</div>';
  $('view').querySelectorAll('[data-wk]').forEach(b => b.onclick = () => go(b.dataset.wk, ws));
  $('wsPrev').onclick = () => go(kind, addDays(ws, -7));
  $('wsNext').onclick = () => go(kind, addDays(ws, 7));
  $('wsPrint').onclick = () => window.print();
}
