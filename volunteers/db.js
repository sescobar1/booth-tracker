// Cloud copy in Supabase. Everything saves on the device first, so check-in works without
// signal. When signed in, changes go up shortly after, and sign-ups from the public page
// (and edits on your other devices) come down live.
//
// Sync compares each list with the last copy the cloud confirmed: rows that differ are sent,
// rows that disappeared are deleted, and anything not changed here takes the cloud's version.
(function () {
  const $ = id => document.getElementById(id);
  const CFG = window.VOL_CONFIG || {};
  const KEY = CFG.storageKey || 'bandVolunteers';
  const LS = {
    get: k => { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(KEY + k) : localStorage.setItem(KEY + k, v); } catch (e) {} }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => window.toast && window.toast(m);

  // App list -> table, with field names on each side. Order matters: parents before children.
  const COLS = [
    { key: 'events', table: 'vol_events', map: { id: 'id', name: 'name', date: 'date', start: 'start_time', end: 'end_time', location: 'location', notes: 'notes', isPublic: 'is_public' } },
    { key: 'jobs', table: 'vol_jobs', map: { id: 'id', eventId: 'event_id', role: 'role', need: 'need', start: 'start_time', end: 'end_time', sort: 'sort' } },
    { key: 'people', table: 'vol_people', map: { id: 'id', first: 'first', last: 'last', phone: 'phone', email: 'email', type: 'type', parent: 'parent', notes: 'notes' } },
    { key: 'slots', table: 'vol_signups', map: { id: 'id', eventId: 'event_id', jobId: 'job_id', personId: 'person_id', role: 'role', start: 'start_time', end: 'end_time', source: 'source', inAt: 'in_at', outAt: 'out_at', textedAt: 'texted_at' } }
  ];
  const DEFAULTS = { isPublic: true, need: 1, sort: 0, type: 'adult' };

  const NULLABLE = new Set(['jobId', 'inAt', 'outAt', 'textedAt']);
  // One shape for comparing a row from this device with the cloud's copy of it.
  const norm = (c, o) => {
    const r = {};
    Object.keys(c.map).forEach(k => {
      let v = o[k];
      if (v == null || v === '') v = k in DEFAULTS ? DEFAULTS[k] : NULLABLE.has(k) ? null : '';
      if (/At$/.test(k) && v) v = new Date(v).toISOString();
      if (k === 'need' || k === 'sort') v = Number(v) || 0;
      if (k === 'isPublic') v = !!v;
      r[k] = v;
    });
    return r;
  };
  const toRow = (c, o, owner) => { const n = norm(c, o), r = { owner, updated_at: new Date().toISOString() }; Object.entries(c.map).forEach(([k, col]) => { r[col] = n[k]; }); return r; };
  const fromRow = (c, r) => { const o = {}; Object.entries(c.map).forEach(([k, col]) => { o[k] = r[col]; }); return norm(c, o); };
  const sig = (c, o) => JSON.stringify(norm(c, o));
  const settingsOf = d => ({ settings: d.settings || {}, templates: d.templates || [] });

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
        if (rows.length) {
          const { error } = await sb.from(c.table).upsert(rows.map(o => toRow(c, o, user.id)));
          if (error) throw error;
          rows.forEach(o => { s[o.id] = sig(c, o); });
          saveSynced();
        }
      }
      for (const c of COLS.slice().reverse()) {
        const s = synced[c.key] || {};
        const have = new Set((data[c.key] || []).map(o => o.id));
        const gone = Object.keys(s).filter(id => !have.has(id));
        if (gone.length) {
          const { error } = await sb.from(c.table).delete().in('id', gone);
          if (error) throw error;
          gone.forEach(id => delete s[id]);
          saveSynced();
        }
      }
      const st = JSON.stringify(settingsOf(data));
      if (synced.settings !== st) {
        const { error } = await sb.from('vol_settings').upsert({ owner: user.id, data: settingsOf(data), updated_at: new Date().toISOString() });
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
      const res = await Promise.all(COLS.map(c => sb.from(c.table).select('*').range(0, 9999)));
      const bad = res.find(r => r.error); if (bad) throw bad.error;
      const st = await sb.from('vol_settings').select('data').eq('owner', user.id).maybeSingle();
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
        const remote = JSON.stringify(st.data.data), mine = JSON.stringify(settingsOf(data));
        if (synced.settings === undefined || mine === synced.settings) {
          if (remote !== mine) { data.settings = Object.assign({}, data.settings, st.data.data.settings || {}); if (st.data.data.templates && st.data.data.templates.length) data.templates = st.data.data.templates; changed = true; }
          synced.settings = remote; // anything only on this device (like a new message) gets sent next
        }
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
    channel = sb.channel('vol-' + user.id);
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
        box.innerHTML = '<div class="helper">Sign in with the same email and password you use for the Booth Tracker. This turns on your sign-up page and keeps your phone and computer matched.</div>' +
          '<div class="sync-form"><input class="syncEmail" type="email" placeholder="Email" autocomplete="username"><input class="syncPass" type="password" placeholder="Password" autocomplete="current-password">' +
          '<div class="row-actions"><button type="button" data-sync="in">Sign in</button><button type="button" class="ghost" data-sync="up">Create account</button></div></div>' +
          '<div class="helper" id="syncStatus">' + esc(status) + '</div>';
      } else {
        box.innerHTML = '<div class="helper">Signed in as <b>' + esc(user.email) + '</b>. New sign-ups show up here by themselves.</div>' +
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

  window.volSync = { renderBox, user: () => user, client: () => sb, refresh: pull };
  start();
})();
