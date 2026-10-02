// Phone-first features: quick add, receipts, backup, Relic import, restock,
// to-do reminders, reports, mileage, and offline app support.
(function () {
  const $ = id => document.getElementById(id);
  const RENT = { L19: 80, W2: 40, FC: 20, C4: 400 };
  const RENT_TOTAL = Object.values(RENT).reduce((a, b) => a + b, 0);
  const DAY = 864e5;

  data.settings = Object.assign({ rentDay: 1, relicEvery: 7, mileRate: 0.7 }, data.settings || {});
  data.mileage = data.mileage || [];

  // ---------- small helpers ----------
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayIso = () => isoLocal(new Date());
  const monthOf = iso => { const [y, m] = iso.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
  const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / DAY) : Infinity;
  const nice = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const boothFor = name => data.boothRules[groupKey(name)] || guessBooth(name);
  const code = b => String(b || '').split(' ')[0];

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  async function shareOrDownload(file, preferShare) {
    if (preferShare && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  function saveDocs(item, files, kind, note) {
    if (!files || !files.length) return Promise.resolve();
    const added = todayIso();
    return docTx('readwrite', s => {
      for (const f of files) s.put({ id: newId(), item, kind, note: note || '', name: f.name || 'receipt.jpg', type: f.type, size: f.size, added, blob: f });
    }).then(loadDocs).catch(() => toast('The receipt photo could not be saved.'));
  }

  // ---------- navigation: bottom tabs, More sheet, [data-go] links ----------
  const icons = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    sold: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    buy: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
    stock: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
  };
  const svg = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const tabs = [['dashboard', 'Home', 'home'], ['sales', 'Sold', 'sold'], ['purchases', 'Bought', 'buy'], ['inventory', 'Stock', 'stock'], ['more', 'More', 'more']];
  const bottom = document.createElement('div');
  bottom.className = 'bottom-nav'; bottom.setAttribute('role', 'navigation'); bottom.setAttribute('aria-label', 'Main');
  bottom.innerHTML = tabs.map(([p, l, i]) => '<button type="button" data-nav="' + p + '">' + svg(icons[i]) + '<span>' + l + '</span></button>').join('');
  document.body.appendChild(bottom);

  const fab = document.createElement('button');
  fab.className = 'fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Quick add a sale or purchase'); fab.textContent = '+';
  document.body.appendChild(fab);

  document.body.insertAdjacentHTML('beforeend',
    '<dialog class="sheet" id="moreSheet" aria-labelledby="moreTitle"><div class="sheet-head"><h2 id="moreTitle">More</h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body"><div class="more-list">' +
    [['restock', 'Restock', 'What to restock and slow movers'], ['reports', 'Reports', 'Year totals, best sellers, mileage'], ['booths', 'Booth editor', 'Move items between booths in bulk'], ['documents', 'Documents', 'Receipts and photos'], ['settings', 'Import & backup', 'Relic import, backup, reminders']]
      .map(([p, t, d]) => '<button type="button" data-go="' + p + '"><span>' + t + '<small>' + d + '</small></span><span aria-hidden="true">›</span></button>').join('') +
    '</div></div></dialog>' +
    '<dialog class="sheet" id="quickSheet" aria-labelledby="quickTitle"><form id="quickForm" method="dialog"><div class="sheet-head"><h2 id="quickTitle">Quick add</h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body">' +
    '<div class="seg" role="group" aria-label="Type"><button type="button" data-qtype="sales">Sold</button><button type="button" data-qtype="purchases">Bought</button></div>' +
    '<label>Item<input name="item" required list="itemNames" autocomplete="off" placeholder="Example: Butter squishy"></label>' +
    '<div class="sheet-row"><label><span id="qAmountLabel">Payout</span><input name="amount" required type="number" min="0" step=".01" inputmode="decimal" placeholder="0.00"></label><label>Date<input name="date" type="date" required></label></div>' +
    '<div class="sheet-row"><label>Booth<select name="booth"></select></label><label class="q-bought">Quantity<input name="qty" type="number" min="1" value="1" inputmode="numeric"></label></div>' +
    '<label class="q-bought">Receipt photo<input name="receipt" type="file" accept="image/*,.pdf" capture="environment"></label>' +
    '<fieldset class="inv-choice q-bought" id="qInv"><legend>Add this to inventory?</legend><label><input type="radio" name="invDest" value="overall" required> Overall</label><label><input type="radio" name="invDest" value="store"> Store (Relic)</label><label><input type="radio" name="invDest" value="both"> Both</label><label><input type="radio" name="invDest" value="none"> Neither (rent, supplies, fees)</label></fieldset>' +
    '<div class="unit-preview q-bought" id="qPreview"></div>' +
    '<div class="sheet-actions"><button type="submit" class="button ghost" value="again">Save &amp; add another</button><button type="submit" class="button" value="done">Save</button></div>' +
    '</div></form></dialog>');

  function syncTabs(page) {
    document.body.dataset.page = page;
    const tab = ['dashboard', 'sales', 'purchases', 'inventory'].includes(page) ? page : 'more';
    bottom.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.nav === tab));
  }
  function go(page) {
    const b = document.querySelector('.top-nav [data-page="' + page + '"]');
    if (b) b.click();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.top-nav [data-page]').forEach(b => b.addEventListener('click', () => { syncTabs(b.dataset.page); renderExtras(); }));
  syncTabs('dashboard');

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]'), goBtn = e.target.closest('[data-go]'), close = e.target.closest('[data-close]'), quick = e.target.closest('[data-quick]');
    if (nav) { if (nav.dataset.nav === 'more') $('moreSheet').showModal(); else go(nav.dataset.nav); }
    if (goBtn) { const d = goBtn.closest('dialog'); if (d) d.close(); go(goBtn.dataset.go); }
    if (close) close.closest('dialog').close();
    if (quick) openQuick(quick.dataset.quick);
    const task = e.target.closest('[data-task]');
    if (task) runTask(task.dataset.task);
  });
  document.querySelectorAll('dialog.sheet').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // ---------- quick add ----------
  const qf = $('quickForm');
  let qType = 'sales', boothTouched = false;
  qf.booth.innerHTML = boothOptions(BOOTHS[3]);
  function setQuickType(t) {
    qType = t;
    qf.querySelectorAll('[data-qtype]').forEach(b => b.classList.toggle('on', b.dataset.qtype === t));
    qf.querySelectorAll('.q-bought').forEach(el => el.hidden = t !== 'purchases');
    $('qInv').disabled = t !== 'purchases';
    updatePreview(qf, 'qPreview');
    $('qAmountLabel').textContent = t === 'sales' ? 'Payout' : 'Total cost';
    $('quickTitle').textContent = t === 'sales' ? 'Add a sold item' : 'Add a purchase';
  }
  function openQuick(t) {
    qf.reset(); boothTouched = false;
    qf.date.value = todayIso();
    setQuickType(t || (document.querySelector('.page.active').id === 'purchases' ? 'purchases' : 'sales'));
    $('quickSheet').showModal();
    setTimeout(() => qf.item.focus(), 60);
  }
  fab.addEventListener('click', () => openQuick());
  qf.querySelectorAll('[data-qtype]').forEach(b => b.addEventListener('click', () => setQuickType(b.dataset.qtype)));
  qf.item.addEventListener('input', () => { if (!boothTouched && qf.item.value.trim()) qf.booth.value = boothFor(qf.item.value); });
  qf.booth.addEventListener('change', () => { boothTouched = true; });
  qf.addEventListener('submit', e => {
    e.preventDefault();
    const again = e.submitter && e.submitter.value === 'again';
    const item = qf.item.value.trim(), amount = Number(qf.amount.value), date = qf.date.value || todayIso(), booth = qf.booth.value;
    if (!item || !(amount >= 0)) return;
    let m = monthOf(date); if (!months.includes(m)) m = currentMonth;
    if (qType === 'sales') {
      (data.sales[m] = data.sales[m] || []).push({ item, booth, amount, date });
    } else {
      const qty = Math.max(1, Number(qf.qty.value) || 1);
      (data.purchases[m] = data.purchases[m] || []).push({ item, booth, qty, amount, date });
      addToInventory(qf.invDest.value, item, booth, qty, amount);
      saveDocs(item, [...qf.receipt.files], 'Receipt', 'Purchase ' + m + ' · ' + money(amount));
    }
    save(); render();
    toast((qType === 'sales' ? 'Sale' : 'Purchase') + ' saved to ' + m + '.');
    if (again) { const keep = qf.date.value; qf.reset(); qf.date.value = keep; setQuickType(qType); boothTouched = false; qf.item.focus(); }
    else $('quickSheet').close();
  });

  // Receipt photo on the full purchase form
  const pform = $('purchaseForm');
  pform.querySelector('.inv-choice').insertAdjacentHTML('beforebegin', '<label>Receipt photo<input name="receipt" type="file" accept="image/*,.pdf" capture="environment"></label>');
  document.addEventListener('submit', e => {
    if (e.target !== pform) return;
    const files = [...pform.receipt.files], item = pform.item.value.trim(), m = pform.month.value, amt = Number(pform.amount.value);
    if (files.length && item) setTimeout(() => saveDocs(item, files, 'Receipt', 'Purchase ' + m + ' · ' + money(amt)), 0);
  }, true);

  // Unit cost and suggested sell price while typing a purchase
  function updatePreview(form, id) {
    const qty = Math.max(1, Number(form.qty.value) || 1), amt = Number(form.amount.value), el = $(id);
    el.innerHTML = amt > 0 ? 'Unit cost <b>' + money(amt / qty) + '</b> · Suggested sell price <b>' + money(amt / qty * 2) + '</b>' : '';
  }
  ['qty', 'amount'].forEach(n => {
    qf[n].addEventListener('input', () => updatePreview(qf, 'qPreview'));
    pform[n].addEventListener('input', () => updatePreview(pform, 'purchasePreview'));
  });
  pform.addEventListener('reset', () => setTimeout(() => updatePreview(pform, 'purchasePreview'), 0));

  // Edit the quantity on any purchase line, including past months
  document.addEventListener('change', e => {
    const t = e.target; if (!t.matches('.qty-edit')) return;
    const qty = Math.max(1, Math.round(Number(t.value) || 1)), m = t.dataset.month, key = t.dataset.key;
    const edits = ((data.rowEdits.purchases = data.rowEdits.purchases || {})[m] = data.rowEdits.purchases[m] || {});
    edits[key] = { ...(edits[key] || {}), qty };
    save(); render(); toast('Quantity updated.');
  });

  // ---------- backup & restore ----------
  const blobToDataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(b); });
  async function backupNow() {
    const msg = $('backupMsg');
    msg.textContent = 'Preparing your backup…';
    try {
      const all = await docTx('readonly', s => s.getAll()).catch(() => []) || [];
      const documents = await Promise.all(all.map(async d => { const { blob, ...rest } = d; return { ...rest, dataUrl: await blobToDataUrl(blob) }; }));
      const payload = { app: 'booth-tracker', version: 1, saved: new Date().toISOString(), data: { ...data, lastBackup: todayIso() }, documents };
      const file = new File([JSON.stringify(payload)], 'booth-tracker-backup-' + todayIso() + '.json', { type: 'application/json' });
      const done = await shareOrDownload(file, true);
      if (!done) { msg.textContent = 'Backup cancelled.'; return; }
      data.lastBackup = todayIso(); save(); renderExtras();
      msg.textContent = 'Backup saved (' + fileSize(file.size) + ', ' + documents.length + ' document' + (documents.length === 1 ? '' : 's') + ').';
    } catch (e) { msg.textContent = 'The backup could not be made. Please try again.'; }
  }
  async function restoreFrom(file) {
    const msg = $('backupMsg');
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== 'booth-tracker' || !b.data) throw new Error('not a backup');
      if (!confirm('Replace everything on this device with the backup from ' + new Date(b.saved).toLocaleString() + '?')) return;
      localStorage.setItem('boothMonthlyTracker', JSON.stringify(b.data));
      const docsIn = await Promise.all((b.documents || []).map(async d => { const { dataUrl, ...rest } = d; return { ...rest, blob: await (await fetch(dataUrl)).blob() }; }));
      await docTx('readwrite', s => { s.clear(); docsIn.forEach(d => s.put(d)); });
      msg.textContent = 'Restored. Reloading…';
      setTimeout(() => location.reload(), 600);
    } catch (e) { msg.textContent = 'That file is not a Booth Tracker backup.'; }
  }
  $('backupNow').addEventListener('click', backupNow);
  $('restoreFile').addEventListener('change', e => { if (e.target.files[0]) restoreFrom(e.target.files[0]); e.target.value = ''; });

  // ---------- Relic import ----------
  function cleanName(n) {
    const s = String(n || '').replace(/\s*,?\s*SIZE\s*-.*$/i, '').replace(/\s+/g, ' ').trim(), w = s.split(' ');
    for (let k = Math.floor(w.length / 2); k > 0; k--)
      if (w.slice(0, k).join(' ').toLowerCase() === w.slice(k, 2 * k).join(' ').toLowerCase()) return [...w.slice(0, k), ...w.slice(2 * k)].join(' ').replace(/[ ,]+$/, '');
    return s;
  }
  function isoDate(v) {
    if (v instanceof Date && !isNaN(v)) return isoLocal(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * DAY)).toISOString().slice(0, 10);
    const s = String(v || '').trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[1]) + '-' + pad(m[2]);
    const d = new Date(s); return s && !isNaN(d) ? isoLocal(d) : '';
  }
  const hkey = v => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  function textRows(text) {
    return text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.includes('\t') ? l.split('\t') : csvLine(l));
  }
  async function fileRows(f) {
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const book = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      return book.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(book.Sheets[n], { header: 1, defval: null, raw: true }));
    }
    return textRows(await f.text());
  }
  function importRelic(rows) {
    const msg = $('relicMsg');
    const hi = rows.findIndex(r => { const h = r.map(hkey); return (h.includes('BARCODEID') && h.includes('CURRENTSTOCK')) || (h.some(x => ['DETAIL', 'ITEMDESCRIPTION', 'ITEM', 'DESCRIPTION'].includes(x)) && h.some(x => ['PAYOUT', 'NETPAYOUT', 'NET'].includes(x))); });
    if (hi < 0) { msg.textContent = 'I could not find the Relic column headers. Include the header row (DETAIL, PAYOUT, DATE SOLD) or use the inventory export (Barcode ID, Current Stock).'; return; }
    const h = rows[hi].map(hkey), col = (...names) => h.findIndex(x => names.includes(x)), body = rows.slice(hi + 1);
    if (h.includes('BARCODEID') && h.includes('CURRENTSTOCK')) {
      const c = { sku: col('BARCODEID'), item: col('ITEMDESCRIPTION', 'DESCRIPTION', 'ITEM'), price: col('PRICE'), flag: col('ITEMFLAG'), qty: col('CURRENTSTOCK'), life: col('LIFETIMESALES'), created: col('DATECREATED') };
      const inv = body.filter(r => r[c.sku] && r[c.item]).map(r => ({ sku: String(r[c.sku]), item: String(r[c.item]).trim(), price: numberValue(r[c.price]), qty: numberValue(r[c.qty]), lifetimeSales: numberValue(r[c.life]), reorder: 0, flag: r[c.flag] || '-', created: isoDate(r[c.created]) }))
        .sort((a, b) => b.created.localeCompare(a.created) || b.sku.localeCompare(a.sku));
      if (!inv.length) { msg.textContent = 'No inventory rows found in that file.'; return; }
      const keep = data.inventory.filter(x => x.manual && !inv.some(y => groupKey(y.item) === groupKey(x.item)));
      data.inventory = [...keep, ...inv]; save(); render();
      msg.textContent = 'Store inventory updated: ' + inv.length + ' items.';
      return;
    }
    const c = { item: col('DETAIL', 'ITEMDESCRIPTION', 'ITEM', 'DESCRIPTION'), pay: col('PAYOUT', 'NETPAYOUT', 'NET'), date: col('DATESOLD', 'DATE', 'SOLDDATE'), status: col('STATUS') };
    const incoming = {}; let skippedStatus = 0, outside = 0;
    for (const r of body) {
      const item = cleanName(r[c.item]), amount = Math.round(numberValue(r[c.pay]) * 100) / 100, date = c.date >= 0 ? isoDate(r[c.date]) : '';
      if (!item || !(amount > 0) || /^total/i.test(item)) continue;
      if (c.status >= 0 && /refund|void|cancel/i.test(String(r[c.status] || ''))) { skippedStatus++; continue; }
      const m = date ? monthOf(date) : currentMonth;
      if (!months.includes(m)) { outside++; continue; }
      (incoming[m] = incoming[m] || []).push({ item, amount, date, booth: 'Unassigned' });
    }
    let added = 0, dupes = 0; const perMonth = [];
    for (const [m, list] of Object.entries(incoming)) {
      const have = {};
      allRows('sales', m).forEach(x => { const k = (x.date || '') + '|' + groupKey(x.item) + '|' + x.amount.toFixed(2); have[k] = (have[k] || 0) + 1; });
      const fresh = list.filter(x => { const k = x.date + '|' + groupKey(x.item) + '|' + x.amount.toFixed(2); if (have[k]) { have[k]--; dupes++; return false; } return true; });
      if (fresh.length) { (data.sales[m] = data.sales[m] || []).push(...fresh); perMonth.push(m + ': ' + fresh.length); added += fresh.length; }
    }
    data.lastRelicImport = todayIso(); save(); render();
    msg.textContent = (added ? 'Added ' + added + ' new sale' + (added === 1 ? '' : 's') + ' (' + perMonth.join(', ') + ').' : 'No new sales to add.') +
      (dupes ? ' Skipped ' + dupes + ' already in the tracker.' : '') + (skippedStatus ? ' Skipped ' + skippedStatus + ' refunds.' : '') + (outside ? ' ' + outside + ' rows were outside the tracker\'s months.' : '');
    if (added) toast(added + ' Relic sales imported.');
  }
  $('relicFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    $('relicMsg').textContent = 'Reading ' + f.name + '…';
    try { importRelic(await fileRows(f)); } catch (err) { $('relicMsg').textContent = 'That file could not be read. Try the CSV export, or paste the rows below.'; }
  });
  $('relicPasteBtn').addEventListener('click', () => { const t = $('relicPaste').value; if (t.trim()) { importRelic(textRows(t)); $('relicPaste').value = ''; } });

  // ---------- restock ----------
  function restockData() {
    const since = isoLocal(new Date(Date.now() - 30 * DAY)), sold30 = {};
    for (const m of months) for (const x of allRows('sales', m)) if (x.date && x.date >= since) { const k = groupKey(x.item); sold30[k] = (sold30[k] || 0) + 1; }
    const need = [], slow = [];
    for (const x of data.inventory) {
      const s30 = sold30[groupKey(x.item)] || 0;
      let status = '';
      // Only flag repeat sellers; a sold-out one-of-a-kind thrift find is not a restock.
      if (x.qty <= 0 && (x.lifetimeSales >= 2 || s30 >= 2)) status = 'out';
      else if (x.qty > 0 && s30 >= 2 && s30 >= x.qty) status = 'low';
      else if (x.qty > 0 && x.qty <= 2 && x.lifetimeSales >= 3) status = 'low';
      if (status) need.push({ ...x, s30, status });
      if (x.qty > 0 && !x.lifetimeSales && x.created && daysSince(x.created) >= 60) slow.push(x);
    }
    need.sort((a, b) => (a.status === 'out' ? 0 : 1) - (b.status === 'out' ? 0 : 1) || b.s30 - a.s30 || b.lifetimeSales - a.lifetimeSales);
    slow.sort((a, b) => a.created.localeCompare(b.created));
    return { need, slow };
  }
  const tagHtml = x => x.status === 'out' ? '<span class="tag out">Out — restock</span>' : '<span class="tag low">Running low</span>';
  function renderRestock() {
    const { need, slow } = restockData();
    $('restockRows').innerHTML = !data.inventory.length ? '<tr><td colspan="5" class="empty">Import your Relic inventory to see what needs restocking.</td></tr>' :
      need.length ? need.map(x => '<tr><td>' + esc(x.item) + '</td><td>' + esc(code(boothFor(x.item))) + '</td><td class="num">' + x.qty + '</td><td class="num">' + x.s30 + '</td><td>' + tagHtml(x) + '</td></tr>').join('') :
      '<tr><td colspan="5" class="empty">Nothing needs restocking right now.</td></tr>';
    $('slowRows').innerHTML = slow.length ? slow.map(x => '<tr><td>' + esc(x.item) + '</td><td>' + esc(code(boothFor(x.item))) + '</td><td class="num">' + money(x.price) + '</td><td class="num">' + x.qty + '</td><td>' + esc(x.created) + '</td></tr>').join('') :
      '<tr><td colspan="5" class="empty">No slow movers yet.</td></tr>';
    $('dashRestock').innerHTML = need.length ? need.slice(0, 5).map(x => '<div class="restock-mini"><span>' + esc(x.item) + ' <small class="helper">· ' + esc(code(boothFor(x.item))) + ' · ' + x.qty + ' left</small></span>' + tagHtml(x) + '</div>').join('') +
      (need.length > 5 ? '<button type="button" class="link" data-go="restock">See all ' + need.length + '</button>' : '') : '<p class="helper" style="margin:0">Nothing needs restocking right now.</p>';
    return need;
  }

  // ---------- to-do & reminders ----------
  function nextRentDue() {
    const day = Math.min(28, Math.max(1, Number(data.settings.rentDay) || 1)), now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let d = new Date(t.getFullYear(), t.getMonth(), day);
    if (d < t) d = new Date(t.getFullYear(), t.getMonth() + 1, day);
    return { iso: isoLocal(d), days: Math.round((d - t) / DAY) };
  }
  function renderTodo(need) {
    const items = [], rent = nextRentDue(), relicAge = daysSince(data.lastRelicImport), backupAge = daysSince(data.lastBackup);
    if (rent.days <= 7) items.push(['Booth rent ' + money(RENT_TOTAL) + ' due ' + nice(rent.iso), rent.days === 0 ? 'Due today' : 'In ' + rent.days + ' day' + (rent.days === 1 ? '' : 's'), 'rentCal', 'Add to calendar']);
    if (relicAge >= (Number(data.settings.relicEvery) || 7)) items.push(['Import your latest Relic sales', data.lastRelicImport ? 'Last import ' + relicAge + ' days ago' : 'Not imported here yet', 'relic', 'Import']);
    if (backupAge >= 7) items.push(['Back up your data', data.lastBackup ? 'Last backup ' + backupAge + ' days ago' : 'No backup yet — your data lives only on this device', 'backup', 'Back up']);
    if (need.length) items.push([need.length + ' item' + (need.length === 1 ? '' : 's') + ' to restock', need.filter(x => x.status === 'out').length + ' out of stock', 'restock', 'View']);
    $('todo').innerHTML = '<section class="todo" aria-labelledby="todoTitle"><h3 id="todoTitle">To do</h3>' + (items.length ?
      items.map(([t, s, task, btn]) => '<div class="todo-item"><div><b>' + esc(t) + '</b><small>' + esc(s) + '</small></div><button type="button" class="button" data-task="' + task + '">' + btn + '</button></div>').join('') :
      '<div class="todo-done">You\'re all caught up.</div>') + '</section>';
  }
  function runTask(t) {
    if (t === 'relic') go('settings');
    if (t === 'backup') { go('settings'); backupNow(); }
    if (t === 'restock') go('restock');
    if (t === 'rentCal') rentCalendar();
  }
  function rentCalendar() {
    const rent = nextRentDue(), d = rent.iso.replace(/-/g, ''), day = Math.min(28, Math.max(1, Number(data.settings.rentDay) || 1));
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Booth Tracker//EN', 'BEGIN:VEVENT', 'UID:booth-rent-' + d + '@booth-tracker', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;VALUE=DATE:' + d, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + day, 'SUMMARY:Booth rent due (' + money(RENT_TOTAL) + ')',
      'DESCRIPTION:L19 $80\\, W2 $40\\, FC $20\\, C4 $400', 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Booth rent due tomorrow', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    shareOrDownload(new File([ics], 'booth-rent-reminder.ics', { type: 'text/calendar' }), false);
  }
  $('rentCalendar').addEventListener('click', rentCalendar);
  $('rentDay').value = data.settings.rentDay; $('relicEvery').value = data.settings.relicEvery;
  $('rentDay').addEventListener('change', e => { data.settings.rentDay = Math.min(28, Math.max(1, Number(e.target.value) || 1)); e.target.value = data.settings.rentDay; save(); renderExtras(); });
  $('relicEvery').addEventListener('change', e => { data.settings.relicEvery = Math.max(1, Number(e.target.value) || 7); e.target.value = data.settings.relicEvery; save(); renderExtras(); });

  function renderBackupStatus() {
    $('backupStatus').textContent = data.lastBackup ? 'Last backup: ' + nice(data.lastBackup) + ' (' + daysSince(data.lastBackup) + ' days ago).' : 'You have not made a backup yet.';
  }

  // ---------- reports ----------
  const years = [...new Set(months.map(m => m.split(' ')[1]))];
  $('repYear').innerHTML = years.map(y => '<option>' + y + '</option>').join('');
  $('repYear').value = String(new Date().getFullYear());
  if (!$('repYear').value) $('repYear').value = years[0];
  $('repYear').addEventListener('change', renderReports);
  $('bestPeriod').addEventListener('change', renderReports);

  function yearData(y) {
    const ms = months.filter(m => m.endsWith(' ' + y)).reverse(), booths = {};
    Object.keys(RENT).forEach(c => booths[c] = { sales: 0, buy: 0, rent: 0 });
    const tot = { sales: 0, work: 0, buy: 0, rent: 0, other: 0 }, perMonth = [];
    for (const m of ms) {
      const { st, o } = boothStats(m); let ms_ = 0, mc = 0;
      for (const c in st) { booths[c].sales += st[c].sales; booths[c].buy += st[c].buy; booths[c].rent += st[c].rent; tot.sales += st[c].sales; tot.buy += st[c].buy; tot.rent += st[c].rent; ms_ += st[c].sales; mc += st[c].buy + st[c].rent; }
      tot.work += o.work; tot.sales += o.unSales; tot.other += o.unBuy; ms_ += o.work + o.unSales; mc += o.unBuy;
      perMonth.push([m, ms_, mc]);
    }
    const miles = data.mileage.filter(t => t.date.startsWith(y)), mileDed = miles.reduce((t, x) => t + x.miles * x.rate, 0);
    return { ms, booths, tot, perMonth, miles, mileDed };
  }
  function renderReports() {
    if (!$('reports').classList.contains('active')) return;
    const y = $('repYear').value, d = yearData(y), t = d.tot, costs = t.buy + t.other + t.rent, profit = t.sales + t.work - costs;
    const card = (l, v, cls) => '<div class="card"><div class="label">' + l + '</div><div class="value ' + (cls || '') + '">' + v + '</div></div>';
    $('yearSummary').innerHTML = '<div class="year-cards">' + card(y + ' sales', money(t.sales)) + card('Purchases', money(t.buy + t.other)) + card('Booth rent', money(t.rent)) + card('Profit', money(profit), profit < 0 ? 'inventory-low' : 'green') + '</div>' +
      '<div class="year-cards">' + card('Work income', money(t.work)) + card('Mileage deduction', money(d.mileDed)) + card('Profit after mileage', money(profit - d.mileDed), profit - d.mileDed < 0 ? 'inventory-low' : 'green') + card('Months', d.ms.length) + '</div>' +
      '<div class="panel summary"><h3>By booth — ' + y + '</h3><div class="scroll"><table><thead><tr><th>Booth</th><th class="num">Sales</th><th class="num">Purchases</th><th class="num">Rent</th><th class="num">Profit</th></tr></thead><tbody>' +
      Object.entries(d.booths).map(([c, s]) => { const p = s.sales - s.buy - s.rent; return '<tr><td>' + c + '</td><td class="num">' + money(s.sales) + '</td><td class="num">' + money(s.buy) + '</td><td class="num">' + money(s.rent) + '</td><td class="num ' + (p < 0 ? 'inventory-low' : 'green') + '">' + money(p) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><div class="panel summary"><h3>By month — ' + y + '</h3><div class="scroll"><table><thead><tr><th>Month</th><th class="num">Income</th><th class="num">Costs</th><th class="num">Profit</th></tr></thead><tbody>' +
      d.perMonth.map(([m, s, c]) => '<tr><td>' + m + '</td><td class="num">' + money(s) + '</td><td class="num">' + money(c) + '</td><td class="num ' + (s - c < 0 ? 'inventory-low' : 'green') + '">' + money(s - c) + '</td></tr>').join('') + '</tbody></table></div></div>';
    // best sellers
    const n = Number($('bestPeriod').value), start = months.indexOf(currentMonth), span = n ? months.slice(start, start + n) : months.slice(start), best = {};
    for (const m of span) for (const x of allRows('sales', m)) {
      const c = code(x.booth); if (!RENT[c]) continue;
      const k = groupKey(x.item), g = ((best[c] = best[c] || {})[k] = best[c][k] || { name: x.item, n: 0, amt: 0 }); g.n++; g.amt += x.amount;
    }
    $('bestSellers').innerHTML = Object.keys(RENT).map(c => { const top = Object.values(best[c] || {}).sort((a, b) => b.amt - a.amt).slice(0, 5);
      return '<div class="best-card"><h4>' + c + '</h4>' + (top.length ? '<ol>' + top.map(g => '<li>' + esc(g.name) + ' <span>' + g.n + ' · ' + money(g.amt) + '</span></li>').join('') + '</ol>' : '<p class="helper" style="margin:0">No sales in this period.</p>') + '</div>'; }).join('');
    // mileage
    $('mileTotal').textContent = money(d.mileDed);
    $('mileRows').innerHTML = d.miles.length ? d.miles.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.purpose) + '</td><td class="num">' + x.miles + '</td><td class="num">' + money(x.miles * x.rate) + '</td><td><button type="button" class="del mile-del" data-id="' + x.id + '">Delete</button></td></tr>').join('') :
      '<tr><td colspan="5" class="empty">No trips logged for ' + y + '.</td></tr>';
  }
  const mf = $('mileForm');
  mf.date.value = todayIso(); $('mileRate').value = data.settings.mileRate;
  mf.addEventListener('submit', e => {
    e.preventDefault();
    const rate = Number(mf.rate.value) || data.settings.mileRate;
    data.settings.mileRate = rate;
    data.mileage.push({ id: newId(), date: mf.date.value, purpose: mf.purpose.value.trim(), miles: Number(mf.miles.value) || 0, rate });
    save(); mf.purpose.value = ''; mf.miles.value = ''; renderReports(); toast('Trip added.');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.mile-del'); if (!b) return;
    const x = data.mileage.find(t => t.id === b.dataset.id);
    if (x && confirm('Delete the ' + x.miles + '-mile trip on ' + x.date + '?')) { data.mileage = data.mileage.filter(t => t !== x); save(); renderReports(); }
  });
  $('exportYear').addEventListener('click', () => {
    const y = $('repYear').value, q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', lines = [['Date', 'Month', 'Type', 'Item', 'Booth', 'Quantity', 'Amount'].map(q).join(',')];
    for (const m of months.filter(m => m.endsWith(' ' + y)).reverse()) {
      for (const x of allRows('purchases', m)) lines.push([x.date || '', m, /booth rent|gallery rent/i.test(x.item) ? 'Rent' : 'Purchase', x.item, x.booth, x.qty || 1, (-x.amount).toFixed(2)].map(q).join(','));
      for (const x of allRows('sales', m)) lines.push([x.date || '', m, x.booth === 'Work income' ? 'Work income' : 'Sale', x.item, x.booth, 1, x.amount.toFixed(2)].map(q).join(','));
    }
    const miles = data.mileage.filter(t => t.date.startsWith(y));
    if (miles.length) { lines.push('', ['Date', 'Trip', 'Miles', 'Rate', 'Deduction'].map(q).join(',')); miles.forEach(t => lines.push([t.date, t.purpose, t.miles, t.rate, (t.miles * t.rate).toFixed(2)].map(q).join(','))); }
    shareOrDownload(new File([lines.join('\r\n')], 'booth-tracker-' + y + '.csv', { type: 'text/csv' }), true);
  });
  $('printYear').addEventListener('click', () => window.print());

  // ---------- render hook ----------
  function renderExtras() {
    const need = renderRestock();
    renderTodo(need);
    renderBackupStatus();
    renderReports();
  }
  const baseRender = window.render;
  window.render = function () { baseRender(); renderExtras(); };
  renderExtras();

  // ---------- offline / home-screen app ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
