// Shared helpers for Cece's clock-in page (clock.html) and Mom's pay page (index.html).
window.WORK = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => (n < 0 ? '−$' : '$') + Math.abs(Number(n) || 0).toFixed(2);
  const hrs = ms => { const m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  const timer = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const shiftMs = s => new Date(s.clock_out) - new Date(s.clock_in);
  // Same rounding as the database: hours × rate, to the cent.
  const shiftPay = s => Math.round(shiftMs(s) / 3600000 * Number(s.rate) * 100) / 100;
  const day = d => new Date(d).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  const dateOnly = d => new Date(d + 'T12:00').toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  const tm = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const KIND = { spend: 'Spent', cash: 'Cash paid out', bonus: 'Bonus' };

  // One checkbook: finished shifts are deposits, spending and cash-outs are withdrawals, bonuses add.
  // Returns newest first with the running balance after each line.
  // endBalance: the true balance when the lists hold only the latest lines, so older history still counts.
  function register(shifts, entries, endBalance) {
    const lines = [];
    shifts.filter(s => s.clock_out).forEach(s => lines.push({ type: 'shift', id: s.id, at: new Date(s.clock_out).getTime(), date: day(s.clock_in), what: 'Worked ' + hrs(shiftMs(s)), sub: tm(s.clock_in) + ' – ' + tm(s.clock_out) + (Number(s.rate) !== 10 ? ' · $' + Number(s.rate) + '/hr' : '') + (s.note ? ' · ' + s.note : ''), amt: shiftPay(s), src: s }));
    entries.forEach(r => lines.push({ type: 'entry', id: r.id, at: new Date(r.date + 'T23:59').getTime() + (new Date(r.created_at).getTime() % 60000), date: dateOnly(r.date), what: r.payee || KIND[r.kind], sub: (r.payee ? KIND[r.kind] : '') + (r.note ? (r.payee ? ' · ' : '') + r.note : ''), amt: r.kind === 'bonus' ? Number(r.amount) : -Number(r.amount), src: r }));
    lines.sort((a, b) => a.at - b.at);
    let bal = 0; lines.forEach(l => { bal = Math.round((bal + l.amt) * 100) / 100; l.bal = bal; });
    if (endBalance != null && lines.length) { const off = Math.round((Number(endBalance) - bal) * 100) / 100; if (off) lines.forEach(l => { l.bal = Math.round((l.bal + off) * 100) / 100; }); }
    return lines.reverse();
  }
  function totals(lines) {
    let earned = 0, spent = 0;
    lines.forEach(l => { if (l.amt >= 0) earned += l.amt; else spent -= l.amt; });
    return { earned, spent, balance: earned - spent };
  }
  function registerTable(lines, tappable) {
    if (!lines.length) return '<div class="empty">Nothing yet. Clock in to start earning! 💜</div>';
    return '<table class="reg"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>' +
      lines.map(l => '<tr' + (tappable ? ' class="tap" data-type="' + l.type + '" data-id="' + esc(l.id) + '"' : '') + '><td class="d">' + esc(l.date) + '</td><td>' + esc(l.what) + (l.sub ? '<span class="sub">' + esc(l.sub) + '</span>' : '') + '</td><td class="num ' + (l.amt >= 0 ? 'plus' : 'minus') + '">' + (l.amt >= 0 ? '+' : '−') + '$' + Math.abs(l.amt).toFixed(2) + '</td><td class="num bal">' + money(l.bal) + '</td></tr>').join('') +
      '</tbody></table>';
  }
  function totalsHtml(t) {
    return '<div class="totals"><div><b>' + money(t.earned) + '</b><span>Earned</span></div><div><b>' + money(t.spent) + '</b><span>Spent</span></div><div class="bal"><b>' + money(t.balance) + '</b><span>Available</span></div></div>';
  }
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  return { $, esc, money, hrs, timer, shiftPay, shiftMs, register, totals, registerTable, totalsHtml, toast, tm, day, KIND };
})();
