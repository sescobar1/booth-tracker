// Public sign-up page. Anyone with the link can see open jobs and sign up; it only talks to the
// vol_board / vol_signup / vol_mine / vol_cancel database functions, which never reveal phone
// numbers or emails. Each volunteer's own sign-ups are remembered on their phone so they can cancel.
(function () {
  const CFG = window.VOL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const owner = params.get('o') || CFG.ownerId;
  const only = params.get('e');
  const sb = window.supabase.createClient(CFG.sync.url, CFG.sync.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('bandSignup' + k)) || d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('bandSignup' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const pad = n => String(n).padStart(2, '0');
  function fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const opts = { weekday: 'long', month: 'long', day: 'numeric' };
    if (y !== new Date().getFullYear()) opts.year = 'numeric';
    return new Date(y, m - 1, d).toLocaleDateString([], opts);
  }
  function fmtTime(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + ap; }
  const fmtRange = (a, b) => a ? fmtTime(a) + (b ? ' – ' + fmtTime(b) : '') : '';
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }
  function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
  function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; }
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  // The welcome note keeps its paragraphs, and its email address and phone number can be tapped.
  function linkify(text) {
    return text.split(/\n\s*\n/).map(par => '<p>' + esc(par.trim()).replace(/\n/g, '<br>')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, m => '<a href="mailto:' + m + '">' + m + '</a>')
      .replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, m => '<a href="tel:+1' + m.replace(/\D/g, '') + '">' + m + '</a>') + '</p>').join('');
  }

  let board = null;

  async function load() {
    if (!owner) { $('view').innerHTML = '<p>This sign-up link is missing a part. Ask the volunteer coordinator for a new link.</p>'; return; }
    const { data, error } = await sb.rpc('vol_board', { p_owner: owner });
    if (error) { $('view').innerHTML = '<p>Could not load sign-ups. Check your signal and refresh the page.</p><p class="helper">' + esc(error.message) + '</p>'; return; }
    board = data;
    draw();
    drawMine();
  }

  function draw() {
    const st = board.settings || {};
    if (st.org) { $('orgName').textContent = st.org; document.title = 'Volunteer Sign-Up · ' + st.org; }
    let events = board.events || [];
    const one = only && events.find(e => e.id === only);
    if (one) events = [one];
    const jobCard = (ev, j) => {
      const taken = j.names.length, open = Math.max(0, j.need - taken);
      if (j.kind === 'food') return '<div class="job food' + (open ? '' : ' full') + '"><div class="who"><b>' + esc(j.role) + '</b>' +
        (dropLine(j, ev) ? '<span class="sub">📦 Drop off ' + esc(dropLine(j, ev)) + '</span>' : '') +
        '<span class="sub">' + (open ? '<b>' + open + ' of ' + j.need + ' still needed</b>' : 'Covered – thank you!') + (taken ? ' · ' + esc(j.names.join(', ')) : '') + '</span></div>' +
        (open ? '<button type="button" data-job="' + esc(j.id) + '" data-ev="' + esc(ev.id) + '">I\'ll bring one</button>' : '') + '</div>';
      return '<div class="job' + (open ? '' : ' full') + '"><div class="who"><b>' + esc(j.role) + '</b>' +
        '<span class="sub">' + esc(fmtRange(j.start || ev.start, j.end || ev.end)) + '</span>' +
        '<span class="bar"><span style="width:' + Math.min(100, Math.round(taken / Math.max(1, j.need) * 100)) + '%"></span></span>' +
        '<span class="sub">' + (open ? '<b>' + open + ' of ' + j.need + ' spots open</b>' : 'Full – thank you!') + (taken ? ' · ' + esc(j.names.join(', ')) : '') + '</span></div>' +
        (open ? '<button type="button" data-job="' + esc(j.id) + '" data-ev="' + esc(ev.id) + '">Sign up</button>' : '') + '</div>';
    };
    $('view').innerHTML =
      '<h1>' + esc(st.title || 'Volunteer Sign-Up') + '</h1>' +
      (st.intro ? '<div class="intro">' + linkify(st.intro) + '</div>' : '') +
      (st.cashtag ? '<div class="donate-bar"><span>💵 Can\'t volunteer? You can still help with a money donation.</span><button type="button" data-donate="">Donate with Cash App</button></div>' : '') +
      '<div id="mine"></div>' +
      (only && !one ? '<p class="chip warn">That event is full, past, or no longer listed. Here is everything that\'s open.</p>' : '') +
      (events.length ? events.map(ev => '<section class="card pad pub-event"><div class="pub-when">' + esc(fmtDate(ev.date)) + (ev.start ? ' · ' + esc(fmtRange(ev.start, ev.end)) : '') + '</div>' +
        '<h2>' + esc(ev.name) + '</h2>' + (ev.location ? '<p class="sub">📍 ' + esc(ev.location) + '</p>' : '') + (ev.notes ? '<p class="helper">' + esc(ev.notes) + '</p>' : '') +
        (ev.jobs.some(j => j.kind !== 'food') ? ev.jobs.filter(j => j.kind !== 'food').map(j => jobCard(ev, j)).join('') : ev.jobs.length ? '' : '<p class="helper">Jobs coming soon.</p>') +
        (ev.jobs.some(j => j.kind === 'food') ? '<h3 class="food-sub">🍪 Food &amp; supplies we need</h3>' + ev.jobs.filter(j => j.kind === 'food').map(j => jobCard(ev, j)).join('') : '') +
        (st.cashtag ? '<div class="row-actions"><button type="button" class="ghost small" data-donate="' + esc(ev.id) + '">💵 Donate money for this event</button></div>' : '') + '</section>').join('')
        : '<div class="empty"><h2>No sign-ups open right now</h2><p>Check back soon. Thank you for supporting the band!</p></div>') +
      (one && board.events.length > 1 ? '<p><a href="?' + (params.get('o') ? 'o=' + encodeURIComponent(owner) : '') + '">See all upcoming events ›</a></p>' : '');
    $('view').querySelectorAll('[data-job]').forEach(b => b.onclick = () => form(b.dataset.ev, b.dataset.job));
    $('view').querySelectorAll('[data-donate]').forEach(b => b.onclick = () => donate(b.dataset.donate));
  }

  // "Fri, Oct 9, 4:00 PM – 5:00 PM – concession stand back door"
  function dropLine(j, ev) {
    const d = j.dropDate || ev.date;
    return [d ? fmtDate(d) : '', fmtRange(j.start, j.end)].filter(Boolean).join(', ') + (j.note ? ' – ' + j.note : '');
  }

  // Cash App can't fill in the note from a link, so the page hands donors the exact words to paste.
  function donate(evId) {
    const st = board.settings || {}, ev = evId && board.events.find(e => e.id === evId), me = store.get('Me', {});
    const tag = st.cashtag.replace(/^\$/, '');
    const md = d => { const [, m, dd] = d.split('-').map(Number); return m + '/' + dd; };
    const note = (st.org || 'Band Boosters') + ' – ' + (ev ? ev.name + ' ' + md(ev.date) : 'general donation') + ' – ' + ([me.first, me.last].filter(Boolean).join(' ') || 'your name');
    openModal('<h2>💵 Donate with Cash App</h2><p>Send to <b>$' + esc(tag) + '</b></p>' +
      '<div class="must"><b>Important:</b> in Cash App, type what your donation is for in the note (“For”).' + (st.donateInfo ? '<p>' + esc(st.donateInfo) + '</p>' : '') + '</div>' +
      '<label>Copy this into the Cash App note<input id="dNote" value="' + esc(note) + '"></label>' +
      '<div class="row-actions stack"><button type="button" id="dCopy">📋 Copy the note</button><a class="button" id="dOpen" href="https://cash.app/$' + encodeURIComponent(tag) + '" target="_blank" rel="noopener">Open Cash App</a><button type="button" class="ghost" id="dClose">Close</button></div>' +
      '<p class="helper">Tip: tap Copy first, then Open Cash App, enter the amount, and paste in the “For” box.</p>');
    $('dCopy').onclick = async () => { try { await navigator.clipboard.writeText($('dNote').value); toast('Copied. Paste it in the Cash App “For” box.'); } catch (e) { $('dNote').select(); } };
    $('dOpen').onclick = () => { try { navigator.clipboard.writeText($('dNote').value); } catch (e) {} };
    $('dClose').onclick = closeModal;
  }

  const gradeOpts = sel => '<option value="">Pick a grade</option>' + [6, 7, 8, 9, 10, 11, 12].map(n => '<option value="' + n + '"' + (Number(sel) === n ? ' selected' : '') + '>' + n + 'th grade</option>').join('');

  function form(evId, jobId) {
    const ev = board.events.find(e => e.id === evId), job = ev.jobs.find(j => j.id === jobId);
    const me = store.get('Me', {});
    const food = job.kind === 'food';
    if (food) me.type = 'adult'; // food donors are parents and other adults
    openModal('<h2>' + (food ? 'Bring food or supplies' : 'Sign up') + '</h2><p><b>' + esc(job.role) + '</b><br>' + esc(ev.name) + '<br>' +
      (food ? (dropLine(job, ev) ? '📦 Drop off ' + esc(dropLine(job, ev)) : esc(fmtDate(ev.date))) : esc(fmtDate(ev.date)) + ' · ' + esc(fmtRange(job.start || ev.start, job.end || ev.end))) + '</p>' +
      (food ? '' : '<div class="segs" id="fType"><button type="button" class="seg' + (me.type !== 'student' ? ' on' : '') + '" data-t="adult">Parent / adult</button><button type="button" class="seg' + (me.type === 'student' ? ' on' : '') + '" data-t="student">Student</button></div>') +
      '<div class="grid2"><label>First name<input id="fFirst" autocomplete="given-name" value="' + esc(me.first || '') + '"></label><label>Last name<input id="fLast" autocomplete="family-name" value="' + esc(me.last || '') + '"></label></div>' +
      '<label id="fPhoneLbl"' + (me.type === 'student' ? ' hidden' : '') + '>Cell phone (for reminder texts)<input id="fPhone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(me.phone || '') + '" placeholder="(501) 555-0123"></label>' +
      '<label>Email' + (food ? '' : ' (optional)') + '<input id="fEmail" type="email" autocomplete="email" value="' + esc(me.email || '') + '"></label>' +
      (board.settings && board.settings.studentInfo ? '<details class="stuinfo" id="fStuInfo"' + (me.type === 'student' ? '' : ' hidden') + ' open><summary>📋 Please read: student volunteer information</summary>' + linkify(board.settings.studentInfo) + '</details>' : '') +
      '<label id="fParentLbl">' + (me.type === 'student' ? 'Parent\'s name (optional)' : 'Your student\'s name' + (food ? '' : ' (optional)')) + '<input id="fParent" value="' + esc(me.parent || '') + '"></label>' +
      '<label id="fGradeLbl">' + (me.type === 'student' ? 'Your grade' : 'Your student\'s grade') + (food ? '' : ' (optional)') + '<select id="fGrade">' + gradeOpts(me.grade) + '</select></label>' +
      '<div class="row-actions"><button type="button" id="fGo">Sign me up</button><button type="button" class="ghost" id="fCancel">Cancel</button></div>' +
      '<p class="helper">Phone numbers and emails are only seen by the volunteer coordinator.</p>');
    let type = me.type === 'student' ? 'student' : 'adult';
    if ($('fType')) $('fType').querySelectorAll('.seg').forEach(b => b.onclick = () => {
      type = b.dataset.t; $('fType').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b));
      $('fParentLbl').firstChild.textContent = type === 'student' ? 'Parent\'s name (optional)' : 'Your student\'s name (optional)';
      $('fPhoneLbl').hidden = type === 'student'; // students don't give phone numbers
      $('fGradeLbl').firstChild.textContent = (type === 'student' ? 'Your grade' : 'Your student\'s grade') + ' (optional)';
      if ($('fStuInfo')) $('fStuInfo').hidden = type !== 'student';
    });
    $('fCancel').onclick = closeModal;
    $('fGo').onclick = async () => {
      const v = { first: $('fFirst').value.trim(), last: $('fLast').value.trim(), phone: $('fPhone').value.trim(), email: $('fEmail').value.trim(), parent: $('fParent').value.trim(), grade: $('fGrade').value, type };
      if (!v.first || !v.last) { toast('Please enter your first and last name.'); return; }
      if (food && !/\S+@\S+\.\S+/.test(v.email)) { toast('Please enter your email.'); return; }
      if (food && (!v.parent || !v.grade)) { toast('Please enter your student\'s name and grade.'); return; }
      if (type === 'student') v.phone = '';
      else if (v.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) { toast('Please enter a 10-digit cell phone number.'); return; }
      $('fGo').disabled = true; $('fGo').textContent = 'Signing you up…';
      const { data, error } = await sb.rpc('vol_signup', { p_owner: owner, p_job: jobId, p_first: v.first, p_last: v.last, p_phone: v.phone, p_email: v.email, p_type: v.type, p_parent: v.parent, p_grade: v.grade ? Number(v.grade) : null });
      if (error || !data || data.error) {
        toast((data && data.error) || 'Could not sign you up. Check your signal and try again.');
        $('fGo').disabled = false; $('fGo').textContent = 'Sign me up';
        return;
      }
      store.set('Me', v);
      store.set('Tokens', [data.token].concat(store.get('Tokens', [])).slice(0, 50));
      done(data, v.type);
      load();
    };
  }

  function icsFor(x) {
    const d = x.date.replace(/-/g, ''), t = s => (s || '').replace(':', '') + '00';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Band Volunteers//EN', 'BEGIN:VEVENT', 'UID:' + x.token + '@band-volunteers',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      x.start ? 'DTSTART:' + d + 'T' + t(x.start) : 'DTSTART;VALUE=DATE:' + d,
      x.start && x.end ? 'DTEND:' + d + 'T' + t(x.end) : '',
      'SUMMARY:' + ('Volunteer: ' + x.role + ' – ' + x.event).replace(/[,;]/g, '\\$&'),
      x.location ? 'LOCATION:' + x.location.replace(/[,;]/g, '\\$&') : '',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Volunteer shift', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.filter(Boolean).join('\r\n');
  }
  function addToCalendar(x) {
    const blob = new Blob([icsFor(x)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'volunteer-' + x.date + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function done(x, type) {
    const info = type === 'student' && board.settings && board.settings.studentInfo;
    if (x.kind === 'food') {
      // The calendar entry is the drop-off, not the game.
      const drop = Object.assign({}, x, { date: x.dropDate || x.date, role: 'Drop off ' + x.role });
      const line = dropLine({ dropDate: x.dropDate, start: x.start, end: x.end, note: x.note }, { date: x.date });
      openModal('<h2>🎉 Thank you!</h2><p>You\'re bringing <b>' + esc(x.role) + '</b> for ' + esc(x.event) + '.</p>' +
        (line ? '<p>📦 <b>Drop off:</b> ' + esc(line) + '</p>' : '') +
        '<p>We\'ll send a reminder the day before.</p>' +
        '<div class="row-actions stack"><button type="button" id="dCal">📅 Add drop-off to my calendar</button><button type="button" class="ghost" id="dMore">Sign up for something else</button></div>' +
        '<p class="helper">Plans change? Come back to this page on this phone and tap Cancel under My sign-ups.</p>');
      $('dCal').onclick = () => addToCalendar(drop);
      $('dMore').onclick = closeModal;
      return;
    }
    openModal('<h2>🎉 You\'re signed up!</h2><p><b>' + esc(x.role) + '</b><br>' + esc(x.event) + '<br>' + esc(fmtDate(x.date)) + (x.start ? ' · ' + esc(fmtRange(x.start, x.end)) : '') + (x.location ? '<br>📍 ' + esc(x.location) : '') + '</p>' +
      (info ? '<p>Thank you for supporting the band!</p><details class="stuinfo" open><summary>📋 What to know before your shift</summary>' + linkify(info) + '</details>'
        : '<p>Thank you for supporting the band! You\'ll get a reminder text before your shift.</p>') +
      '<div class="row-actions stack"><button type="button" id="dCal">📅 Add to my calendar</button><button type="button" class="ghost" id="dMore">Sign up for something else</button></div>' +
      '<p class="helper">Plans change? Come back to this page on this phone and tap Cancel under My sign-ups.</p>');
    $('dCal').onclick = () => addToCalendar(x);
    $('dMore').onclick = closeModal;
  }

  async function drawMine() {
    const tokens = store.get('Tokens', []);
    if (!tokens.length || !$('mine')) return;
    const { data, error } = await sb.rpc('vol_mine', { p_tokens: tokens });
    if (error || !data || !data.length) { if (!error) store.set('Tokens', []); return; }
    store.set('Tokens', data.map(x => x.token));
    $('mine').innerHTML = '<div class="card pad mine"><h2>My sign-ups</h2>' + data.map(x => '<div class="vol"><div class="who"><b>' + esc(x.role) + ' – ' + esc(x.event) + '</b><span class="sub">' + esc(fmtDate(x.date)) + (x.start ? ' · ' + esc(fmtRange(x.start, x.end)) : '') + '</span></div>' +
      '<div class="acts"><button type="button" class="icon" data-cal="' + esc(x.token) + '" title="Add to calendar">📅</button><button type="button" class="ghost small" data-cancel="' + esc(x.token) + '">Cancel</button></div></div>').join('') + '</div>';
    $('mine').querySelectorAll('[data-cal]').forEach(b => b.onclick = () => addToCalendar(data.find(x => x.token === b.dataset.cal)));
    $('mine').querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      const x = data.find(y => y.token === b.dataset.cancel);
      if (!confirm('Cancel ' + x.role + ' at ' + x.event + ' on ' + fmtDate(x.date) + '?')) return;
      const { data: r, error: err } = await sb.rpc('vol_cancel', { p_token: x.token });
      if (err || !r || !r.ok) { toast('Could not cancel. Please text the volunteer coordinator.'); return; }
      toast('Cancelled. Thank you for letting us know!');
      load();
    });
  }

  load();
})();
