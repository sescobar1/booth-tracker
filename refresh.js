// Pull down at the top of any screen to refresh: checks for a newer version of the app and reloads the page.
// Home Screen apps on iPhone don't have pull-to-refresh, so this adds it to every app here.
(function () {
  if (window.__pullRefresh) return; window.__pullRefresh = true;
  const css = document.createElement('style');
  css.textContent = '.ptr{position:fixed;left:50%;top:0;z-index:9999;transform:translate(-50%,-60px);display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:#2b2522;color:#fff;font:600 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .15s}' +
    '.ptr i{display:inline-block;font-style:normal;font-size:18px;transition:transform .15s}.ptr.ready i{transform:rotate(180deg)}.ptr.spin i{animation:ptrspin .8s linear infinite}@keyframes ptrspin{to{transform:rotate(360deg)}}' +
    '@media (prefers-color-scheme:dark){.ptr{background:#f2ede8;color:#2b2522}}';
  document.head.appendChild(css);
  const el = document.createElement('div'); el.className = 'ptr'; el.innerHTML = '<i>↓</i><span>Pull to refresh</span>';
  const add = () => document.body.appendChild(el);
  document.body ? add() : document.addEventListener('DOMContentLoaded', add);
  const LIMIT = 80;
  let startY = null, pull = 0, busy = false;
  // Don't start a pull inside something that scrolls on its own (an open popup, a long list) unless it's at its top.
  const blocked = t => { for (let n = t; n && n !== document.body; n = n.parentElement) { if (n.scrollTop > 0) return true; if (n.matches && n.matches('dialog[open], .modal:not([hidden]), input, textarea, select, [contenteditable]')) return true; } return false; };
  const show = () => {
    const d = Math.min(pull, LIMIT * 1.4);
    el.style.opacity = d > 10 ? 1 : 0;
    el.style.transform = 'translate(-50%,' + (d * 0.8 - 50) + 'px)';
    el.classList.toggle('ready', pull >= LIMIT);
    el.lastChild.textContent = pull >= LIMIT ? 'Let go to refresh' : 'Pull to refresh';
  };
  addEventListener('touchstart', e => { if (busy || e.touches.length !== 1 || (window.scrollY || document.documentElement.scrollTop) > 0 || blocked(e.target)) { startY = null; return; } startY = e.touches[0].clientY; pull = 0; }, { passive: true });
  addEventListener('touchmove', e => { if (startY == null) return; pull = Math.max(0, e.touches[0].clientY - startY); if ((window.scrollY || 0) > 0) { startY = null; pull = 0; } show(); }, { passive: true });
  addEventListener('touchend', async () => {
    if (startY == null) return; startY = null;
    if (pull < LIMIT) { pull = 0; show(); return; }
    busy = true; el.classList.remove('ready'); el.classList.add('spin'); el.innerHTML = '<i>↻</i><span>Refreshing…</span>';
    el.style.opacity = 1; el.style.transform = 'translate(-50%,16px)';
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await Promise.race([reg.update(), new Promise(r => setTimeout(r, 2500))]);
    } catch (e) {}
    location.reload();
  });
})();
