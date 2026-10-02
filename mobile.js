// Phone-first features: quick add, receipts, backup, Relic import, restock,
// to-do reminders, reports, mileage, and offline app support.
(function () {
  const $ = id => document.getElementById(id);
  const CFG = window.BOOTH_CONFIG || {};
  const RENT = Object.fromEntries(BOOTH_LIST.map(b => [b.code, Number(b.rent) || 0]));
  const RENT_TOTAL = Object.values(RENT).reduce((a, b) => a + b, 0);
  const DAY = 864e5;

  data.settings = Object.assign({ relicEvery: 7, mileRate: 0.7, mpg: 25, gasPrice: 2.75 }, data.settings || {});
  data.shifts = data.shifts || [];
  data.mileage = data.mileage || [];
  // Regular trips and places from the settings file; miles are one way from home.
  const DEFAULT_ROUTES = CFG.routes || [];

  data.routes = data.routes || [];
  if (!data.routesV2) {
    for (const d of DEFAULT_ROUTES) {
      const r = data.routes.find(x => x.id === d.id);
      if (!r) data.routes.push({ ...d });
      else { if (!r.days) r.days = d.days; if (d.id === 'conway' && r.name === 'Conway') r.name = d.name; if (d.id === 'pricebreak') r.detail = d.detail; }
    }
    data.routes.forEach(r => { if (!r.days) r.days = []; delete r.perWeek; });
    data.routesV2 = true;
  }
  data.mileSkips = data.mileSkips || [];
  data.amazon = data.amazon || [];

  // ---------- small helpers ----------
  // A big "take a photo" button wrapping a file input; works for camera or photo library.
  const camBtn = name => '<label class="camera-btn"><input name="' + name + '" type="file" accept="image/*,.pdf" capture="environment"><span class="cam-text">📷 Take photo of receipt</span><img class="cam-thumb" alt="Receipt preview" hidden></label>';
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayIso = () => isoLocal(new Date());
  const monthOf = iso => { const [y, m] = iso.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
  const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / DAY) : Infinity;
  const nice = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const boothFor = name => data.boothRules[groupKey(name)] || guessBooth(name);
  const code = b => String(b || '').split(' ')[0];

  function toast(msg) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
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
    car: '<path d="M5 17h14M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M4 12h16"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
  };
  const svg = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const tabs = [['dashboard', 'Home', 'home'], ['sales', 'Sold', 'sold'], ['purchases', 'Bought', 'buy'], ['mileage', 'Miles', 'car'], ['work', 'Work', 'work'], ['more', 'More', 'more']];
  const bottom = document.createElement('div');
  bottom.className = 'bottom-nav'; bottom.setAttribute('role', 'navigation'); bottom.setAttribute('aria-label', 'Main');
  bottom.innerHTML = tabs.map(([p, l, i]) => '<button type="button" data-nav="' + p + '">' + svg(icons[i]) + '<span>' + l + '</span></button>').join('');
  document.body.appendChild(bottom);

  const fab = document.createElement('button');
  fab.className = 'fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Quick add a sale or purchase'); fab.textContent = '+';
  document.body.appendChild(fab);

  document.body.insertAdjacentHTML('beforeend',
    '<dialog class="sheet" id="moreSheet" aria-labelledby="moreTitle"><div class="sheet-head"><h2 id="moreTitle">More</h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body"><div class="more-list">' +
    [['taxes', 'Taxes', 'Profit for taxes, set-aside, due dates'], ['inventory', 'Inventory', 'Overall and store stock'], ['amazon', 'Amazon orders', 'Things you order for the booth'], ['restock', 'Restock', 'What to restock and slow movers'], ['cookies', 'Cookie costs', 'Cost and profit per batch and cookie'], ['reports', 'Reports', 'Year totals and best sellers'], ['booths', 'Booth editor', 'Move items between booths in bulk'], ['documents', 'Documents', 'Receipts and photos'], ['settings', 'Import & backup', 'Relic import, backup, reminders']]
      .map(([p, t, d]) => '<button type="button" data-go="' + p + '"><span>' + t + '<small>' + d + '</small></span><span aria-hidden="true">›</span></button>').join('') +
    '</div></div></dialog>' +
    '<dialog class="sheet" id="quickSheet" aria-labelledby="quickTitle"><form id="quickForm" method="dialog"><div class="sheet-head"><h2 id="quickTitle">Quick add</h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body">' +
    '<div class="seg" role="group" aria-label="Type"><button type="button" data-qtype="sales">Sold</button><button type="button" data-qtype="purchases">Bought</button></div>' +
    '<label>Item<input name="item" required list="itemNames" autocomplete="off" placeholder="Example: Butter squishy"></label>' +
    '<div class="sheet-row"><label><span id="qAmountLabel">Payout</span><input name="amount" required type="number" min="0" step=".01" inputmode="decimal" placeholder="0.00"></label><label>Date<input name="date" type="date" required></label></div>' +
    '<div class="sheet-row"><label>Booth<select name="booth"></select></label><label class="q-bought">Quantity<input name="qty" type="number" min="1" value="1" inputmode="numeric"></label></div>' +
    '<div class="q-bought">' + camBtn('receipt') + '</div>' +
    '<label class="q-bought">Sell price each<input name="sellPrice" type="number" min="0" step=".01" inputmode="decimal" placeholder="2× cost"></label>' +
    '<fieldset class="inv-choice q-bought" id="qInv"><legend>Add this to inventory?</legend><label><input type="radio" name="invDest" value="overall" required> Overall</label><label><input type="radio" name="invDest" value="store"> Store (Relic)</label><label><input type="radio" name="invDest" value="both"> Both</label><label><input type="radio" name="invDest" value="none"> Neither (rent, supplies, fees)</label></fieldset>' +
    '<div class="unit-preview q-bought" id="qPreview"></div>' +
    '<div class="sheet-actions"><button type="submit" class="button ghost" value="again">Save &amp; add another</button><button type="submit" class="button" value="done">Save</button></div>' +
    '</div></form></dialog>');

  function syncTabs(page) {
    document.body.dataset.page = page;
    const tab = ['dashboard', 'sales', 'purchases', 'mileage', 'work'].includes(page) ? page : 'more';
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
      const sell = Number(qf.sellPrice.value) || 0, override = qf.sellPrice.dataset.touched === '1', rec = { item, booth, qty, amount, date };
      if (override && sell > 0) rec.sell = Math.round(sell * 100) / 100;
      (data.purchases[m] = data.purchases[m] || []).push(rec);
      addToInventory(qf.invDest.value, item, booth, qty, amount, sell, override);
      saveDocs(item, [...qf.receipt.files], 'Receipt', 'Purchase ' + m + ' · ' + money(amount));
    }
    save(); render();
    toast((qType === 'sales' ? 'Sale' : 'Purchase') + ' saved to ' + m + '.');
    if (again) { const keep = qf.date.value; qf.reset(); qf.date.value = keep; setQuickType(qType); boothTouched = false; qf.item.focus(); }
    else $('quickSheet').close();
  });

  // Receipt photo on the full purchase form
  const pform = $('purchaseForm');
  pform.querySelector('.inv-choice').insertAdjacentHTML('beforebegin', '<div class="cam-wrap">' + camBtn('receipt') + '</div>');
  document.addEventListener('submit', e => {
    if (e.target !== pform) return;
    const files = [...pform.receipt.files], item = pform.item.value.trim(), m = pform.month.value, amt = Number(pform.amount.value);
    if (files.length && item) setTimeout(() => saveDocs(item, files, 'Receipt', 'Purchase ' + m + ' · ' + money(amt)), 0);
  }, true);

  // Unit cost and suggested sell price while typing a purchase
  function updatePreview(form, id) {
    const qty = Math.max(1, Number(form.qty.value) || 1), amt = Number(form.amount.value), el = $(id), sp = form.sellPrice;
    el.innerHTML = amt > 0 ? 'Unit cost <b>' + money(amt / qty) + '</b> · Suggested sell price (2×) <b>' + money(amt / qty * 2) + '</b>' : '';
    // Fill in the suggestion until the price is typed over; clearing it brings the suggestion back.
    if (sp.dataset.touched !== '1') sp.value = amt > 0 ? (amt / qty * 2).toFixed(2) : '';
  }
  [qf, pform].forEach(f => {
    f.sellPrice.addEventListener('input', () => { f.sellPrice.dataset.touched = f.sellPrice.value ? '1' : ''; });
    f.addEventListener('reset', () => { f.sellPrice.dataset.touched = ''; });
  });
  ['qty', 'amount'].forEach(n => {
    qf[n].addEventListener('input', () => updatePreview(qf, 'qPreview'));
    pform[n].addEventListener('input', () => updatePreview(pform, 'purchasePreview'));
  });
  pform.addEventListener('reset', () => setTimeout(() => updatePreview(pform, 'purchasePreview'), 0));

  // Price overrides: purchase lines, overall inventory, store inventory
  document.addEventListener('change', e => {
    const t = e.target, v = Math.round((Number(t.value) || 0) * 100) / 100;
    if (t.matches('.sell-edit')) {
      const edits = ((data.rowEdits.purchases = data.rowEdits.purchases || {})[t.dataset.month] = data.rowEdits.purchases[t.dataset.month] || {});
      const cur = { ...(edits[t.dataset.key] || {}) };
      if (v > 0) cur.sell = v; else delete cur.sell;
      edits[t.dataset.key] = cur; save(); render(); toast(v > 0 ? 'Sell price set to ' + money(v) + '.' : 'Back to the suggested price.');
    } else if (t.matches('.ov-price')) {
      const x = data.overall.find(o => o.id === t.dataset.id); if (!x) return;
      if (v > 0) x.price = v; else delete x.price; save(); render();
    } else if (t.matches('.store-price')) {
      const x = data.inventory[Number(t.dataset.i)]; if (!x) return;
      x.price = v; save(); render(); toast('Store price updated.');
    }
  });

  // Edit the quantity on any purchase line, including past months
  document.addEventListener('change', e => {
    const t = e.target; if (!t.matches('.qty-edit')) return;
    const qty = Math.max(1, Math.round(Number(t.value) || 1)), m = t.dataset.month, key = t.dataset.key;
    const edits = ((data.rowEdits.purchases = data.rowEdits.purchases || {})[m] = data.rowEdits.purchases[m] || {});
    edits[key] = { ...(edits[key] || {}), qty };
    save(); render(); toast('Quantity updated.');
  });

  // ---------- receipt photos ----------
  function resetCam(root) { root.querySelectorAll('.camera-btn').forEach(l => { const img = l.querySelector('.cam-thumb'); if (img.src) URL.revokeObjectURL(img.src); img.hidden = true; img.removeAttribute('src'); l.classList.remove('has'); l.querySelector('.cam-text').textContent = '📷 Take photo of receipt'; }); }
  document.addEventListener('change', e => {
    const inp = e.target; if (!inp.closest || !inp.closest('.camera-btn')) return;
    const l = inp.closest('.camera-btn'), f = inp.files[0], img = l.querySelector('.cam-thumb');
    if (!f) { resetCam(l.parentNode); return; }
    l.classList.add('has'); l.querySelector('.cam-text').textContent = '✓ Receipt added · tap to retake';
    if (f.type.startsWith('image/')) { if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(f); img.hidden = false; }
  });
  [qf, pform].forEach(f => f.addEventListener('reset', () => resetCam(f)));
  // Snap a receipt first, then fill in the purchase.
  document.addEventListener('click', e => { if (e.target.closest('[data-snap]')) { openQuick('purchases'); qf.receipt.click(); } });
  // Add a receipt photo to any purchase line, including past months.
  document.body.insertAdjacentHTML('beforeend', '<input type="file" id="rcptInput" accept="image/*,.pdf" capture="environment" hidden>');
  let rcptFor = null;
  document.addEventListener('click', e => { const b = e.target.closest('.rcpt-add'); if (b) { rcptFor = { item: b.dataset.item, month: b.dataset.month }; $('rcptInput').click(); } });
  $('rcptInput').addEventListener('change', e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length || !rcptFor) return;
    const it = rcptFor; rcptFor = null;
    saveDocs(it.item, files, 'Receipt', 'Purchase ' + it.month).then(() => { render(); toast('Receipt saved for ' + it.item + '.'); });
  });

  // ---------- backup & restore ----------
  const blobToDataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(b); });
  async function buildBackup() {
    const all = await docTx('readonly', s => s.getAll()).catch(() => []) || [];
    const documents = await Promise.all(all.map(async d => { const { blob, ...rest } = d; return { ...rest, dataUrl: await blobToDataUrl(blob) }; }));
    const payload = { app: 'booth-tracker', version: 1, saved: new Date().toISOString(), data: { ...data, lastBackup: todayIso() }, documents };
    return { file: new File([JSON.stringify(payload)], 'booth-tracker-backup-' + todayIso() + '.json', { type: 'application/json' }), docs: documents.length };
  }
  // Phones only open the share sheet straight from a tap, so the daily backup file is
  // built ahead of time and handed over the moment Back up is tapped.
  let prepared = null, preparing = false, dataVer = 0;
  const baseSave = window.save;
  window.save = function () { baseSave(); dataVer++; prepared = null; };
  function prepareBackup() {
    if (preparing || (prepared && prepared.v === dataVer)) return;
    const v = dataVer; preparing = true;
    buildBackup().then(b => { if (v === dataVer) prepared = { v, ...b }; }).catch(() => {}).finally(() => { preparing = false; });
  }
  async function backupNow() {
    const msg = $('backupMsg');
    msg.textContent = 'Preparing your backup…';
    try {
      const b = prepared && prepared.v === dataVer ? prepared : await buildBackup();
      const done = await shareOrDownload(b.file, true);
      if (!done) { msg.textContent = 'Backup cancelled.'; return; }
      data.lastBackup = todayIso(); save(); renderExtras();
      msg.textContent = 'Backup saved (' + fileSize(b.file.size) + ', ' + b.docs + ' document' + (b.docs === 1 ? '' : 's') + ').';
      toast('Backed up. Pick OneDrive in the share menu to keep it there.');
    } catch (e) { msg.textContent = 'The backup could not be made. Please try again.'; toast('Backup did not finish. Try again.'); }
  }
  async function restoreFrom(file) {
    const msg = $('backupMsg');
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== 'booth-tracker' || !b.data) throw new Error('not a backup');
      if (!confirm('Replace everything on this device with the backup from ' + new Date(b.saved).toLocaleString() + '?')) return;
      localStorage.setItem(CFG.storageKey || 'boothMonthlyTracker', JSON.stringify(b.data));
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
  function renderTodo(need) {
    const items = [], relicAge = daysSince(data.lastRelicImport), backupAge = daysSince(data.lastBackup);
    if (relicAge >= (Number(data.settings.relicEvery) || 7)) items.push(['Import your latest Relic sales', data.lastRelicImport ? 'Last import ' + relicAge + ' days ago' : 'Not imported here yet', 'relic', 'Import']);
    if (backupAge >= 1) { items.push(['Back up to OneDrive', data.lastBackup ? 'Last backup ' + (backupAge === 1 ? 'yesterday' : backupAge + ' days ago') : 'No backup yet. Your data lives only on this phone', 'backup', 'Back up']); prepareBackup(); }
    (data.batches || []).filter(b => !b.done).forEach(b => {
      const left = Math.round((new Date(b.expires + 'T00:00:00') - new Date(todayIso() + 'T00:00:00')) / DAY);
      if (left <= 1) items.push(['Pull ' + b.name.toLowerCase() + ' made ' + nice(b.made), left < 0 ? 'Expired ' + nice(b.expires) : left === 0 ? 'They expire today' : 'They expire tomorrow', 'cookies', 'View']);
    });
    if (typeof boothReport === 'function') boothReport().filter(r => r.status[0] === 'Losing money').forEach(r => items.push([r.c + ' booth is losing money', r.status[2], 'reports', 'Review']));
    const due = typeof nextTaxDue === 'function' ? nextTaxDue() : null;
    if (due && due.est > 0 && !due.paid && due.days <= 21) items.push(['Estimated tax ' + money(due.est) + ' due ' + nice(due.due), due.q + ' ' + due.yr + ' · in ' + due.days + ' days', 'taxes', 'View']);
    if (need.length) items.push([need.length + ' item' + (need.length === 1 ? '' : 's') + ' to restock', need.filter(x => x.status === 'out').length + ' out of stock', 'restock', 'View']);
    $('todo').innerHTML = '<section class="todo" aria-labelledby="todoTitle"><h3 id="todoTitle">To do</h3>' + (items.length ?
      items.map(([t, s, task, btn]) => '<div class="todo-item"><div><b>' + esc(t) + '</b><small>' + esc(s) + '</small></div><button type="button" class="button" data-task="' + task + '">' + btn + '</button></div>').join('') :
      '<div class="todo-done">You\'re all caught up.</div>') + '</section>';
  }
  function runTask(t) {
    if (t === 'relic') go('settings');
    if (t === 'backup') backupNow();
    if (t === 'restock') go('restock');
    if (t === 'mileage') go('mileage');
    if (t === 'reports') go('reports');
    if (t === 'taxes') go('taxes');
    if (t === 'cookies') document.getElementById('dashCookies').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('relicEvery').value = data.settings.relicEvery;
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
      '<div class="year-cards">' + card('Work income', money(t.work)) + card('Mileage deduction', money(d.mileDed)) + card('Profit after mileage', money(profit - d.mileDed), profit - d.mileDed < 0 ? 'inventory-low' : 'green') + card('Gas cost (est.)', money(d.miles.reduce((t, x) => t + gasOf(x), 0))) + '</div>' +
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
  }
  // ---------- mileage ----------
  // Scheduled trips are logged automatically on their weekdays (0 = Sunday).
  // Places without a schedule are logged with one tap.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const r2 = v => Math.round(v * 100) / 100;
  const tripMiles = r => Math.round((Number(r.miles) || 0) * (r.round ? 2 : 1) * 10) / 10;
  const gasFor = miles => miles / (Number(data.settings.mpg) || 25) * (Number(data.settings.gasPrice) || 0);
  const gasOf = t => t.gas != null ? t.gas : gasFor(t.miles);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  const dow = iso => new Date(iso + 'T00:00:00').getDay();
  // IRS business standard mileage rates by start date (2026 rose mid-year). Later years use the rate set on the page.
  const IRS_RATES = [['2025-01-01', 0.70], ['2026-01-01', 0.725], ['2026-07-01', 0.76]];
  function rateFor(date) {
    if (date.slice(0, 4) > IRS_RATES[IRS_RATES.length - 1][0].slice(0, 4)) return Number(data.settings.mileRate) || 0.76;
    let r = IRS_RATES[0][1]; for (const [from, v] of IRS_RATES) if (date >= from) r = v; return r;
  }
  if (!data.irsRates2026) { data.mileage.forEach(t => { t.rate = rateFor(t.date); }); data.irsRates2026 = true; if (data.settings.mileRate === 0.7) data.settings.mileRate = 0.76; }
  function weekStart() { const d = new Date(), day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return isoLocal(d); }
  // Fill in scheduled trips from January 1 of this year (one time); the start date can be changed on the page.
  if (!data.settings.autoFromJan) { data.settings.autoFrom = CFG.mileageFromJan ? new Date().getFullYear() + '-01-01' : weekStart(); data.settings.autoFromJan = true; }
  const scheduled = () => data.routes.filter(r => r.days && r.days.length);
  const places = () => data.routes.filter(r => !r.days || !r.days.length);
  const routeLabel = r => r.name + (r.detail ? ' (' + r.detail + ')' : '');
  function tripFor(r, date, auto) {
    const miles = tripMiles(r);
    return { id: newId(), date, purpose: routeLabel(r), miles, rate: rateFor(date), gas: r2(gasFor(miles)), route: r.id, auto: !!auto };
  }
  function autoLog() {
    const from = data.settings.autoFrom, to = todayIso(), skips = new Set(data.mileSkips);
    const before = data.mileage.length;
    // Drop automatic trips that no longer match a schedule or the start date.
    data.mileage = data.mileage.filter(t => {
      if (!t.auto) return true;
      const r = data.routes.find(x => x.id === t.route);
      return r && t.date >= from && (r.days || []).includes(dow(t.date));
    });
    let changed = data.mileage.length !== before;
    const have = new Set(data.mileage.filter(t => t.route).map(t => t.route + '|' + t.date));
    for (let d = from, guard = 0; d <= to && guard < 1200; d = addDays(d, 1), guard++)
      for (const r of scheduled()) if (r.days.includes(dow(d))) {
        const k = r.id + '|' + d;
        if (!have.has(k) && !skips.has(k)) { data.mileage.push(tripFor(r, d, true)); have.add(k); changed = true; }
      }
    if (changed) save();
    return changed;
  }
  autoLog();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && autoLog()) renderExtras(); });

  $('tripDate').value = todayIso();
  $('autoFrom').value = data.settings.autoFrom;
  $('autoFrom').addEventListener('change', e => { if (e.target.value) { data.settings.autoFrom = e.target.value; autoLog(); save(); renderExtras(); toast('Scheduled trips filled in from ' + nice(e.target.value) + '.'); } });
  const myears = () => [...new Set([String(new Date().getFullYear()), ...data.mileage.map(t => t.date.slice(0, 4))])].sort().reverse();

  function renderMileage() {
    if (!$('mileage').classList.contains('active')) return;
    const ws = weekStart(), wk = data.mileage.filter(t => t.route && t.date >= ws), today = todayIso();
    const gasLine = r => tripMiles(r) + ' mi' + (r.round ? ' round trip' : '') + ' · about ' + money(gasFor(tripMiles(r))) + ' gas';
    $('routeCards').innerHTML = scheduled().length ? scheduled().map(r => {
      const n = wk.filter(t => t.route === r.id).length, goal = r.days.length;
      const dots = Array.from({ length: Math.max(goal, n) }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('');
      return '<div class="route-card"><div class="route-info"><b>' + esc(r.name) + '</b><small>' + (r.detail ? esc(r.detail) + ' · ' : '') + gasLine(r) + '</small><small class="days-line">' + r.days.slice().sort().map(d => DAYS[d]).join(' · ') + '</small>' +
        '<div class="week-dots">' + dots + '<span>' + n + ' of ' + goal + ' this week</span></div></div><button type="button" class="button ghost log-trip" data-route="' + r.id + '">+ Extra trip</button></div>';
    }).join('') : '<p class="helper">No scheduled trips. Pick days for a place below to log it automatically.</p>';
    $('placeCards').innerHTML = places().length ? places().map(r => {
      const last = data.mileage.filter(t => t.route === r.id).map(t => t.date).sort().pop();
      return '<div class="route-card"><div class="route-info"><b>' + esc(r.name) + '</b><small>' + (r.detail ? esc(r.detail) + ' · ' : '') + gasLine(r) + '</small><small class="days-line">' + (last ? 'Last trip ' + (last === today ? 'today' : nice(last)) : 'No trips yet') + '</small></div><button type="button" class="button log-trip" data-route="' + r.id + '">+ Log trip</button></div>';
    }).join('') : '<p class="helper">No places yet. Add one below.</p>';
    // summary cards
    const thisMonth = today.slice(0, 7), thisYear = today.slice(0, 4);
    [['Week', data.mileage.filter(t => t.date >= ws && t.date <= today)], ['Month', data.mileage.filter(t => t.date.startsWith(thisMonth))], ['Year', data.mileage.filter(t => t.date.startsWith(thisYear))]].forEach(([k, list]) => {
      const g = list.reduce((t, x) => t + gasOf(x), 0), mi = list.reduce((t, x) => t + x.miles, 0), d = list.reduce((t, x) => t + x.miles * x.rate, 0);
      $('mc' + k).textContent = money(g); $('mc' + k + 'Mi').textContent = Math.round(mi * 10) / 10 + ' mi · ' + money(d) + ' deduction';
    });
    // trip log
    const ys = myears(), cur = $('mileYear').value;
    $('mileYear').innerHTML = ys.map(y => '<option>' + y + '</option>').join(''); $('mileYear').value = ys.includes(cur) ? cur : ys[0];
    const y = $('mileYear').value, trips = data.mileage.filter(t => t.date.startsWith(y)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const miles = trips.reduce((t, x) => t + x.miles, 0), ded = trips.reduce((t, x) => t + x.miles * x.rate, 0);
    $('mileTotal').textContent = money(ded); $('mileGas').textContent = money(trips.reduce((t, x) => t + gasOf(x), 0));
    $('mileSummary').textContent = trips.length + ' trip' + (trips.length === 1 ? '' : 's') + ' · ' + Math.round(miles * 10) / 10 + ' miles in ' + y + '.';
    $('mileRows').innerHTML = trips.length ? trips.map(x => '<tr><td>' + esc(x.date) + '<small class="dow">' + DAYS[dow(x.date)] + '</small></td><td>' + esc(x.purpose) + (x.auto ? ' <span class="tag auto">Auto</span>' : '') + '</td><td class="num">' + x.miles + '</td><td class="num">' + money(gasOf(x)) + '</td><td class="num">' + money(x.miles * x.rate) + '</td><td><button type="button" class="del mile-del" data-id="' + x.id + '">' + (x.auto ? 'Didn\'t go' : 'Delete') + '</button></td></tr>').join('') :
      '<tr><td colspan="6" class="empty">No trips logged for ' + y + '.</td></tr>';
    // editor
    const dayBoxes = r => '<span class="day-boxes">' + DAYS.map((d, i) => '<label title="' + d + '"><input type="checkbox" class="route-edit" data-id="' + r.id + '" data-f="day" data-d="' + i + '"' + ((r.days || []).includes(i) ? ' checked' : '') + '>' + d[0] + '</label>').join('') + '</span>';
    $('routeRows').innerHTML = data.routes.map(r => '<tr><td><input class="cell-input route-edit wide" data-id="' + r.id + '" data-f="name" value="' + esc(r.name) + '" aria-label="Name"></td><td><input class="cell-input route-edit wide" data-id="' + r.id + '" data-f="detail" value="' + esc(r.detail || '') + '" aria-label="Town or route"></td><td class="num"><input class="cell-input route-edit" type="number" min="0" step=".1" inputmode="decimal" data-id="' + r.id + '" data-f="miles" value="' + r.miles + '" aria-label="Miles one way"></td><td><input type="checkbox" class="route-edit" data-id="' + r.id + '" data-f="round"' + (r.round ? ' checked' : '') + ' aria-label="Round trip"></td><td>' + dayBoxes(r) + '</td><td><button type="button" class="del route-del" data-id="' + r.id + '">Remove</button></td></tr>').join('');
  }
  $('mileYear').addEventListener('change', renderMileage);
  document.addEventListener('click', e => {
    const log = e.target.closest('.log-trip'), del = e.target.closest('.mile-del'), rdel = e.target.closest('.route-del');
    if (log) {
      const r = data.routes.find(x => x.id === log.dataset.route); if (!r) return;
      const t = tripFor(r, $('tripDate').value || todayIso(), false);
      data.mileage.push(t); save(); renderExtras(); toast('Logged ' + t.miles + ' miles · ' + r.name + ' · about ' + money(t.gas) + ' gas');
    }
    if (del) {
      const x = data.mileage.find(t => t.id === del.dataset.id); if (!x) return;
      if (confirm((x.auto ? 'Remove this automatic trip (you didn\'t go)?' : 'Delete this trip?') + '\n' + x.purpose + ' · ' + x.date)) {
        if (x.auto) data.mileSkips.push(x.route + '|' + x.date);
        data.mileage = data.mileage.filter(t => t !== x); save(); renderExtras();
      }
    }
    if (rdel) {
      const r = data.routes.find(x => x.id === rdel.dataset.id);
      if (r && confirm('Remove “' + r.name + '”? Trips you logged yourself stay in your log; automatic ones are removed.')) {
        data.routes = data.routes.filter(x => x !== r); data.mileage = data.mileage.filter(t => !(t.auto && t.route === r.id)); save(); renderExtras();
      }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.matches('.route-edit')) return;
    const r = data.routes.find(x => x.id === t.dataset.id); if (!r) return;
    const f = t.dataset.f;
    if (f === 'day') { const d = Number(t.dataset.d); r.days = (r.days || []).filter(x => x !== d); if (t.checked) r.days.push(d); }
    else r[f] = f === 'round' ? t.checked : f === 'miles' ? Math.max(0, Number(t.value) || 0) : t.value.trim();
    autoLog(); save(); renderExtras();
  });
  const rf = $('routeForm');
  const towns = CFG.towns || [];
  rf.elements.town.innerHTML = towns.map(([t, mi]) => '<option value="' + mi + '" data-town="' + esc(t) + '">' + esc(t) + ' (' + mi + ' mi)</option>').join('') + '<option value="" data-town="">' + (towns.length ? 'Other' : 'Anywhere') + '</option>';
  if (!towns.length) rf.elements.town.closest('label').hidden = true;
  rf.elements.town.addEventListener('change', () => { if (rf.elements.town.value) rf.elements.miles.value = rf.elements.town.value; });
  rf.elements.miles.value = rf.elements.town.value;
  rf.addEventListener('submit', e => {
    e.preventDefault();
    const town = rf.elements.town.selectedOptions[0].dataset.town || '';
    const days = [...rf.querySelectorAll('[name=day]:checked')].map(x => Number(x.value));
    data.routes.push({ id: newId(), name: rf.elements.name.value.trim(), detail: town, miles: Number(rf.elements.miles.value) || 0, round: true, days });
    autoLog(); save(); rf.reset(); rf.elements.miles.value = rf.elements.town.value; renderExtras();
    toast(days.length ? 'Added. Trips on ' + days.map(d => DAYS[d]).join(', ') + ' will log automatically.' : 'Place added. Tap Log trip when you go.');
  });
  const mf = $('mileForm');
  mf.date.value = todayIso(); $('mileRate').value = data.settings.mileRate;
  mf.addEventListener('submit', e => {
    e.preventDefault();
    const rate = rateFor(mf.date.value || todayIso()), miles = Number(mf.miles.value) || 0;
    data.mileage.push({ id: newId(), date: mf.date.value, purpose: mf.purpose.value.trim(), miles, rate, gas: r2(gasFor(miles)) });
    save(); mf.purpose.value = ''; mf.miles.value = ''; renderExtras(); toast('Trip added.');
  });
  $('mileRate').addEventListener('change', e => { const r = Number(e.target.value); if (r > 0) { data.settings.mileRate = r; save(); renderExtras(); } });
  $('mpg').value = data.settings.mpg; $('gasPrice').value = data.settings.gasPrice;
  $('mpg').addEventListener('change', e => { const v = Number(e.target.value); if (v > 0) { data.settings.mpg = v; save(); renderExtras(); } });
  $('gasPrice').addEventListener('change', e => { const v = Number(e.target.value); if (v >= 0) { data.settings.gasPrice = v; save(); renderExtras(); } });

  // ---------- work shifts ----------
  const wf = $('workForm');
  wf.date.value = todayIso();
  const lastPay = () => { const s0 = data.shifts[data.shifts.length - 1]; return s0 ? s0.amount : 75; };
  wf.amount.value = lastPay();
  function workRows() {
    const out = [];
    for (const m of months) for (const x of allRows('sales', m)) if (x.booth === 'Work income') out.push({ ...x, month: m });
    return out;
  }
  function renderWork() {
    if (!$('work').classList.contains('active')) return;
    const all = workRows(), nowYear = String(new Date().getFullYear());
    const ys = [...new Set([nowYear, ...all.map(x => (x.date || x.month.split(' ')[1]).slice(0, 4))])].sort().reverse(), cur = $('workYear').value;
    $('workYear').innerHTML = ys.map(y => '<option>' + y + '</option>').join(''); $('workYear').value = ys.includes(cur) ? cur : ys[0];
    const y = $('workYear').value, inYear = all.filter(x => x.month.endsWith(' ' + y)), mon = all.filter(x => x.month === currentMonth), yr = all.filter(x => x.month.endsWith(' ' + nowYear));
    const tot = l => l.reduce((t, x) => t + x.amount, 0), plural = n => n + ' shift' + (n === 1 ? '' : 's');
    $('wkMonth').textContent = money(tot(mon)); $('wkMonthN').textContent = plural(mon.length) + ' in ' + currentMonth;
    $('wkYear').textContent = money(tot(yr)); $('wkYearN').textContent = plural(yr.length) + ' in ' + nowYear;
    $('wkAvg').textContent = money(yr.length ? tot(yr) / yr.length : 0);
    const hrs = yr.reduce((t, x) => t + (Number(x.hours) || 0), 0);
    $('wkHours').textContent = hrs ? hrs + ' hours logged · ' + money(tot(yr.filter(x => x.hours)) / hrs) + ' per hour' : 'Add hours to see pay per hour';
    $('workRows').innerHTML = inYear.length ? inYear.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => '<tr><td>' + esc(x.date || '—') + '</td><td>' + esc(x.item) + '</td><td class="num">' + (x.hours || '—') + '</td><td class="num">' + money(x.amount) + '</td><td>' +
      (x.key[0] === 'w' ? '<button type="button" class="del shift-del" data-id="' + x.key.slice(1) + '">Delete</button>' : '<span class="helper" style="margin:0">Worksheet</span>') + '</td></tr>').join('') :
      '<tr><td colspan="5" class="empty">No shifts logged for ' + y + '.</td></tr>';
    $('workMonths').innerHTML = months.filter(m => m.endsWith(' ' + y)).map(m => { const l = all.filter(x => x.month === m); return '<tr><td>' + m + '</td><td class="num">' + l.length + '</td><td class="num">' + money(tot(l)) + '</td></tr>'; }).join('');
    $('shiftNames').innerHTML = ['Working Sunday', 'Working Saturday', 'Working Friday', 'Working Tuesday', 'Vendor work night'].map(n => '<option value="' + n + '">').join('');
  }
  $('workYear').addEventListener('change', renderWork);
  wf.addEventListener('submit', e => {
    e.preventDefault();
    const date = wf.date.value || todayIso(); let m = monthOf(date); if (!months.includes(m)) m = currentMonth;
    const amount = Math.round((Number(wf.amount.value) || 0) * 100) / 100;
    data.shifts.push({ id: newId(), date, month: m, item: wf.item.value.trim() || 'Work shift', hours: Number(wf.hours.value) || undefined, amount });
    save(); render(); wf.item.value = ''; wf.hours.value = ''; toast('Shift added: ' + money(amount) + ' in ' + m + '.');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.shift-del'); if (!b) return;
    const x = data.shifts.find(t => t.id === b.dataset.id);
    if (x && confirm('Delete the ' + money(x.amount) + ' shift on ' + x.date + '?')) { data.shifts = data.shifts.filter(t => t !== x); save(); render(); }
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

  // ---------- Amazon orders ----------
  const af = $('amzForm');
  af.date.value = todayIso();
  let amzBoothTouched = false;
  af.item.addEventListener('input', () => { if (!amzBoothTouched && af.item.value.trim()) af.booth.value = boothFor(af.item.value); });
  af.booth.addEventListener('change', () => { amzBoothTouched = true; });
  af.sellPrice.addEventListener('input', () => { af.sellPrice.dataset.touched = af.sellPrice.value ? '1' : ''; });
  ['qty', 'amount'].forEach(n => af[n].addEventListener('input', () => updatePreview(af, 'amzPreview')));
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const sortKey = x => x.date || (x.month.split(' ')[1] + '-' + pad(MONTH_NAMES.indexOf(x.month.split(' ')[0]) + 1) + '-00');
  function amazonRows() {
    const out = [];
    for (const m of months) for (const x of allRows('purchases', m)) if (x.key[0] === 'z' || /amazon/i.test(x.item)) out.push({ ...x, month: m });
    return out;
  }
  function renderAmazon() {
    if (!$('amazon').classList.contains('active')) return;
    const all = amazonRows(), nowYear = String(new Date().getFullYear());
    const ys = [...new Set([nowYear, ...all.map(x => x.month.split(' ')[1])])].sort().reverse(), cur = $('amzYear').value;
    $('amzYear').innerHTML = ys.map(y => '<option>' + y + '</option>').join(''); $('amzYear').value = ys.includes(cur) ? cur : ys[0];
    const y = $('amzYear').value, inYear = all.filter(x => x.month.endsWith(' ' + y)), tot = l => l.reduce((t, x) => t + x.amount, 0);
    const mon = all.filter(x => x.month === currentMonth);
    $('amzMonth').textContent = money(tot(mon)); $('amzMonthN').textContent = mon.length + ' order' + (mon.length === 1 ? '' : 's') + ' in ' + currentMonth;
    $('amzYearTot').textContent = money(tot(inYear)); $('amzYearN').textContent = inYear.length + ' order' + (inYear.length === 1 ? '' : 's') + ' in ' + y;
    const items = inYear.reduce((t, x) => t + (Number(x.qty) || 1), 0);
    $('amzEach').textContent = money(items ? tot(inYear) / items : 0); $('amzEachN').textContent = items + ' item' + (items === 1 ? '' : 's') + ' in ' + y;
    $('amzRows').innerHTML = inYear.length ? inYear.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a))).map(x => '<tr><td>' + esc(x.date || x.month) + '</td><td>' + esc(x.item) + '</td><td>' + esc(x.orderNo || '—') + '</td><td>' + esc(code(x.booth)) + '</td><td class="num">' + (x.qty || 1) + '</td><td class="num">' + money(x.amount) + '</td><td class="num">' + money(x.amount / (x.qty || 1)) + '</td><td>' +
      (x.key[0] === 'z' ? '<button type="button" class="del amz-del" data-id="' + x.key.slice(1) + '">Delete</button>' : '<span class="helper" style="margin:0">Worksheet</span>') + '</td></tr>').join('') :
      '<tr><td colspan="8" class="empty">No Amazon orders for ' + y + ' yet.</td></tr>';
  }
  $('amzYear').addEventListener('change', renderAmazon);
  af.addEventListener('submit', e => {
    e.preventDefault();
    const date = af.date.value || todayIso(); let m = monthOf(date); if (!months.includes(m)) m = currentMonth;
    const item = af.item.value.trim(), qty = Math.max(1, Number(af.qty.value) || 1), amount = r2(Number(af.amount.value) || 0), booth = af.booth.value;
    const sell = Number(af.sellPrice.value) || 0, override = af.sellPrice.dataset.touched === '1';
    const rec = { id: newId(), date, month: m, item, booth, qty, amount, orderNo: af.orderNo.value.trim(), source: 'Amazon' };
    if (override && sell > 0) rec.sell = r2(sell);
    data.amazon.push(rec);
    addToInventory(af.invDest.value, item, booth, qty, amount, sell, override);
    saveDocs(item, [...af.receipt.files], 'Invoice', 'Amazon order ' + (rec.orderNo || '') + ' · ' + money(amount));
    save(); render();
    af.reset(); af.date.value = date; af.sellPrice.dataset.touched = ''; amzBoothTouched = false; updatePreview(af, 'amzPreview');
    toast('Amazon order saved to ' + m + '.');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.amz-del'); if (!b) return;
    const x = data.amazon.find(t => t.id === b.dataset.id);
    if (x && confirm('Delete the Amazon order “' + x.item + '” (' + money(x.amount) + ')? It will also come off your purchases.')) { data.amazon = data.amazon.filter(t => t !== x); save(); render(); }
  });

  // ---------- cookie cost calculator ----------
  // Each ingredient: package price for a package amount, and how much one batch uses (same unit).
  const DEFAULT_RECIPES = CFG.recipes || [];
  // The booth baked goods are sold in: the one named in the settings, else one that sounds like food.
  const cookieBooth = () => BOOTHS.find(b => CFG.cookieBooth && b.startsWith(CFG.cookieBooth + ' ')) || BOOTHS.find(b => /cookie|bak|treat|food|sweet/i.test(b)) || (BOOTHS.length === 1 ? BOOTHS[0] : 'Unassigned');
  // Load the starting recipes once; after that, edits are kept.
  if (!data.recipes || !data.recipesMine3) { data.recipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES)); data.recipesMine3 = true; }
  data.settings.relicFee = data.settings.relicFee ?? 10;
  data.recipes.forEach(r => { if (r.shelf == null) r.shelf = 7; });
  data.batches = data.batches || [];
  const ingCost = g => (Number(g.packAmt) > 0 ? (Number(g.pack) || 0) / Number(g.packAmt) * (Number(g.use) || 0) : 0);
  function recipeMath(r) {
    const batch = r.ingredients.reduce((t, g) => t + ingCost(g), 0), n = Math.max(1, Number(r.perBatch) || 1);
    const each = batch / n + (Number(r.packaging) || 0), payout = (Number(r.price) || 0) * (1 - (Number(data.settings.relicFee) || 0) / 100);
    return { batch, n, each, payout, profit: payout - each, batchTotal: each * n };
  }
  // Batches listed in the settings file (made before the tracker existed), added once.
  if (CFG.seedData && !data.seedBatches0930) {
    for (const sb of CFG.seedBatches || []) {
      const r = data.recipes.find(x => x.id === sb.recipe), made = sb.made;
      if (!r || data.batches.some(b => b.recipe === sb.recipe && b.made === made)) continue;
      const m = recipeMath(r), qty = r.perBatch || 16;
      let mo = monthOf(made); if (!months.includes(mo)) mo = currentMonth;
      data.batches.push({ id: newId(), recipe: r.id, name: r.name, qty, made, expires: addDays(made, r.shelf ?? 7), done: false });
      (data.purchases[mo] = data.purchases[mo] || []).push({ item: r.name + ' (baked batch)', booth: cookieBooth(), qty, amount: r2(m.each * qty), sell: Number(r.price) || undefined, date: made });
    }
    data.seedBatches0930 = true; save();
  }
  function renderCookies() {
    if (!$('cookies').classList.contains('active')) return;
    const fcCode = code(cookieBooth()), fc = RENT[fcCode] || 0;
    $('cookieCards').innerHTML = data.recipes.length ? '' : '<p class="helper">No recipes yet. Tap <b>+ Add a recipe</b> to figure the cost of something you make.</p>';
    $('cookieCards').innerHTML += data.recipes.map((r, ri) => {
      const m = recipeMath(r), rentCookies = m.profit > 0 ? Math.ceil(fc / m.profit) : '—';
      const num = (f, v, step, extra) => '<input class="cell-input ck" type="number" min="0" step="' + step + '" inputmode="decimal" data-r="' + ri + '" data-f="' + f + '"' + (extra || '') + ' value="' + v + '">';
      return '<article class="panel cookie-card"><h3><input class="cell-input ck ck-name" data-r="' + ri + '" data-f="name" value="' + esc(r.name) + '" aria-label="Recipe name"></h3><div class="panel-body">' +
        '<div class="ck-summary"><div><span>Cost per cookie</span><b>' + money(m.each) + '</b></div><div><span>Profit per cookie</span><b class="' + (m.profit < 0 ? 'inventory-low' : 'green') + '">' + money(m.profit) + '</b></div><div><span>Batch costs you</span><b>' + money(m.batchTotal) + '</b></div><div><span>Batch profit</span><b class="' + (m.profit < 0 ? 'inventory-low' : 'green') + '">' + money(m.profit * m.n) + '</b></div></div>' +
        '<p class="helper">Ingredients and cellophane bags ' + money(m.batch) + ' ÷ ' + m.n + ' cookies = ' + money(m.batch / m.n) + ' each' + (Number(r.packaging) ? ', plus ' + money(Number(r.packaging)) + ' other packaging' : '') + '. You get ' + money(m.payout) + ' per cookie after Relic\'s ' + (data.settings.relicFee || 0) + '%' + (fc ? '. Sell about <b>' + rentCookies + '</b> a month to cover the $' + fc + ' ' + esc(fcCode) + ' rent' : '') + '.</p>' +
        '<div class="ck-settings"><label>Cookies per batch' + num('perBatch', r.perBatch, '1') + '</label><label>Other packaging per cookie' + num('packaging', r.packaging, '.01') + '</label><label>Sell price' + num('price', r.price, '.05') + '</label><label>Good for (days)' + num('shelf', r.shelf ?? 7, '1') + '</label></div>' +
        '<div class="scroll"><table class="ck-table"><thead><tr><th>Ingredient</th><th class="num">Package price</th><th class="num">Package has</th><th>Unit</th><th class="num">Batch uses</th><th class="num">Cost</th><th></th></tr></thead><tbody>' +
        r.ingredients.map((g, gi) => { const a = ' data-g="' + gi + '"';
          return '<tr><td><input class="cell-input ck wide" data-r="' + ri + '"' + a + ' data-f="name" value="' + esc(g.name) + '" aria-label="Ingredient"></td><td class="num">' + num('pack', g.pack, '.01', a) + '</td><td class="num">' + num('packAmt', g.packAmt, '.01', a) + '</td><td><input class="cell-input ck unit" data-r="' + ri + '"' + a + ' data-f="unit" value="' + esc(g.unit) + '" aria-label="Unit"></td><td class="num">' + num('use', g.use, '.01', a) + '</td><td class="num">' + money(ingCost(g)) + '</td><td><button type="button" class="del ck-del" data-r="' + ri + '"' + a + ' aria-label="Remove ' + esc(g.name) + '">×</button></td></tr>'; }).join('') +
        '</tbody></table></div><div class="ck-actions"><button type="button" class="button ghost ck-add" data-r="' + ri + '">+ Ingredient</button><button type="button" class="button ghost ck-remove" data-r="' + ri + '">Remove recipe</button><button type="button" class="button ck-log" data-r="' + ri + '">I baked a batch</button></div></div></article>';
    }).join('');
    $('relicFee').value = data.settings.relicFee;
  }
  document.addEventListener('change', e => {
    const t = e.target; if (!t.matches('.ck')) return;
    const r = data.recipes[Number(t.dataset.r)]; if (!r) return;
    const target = t.dataset.g != null ? r.ingredients[Number(t.dataset.g)] : r, f = t.dataset.f;
    target[f] = ['name', 'unit'].includes(f) ? t.value.trim() : Math.max(0, Number(t.value) || 0);
    save(); renderCookies();
  });
  document.addEventListener('click', e => {
    const add = e.target.closest('.ck-add'), del = e.target.closest('.ck-del'), log = e.target.closest('.ck-log');
    if (add) { data.recipes[Number(add.dataset.r)].ingredients.push({ name: 'New ingredient', pack: 0, packAmt: 1, unit: 'cups', use: 0 }); save(); renderCookies(); }
    if (del) { const r = data.recipes[Number(del.dataset.r)]; r.ingredients.splice(Number(del.dataset.g), 1); save(); renderCookies(); }
    if (log) openBatch(Number(log.dataset.r));
  });
  $('relicFee').addEventListener('change', e => { data.settings.relicFee = Math.min(100, Math.max(0, Number(e.target.value) || 0)); save(); renderCookies(); });
  // ---------- cookie batches: when made and when they expire ----------
  document.body.insertAdjacentHTML('beforeend', '<dialog class="sheet" id="batchSheet" aria-labelledby="batchTitle"><form id="batchForm" method="dialog"><div class="sheet-head"><h2 id="batchTitle">I made cookies</h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body">' +
    '<div class="seg" role="group" aria-label="Which cookies" id="batchKinds"></div>' +
    '<div class="sheet-row"><label>How many<input name="qty" type="number" min="1" inputmode="numeric" required></label><label>Made on<input name="made" type="date" required></label></div>' +
    '<div class="sheet-row"><label>Good for (days)<input name="shelf" type="number" min="1" inputmode="numeric" required></label><label>Expires<input name="expires" type="date" readonly tabindex="-1"></label></div>' +
    '<label class="check-label"><input type="checkbox" name="logCost" checked> <span id="batchCostLabel">Add the batch cost to this month\'s purchases</span></label>' +
    '<div class="sheet-actions"><button type="button" class="button ghost" data-close>Cancel</button><button type="submit" class="button">Save batch</button></div></div></form></dialog>');
  const bf = $('batchForm');
  let batchRecipe = 0;
  const expiryOf = (made, days) => addDays(made, Math.max(1, Number(days) || 7));
  function batchPreview() {
    const r = data.recipes[batchRecipe]; if (!r) return;
    bf.expires.value = expiryOf(bf.made.value || todayIso(), bf.shelf.value);
    const m = recipeMath(r), qty = Math.max(1, Number(bf.qty.value) || m.n);
    $('batchCostLabel').textContent = 'Add the batch cost (' + money(m.each * qty) + ') to this month\'s purchases';
  }
  function pickBatchRecipe(i) {
    batchRecipe = i; const r = data.recipes[i];
    $('batchKinds').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.r) === i));
    bf.qty.value = r.perBatch || 16; bf.shelf.value = r.shelf ?? 7; batchPreview();
  }
  function openBatch(i) {
    $('batchKinds').innerHTML = data.recipes.map((r, ri) => '<button type="button" data-r="' + ri + '">' + esc(r.name.replace(/ cookies$/i, '')) + '</button>').join('');
    $('batchKinds').style.gridTemplateColumns = 'repeat(' + data.recipes.length + ',1fr)';
    bf.reset(); bf.made.value = todayIso(); bf.logCost.checked = true;
    pickBatchRecipe(i || 0);
    $('batchSheet').showModal();
  }
  $('batchKinds').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) pickBatchRecipe(Number(b.dataset.r)); });
  ['qty', 'made', 'shelf'].forEach(n => bf[n].addEventListener('input', batchPreview));
  bf.addEventListener('submit', e => {
    e.preventDefault();
    const r = data.recipes[batchRecipe], m = recipeMath(r), qty = Math.max(1, Number(bf.qty.value) || m.n), made = bf.made.value || todayIso();
    const expires = expiryOf(made, bf.shelf.value);
    data.batches.push({ id: newId(), recipe: r.id, name: r.name, qty, made, expires, done: false });
    if (bf.logCost.checked) {
      let mo = monthOf(made); if (!months.includes(mo)) mo = currentMonth;
      (data.purchases[mo] = data.purchases[mo] || []).push({ item: r.name + ' (baked batch)', booth: cookieBooth(), qty, amount: r2(m.each * qty), sell: Number(r.price) || undefined, date: made });
    }
    save(); render(); $('batchSheet').close();
    toast(qty + ' ' + r.name.toLowerCase() + ' saved. They expire ' + nice(expires) + '.');
  });
  function batchStatus(b) {
    const left = Math.round((new Date(b.expires + 'T00:00:00') - new Date(todayIso() + 'T00:00:00')) / DAY);
    if (left < 0) return { left, cls: 'out', text: 'Expired ' + nice(b.expires) };
    if (left === 0) return { left, cls: 'out', text: 'Expires today' };
    if (left <= 2) return { left, cls: 'low', text: 'Expires ' + (left === 1 ? 'tomorrow' : nice(b.expires)) };
    return { left, cls: 'fresh', text: 'Good until ' + nice(b.expires) + ' · ' + left + ' days' };
  }
  function renderBatches() {
    const active = data.batches.filter(b => !b.done).sort((a, b) => a.expires.localeCompare(b.expires));
    $('dashCookies').innerHTML = '<section class="panel summary cookie-batches"><div class="cb-head"><h3>Cookies</h3><button type="button" class="button" data-batch-new>+ I made cookies</button></div><div class="panel-body">' +
      (active.length ? active.map(b => { const st = batchStatus(b);
        return '<div class="cb-row"><div><b>' + esc(b.name) + ' · ' + b.qty + '</b><small>Made ' + nice(b.made) + '</small></div><span class="tag ' + st.cls + '">' + esc(st.text) + '</span><button type="button" class="button ghost cb-done" data-id="' + b.id + '">' + (st.left < 0 ? 'Pulled' : 'Sold out') + '</button></div>'; }).join('') :
        '<p class="helper" style="margin:0">No cookies out right now. Tap <b>+ I made cookies</b> after you bake.</p>') + '</div></section>';
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-batch-new]')) openBatch(0);
    const d = e.target.closest('.cb-done');
    if (d) { const b = data.batches.find(x => x.id === d.dataset.id); if (b) { b.done = true; b.doneOn = todayIso(); save(); renderExtras(); toast(b.name + ' cleared.'); } }
  });

  $('ckReset').addEventListener('click', () => { if (confirm('Put both recipes back to the starting ingredients and Walmart prices?')) { data.recipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES)); save(); renderCookies(); } });

  // ---------- insights: take-home, goal, booth report card, busiest days ----------
  data.settings.goal = data.settings.goal ?? 500;
  const monthPrefix = m => { const [name, y] = m.split(' '); return y + '-' + pad(MONTH_NAMES.indexOf(name) + 1); };
  const latestSalesMonth = () => months.slice(months.indexOf(currentMonth)).find(m => allRows('sales', m).length) || currentMonth;
  function monthMoney(m) {
    const { st, o } = boothStats(m); let sales = 0, buy = o.unBuy, rent = 0;
    for (const c in st) { sales += st[c].sales; buy += st[c].buy; rent += st[c].rent; }
    sales += o.unSales;
    const trips = data.mileage.filter(t => t.date.startsWith(monthPrefix(m)));
    const gas = trips.reduce((t, x) => t + gasOf(x), 0), deduction = trips.reduce((t, x) => t + x.miles * x.rate, 0);
    return { sales, buy, rent, work: o.work, profit: sales - buy - rent, gas, deduction, st };
  }
  function renderDashInsights() {
    const dm = latestSalesMonth(), mm = monthMoney(dm), take = mm.profit - mm.gas;
    $('dashTake').textContent = money(take); $('dashTake').className = 'value ' + (take < 0 ? 'inventory-low' : 'green');
    $('dashTakeLabel').textContent = dm + ' after gas'; $('dashTakeNote').textContent = 'Gas about ' + money(mm.gas);
    const goal = Number(data.settings.goal) || 0, cur = monthMoney(currentMonth), pct = goal > 0 ? Math.max(0, Math.min(100, cur.profit / goal * 100)) : 0;
    $('dashGoal').innerHTML = '<section class="goal" aria-labelledby="goalTitle"><div class="goal-head"><h3 id="goalTitle">' + esc(currentMonth) + ' profit goal</h3><label>Goal $<input type="number" id="goalInput" min="0" step="25" inputmode="numeric" value="' + goal + '" class="cell-input"></label></div>' +
      '<div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.round(cur.profit) + '"><i style="width:' + pct + '%"></i></div>' +
      '<p class="helper">' + money(cur.profit) + ' of ' + money(goal) + (cur.profit >= goal && goal > 0 ? ' · Goal reached!' : ' · ' + money(Math.max(0, goal - cur.profit)) + ' to go') + '. Rent for the month counts from day 1, so this starts below zero.' + (dm !== currentMonth ? ' Last month (' + esc(dm) + '): ' + money(mm.profit) + '.' : '') + '</p></section>';
  }
  document.addEventListener('change', e => { if (e.target.id === 'goalInput') { data.settings.goal = Math.max(0, Number(e.target.value) || 0); save(); renderExtras(); } });

  // Booth report card: last four months ending with the latest month that has sales.
  function boothReport() {
    const end = months.indexOf(latestSalesMonth()), span = months.slice(end, end + 4).reverse();
    const per = span.map(m => monthMoney(m).st);
    return Object.keys(RENT).map(c => {
      const profits = per.map(st => st[c].sales - st[c].buy - st[c].rent), rent = per.reduce((t, st) => t + st[c].rent, 0), total = profits.reduce((a, b) => a + b, 0);
      const last3 = profits.slice(-3), losing = last3.filter(p => p < 0).length >= 2, n = profits.length;
      const falling = n >= 3 && profits[n - 1] < profits[n - 2] && profits[n - 2] < profits[n - 3] && profits[n - 1] < profits[n - 3] - Math.abs(profits[n - 3]) * 0.25;
      const status = losing ? ['Losing money', 'out', 'Lost money in ' + last3.filter(p => p < 0).length + ' of the last 3 months'] : falling ? ['Watch', 'low', 'Profit down 2 months in a row'] : profits[n - 1] < 0 ? ['Watch', 'low', 'Lost money last month'] : ['Doing well', 'fresh', 'Making money'];
      return { c, span, profits, perRent: rent ? total / rent : 0, total, status };
    });
  }
  function renderReportCard() {
    const rows = boothReport(), span = rows[0].span;
    $('reportCard').innerHTML = '<div class="scroll"><table><thead><tr><th>Booth</th><th>Status</th>' + span.map(m => '<th class="num">' + esc(m.slice(0, 3)) + '</th>').join('') + '<th class="num">Per $1 rent</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td><b>' + r.c + '</b></td><td><span class="tag ' + r.status[1] + '" title="' + esc(r.status[2]) + '">' + r.status[0] + '</span><small class="rc-why">' + esc(r.status[2]) + '</small></td>' + r.profits.map(p => '<td class="num ' + (p < 0 ? 'inventory-low' : '') + '">' + money(p) + '</td>').join('') + '<td class="num">' + money(r.perRent) + '</td></tr>').join('') +
      '</tbody></table></div><p class="helper">Profit is sales − purchases − rent. "Per $1 rent" is how much profit each rent dollar brought back over these months.</p>';
  }
  function renderWeekdays() {
    const y = $('repYear').value, totals = [0, 0, 0, 0, 0, 0, 0];
    for (const m of months.filter(x => x.endsWith(' ' + y))) for (const x of allRows('sales', m)) if (x.date && x.booth !== 'Work income') totals[dow(x.date)] += x.amount;
    const max = Math.max(...totals), order = [1, 2, 3, 4, 5, 6, 0], best = totals.indexOf(max);
    $('weekdayChart').innerHTML = max ? '<p class="helper">Busiest day: <b>' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][best] + '</b>. Restock the day before so the shelves are full.</p><div class="wd-chart" role="img" aria-label="Sales by day of the week">' +
      order.map(d => '<div class="wd-row' + (d === best ? ' best' : '') + '" title="' + DAYS[d] + ': ' + money(totals[d]) + '"><span class="wd-day">' + DAYS[d] + '</span><span class="wd-track"><i style="width:' + (totals[d] / max * 100) + '%"></i></span><span class="wd-val">' + money(totals[d]) + '</span></div>').join('') + '</div>' :
      '<p class="helper">No dated sales for ' + y + ' yet.</p>';
  }

  // ---------- taxes ----------
  data.settings.incomeRate = data.settings.incomeRate ?? 15;
  data.taxPaid = data.taxPaid || {};
  const SE_RATE = 0.9235 * 0.153;
  const QUARTERS = y => [
    { q: 'Q1', label: 'Jan–Mar', months: [1, 2, 3], due: y + '-04-15' },
    { q: 'Q2', label: 'Apr–May', months: [4, 5], due: y + '-06-15' },
    { q: 'Q3', label: 'Jun–Aug', months: [6, 7, 8], due: y + '-09-15' },
    { q: 'Q4', label: 'Sep–Dec', months: [9, 10, 11, 12], due: (Number(y) + 1) + '-01-15' }
  ];
  const taxOn = net => net > 0 ? net * (net > 400 ? SE_RATE : 0) + net * (Number(data.settings.incomeRate) || 0) / 100 : 0;
  function taxYear(y) {
    // Only months up to now count; planned rent and purchases for later months are left out.
    const ms = months.filter(m => m.endsWith(' ' + y) && months.indexOf(m) >= months.indexOf(currentMonth)).reverse(), rows = ms.map(m => ({ m, ...monthMoney(m) }));
    const sum = k => rows.reduce((t, r) => t + r[k], 0);
    const sales = sum('sales'), buy = sum('buy'), rent = sum('rent'), work = sum('work'), deduction = sum('deduction'), gas = sum('gas');
    const net = sales - buy - rent - deduction, se = net > 400 ? net * SE_RATE : 0, inc = net > 0 ? net * (Number(data.settings.incomeRate) || 0) / 100 : 0;
    const quarters = QUARTERS(y).map(q => {
      const qr = rows.filter(r => q.months.includes(MONTH_NAMES.indexOf(r.m.split(' ')[0]) + 1));
      const qnet = qr.reduce((t, r) => t + r.sales - r.buy - r.rent - r.deduction, 0);
      return { ...q, net: qnet, est: taxOn(qnet), paid: Number(((data.taxPaid[y] || {})[q.q]) || 0), has: qr.length };
    });
    return { y, rows, sales, buy, rent, work, deduction, gas, net, se, inc, quarters, miles: data.mileage.filter(t => t.date.startsWith(y)) };
  }
  const taxYears = [...new Set(months.map(m => m.split(' ')[1]))].sort().reverse();
  $('taxYear').innerHTML = taxYears.map(y => '<option>' + y + '</option>').join('');
  $('taxYear').value = taxYears.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : taxYears[0];
  $('taxYear').addEventListener('change', renderTaxes);
  $('incomeRate').value = data.settings.incomeRate;
  $('incomeRate').addEventListener('change', e => { data.settings.incomeRate = Math.min(60, Math.max(0, Number(e.target.value) || 0)); save(); renderExtras(); });
  function renderTaxes() {
    if (!$('taxes').classList.contains('active')) return;
    const t = taxYear($('taxYear').value), line = (l, v, note, cls) => '<tr class="' + (cls || '') + '"><td>' + l + (note ? '<small>' + note + '</small>' : '') + '</td><td class="num">' + v + '</td></tr>';
    const miles = t.miles.reduce((s, x) => s + x.miles, 0);
    $('taxSummary').innerHTML = '<table class="tax-table"><tbody>' +
      line('Sales (Relic payouts)', money(t.sales), 'Schedule C, gross receipts') +
      line('Inventory & supplies bought', '−' + money(t.buy), 'Cost of goods and supplies') +
      line('Booth rent', '−' + money(t.rent), 'Rent of business property') +
      line('Mileage deduction', '−' + money(t.deduction), Math.round(miles).toLocaleString() + ' business miles at the IRS rate') +
      line('<b>Business profit (or loss)</b>', '<b class="' + (t.net < 0 ? 'inventory-low' : 'green') + '">' + money(t.net) + '</b>', '', 'tax-total') +
      '</tbody></table>' +
      (t.work ? '<p class="helper">Work shifts: <b>' + money(t.work) + '</b> (not included above). Ask your tax preparer whether Relic reports this pay on a W-2 or a 1099.</p>' : '');
    $('taxEstimate').innerHTML = t.net > 0 ?
      '<div class="cards tax-cards"><div class="card"><div class="label">Self-employment tax</div><div class="value">' + money(t.se) + '</div><div class="helper">15.3% on 92.35% of profit</div></div><div class="card"><div class="label">Income tax (est.)</div><div class="value">' + money(t.inc) + '</div><div class="helper">' + (data.settings.incomeRate || 0) + '% of profit</div></div><div class="card"><div class="label">Set aside in total</div><div class="value">' + money(t.se + t.inc) + '</div><div class="helper">About ' + Math.round((t.se + t.inc) / t.net * 100) + '% of each month\'s profit</div></div></div>' :
      '<div class="tax-good"><b>No business tax is likely owed for ' + t.y + ' so far.</b> Your mileage deduction (' + money(t.deduction) + ') is larger than your booth profit before mileage (' + money(t.sales - t.buy - t.rent) + '), so the business shows a loss of ' + money(-t.net) + '. Self-employment tax only applies when profit is over $400. Keep your trip log, because it is what supports this.</div>';
    $('taxEstimate').insertAdjacentHTML('beforeend', '<div class="tax-ask"><b>Ask your preparer about mileage.</b> Driving from home to your own booth can count as commuting, which is not deductible, unless your home is your main place of business (where you bake, price, store inventory, and keep the books). Trips to buy inventory, like Price Break, Goodwill, or St. Joe\'s, are usually business trips. Booth profit before mileage this year: <b>' + money(t.sales - t.buy - t.rent) + '</b>.</div>');
    const today = todayIso();
    $('taxQuarters').innerHTML = '<div class="scroll"><table><thead><tr><th>Payment</th><th>Covers</th><th>Due</th><th class="num">Profit</th><th class="num">Estimated tax</th><th class="num">Paid</th></tr></thead><tbody>' +
      t.quarters.map(q => { const late = !q.paid && q.est > 0 && q.due < today;
        return '<tr><td><b>' + q.q + '</b></td><td>' + q.label + '</td><td>' + nice(q.due) + (late ? ' <span class="tag out">Past due</span>' : '') + '</td><td class="num ' + (q.net < 0 ? 'inventory-low' : '') + '">' + (q.has ? money(q.net) : '—') + '</td><td class="num">' + (q.has ? money(q.est) : '—') + '</td><td class="num"><input class="cell-input tax-paid" type="number" min="0" step=".01" inputmode="decimal" data-y="' + t.y + '" data-q="' + q.q + '" value="' + (q.paid || '') + '" placeholder="0.00" aria-label="Amount paid for ' + q.q + '"></td></tr>'; }).join('') +
      '</tbody></table></div><p class="helper">Pay estimated taxes at IRS.gov/payments (Direct Pay, choose 1040-ES) and type what you paid in the Paid column. If a quarter shows $0, there is nothing to send.</p>';
    $('taxMonths').innerHTML = t.rows.map(r => { const net = r.sales - r.buy - r.rent - r.deduction;
      return '<tr><td>' + r.m + '</td><td class="num">' + money(r.sales - r.buy - r.rent) + '</td><td class="num">' + money(r.deduction) + '</td><td class="num ' + (net < 0 ? 'inventory-low' : 'green') + '">' + money(net) + '</td><td class="num">' + money(taxOn(net)) + '</td></tr>'; }).join('');
  }
  document.addEventListener('change', e => {
    const t = e.target; if (!t.matches('.tax-paid')) return;
    (data.taxPaid[t.dataset.y] = data.taxPaid[t.dataset.y] || {})[t.dataset.q] = Math.max(0, Number(t.value) || 0);
    save(); renderExtras(); toast('Payment saved.');
  });
  function nextTaxDue() {
    const today = todayIso(), y = today.slice(0, 4), list = [...QUARTERS(String(Number(y) - 1)).slice(3), ...QUARTERS(y)];
    for (const q of list) {
      const yr = q.q === 'Q4' ? String(Number(q.due.slice(0, 4)) - 1) : q.due.slice(0, 4);
      if (q.due < today) continue;
      const days = Math.round((new Date(q.due + 'T00:00:00') - new Date(today + 'T00:00:00')) / DAY);
      const tq = taxYear(yr).quarters.find(x => x.q === q.q);
      return { ...tq, yr, days };
    }
    return null;
  }
  $('taxCsv').addEventListener('click', () => {
    const t = taxYear($('taxYear').value), q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', L = [];
    L.push(['Booth Tracker tax summary', t.y].map(q).join(','), '');
    [['Sales (Relic payouts)', t.sales], ['Inventory & supplies bought', t.buy], ['Booth rent', t.rent], ['Mileage deduction', t.deduction], ['Business profit (loss)', t.net], ['Work shift income (separate)', t.work], ['Business miles', t.miles.reduce((s, x) => s + x.miles, 0)]].forEach(([a, b]) => L.push([a, Number(b).toFixed(2)].map(q).join(',')));
    L.push('', ['Quarter', 'Covers', 'Due', 'Profit', 'Estimated tax', 'Paid'].map(q).join(','));
    t.quarters.forEach(x => L.push([x.q, x.label, x.due, x.net.toFixed(2), x.est.toFixed(2), x.paid.toFixed(2)].map(q).join(',')));
    L.push('', ['Date', 'Trip', 'Miles', 'IRS rate', 'Deduction'].map(q).join(','));
    t.miles.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(x => L.push([x.date, x.purpose, x.miles, x.rate, (x.miles * x.rate).toFixed(2)].map(q).join(',')));
    shareOrDownload(new File([L.join('\r\n')], 'booth-taxes-' + t.y + '.csv', { type: 'text/csv' }), true);
  });
  $('taxPrint').addEventListener('click', () => window.print());

  // ---------- price tags (Avery 5160, 30 per sheet) ----------
  function printTags(list) {
    const tags = list.flatMap(t => Array(Math.max(1, t.n)).fill(t)).slice(0, 600);
    if (!tags.length) { toast('No items to print. Clear the search or add prices first.'); return; }
    const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print tags.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Price tags</title><style>' +
      '@page{size:letter;margin:0.5in 0.19in}body{margin:0;font-family:system-ui,-apple-system,sans-serif;color:#173447}' +
      '.bar{padding:12px;font-size:15px}.bar button{font:inherit;font-weight:700;padding:8px 14px;border:0;border-radius:8px;background:#24536f;color:#fff}' +
      '.sheet{display:grid;grid-template-columns:repeat(3,2.625in);grid-auto-rows:1in;column-gap:.125in}' +
      '.tag{box-sizing:border-box;padding:.07in .14in;overflow:hidden;display:flex;flex-direction:column;justify-content:center;border:1px dashed #c9d3d8;break-inside:avoid}' +
      '.n{font-size:10pt;font-weight:600;line-height:1.15;max-height:2.3em;overflow:hidden}.p{font-size:20pt;font-weight:800;line-height:1.1}.m{font-size:7.5pt;color:#5b6a73}' +
      '@media print{.bar{display:none}.tag{border:0}}</style></head><body><div class="bar">' + tags.length + ' tag' + (tags.length === 1 ? '' : 's') + ' · Avery 5160 labels (30 per sheet) or plain paper. <button onclick="print()">Print</button></div><div class="sheet">' +
      tags.map(t => '<div class="tag"><div class="n">' + esc(t.name) + '</div><div class="p">' + money(t.price) + '</div><div class="m">' + esc(t.code) + (t.sku ? ' · ' + esc(t.sku) : '') + '</div></div>').join('') + '</div></body></html>');
    w.document.close();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tags]'); if (!b) return;
    if (b.dataset.tags === 'store') {
      const q = itemKey($('storeSearch').value), each = $('tagEach').checked;
      printTags(data.inventory.filter(x => x.qty > 0 && x.price > 0 && (!q || itemKey(x.item + ' ' + x.sku).includes(q))).map(x => ({ name: x.item, price: x.price, code: code(boothFor(x.item)), sku: x.sku, n: each ? Math.min(x.qty, 30) : 1 })));
    } else {
      const q = itemKey($('overallSearch').value), bf = $('overallBooth').value;
      printTags(data.overall.filter(x => x.qty > 0 && (!q || itemKey(x.item).includes(q)) && (!bf || x.booth === bf)).map(x => ({ name: x.item, price: x.price || (x.qty ? r2(x.cost / x.qty * 2) : 0), code: code(x.booth), sku: '', n: 1 })).filter(t => t.price > 0));
    }
  });

  // ---------- recipes: add and remove ----------
  if (!CFG.recipeCards) { const a = document.querySelector('a[href="recipe-cards.html"]'); if (a) a.remove(); }
  document.addEventListener('click', e => {
    if (e.target.closest('#ckNew')) { data.recipes.push({ id: newId(), name: 'New recipe', perBatch: 12, packaging: 0, price: 2, shelf: 7, ingredients: [] }); save(); renderCookies(); }
    const rm = e.target.closest('.ck-remove');
    if (rm) { const r = data.recipes[Number(rm.dataset.r)]; if (r && confirm('Remove the recipe “' + r.name + '”?')) { data.recipes.splice(Number(rm.dataset.r), 1); save(); renderCookies(); } }
  });

  // ---------- your booths: welcome setup and editor ----------
  const boothRow = b => '<div class="bx-row"><label>Booth #<input class="bx-code" value="' + esc(b.code || '') + '" placeholder="A12" autocapitalize="characters"></label><label>What you sell<input class="bx-name" value="' + esc(b.name || '') + '" placeholder="Clothes, candles…"></label><label>Monthly rent<input class="bx-rent" type="number" min="0" step=".01" inputmode="decimal" value="' + (b.rent ?? '') + '" placeholder="0.00"></label><button type="button" class="del bx-del" aria-label="Remove booth">×</button></div>';
  const readBooths = box => [...box.querySelectorAll('.bx-row')].map(r => ({ code: r.querySelector('.bx-code').value.trim().replace(/\s+/g, '-'), name: r.querySelector('.bx-name').value.trim() || 'Booth', rent: Math.max(0, Number(r.querySelector('.bx-rent').value) || 0) })).filter(b => b.code);
  const checkBooths = list => !list.length ? 'Add at least one booth number.' : new Set(list.map(b => b.code)).size !== list.length ? 'Each booth needs a different booth number.' : '';
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-bx-add]'); if (add) $(add.dataset.bxAdd).insertAdjacentHTML('beforeend', boothRow({}));
    const del = e.target.closest('.bx-del'); if (del) del.closest('.bx-row').remove();
  });
  $('boothsEdit').innerHTML = BOOTH_LIST.map(boothRow).join('') || boothRow({});
  $('ownerName').value = OWNER;
  $('boothsSave').addEventListener('click', () => {
    const list = readBooths($('boothsEdit')), problem = checkBooths(list);
    if (problem) { toast(problem); return; }
    data.boothList = list; data.owner = $('ownerName').value.trim(); if (!data.rentFrom) data.rentFrom = currentMonth;
    save(); location.reload();
  });
  if (CFG.setup && !data.owner && !(data.boothList && data.boothList.length)) {
    document.body.insertAdjacentHTML('beforeend', '<dialog class="sheet" id="setupSheet" aria-labelledby="setupTitle"><form id="setupForm"><div class="sheet-head"><h2 id="setupTitle">Welcome to Booth Tracker!</h2></div><div class="sheet-body">' +
      '<p class="helper">Tell it a little about your booths. You can change this any time under <b>Import &amp; backup → Your booths</b>. Everything you enter stays on this phone.' + (CFG.guideUrl ? ' <a href="' + CFG.guideUrl + '" target="_blank" rel="noopener">How to use it</a>' : '') + '</p>' +
      '<label>Your first name<input name="owner" required autocomplete="given-name"></label><h3 class="sec-title">Your booths</h3><div id="setupBooths">' + boothRow({}) + '</div>' +
      '<button type="button" class="button ghost" data-bx-add="setupBooths" style="margin-bottom:14px">+ Add another booth</button><button type="submit" class="button" style="width:100%;padding:14px">Start tracking</button></div></form></dialog>');
    const sheet = $('setupSheet');
    sheet.addEventListener('cancel', e => e.preventDefault());
    $('setupForm').addEventListener('submit', e => {
      e.preventDefault();
      const list = readBooths($('setupBooths')), problem = checkBooths(list);
      if (problem) { toast(problem); return; }
      data.owner = e.target.owner.value.trim(); data.boothList = list; data.rentFrom = currentMonth; save(); location.reload();
    });
    sheet.showModal();
  }

  // ---------- render hook ----------
  function renderExtras() {
    const need = renderRestock();
    renderBatches();
    renderTodo(need);
    renderBackupStatus();
    renderReports();
    renderMileage();
    renderWork();
    renderAmazon();
    renderCookies();
    renderDashInsights();
    if ($('reports').classList.contains('active')) { renderReportCard(); renderWeekdays(); }
    renderTaxes();
  }
  const baseRender = window.render;
  window.render = function () { baseRender(); renderExtras(); };
  renderExtras();

  // ---------- offline / home-screen app ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
