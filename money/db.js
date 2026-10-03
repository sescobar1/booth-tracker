// Cloud copy in Supabase. Everything saves on the device first, so check-in works without
// signal. When signed in, changes go up shortly after, and sign-ups from the public page
// (and edits on your other devices) come down live.
//
// Sync compares each list with the last copy the cloud confirmed: rows that differ are sent,
// rows that disappeared are deleted, and anything not changed here takes the cloud's version.
(function () {
  const $ = id => document.getElementById(id);
  const CFG = window.MONEY_CONFIG || {};
  const KEY = CFG.storageKey || 'moneyApp';
  const LS = {
    get: k => { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(KEY + k) : localStorage.setItem(KEY + k, v); } catch (e) {} }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => window.toast && window.toast(m);

  // App list -> table, with field names on each side. Order matters: parents before children.
  const COLS = [
    { key: 'accounts', table: 'money_accounts', map: { id: 'id', name: 'name', kind: 'kind', openingBalance: 'opening_balance', openingDate: 'opening_date', sort: 'sort' } },
    { key: 'tx', table: 'money_tx', map: { id: 'id', accountId: 'account_id', date: 'date', time: 'time', payee: 'payee', amount: 'amount', type: 'type', category: 'category', note: 'note', checkNum: 'check_num', cleared: 'cleared', taxCat: 'tax_cat', receipt: 'receipt', source: 'source', bankAmount: 'bank_amount', tags: 'tags' } },
    { key: 'docs', table: 'money_docs', map: { id: 'id', year: 'year', kind: 'kind', title: 'title', checklist: 'checklist', taxCat: 'tax_cat', amount: 'amount', file: 'file', fileName: 'file_name', txId: 'tx_id', note: 'note' } }
  ];
  const DEFAULTS = { sort: 0, kind: 'checking', type: 'expense', cleared: false, openingBalance: 0 };
  // Docs and accounts share some names, so their own defaults are applied before syncing.
  const NULLABLE = new Set(['openingDate', 'txId', 'docAmount', 'bankAmount']);
  // One shape for comparing a row from this device with the cloud's copy of it.
  const norm = (c, o) => {
    const r = {};
    Object.keys(c.map).forEach(k => {
      let v = o[k];
      if (v == null || v === '') v = k in DEFAULTS ? DEFAULTS[k] : NULLABLE.has(k) ? null : '';
      if (c.key === 'docs' && k === 'kind' && (o[k] == null || o[k] === '')) v = 'tax';
      if (c.key === 'docs' && k === 'amount') v = o[k] == null || o[k] === '' ? null : Math.round(Number(o[k]) * 100) / 100;
      else if (k === 'bankAmount') v = o[k] == null || o[k] === '' ? null : Math.round(Number(o[k]) * 100) / 100;
      else if (k === 'amount' || k === 'openingBalance') v = Math.round((Number(v) || 0) * 100) / 100;
      if (k === 'sort' || k === 'year') v = Number(v) || 0;
      if (k === 'cleared') v = !!v;
      if ((k === 'openingDate' || k === 'txId') && !v) v = null;
      r[k] = v;
    });
    return r;
  };
  const toRow = (c, o, owner) => { const n = norm(c, o), r = { owner, updated_at: new Date().toISOString() }; Object.entries(c.map).forEach(([k, col]) => { r[col] = n[k]; }); return r; };
  const fromRow = (c, r) => { const o = {}; Object.entries(c.map).forEach(([k, col]) => { o[k] = r[col]; }); return norm(c, o); };
  const sig = (c, o) => JSON.stringify(norm(c, o));
  const settingsOf = d => ({ settings: d.settings || {}, templates: [] });

  let synced = JSON.parse(LS.get('Synced') || 'null') || {};
  const saveSynced = () => LS.set('Synced', JSON.stringify(synced));

  let sb = null, user = null, channel = null, timer = null, pullTimer = null, busy = false, again = false, status = '';
  const project = CFG.sync;

  const localSave = window.save;
  window.save = function () {
    localSave();
    if (user) { clearTimeout(timer); timer = setTimeout(flush, 800); }
    else setStatus('Saved on this device. Sign in to send it to the cloud.');
  };

  function setStatus(s) { status = s; const el = $('syncStatus'); if (el) el.textContent = s; }
  const when = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  async function flush() {
    if (!user || !navigator.onLine) { setStatus('Offline. Changes will send when you have signal.'); return; }
    if (busy) { again = true; return; }
    busy = true;
    try {
      for (const c of COLS) {
        const s = synced[c.key] || (synced[c.key] = {});
        const rows = (data[c.key] || []).filter(o => s[o.id] !== sig(c, o));
        // A year of bank history is about a thousand rows, so send them in batches.
        for (let i = 0; i < rows.length; i += 500) {
          const part = rows.slice(i, i + 500);
          const { error } = await sb.from(c.table).upsert(part.map(o => toRow(c, o, user.id)));
          if (error) throw error;
          part.forEach(o => { s[o.id] = sig(c, o); });
          saveSynced();
        }
      }
      for (const c of COLS.slice().reverse()) {
        const s = synced[c.key] || {};
        const have = new Set((data[c.key] || []).map(o => o.id));
        const gone = Object.keys(s).filter(id => !have.has(id));
        for (let i = 0; i < gone.length; i += 200) {
          const part = gone.slice(i, i + 200);
          const { error } = await sb.from(c.table).delete().in('id', part);
          if (error) throw error;
          part.forEach(id => delete s[id]);
          saveSynced();
        }
      }
      const st = JSON.stringify(settingsOf(data));
      if (synced.settings !== st) {
        const { error } = await sb.from('money_settings').upsert({ owner: user.id, data: settingsOf(data), updated_at: new Date().toISOString() });
        if (error) throw error;
        synced.settings = st; saveSynced();
      }
      setStatus('All changes saved to the cloud at ' + when(new Date()) + '.');
    } catch (e) {
      setStatus('Could not save to the cloud yet: ' + e.message);
    } finally {
      busy = false;
      if (again) { again = false; flush(); }
    }
  }

  async function pull() {
    if (!user || !navigator.onLine) return;
    try {
      // The server hands back at most 1,000 rows at a time, so read page by page (a short read would look like deletions).
      const all = async table => {
        const out = [];
        for (let from = 0; ; from += 1000) {
          const r = await sb.from(table).select('*').order('id').range(from, from + 999);
          if (r.error) return r;
          out.push(...r.data);
          if (r.data.length < 1000) return { data: out, error: null };
        }
      };
      const res = await Promise.all(COLS.map(c => all(c.table)));
      const bad = res.find(r => r.error); if (bad) throw bad.error;
      const st = await sb.from('money_settings').select('data').eq('owner', user.id).maybeSingle();
      if (st.error) throw st.error;
      let changed = false;
      COLS.forEach((c, i) => {
        const s = synced[c.key] || {}, next = {};
        const server = new Map(res[i].data.map(r => { const o = fromRow(c, r); return [o.id, o]; }));
        const local = new Map((data[c.key] || []).map(o => [o.id, o]));
        const out = [];
        server.forEach((o, id) => {
          next[id] = sig(c, o);
          const mine = local.get(id);
          if (mine && s[id] !== undefined && sig(c, mine) !== s[id]) out.push(mine);         // changed here, not sent yet
          else if (!mine && s[id] !== undefined) {}                                           // deleted here, not sent yet
          else { out.push(Object.assign(mine || {}, o)); if (!mine || sig(c, mine) !== sig(c, o)) changed = true; }
        });
        local.forEach((o, id) => {
          if (server.has(id)) return;
          if (s[id] !== undefined && sig(c, o) === s[id]) { changed = true; return; }        // deleted elsewhere (or cancelled)
          out.push(o);                                                                        // new here, not sent yet
        });
        // Keep "deleted here, not sent yet" rows marked as synced so flush deletes them.
        Object.keys(s).forEach(id => { if (server.has(id) && !local.has(id)) next[id] = s[id]; });
        data[c.key] = out;
        synced[c.key] = next;
      });
      if (st.data && st.data.data) {
        // Settings merge one at a time: whatever changed here since the last sync stays, everything
        // else takes the cloud's value. The first sync on a device takes the cloud's values.
        const remote = st.data.data, rs = remote.settings || {}, mine = settingsOf(data);
        const base = synced.settings ? JSON.parse(synced.settings) : null, bs = (base && base.settings) || {};
        const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
        const merged = Object.assign({}, mine.settings);
        Object.keys(rs).forEach(k => { if (!base || same(mine.settings[k], bs[k])) merged[k] = rs[k]; });
        let templates = mine.templates;
        if (remote.templates && remote.templates.length && (!base || same(mine.templates, base.templates))) templates = remote.templates;
        if (!same(merged, mine.settings) || !same(templates, mine.templates)) { data.settings = merged; data.templates = templates; changed = true; }
        synced.settings = JSON.stringify(remote); // anything only on this device gets sent next
      }
      saveSynced();
      localSave();
      if (changed && typeof window.render === 'function') window.render();
      await flush();
    } catch (e) { setStatus('Could not reach the cloud: ' + e.message); }
  }
  const pullSoon = () => { clearTimeout(pullTimer); pullTimer = setTimeout(pull, 600); };

  function listen() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('money-' + user.id);
    COLS.forEach(c => channel.on('postgres_changes', { event: '*', schema: 'public', table: c.table, filter: 'owner=eq.' + user.id }, () => { if (!busy) pullSoon(); }));
    channel.subscribe();
  }

  async function signedIn(u) {
    if (synced.user && synced.user !== u.id) synced = {};
    synced.user = u.id; saveSynced();
    user = u; renderBox();
    setStatus('Getting the latest…');
    await pull();
    listen();
    if (typeof window.render === 'function') window.render();
  }

  function loadClient() {
    return new Promise((ok, no) => {
      if (window.supabase) return ok();
      const s = document.createElement('script');
      s.src = 'vendor/supabase.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load sync. Check your signal.'));
      document.head.appendChild(s);
    });
  }

  async function start() {
    try {
      await loadClient();
      sb = window.supabase.createClient(project.url, project.key, { auth: { storageKey: KEY + 'Auth', persistSession: true, autoRefreshToken: true } });
      const { data: s } = await sb.auth.getSession();
      sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { user = null; renderBox(); if (window.render) window.render(); } });
      if (s.session) await signedIn(s.session.user); else { renderBox(); if (window.render) window.render(); }
    } catch (e) { setStatus(e.message); renderBox(); }
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) pull(); });
  window.addEventListener('online', () => { if (user) pull(); });

  function renderBox() {
    document.querySelectorAll('[data-syncbox]').forEach(box => {
      if (!user) {
        box.innerHTML = '<div class="helper">Sign in with the same email and password you use for the Booth Tracker. Your register, receipts and tax papers stay private to your account and match on your phone and computer.</div>' +
          '<div class="sync-form"><input class="syncEmail" type="email" placeholder="Email" autocomplete="username"><input class="syncPass" type="password" placeholder="Password" autocomplete="current-password">' +
          '<div class="row-actions"><button type="button" data-sync="in">Sign in</button><button type="button" class="ghost" data-sync="up">Create account</button></div></div>' +
          '<div class="helper" id="syncStatus">' + esc(status) + '</div>';
      } else {
        box.innerHTML = '<div class="helper">Signed in as <b>' + esc(user.email) + '</b>. Changes on your other devices show up here by themselves.</div>' +
          '<div class="helper" id="syncStatus">' + esc(status || 'Syncing…') + '</div>' +
          '<div class="row-actions"><button type="button" class="ghost" data-sync="now">Sync now</button><button type="button" class="ghost" data-sync="out">Sign out</button></div>';
      }
    });
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-sync]'); if (!b) return;
    const box = b.closest('[data-syncbox]'), act = b.dataset.sync;
    if (act === 'in' || act === 'up') {
      if (!sb) { toast('Still connecting. Try again in a moment.'); return; }
      const email = box.querySelector('.syncEmail').value.trim(), password = box.querySelector('.syncPass').value;
      if (!email || password.length < 6) { toast('Enter your email and a password of at least 6 characters.'); return; }
      setStatus(act === 'in' ? 'Signing in…' : 'Creating your account…');
      const r = act === 'in' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
      if (r.error) { setStatus(r.error.message); return; }
      if (r.data.session) signedIn(r.data.session.user);
      else setStatus('Check your email and tap the link to confirm, then come back and sign in.');
    } else if (act === 'now') {
      setStatus('Syncing…'); await pull();
    } else if (act === 'out') {
      if (!confirm('Sign out? Your list stays on this device but stops syncing.')) return;
      if (channel) sb.removeChannel(channel);
      await sb.auth.signOut(); user = null; status = ''; renderBox(); if (window.render) window.render();
    }
  });

  window.moneySync = { renderBox, user: () => user, client: () => sb, refresh: pull };
  start();
})();
