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
    // Already signed in to one of the apps on this site (like the Planner)? Use that sign-in here too.
    try { if (!localStorage.getItem(KEY)) { const k = ['plannerAppAuth', 'moneyAppAuth', 'boothMonthlyTrackerAuth', 'bandVolunteersAuth'].find(x => localStorage.getItem(x)); if (k) localStorage.setItem(KEY, localStorage.getItem(k)); } } catch (e) {}
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { storageKey: KEY, persistSession: true, autoRefreshToken: true } });
    run(box, draw);
    // Another widget signed in: redraw this one too.
    window.addEventListener('storage', e => { if (e.key === KEY) run(box, draw); });
    setInterval(() => run(box, draw), (every || 15) * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(box, draw); });
  };
})();

// Small synced notes for the hub (habits, gift ideas, checklists), one row per key.
window.hubGet = async (sb, key) => { const { data, error } = await sb.from('hub_state').select('data').eq('key', key).maybeSingle(); if (error) throw error; return data ? data.data : {}; };
window.hubSet = async (sb, key, val) => { const { error } = await sb.from('hub_state').upsert({ key, data: val, updated_at: new Date().toISOString() }, { onConflict: 'owner,key' }); if (error) throw error; };
window.weekStart = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

// Notion shows the hub boxes in a locked-down frame that can block normal form sending, so pressing Enter
// or tapping a form's button never reaches the page. Send those ourselves so typing in a box always saves.
(function () {
  const send = form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
    const t = e.target; if (!t || t.tagName !== 'INPUT' || !t.form || /^(button|submit|checkbox|radio|file)$/i.test(t.type)) return;
    e.preventDefault(); send(t.form);
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, input[type=submit]'); if (!b || !b.form) return;
    if ((b.getAttribute('type') || 'submit').toLowerCase() !== 'submit') return;
    e.preventDefault(); send(b.form);
  }, true);
})();

// The Notion frame can also block pop-up questions and alerts, so ask and tell right on the page instead.
window.ask = msg => new Promise(done => {
  const s = document.createElement('div');
  s.style.cssText = 'position:fixed;inset:0;background:#26342855;display:flex;align-items:flex-start;justify-content:center;padding:20px;z-index:99';
  s.innerHTML = '<div style="background:#fbfaf6;border-radius:14px;padding:16px 18px;max-width:340px;width:100%;box-shadow:0 10px 30px #0002;font-family:Lora,Georgia,serif;color:#263428"><p style="margin:0 0 14px;font-size:15px;line-height:1.4"></p>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end"><button data-a="0" style="font:inherit;font-size:13px;border:1px solid #e6e2d8;border-radius:8px;padding:7px 12px;background:none;cursor:pointer">Cancel</button><button data-a="1" style="font:inherit;font-size:13px;border:0;border-radius:8px;padding:7px 14px;background:#7d9178;color:#fff;cursor:pointer">OK</button></div></div>';
  s.querySelector('p').textContent = msg;
  s.onclick = e => { const b = e.target.closest('[data-a]'); if (b || e.target === s) { s.remove(); done(!!(b && b.dataset.a === '1')); } };
  document.body.appendChild(s); s.querySelector('[data-a="1"]').focus();
});
window.alert = msg => {
  const t = document.createElement('div'); t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#263428;color:#fff;padding:9px 14px;border-radius:10px;font:14px Lora,Georgia,serif;z-index:100;max-width:90%';
  document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
};
