// Vinted & eBay listing helper: fill in an item's details once, get a ready-to-paste title and
// description for each site, and track it from listed to sold to shipped. Selling it can add the
// payout to Sold items, so online sales count in the month's totals like booth sales.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toastMsg = m => (window.toast ? window.toast(m) : alert(m));
  const iso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const daysSince = d => d ? Math.floor((new Date(iso() + 'T12:00') - new Date(d + 'T12:00')) / 864e5) : 0;
  const monthName = d => new Date(d + 'T12:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const fmtDay = d => d ? new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const SITES = { vinted: 'Vinted', ebay: 'eBay' };
  const BOOTH = { vinted: 'VINTED — Vinted', ebay: 'EBAY — eBay' };
  // eBay's final value fee for most clothing and toys is 13.6% plus $0.40 an order. Vinted charges sellers nothing.
  const payoutGuess = (site, price) => site === 'ebay' ? Math.max(0, Math.round((price * 0.864 - 0.4) * 100) / 100) : price;
  const CONDITIONS = ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory'];
  const EBAY_COND = { 'New with tags': 'New with tags', 'New without tags': 'New without tags', 'Very good': 'Pre-owned, excellent condition', 'Good': 'Pre-owned, good condition', 'Satisfactory': 'Pre-owned, fair condition' };
  const KINDS = {
    flannel: { label: 'Flannel shirt', item: 'Flannel Shirt' },
    upcycled: { label: 'Upcycled flannel', item: 'Upcycled Flannel', handmade: true },
    squishy: { label: 'Squishy / toy', item: 'Squishy' },
    clothing: { label: 'Other clothing', item: '' },
    other: { label: 'Something else', item: '' }
  };

  data.listings = data.listings || [];
  data.settings = data.settings || {};
  const list = () => data.listings || (data.listings = []);
  const byId = id => list().find(x => x.id === id);
  const uid = () => (typeof newId === 'function' ? newId() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- title and description ----------
  function sizeText(L) { return L.size ? (/^(size|sz)\b/i.test(L.size) ? L.size : 'Size ' + L.size) : ''; }
  function ebayTitle(L) {
    const parts = [L.brand, L.who && L.who !== 'Unisex' ? L.who : '', L.color, L.material, L.item || (KINDS[L.kind] || {}).item, sizeText(L), L.cond === 'New with tags' ? 'NWT' : '', L.keywords];
    let t = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (t.length > 80) { const w = t.split(' '); t = ''; for (const x of w) { if ((t + ' ' + x).trim().length > 80) break; t = (t + ' ' + x).trim(); } }
    return t;
  }
  function vintedTitle(L) {
    return [L.brand, L.color, L.item || (KINDS[L.kind] || {}).item].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  function description(L, site) {
    const thing = [L.brand, L.color, L.item || (KINDS[L.kind] || {}).item].filter(Boolean).join(' ');
    const lines = [];
    if (thing) lines.push(thing + (L.who ? ' (' + L.who + ')' : '') + '.');
    if ((KINDS[L.kind] || {}).handmade) lines.push('Handmade and upcycled by Plaid Paddling Mama, so it\'s one of a kind.');
    if (L.size) lines.push('Size: ' + L.size);
    if (L.cond) lines.push('Condition: ' + (site === 'ebay' ? EBAY_COND[L.cond] || L.cond : L.cond) + '.' + (L.flaws ? ' ' + L.flaws.trim().replace(/\.?$/, '.') : (/^New/.test(L.cond) ? '' : ' No flaws noted.')));
    else if (L.flaws) lines.push(L.flaws.trim());
    if (L.material) lines.push('Material: ' + L.material);
    const meas = [L.pit ? 'Pit to pit ' + L.pit + '"' : '', L.len ? 'Length ' + L.len + '"' : ''].filter(Boolean);
    if (meas.length) lines.push('Measurements (laid flat): ' + meas.join(', '));
    if (L.notes) lines.push('', L.notes.trim());
    const shop = (data.settings.listingNote || '').trim();
    if (shop) lines.push('', shop);
    return lines.join('\n').trim();
  }
  const titleFor = (L, site) => (L.custom && L.custom[site + 'Title']) || (site === 'ebay' ? ebayTitle(L) : vintedTitle(L));
  const descFor = (L, site) => (L.custom && L.custom[site + 'Desc']) || description(L, site);
  const nameOf = L => vintedTitle(L) || L.item || 'Untitled item';

  // ---------- status ----------
  function status(L) {
    if (L.shippedAt) return 'shipped';
    if (L.soldAt) return 'ship';
    if (L.listedAt) return 'listed';
    return 'draft';
  }
  const STATUS = { draft: 'To list', listed: 'Listed', ship: 'Sold · ship it', shipped: 'Shipped' };

  // ---------- page and nav ----------
  const nav = document.querySelector('.top-nav');
  const navBtn = document.createElement('button');
  navBtn.dataset.page = 'listings'; navBtn.textContent = 'Vinted & eBay';
  const after = nav.querySelector('[data-page="sales"]');
  after ? after.after(navBtn) : nav.appendChild(navBtn);
  const page = document.createElement('section');
  page.className = 'page'; page.id = 'listings';
  document.querySelector('main').appendChild(page);
  navBtn.onclick = () => {
    document.querySelectorAll('[data-page]').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    navBtn.classList.add('active'); page.classList.add('active');
    document.body.dataset.page = 'listings';
    document.querySelectorAll('.bottom-nav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === 'more'));
    draw();
  };
  const more = document.querySelector('#moreSheet .more-list');
  if (more) more.insertAdjacentHTML('afterbegin', '<button type="button" data-go="listings"><span>Vinted &amp; eBay<small>Write listings, track sold and shipped</small></span><span aria-hidden="true">›</span></button>');

  let filter = 'active', search = '';
  function draw() {
    if (!page.classList.contains('active')) return;
    const all = list(), now = iso(), m = monthName(now);
    const listed = all.filter(L => status(L) === 'listed'), toShip = all.filter(L => status(L) === 'ship'), drafts = all.filter(L => status(L) === 'draft');
    const soldMonth = all.filter(L => L.soldAt && monthName(L.soldAt) === m);
    const pay = soldMonth.reduce((s, L) => s + (Number(L.payout) || 0), 0), cost = soldMonth.reduce((s, L) => s + (Number(L.cost) || 0), 0);
    const stale = listed.filter(L => daysSince(L.listedAt) >= 30);
    const q = search.trim().toLowerCase();
    const shown = all.filter(L => filter === 'all' || (filter === 'active' ? status(L) !== 'shipped' : status(L) === filter))
      .filter(L => !q || [nameOf(L), L.brand, L.size, L.notes, L.keywords].join(' ').toLowerCase().includes(q))
      .sort((a, b) => ['ship', 'draft', 'listed', 'shipped'].indexOf(status(a)) - ['ship', 'draft', 'listed', 'shipped'].indexOf(status(b)) || (b.updated || '').localeCompare(a.updated || ''));
    const seg = (k, label, n) => '<button type="button" class="' + (filter === k ? 'on' : '') + '" data-lf="' + k + '">' + label + (n != null ? ' ' + n : '') + '</button>';
    page.innerHTML =
      '<div class="toolbar"><div><h2>Vinted &amp; eBay</h2><div class="helper">Fill in an item once and copy a ready-made title and description for each site. Mark it sold and the payout goes to Sold items.</div></div>' +
      '<button type="button" class="button" id="lsNew">+ New listing</button></div>' +
      '<div class="cards ls-cards">' +
      '<div class="card"><div class="label">Listed now</div><div class="value">' + listed.length + '</div><div class="helper">' + money(listed.reduce((s, L) => s + (Number(L.price) || 0), 0)) + ' asking</div></div>' +
      '<div class="card"><div class="label">Need to ship</div><div class="value' + (toShip.length ? ' ls-warn' : '') + '">' + toShip.length + '</div><div class="helper">' + (drafts.length ? drafts.length + ' still to list' : 'All listed') + '</div></div>' +
      '<div class="card"><div class="label">' + esc(m.split(' ')[0]) + ' payouts</div><div class="value green">' + money(pay) + '</div><div class="helper">' + soldMonth.length + ' sold' + (cost ? ' · ' + money(pay - cost) + ' profit' : '') + '</div></div></div>' +
      (stale.length ? '<div class="ls-stale">⏳ ' + stale.length + ' listed 30+ days. Try dropping the price or relisting to bump them back to the top.</div>' : '') +
      '<div class="ls-bar"><div class="seg ls-seg">' + seg('active', 'Open', all.filter(L => status(L) !== 'shipped').length) + seg('draft', 'To list', drafts.length) + seg('listed', 'Listed', listed.length) + seg('ship', 'To ship', toShip.length) + seg('shipped', 'Shipped') + seg('all', 'All') + '</div>' +
      '<input type="search" id="lsSearch" placeholder="Search" value="' + esc(search) + '"></div>' +
      '<div class="ls-list">' + (shown.map(row).join('') || '<p class="helper ls-empty">' + (all.length ? 'Nothing here.' : 'No listings yet. Tap <b>+ New listing</b> to write your first one.') + '</p>') + '</div>' +
      '<details class="panel ls-settings"><summary>Listing settings</summary><label>Add this to the end of every description<textarea id="lsNote" rows="3" placeholder="Example: Bundle 2 or more for a discount!">' + esc(data.settings.listingNote || '') + '</textarea></label><button type="button" class="button ghost" id="lsNoteSave">Save</button></details>';
    $('lsNew').onclick = () => edit(null);
    page.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { filter = b.dataset.lf; draw(); });
    $('lsSearch').oninput = e => { search = e.target.value; const c = e.target.selectionStart; draw(); const s = $('lsSearch'); s.focus(); s.setSelectionRange(c, c); };
    $('lsNoteSave').onclick = () => { data.settings.listingNote = $('lsNote').value; save(); toastMsg('Saved. It\'s added to every description.'); };
    page.querySelectorAll('[data-ls]').forEach(el => el.onclick = e => { if (!e.target.closest('button')) edit(el.dataset.ls); });
    page.querySelectorAll('[data-lsact]').forEach(b => b.onclick = () => act(b.dataset.lsact, b.dataset.id));
  }
  function row(L) {
    const st = status(L), sites = (L.sites || []).map(s => SITES[s]).join(' + ');
    const sub = st === 'draft' ? 'Not listed yet' + (sites ? ' · for ' + sites : '')
      : st === 'listed' ? 'On ' + sites + ' · ' + daysSince(L.listedAt) + ' days'
      : st === 'ship' ? 'Sold on ' + SITES[L.soldOn] + ' ' + fmtDay(L.soldAt) + ' · ' + money(Number(L.payout) || 0) + ' payout'
      : 'Shipped ' + fmtDay(L.shippedAt) + ' · ' + money(Number(L.payout) || 0) + ' payout';
    const btn = (a, t, cls) => '<button type="button" class="button small ' + (cls || 'ghost') + '" data-lsact="' + a + '" data-id="' + L.id + '">' + t + '</button>';
    const acts = st === 'draft' ? btn('copy', '📋 Copy text') + btn('list', '✓ Mark listed', ' ')
      : st === 'listed' ? btn('copy', '📋 Copy text') + btn('sold', '💰 Sold', ' ')
      : st === 'ship' ? btn('ship', '📦 Shipped', ' ') : '';
    return '<div class="ls-row ls-' + st + '" data-ls="' + L.id + '">' +
      (L.photo ? '<img class="ls-thumb" src="' + L.photo + '" alt="">' : '<div class="ls-thumb ls-nophoto" aria-hidden="true">' + (L.kind === 'squishy' ? '🧸' : '👕') + '</div>') +
      '<div class="ls-main"><b>' + esc(nameOf(L)) + '</b><span class="ls-sub">' + esc([L.size ? 'Size ' + L.size : '', L.price ? money(Number(L.price)) : ''].filter(Boolean).join(' · ')) + '</span>' +
      '<span class="ls-sub"><span class="tag ls-st-' + st + '">' + STATUS[st] + '</span> ' + esc(sub) + (st === 'listed' && daysSince(L.listedAt) >= 30 ? ' <span class="tag low">30+ days</span>' : '') + '</span>' +
      (L.tracking ? '<span class="ls-sub">Tracking ' + esc(L.tracking) + '</span>' : '') +
      '<div class="ls-acts">' + acts + '</div></div></div>';
  }

  // ---------- actions ----------
  function act(a, id) {
    const L = byId(id); if (!L) return;
    if (a === 'copy') return copySheet(L);
    if (a === 'list') return listSheet(L);
    if (a === 'sold') return soldSheet(L);
    if (a === 'ship') return shipSheet(L);
  }
  function touch(L) { L.updated = new Date().toISOString(); save(); draw(); }

  // One reusable bottom sheet for every form on this page.
  document.body.insertAdjacentHTML('beforeend', '<dialog class="sheet" id="lsSheet"><div class="sheet-head"><h2 id="lsTitle"></h2><button type="button" class="sheet-close" data-close aria-label="Close">×</button></div><div class="sheet-body" id="lsBody"></div></dialog>');
  document.getElementById('lsSheet').addEventListener('click', e => { if (e.target.id === 'lsSheet') e.target.close(); });
  function sheet(title, html) { $('lsTitle').textContent = title; $('lsBody').innerHTML = html; const d = $('lsSheet'); if (!d.open) d.showModal(); $('lsBody').scrollTop = 0; }
  const close = () => $('lsSheet').close();

  function copyText(text, btn) {
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = t; }, 1400); } };
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toastMsg('Press and hold the text to copy it.'); } ta.remove(); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  function copyBlock(L, site) {
    const t = titleFor(L, site), d = descFor(L, site);
    return '<div class="ls-copy"><h3>' + SITES[site] + '</h3>' +
      '<div class="ls-field"><div class="ls-fhead"><span>Title' + (site === 'ebay' ? ' <small>' + t.length + '/80</small>' : '') + '</span><button type="button" class="button small ghost" data-cp="' + site + 'Title">📋 Copy</button></div><div class="ls-text">' + esc(t) + '</div></div>' +
      '<div class="ls-field"><div class="ls-fhead"><span>Description</span><button type="button" class="button small ghost" data-cp="' + site + 'Desc">📋 Copy</button></div><div class="ls-text ls-desc">' + esc(d) + '</div></div>' +
      (L.price ? '<div class="ls-field"><div class="ls-fhead"><span>Price ' + money(Number(L.price)) + '</span><button type="button" class="button small ghost" data-cp="price">📋 Copy</button></div></div>' : '') + '</div>';
  }
  function wireCopy(L) {
    $('lsBody').querySelectorAll('[data-cp]').forEach(b => b.onclick = () => {
      const k = b.dataset.cp, site = k.startsWith('ebay') ? 'ebay' : 'vinted';
      copyText(k === 'price' ? Number(L.price).toFixed(2) : k.endsWith('Title') ? titleFor(L, site) : descFor(L, site), b);
    });
  }
  function copySheet(L) {
    const sites = (L.sites && L.sites.length ? L.sites : ['vinted', 'ebay']);
    sheet('Copy listing', '<p class="helper">Open the ' + sites.map(s => SITES[s]).join(' or ') + ' app, then copy each part and paste it in. Your photos are already in your camera roll.</p>' +
      sites.map(s => copyBlock(L, s)).join('') +
      '<div class="sheet-actions"><button type="button" class="button ghost" id="lsEditBtn">Edit details</button>' + (status(L) === 'draft' ? '<button type="button" class="button" id="lsListBtn">✓ Mark listed</button>' : '') + '</div>');
    wireCopy(L);
    $('lsEditBtn').onclick = () => edit(L.id);
    if ($('lsListBtn')) $('lsListBtn').onclick = () => listSheet(L);
  }
  function listSheet(L) {
    const on = L.sites && L.sites.length ? L.sites : ['vinted'];
    sheet('Mark listed', '<p class="helper">Where did you list ' + esc(nameOf(L)) + '?</p>' +
      Object.entries(SITES).map(([k, n]) => '<label class="ls-check"><input type="checkbox" name="lsSite" value="' + k + '"' + (on.includes(k) ? ' checked' : '') + '> ' + n + '</label>').join('') +
      '<label>Listed on<input type="date" id="lsListDate" value="' + (L.listedAt || iso()) + '"></label>' +
      '<div class="sheet-actions"><button type="button" class="button" id="lsListGo">Save</button></div>');
    $('lsListGo').onclick = () => {
      const sites = [...document.querySelectorAll('[name=lsSite]:checked')].map(c => c.value);
      if (!sites.length) { toastMsg('Pick Vinted, eBay or both.'); return; }
      L.sites = sites; L.listedAt = $('lsListDate').value || iso(); close(); touch(L); toastMsg('Marked listed on ' + sites.map(s => SITES[s]).join(' + ') + '.');
    };
  }
  function soldSheet(L) {
    const site = (L.sites || [])[0] || 'vinted', price = Number(L.price) || 0;
    sheet('Sold!', '<p class="helper">' + esc(nameOf(L)) + '</p>' +
      '<div class="seg" id="lsSoldOn">' + Object.entries(SITES).map(([k, n]) => '<button type="button" data-so="' + k + '" class="' + (k === site ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
      '<div class="sheet-row"><label>Sold for<input type="number" inputmode="decimal" step=".01" min="0" id="lsSoldPrice" value="' + (price ? price.toFixed(2) : '') + '"></label>' +
      '<label>Your payout<input type="number" inputmode="decimal" step=".01" min="0" id="lsPayout" value="' + (price ? payoutGuess(site, price).toFixed(2) : '') + '"></label></div>' +
      '<p class="helper" id="lsFeeNote"></p>' +
      '<label>Date sold<input type="date" id="lsSoldDate" value="' + iso() + '"></label>' +
      '<label class="ls-check"><input type="checkbox" id="lsToSales" checked> Add the payout to Sold items</label>' +
      '<div class="sheet-actions"><button type="button" class="button" id="lsSoldGo">Save sale</button></div>');
    let soldOn = site, payTouched = false;
    const note = () => { $('lsFeeNote').textContent = soldOn === 'ebay' ? 'Estimated after eBay\'s fee (about 13.6% + $0.40). Change it to what eBay actually paid.' : 'Vinted doesn\'t charge sellers a fee, so the payout is the sale price.'; };
    const refill = () => { if (!payTouched) { const p = Number($('lsSoldPrice').value) || 0; $('lsPayout').value = p ? payoutGuess(soldOn, p).toFixed(2) : ''; } note(); };
    $('lsSoldOn').querySelectorAll('[data-so]').forEach(b => b.onclick = () => { soldOn = b.dataset.so; $('lsSoldOn').querySelectorAll('[data-so]').forEach(x => x.classList.toggle('on', x === b)); refill(); });
    $('lsSoldPrice').oninput = refill; $('lsPayout').oninput = () => { payTouched = true; };
    note();
    $('lsSoldGo').onclick = () => {
      const sold = Number($('lsSoldPrice').value) || 0, payout = Number($('lsPayout').value), d = $('lsSoldDate').value || iso();
      if (!(payout >= 0) || $('lsPayout').value === '') { toastMsg('Fill in your payout.'); return; }
      Object.assign(L, { soldOn, soldPrice: sold, payout, soldAt: d });
      const other = (L.sites || []).filter(s => s !== soldOn);
      if ($('lsToSales').checked) {
        let m = monthName(d); if (typeof months !== 'undefined' && !months.includes(m)) m = currentMonth;
        (data.sales[m] = data.sales[m] || []).push({ item: nameOf(L), booth: BOOTH[soldOn], amount: payout, date: d, manual: true, listing: L.id });
        L.saleMonth = m;
      }
      close(); touch(L); if (window.render) window.render();
      toastMsg(other.length ? 'Sale saved. Remember to delete it on ' + other.map(s => SITES[s]).join(' and ') + '!' : 'Sale saved. Don\'t forget to ship it!');
    };
  }
  function shipSheet(L) {
    sheet('Shipped', '<p class="helper">' + esc(nameOf(L)) + '</p>' +
      '<label>Date shipped<input type="date" id="lsShipDate" value="' + iso() + '"></label>' +
      '<label>Tracking number <small>(optional)</small><input id="lsTrack" value="' + esc(L.tracking || '') + '" autocomplete="off"></label>' +
      '<div class="sheet-actions"><button type="button" class="button" id="lsShipGo">Save</button></div>');
    $('lsShipGo').onclick = () => { L.shippedAt = $('lsShipDate').value || iso(); L.tracking = $('lsTrack').value.trim(); close(); touch(L); toastMsg('Marked shipped.'); };
  }

  // ---------- add / edit ----------
  function shrink(file) {
    return new Promise((ok, bad) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 220 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(url); bad(); };
      img.src = url;
    });
  }
  function edit(id) {
    const L = id ? byId(id) : { kind: 'flannel', sites: ['vinted', 'ebay'], cond: 'Very good', custom: {} };
    if (!L) return;
    L.custom = L.custom || {};
    const f = (k, label, ph, extra) => '<label>' + label + '<input data-f="' + k + '" value="' + esc(L[k] || '') + '" placeholder="' + esc(ph || '') + '"' + (extra || '') + '></label>';
    sheet(id ? 'Edit listing' : 'New listing',
      '<label class="camera-btn ls-cam' + (L.photo ? ' has' : '') + '"><input type="file" accept="image/*" capture="environment" id="lsPhoto"><img class="cam-thumb" id="lsPhotoImg" alt=""' + (L.photo ? ' src="' + L.photo + '"' : ' hidden') + '><span class="cam-text">' + (L.photo ? '✓ Photo added · tap to retake' : '📷 Add a photo (to recognize it later)') + '</span></label>' +
      '<div class="ls-sitepick">Selling on ' + Object.entries(SITES).map(([k, n]) => '<label class="ls-check"><input type="checkbox" name="lsEdSite" value="' + k + '"' + ((L.sites || []).includes(k) ? ' checked' : '') + '> ' + n + '</label>').join('') + '</div>' +
      '<label>What is it?<select data-f="kind">' + Object.entries(KINDS).map(([k, v]) => '<option value="' + k + '"' + (L.kind === k ? ' selected' : '') + '>' + v.label + '</option>').join('') + '</select></label>' +
      '<div class="sheet-row">' + f('brand', 'Brand', 'Wrangler') + f('item', 'Item name', (KINDS[L.kind] || {}).item || 'Shacket') + '</div>' +
      '<div class="sheet-row">' + f('color', 'Color / pattern', 'Red Plaid') + f('size', 'Size', 'L') + '</div>' +
      '<div class="sheet-row"><label>For<select data-f="who">' + ['', 'Women\'s', 'Men\'s', 'Unisex', 'Kids'].map(w => '<option value="' + w + '"' + ((L.who || '') === w ? ' selected' : '') + '>' + (w || '—') + '</option>').join('') + '</select></label>' +
      '<label>Condition<select data-f="cond">' + CONDITIONS.map(c => '<option' + (L.cond === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label></div>' +
      '<div class="sheet-row">' + f('material', 'Material', '100% Cotton') + f('keywords', 'Extra search words', 'Grunge Oversized') + '</div>' +
      '<div class="sheet-row">' + f('pit', 'Pit to pit (in.)', '22', ' inputmode="decimal"') + f('len', 'Length (in.)', '30', ' inputmode="decimal"') + '</div>' +
      f('flaws', 'Flaws', 'Small mark on left cuff') +
      '<label>Other notes<textarea data-f="notes" rows="2" placeholder="Soft and warm, perfect for fall.">' + esc(L.notes || '') + '</textarea></label>' +
      '<div class="sheet-row">' + f('price', 'Asking price', '25.00', ' type="number" step=".01" min="0" inputmode="decimal"') + f('cost', 'What you paid', '4.00', ' type="number" step=".01" min="0" inputmode="decimal"') + '</div>' +
      '<p class="helper" id="lsProfit"></p>' +
      '<h3 class="ls-prev-h">Preview <small>(updates as you type; tap any text to change it)</small></h3><div id="lsPreview"></div>' +
      '<div class="sheet-actions">' + (id ? '<button type="button" class="button ghost ls-del" id="lsDel">Delete</button>' : '') + '<button type="button" class="button ghost" id="lsSave">Save</button>' + (status(L) === 'draft' ? '<button type="button" class="button" id="lsSaveCopy">Save &amp; copy</button>' : '') + '</div>');
    const read = () => {
      $('lsBody').querySelectorAll('[data-f]').forEach(el => { L[el.dataset.f] = el.value.trim(); });
      L.sites = [...document.querySelectorAll('[name=lsEdSite]:checked')].map(c => c.value);
    };
    const preview = () => {
      read();
      const p = Number(L.price) || 0, c = Number(L.cost) || 0, sites = L.sites.length ? L.sites : ['vinted'];
      $('lsProfit').textContent = p ? sites.map(s => SITES[s] + ': about ' + money(payoutGuess(s, p) - c) + ' profit').join(' · ') : '';
      $('lsPreview').innerHTML = sites.map(s => {
        const t = titleFor(L, s), d = descFor(L, s);
        return '<div class="ls-copy"><h3>' + SITES[s] + '</h3><label>Title' + (s === 'ebay' ? ' <small id="lsCount_' + s + '">' + t.length + '/80</small>' : '') + '<input data-ct="' + s + 'Title" value="' + esc(t) + '"' + (s === 'ebay' ? ' maxlength="80"' : '') + '></label>' +
          '<label>Description<textarea data-ct="' + s + 'Desc" rows="6">' + esc(d) + '</textarea></label>' +
          (L.custom[s + 'Title'] || L.custom[s + 'Desc'] ? '<button type="button" class="linkish" data-reset="' + s + '">↻ Go back to the automatic text</button>' : '') + '</div>';
      }).join('');
      $('lsPreview').querySelectorAll('[data-ct]').forEach(el => el.oninput = () => { L.custom[el.dataset.ct] = el.value; const n = $('lsCount_ebay'); if (n && el.dataset.ct === 'ebayTitle') n.textContent = el.value.length + '/80'; });
      $('lsPreview').querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { delete L.custom[b.dataset.reset + 'Title']; delete L.custom[b.dataset.reset + 'Desc']; preview(); });
    };
    $('lsBody').querySelectorAll('[data-f], [name=lsEdSite]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
      if (el.dataset.f === 'kind') { const it = $('lsBody').querySelector('[data-f=item]'); it.placeholder = (KINDS[el.value] || {}).item || ''; }
      preview();
    }));
    $('lsPhoto').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try { L.photo = await shrink(file); $('lsPhotoImg').src = L.photo; $('lsPhotoImg').hidden = false; $('lsBody').querySelector('.ls-cam').classList.add('has'); $('lsBody').querySelector('.ls-cam .cam-text').textContent = '✓ Photo added · tap to retake'; }
      catch (err) { toastMsg('That photo couldn\'t be read. Try another one.'); }
    };
    preview();
    const keep = () => {
      read();
      Object.keys(L.custom).forEach(k => { if (!L.custom[k]) delete L.custom[k]; });
      if (!L.brand && !L.item && !L.color && !L.notes) { toastMsg('Add at least a brand or item name.'); return false; }
      if (!id) { L.id = uid(); L.created = iso(); list().push(L); }
      touch(L); return true;
    };
    $('lsSave').onclick = () => { if (keep()) { close(); toastMsg('Listing saved.'); } };
    if ($('lsSaveCopy')) $('lsSaveCopy').onclick = () => { if (keep()) copySheet(L); };
    if (id) $('lsDel').onclick = () => {
      if (!confirm('Delete ' + nameOf(L) + '?' + (L.saleMonth ? ' Its sale stays in Sold items.' : ''))) return;
      data.listings = list().filter(x => x.id !== L.id); save(); close(); draw();
    };
  }

  // Redraw after other devices' data arrives or anything else changes.
  const baseRender = window.render;
  window.render = function () { if (baseRender) baseRender.apply(this, arguments); if (!data.listings) data.listings = []; draw(); };
})();
