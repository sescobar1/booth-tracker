// Sync between devices with Supabase. Everything still saves on the device first, so the app
// works without signal; when signed in, each change is sent to the cloud and other signed-in
// devices pick it up live. Receipt photos stay on the device they were taken on.
(function () {
  const $ = id => document.getElementById(id);
  const CFG = window.BOOTH_CONFIG || {};
  const KEY = CFG.storageKey || 'boothMonthlyTracker';
  const LS = {
    get: k => { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(KEY + k) : localStorage.setItem(KEY + k, v); } catch (e) {} }
  };
  const toast = msg => (window.toast ? window.toast(msg) : null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // The project comes from config.js, or is typed in once on this device.
  let project = CFG.sync && CFG.sync.url ? CFG.sync : JSON.parse(LS.get('SyncProject') || 'null');
  const device = LS.get('SyncDevice') || (LS.set('SyncDevice', Math.random().toString(36).slice(2)), LS.get('SyncDevice'));

  let sb = null, user = null, channel = null, pushTimer = null, applying = false, status = '';
  const syncedAt = () => LS.get('SyncAt') || '';
  const dirty = () => LS.get('SyncDirty') === '1';

  // Every save marks the data as not yet sent, then sends it shortly after.
  const beforeSync = window.save;
  window.save = function () {
    beforeSync();
    if (applying) return;
    LS.set('SyncDirty', '1');
    if (user) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); }
  };

  function setStatus(s) { status = s; const el = $('syncStatus'); if (el) el.textContent = s; }
  const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function push() {
    if (!user || !navigator.onLine) { setStatus('Offline. Changes will sync when you have signal.'); return; }
    const stamp = new Date().toISOString();
    const { error } = await sb.from('booth_data').upsert({ user_id: user.id, data, updated_at: stamp, device });
    if (error) { setStatus('Could not sync yet: ' + error.message); return; }
    LS.set('SyncAt', stamp); LS.set('SyncDirty', null);
    setStatus('Synced ' + when(stamp) + '.');
  }

  // Swap in the other device's data without reloading the page.
  function apply(remote, stamp) {
    applying = true;
    try {
      Object.keys(data).forEach(k => delete data[k]);
      Object.assign(data, remote);
      window.save();
      LS.set('SyncAt', stamp); LS.set('SyncDirty', null);
      if (typeof window.render === 'function') window.render();
    } finally { applying = false; }
    setStatus('Synced ' + when(stamp) + '.');
  }

  async function pull(first) {
    if (!user || !navigator.onLine) return;
    const { data: row, error } = await sb.from('booth_data').select('data, updated_at, device').eq('user_id', user.id).maybeSingle();
    if (error) { setStatus('Could not sync yet: ' + error.message); return; }
    if (!row) { await push(); toast('This device\'s data is now in the cloud.'); return; }
    if (row.updated_at <= syncedAt()) { if (dirty()) await push(); else setStatus('Synced ' + when(row.updated_at) + '.'); return; }
    // The cloud has something newer than this device last saw.
    if (dirty() || (first && !syncedAt())) {
      const useCloud = confirm('Your other device saved changes ' + when(row.updated_at) + '.\n\nOK: use the cloud copy on this device.\nCancel: keep this device\'s copy and send it to the cloud.\n\n(Either way, an automatic copy of this device is kept under Import & backup.)');
      if (!useCloud) { await push(); return; }
    }
    apply(row.data, row.updated_at);
    if (!first) toast('Updated from your other device.');
  }

  function listen() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('booth-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_data', filter: 'user_id=eq.' + user.id }, p => {
        const row = p.new || {};
        if (row.device === device || !row.updated_at || row.updated_at <= syncedAt()) return;
        if (dirty()) { pull(false); return; }
        apply(row.data, row.updated_at);
        toast('Updated from your other device.');
      })
      .subscribe();
  }

  async function signedIn(u) {
    user = u; renderBox();
    await pull(true);
    listen();
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
    if (!project) { renderBox(); return; }
    try {
      await loadClient();
      sb = window.supabase.createClient(project.url, project.key, { auth: { storageKey: KEY + 'Auth', persistSession: true, autoRefreshToken: true } });
      const { data: s } = await sb.auth.getSession();
      sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_OUT') { user = null; renderBox(); } });
      if (s.session) await signedIn(s.session.user); else renderBox();
    } catch (e) { setStatus(e.message); renderBox(); }
  }

  // Phones pause the live connection in the background, so check again when the app comes back.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) pull(false); });
  window.addEventListener('online', () => { if (user) pull(false); });

  function renderBox() {
    const box = $('syncBody'); if (!box) return;
    if (!project) {
      box.innerHTML = '<div class="helper">Connect a free Supabase project to keep your phone and computer in sync. Paste its Project URL and anon public key.</div>' +
        '<div class="sync-form"><input id="syncUrl" placeholder="https://xxxx.supabase.co" autocomplete="off"><input id="syncKey" placeholder="anon public key" autocomplete="off">' +
        '<button type="button" class="button" id="syncConnect">Connect</button></div>';
      return;
    }
    if (!user) {
      box.innerHTML = '<div class="helper">Sign in with the same email and password on each device. First time? Tap <b>Create account</b>, then open the email Supabase sends you.</div>' +
        '<div class="sync-form"><input id="syncEmail" type="email" placeholder="Email" autocomplete="username"><input id="syncPass" type="password" placeholder="Password" autocomplete="current-password">' +
        '<button type="button" class="button" id="syncIn">Sign in</button> <button type="button" class="button ghost" id="syncUp">Create account</button></div>' +
        '<div class="helper" id="syncStatus">' + esc(status) + '</div>' +
        (CFG.sync && CFG.sync.url ? '' : '<div class="helper"><button type="button" class="linkish" id="syncForget">Use a different Supabase project</button></div>');
      return;
    }
    box.innerHTML = '<div class="helper">Signed in as <b>' + esc(user.email) + '</b>. Changes on this device show up on your other devices automatically.</div>' +
      '<div class="helper" id="syncStatus">' + esc(status || 'Syncing…') + '</div>' +
      '<button type="button" class="button ghost" id="syncNow">Sync now</button> <button type="button" class="button ghost" id="syncOut">Sign out</button>';
  }

  document.addEventListener('click', async e => {
    const id = e.target && e.target.id;
    if (id === 'syncConnect') {
      const url = $('syncUrl').value.trim().replace(/\/+$/, ''), key = $('syncKey').value.trim();
      if (!/^https:\/\/.+/.test(url) || key.length < 20) { toast('Paste the Project URL and the anon public key.'); return; }
      project = { url, key }; LS.set('SyncProject', JSON.stringify(project)); start();
    } else if (id === 'syncForget') {
      if (sb) await sb.auth.signOut().catch(() => {});
      project = null; user = null; LS.set('SyncProject', null); renderBox();
    } else if (id === 'syncIn' || id === 'syncUp') {
      const email = $('syncEmail').value.trim(), password = $('syncPass').value;
      if (!email || password.length < 6) { toast('Enter your email and a password of at least 6 characters.'); return; }
      setStatus(id === 'syncIn' ? 'Signing in…' : 'Creating your account…');
      const r = id === 'syncIn' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
      if (r.error) { setStatus(r.error.message); return; }
      if (r.data.session) signedIn(r.data.session.user);
      else setStatus('Check your email and tap the link to confirm, then come back and sign in.');
    } else if (id === 'syncNow') {
      setStatus('Syncing…'); await pull(false); if (dirty()) await push();
    } else if (id === 'syncOut') {
      if (!confirm('Sign out? Your data stays on this device but stops syncing.')) return;
      if (channel) sb.removeChannel(channel);
      await sb.auth.signOut(); user = null; status = ''; renderBox();
    }
  });

  start();
})();
