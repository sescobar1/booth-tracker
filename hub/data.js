// Shared sign-in for the hub widgets. All widgets in Notion share one sign-in,
// so signing in on one of them unlocks the others.
(function () {
  const CFG = window.BOOTH_CONFIG.sync, KEY = 'hubAuth';
  let sb;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.esc = esc;
  window.$money = n => '$' + Math.round(n).toLocaleString();
  window.isoDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function signInForm(box, draw, msg) {
    box.innerHTML = '<p class="muted small">Sign in once with your app email to show your numbers here.</p>' +
      '<form class="signin"><input type="email" placeholder="Email" autocomplete="username" required><input type="password" placeholder="Password" autocomplete="current-password" required><button class="btn">Sign in</button></form>' +
      '<p class="muted small" id="sMsg">' + esc(msg || '') + '</p>';
    box.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const [em, pw] = e.target.querySelectorAll('input');
      box.querySelector('#sMsg').textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
      if (error) box.querySelector('#sMsg').textContent = error.message; else run(box, draw);
    };
  }

  async function run(box, draw) {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return signInForm(box, draw);
    try { await draw(sb, s.session.user); } catch (e) { box.innerHTML = '<p class="muted small">Couldn\'t load right now. ' + esc(e.message) + '</p>'; }
  }

  window.hubData = function (draw, every) {
    const box = document.getElementById('body');
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { storageKey: KEY, persistSession: true, autoRefreshToken: true } });
    run(box, draw);
    // Another widget signed in: redraw this one too.
    window.addEventListener('storage', e => { if (e.key === KEY) run(box, draw); });
    setInterval(() => run(box, draw), (every || 15) * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(box, draw); });
  };
})();
