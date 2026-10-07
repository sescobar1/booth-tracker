// Instructor gradebook: sign in with the owner account to see every grade students handed in.
(function () {
  const CFG = window.MEDMATH_CONFIG || {};
  const MM = window.MedMath;
  const PASS = CFG.passing || 80;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const mins = s => s == null ? '' : (s >= 60 ? Math.round(s / 60) + ' min' : s + ' sec');
  const short = id => { const m = MM.byId(id); return m ? (m.ch ? 'Ch ' + m.ch : m.id === 'pre' ? 'Pre' : 'Post') : id; };
  const sb = window.supabase.createClient(CFG.sync.url, CFG.sync.key, { auth: { storageKey: (CFG.storageKey || 'medMath') + 'TeacherAuth', persistSession: true, autoRefreshToken: true } });
  let rows = [], bank = [], classes = [], settings = null, tab = 'book', filt = { cls: '', student: '', module: '' };

  function signInView(msg) {
    $('signOut').hidden = true;
    $('view').innerHTML = `<h1>Instructor sign in</h1><p class="sub">Use the same email and password as the Booth Tracker. Students don't need an account; they take tests at <a href="index.html">the practice page</a>.</p>
      <form class="card" id="signIn" style="max-width:420px"><label class="f" for="em">Email</label><input type="email" id="em" autocomplete="email" required>
      <label class="f" for="pw">Password</label><input type="password" id="pw" autocomplete="current-password" required>
      <div class="row" style="margin-top:14px"><button type="submit">Sign in</button><span class="muted" id="msg">${esc(msg || '')}</span></div></form>`;
    $('signIn').onsubmit = async e => {
      e.preventDefault(); $('msg').textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
      if (error) $('msg').textContent = error.message; else load();
    };
  }

  async function load() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return signInView();
    $('signOut').hidden = false;
    $('view').innerHTML = '<p class="muted">Loading grades…</p>';
    rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('med_math_grades').select('*').order('submitted_at', { ascending: false }).range(from, from + 999);
      if (error) { $('view').innerHTML = `<div class="card"><b>Couldn't load grades.</b> ${esc(error.message)}<p class="muted">If the table is missing, run <code>med-math/supabase-setup.sql</code> in Supabase (SQL Editor → New query → Run).</p></div>`; return; }
      rows = rows.concat(data);
      if (data.length < 1000) break;
    }
    const [b, st, cl] = await Promise.all([
      sb.from('med_math_bank').select('id, module, kind, prompt, choices, answers, active').order('module'),
      sb.from('med_math_settings').select('*').maybeSingle(),
      sb.from('med_math_classes').select('*').order('created_at')
    ]);
    classes = cl.data || [];
    bank = b.data || [];
    settings = st.data || { owner: session.user.id, class_code: '', show_answers: true, videos: {} };
    render();
  }

  // A grade's class: the class its code belonged to (current name), or what the student typed before classes existed.
  const classOf = r => { const c = r.class_id && classes.find(x => x.id === r.class_id); return c ? c.name : (r.class_code || ''); };
  const inClass = r => !filt.cls || (filt.cls === 'none' ? !r.class_id : r.class_id === filt.cls);
  const filtered = () => rows.filter(r => inClass(r) && (!filt.student || r.student.toLowerCase().includes(filt.student.toLowerCase())) && (!filt.module || r.module === filt.module));
  const pct = p => `<span class="pill ${p >= PASS ? 'pass' : 'fail'}">${+p}%</span>`;

  function render() {
    const older = rows.some(r => !r.class_id);
    const list = filtered();
    const students = new Set(list.map(r => r.student.toLowerCase())).size;
    const avg = list.length ? Math.round(list.reduce((s, r) => s + +r.percent, 0) / list.length) : 0;
    let html = `<h1>Gradebook</h1><p class="sub">${list.length} submission${list.length === 1 ? '' : 's'} · ${students} student${students === 1 ? '' : 's'} · average ${avg}% · passing is ${PASS}%. Student practice page: <a href="index.html">${esc(location.href.replace(/teacher\.html.*$/, ''))}</a></p>
      <div class="card no-print"><div class="row">
        <select id="fCls" style="max-width:240px"><option value="">All classes</option>${classes.map(c => `<option value="${c.id}"${c.id === filt.cls ? ' selected' : ''}>${esc(c.name)}${c.active ? '' : ' (closed)'}</option>`).join('')}${older ? `<option value="none"${filt.cls === 'none' ? ' selected' : ''}>Before classes were set up</option>` : ''}</select>
        <select id="fMod" style="max-width:260px"><option value="">All chapters and tests</option>${MM.MODULES.map(m => `<option value="${m.id}"${m.id === filt.module ? ' selected' : ''}>${m.ch ? m.ch + '. ' : ''}${esc(m.title)}</option>`).join('')}</select>
        <input type="text" id="fStu" placeholder="Search student" value="${esc(filt.student)}" style="max-width:200px">
      </div><div class="row" style="margin-top:10px">
        <button class="${tab === 'book' ? '' : 'ghost'} small" data-tab="book">Best scores</button>
        <button class="${tab === 'all' ? '' : 'ghost'} small" data-tab="all">Every submission</button>
        <button class="${tab === 'bank' ? '' : 'ghost'} small" data-tab="bank">Test bank</button>
        <button class="${tab === 'videos' ? '' : 'ghost'} small" data-tab="videos">Videos</button>
        <button class="${tab === 'classes' ? '' : 'ghost'} small" data-tab="classes">Classes</button>
        <button class="ghost small" id="csv">Download CSV</button><button class="ghost small" onclick="print()">Print</button><button class="ghost small" id="refresh">Refresh</button>
      </div></div>`;
    html += tab === 'book' ? bookTable(list) : tab === 'all' ? allTable(list) : tab === 'bank' ? bankView() : tab === 'videos' ? videosView() : classesView();
    $('view').innerHTML = html;
    $('fCls').onchange = e => { filt.cls = e.target.value; render(); };
    $('fMod').onchange = e => { filt.module = e.target.value; render(); };
    $('fStu').oninput = e => { filt.student = e.target.value; clearTimeout(window._t); window._t = setTimeout(() => { render(); const i = $('fStu'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $('csv').onclick = () => csv(list);
    $('refresh').onclick = load;
    document.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); detail(a.dataset.open); });
    document.querySelectorAll('[data-q]').forEach(c => c.onchange = () => setActive(c.dataset.q, c.checked));
    if (tab === 'classes') wireClasses();
    const vs = $('saveVideos');
    if (vs) vs.onclick = saveVideos;
  }

  // The private test bank: every question with its answer key, and a switch to leave it out of tests.
  function bankView() {
    if (!bank.length) return '<div class="card"><b>No test bank yet.</b><p class="muted">Load one with <code>med-math/tools/import-bank.py</code> (see the README). Until then each test uses generated questions.</p></div>';
    const mods = MM.MODULES.filter(m => !m.kind && (!filt.module || m.id === filt.module || ((MM.byId(filt.module) || {}).from || []).includes(m.id)));
    let h = `<div class="card"><p style="margin:0">${bank.filter(q => q.active).length} of ${bank.length} questions are in use. Untick a question to leave it out of tests (for example, if its answer key is wrong). Students never see this page or the answers before they hand in a test.</p></div>`;
    mods.forEach(m => {
      const qs = bank.filter(q => q.module === m.id);
      h += `<h2>${m.ch}. ${esc(m.title)} <span class="muted">(${qs.filter(q => q.active).length} in use${qs.length ? '' : ' · tests use generated questions'})</span></h2>`;
      if (qs.length) h += `<div class="card scroll"><table><tr><th>Use</th><th>Question</th><th>Answer</th></tr>${qs.map(q => `<tr><td><input type="checkbox" data-q="${esc(q.id)}"${q.active ? ' checked' : ''} aria-label="Use this question"></td><td>${q.prompt}${q.kind === 'mc' ? `<br><small class="muted">Choices: ${q.choices.map(esc).join(' · ')}</small>` : ''}</td><td><b>${q.answers.map(a => a.map(esc).join(' or ')).join('; ')}</b></td></tr>`).join('')}</table></div>`;
    });
    return h;
  }

  async function setActive(id, on) {
    const { error } = await sb.from('med_math_bank').update({ active: on }).eq('id', id);
    if (error) { alert(error.message); return render(); }
    const q = bank.find(x => x.id === id); if (q) q.active = on;
  }

  // A YouTube or Vimeo link per chapter, shown at the top of that chapter for students.
  const embedOk = u => /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)[\w-]{11}|vimeo\.com\/(?:video\/)?\d+/.test(u);
  function videosView() {
    const v = settings.videos || {};
    return `<div class="card"><p style="margin:0">Paste a YouTube or Vimeo link for any chapter, and it shows at the top of that chapter as <b>Video from your instructor</b>, above the built-in <b>Watch how to do it</b> walkthrough. Leave a box empty for none.</p></div>
      <div class="card">${MM.MODULES.filter(m => m.lesson).map(m => `<label class="f" for="v_${m.id}">${m.ch}. ${esc(m.title)}</label>
        <input type="text" id="v_${m.id}" data-v="${m.id}" inputmode="url" value="${esc(v[m.id] || '')}" placeholder="https://www.youtube.com/watch?v=…">`).join('')}
      <div class="row" style="margin-top:14px"><button id="saveVideos">Save videos</button><span class="muted" id="vidMsg"></span></div></div>`;
  }

  async function saveVideos() {
    const videos = {}, bad = [];
    document.querySelectorAll('[data-v]').forEach(i => { const u = i.value.trim(); if (!u) return; if (embedOk(u)) videos[i.dataset.v] = u; else bad.push((MM.byId(i.dataset.v) || {}).ch); });
    if (bad.length) { $('vidMsg').textContent = 'Not a YouTube or Vimeo link: chapter ' + bad.join(', ') + '. Nothing saved.'; return; }
    const { error } = await sb.from('med_math_settings').upsert({ owner: settings.owner, class_code: settings.class_code, show_answers: settings.show_answers, videos, updated_at: new Date().toISOString() });
    if (!error) settings.videos = videos;
    $('vidMsg').textContent = error ? error.message : 'Saved. Students see them the next time they open the chapter.';
  }

  // Classes: each has its own code. Students type only the code, which puts their grades in that class.
  const newCode = () => { const ch = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += ch[Math.floor(Math.random() * ch.length)]; return c; };
  function classesView() {
    const stats = id => { const g = rows.filter(r => r.class_id === id); return { students: new Set(g.map(r => r.student.trim().toLowerCase())).size, tests: g.length }; };
    let h = `<div class="card" style="max-width:640px"><b>Start a new class</b>
      <div class="row" style="gap:12px;align-items:flex-end;margin-top:6px">
        <div style="flex:2;min-width:200px"><label class="f" for="cName">Class name</label><input type="text" id="cName" maxlength="80" placeholder="e.g. NUR 101 Spring 2027"></div>
        <div style="flex:1;min-width:140px"><label class="f" for="cCode">Class code</label><input type="text" id="cCode" maxlength="20" autocapitalize="characters" value="${newCode()}"></div>
      </div>
      <div class="row" style="margin-top:12px"><button id="cAdd">Create class</button><span class="muted" id="cMsg"></span></div>
      <p class="muted" style="margin:10px 0 0">Give students the class code. It puts their test grades in this class. Codes are 4–20 letters, numbers or dashes.</p></div>`;
    h += `<div class="card scroll"><table><tr><th>Class</th><th>Code</th><th>Students</th><th>Tests</th><th>Status</th><th></th></tr>${classes.length ? classes.map(c => { const st = stats(c.id); return `<tr>
      <td><b>${esc(c.name)}</b></td><td><code>${esc(c.code)}</code></td><td>${st.students}</td><td>${st.tests}</td>
      <td>${c.active ? '<span class="pill pass">Open</span>' : '<span class="pill none">Closed</span>'}</td>
      <td class="row" style="gap:6px"><button class="ghost small" data-cview="${c.id}">Grades</button><button class="ghost small" data-cedit="${c.id}">Rename / code</button><button class="ghost small" data-ctoggle="${c.id}">${c.active ? 'Close' : 'Reopen'}</button></td></tr>`; }).join('') : '<tr><td colspan="6" class="muted">No classes yet. Create one above.</td></tr>'}</table></div>
      <p class="muted">Closing a class stops its code from working. Its grades stay in the gradebook.</p>`;
    h += `<div class="card" style="max-width:640px"><label class="choice"><input type="checkbox" id="showAns"${settings.show_answers ? ' checked' : ''}><span>Show students the right answers after they hand in a test (all classes)</span></label><span class="muted" id="setMsg"></span></div>`;
    return h;
  }

  function wireClasses() {
    const save = async (c, patch) => {
      const { data, error } = await sb.from('med_math_classes').update(patch).eq('id', c.id).select().single();
      if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Another of your classes already uses that code.' : error.message); return; }
      Object.assign(c, data); render();
    };
    $('cAdd').onclick = async () => {
      const name = $('cName').value.trim(), code = $('cCode').value.trim().toUpperCase();
      if (!name) { $('cMsg').textContent = 'Give the class a name.'; return; }
      if (!/^[A-Z0-9-]{4,20}$/.test(code)) { $('cMsg').textContent = 'Codes are 4–20 letters, numbers or dashes.'; return; }
      const { data, error } = await sb.from('med_math_classes').insert({ owner: settings.owner, name, code }).select().single();
      if (error) { $('cMsg').textContent = /duplicate|unique/i.test(error.message) ? 'Another of your classes already uses that code.' : error.message; return; }
      classes.push(data); render();
    };
    document.querySelectorAll('[data-cview]').forEach(bt => bt.onclick = () => { filt.cls = bt.dataset.cview; tab = 'book'; render(); });
    document.querySelectorAll('[data-ctoggle]').forEach(bt => bt.onclick = () => {
      const c = classes.find(x => x.id === bt.dataset.ctoggle);
      if (c.active && !confirm(`Close ${c.name}? Its code (${c.code}) will stop working. Its grades stay in the gradebook.`)) return;
      save(c, { active: !c.active });
    });
    document.querySelectorAll('[data-cedit]').forEach(bt => bt.onclick = () => {
      const c = classes.find(x => x.id === bt.dataset.cedit);
      const name = prompt('Class name', c.name); if (name == null) return;
      const code = prompt('Class code (students who already joined need the new code if you change it)', c.code); if (code == null) return;
      if (!name.trim()) return alert('Give the class a name.');
      if (!/^[A-Za-z0-9-]{4,20}$/.test(code.trim())) return alert('Codes are 4–20 letters, numbers or dashes.');
      save(c, { name: name.trim(), code: code.trim().toUpperCase() });
    });
    $('showAns').onchange = async () => {
      settings.show_answers = $('showAns').checked;
      const { error } = await sb.from('med_math_settings').upsert({ owner: settings.owner, class_code: settings.class_code || '', show_answers: settings.show_answers, videos: settings.videos || {}, updated_at: new Date().toISOString() });
      $('setMsg').textContent = error ? ' ' + error.message : ' Saved.';
    };
  }


  // One row per student, one column per chapter, showing the best score.
  function bookTable(list) {
    if (!list.length) return '<div class="card muted">No grades yet. Share the practice page with your students.</div>';
    const by = {};
    list.forEach(r => { const k = r.student.trim().toLowerCase(); (by[k] = by[k] || { name: r.student, cls: classOf(r), email: r.email, m: {} }); const c = by[k].m[r.module]; if (!c || +r.percent > +c.percent) by[k].m[r.module] = r; if (!by[k].email && r.email) by[k].email = r.email; });
    const mods = MM.MODULES.filter(m => !filt.module || m.id === filt.module);
    let h = `<div class="card scroll"><table class="grid"><tr><th>Student</th><th>Class</th>${mods.map(m => `<th class="c" title="${esc(m.title)}">${short(m.id)}</th>`).join('')}<th class="c">Done</th></tr>`;
    Object.values(by).sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const done = mods.filter(m => s.m[m.id] && +s.m[m.id].percent >= PASS).length;
      h += `<tr><td><b>${esc(s.name)}</b>${s.email ? `<br><small class="muted">${esc(s.email)}</small>` : ''}</td><td>${esc(s.cls)}</td>${mods.map(m => { const r = s.m[m.id]; return `<td class="c">${r ? `<a href="#" data-open="${r.id}">${pct(r.percent)}</a>` : '<span class="muted">—</span>'}</td>`; }).join('')}<td class="c">${done}/${mods.length}</td></tr>`;
    });
    return h + '</table></div><p class="muted">Tap a score to see that student\'s answers.</p>';
  }

  function allTable(list) {
    if (!list.length) return '<div class="card muted">No submissions match.</div>';
    return `<div class="card scroll"><table><tr><th>When</th><th>Student</th><th>Class</th><th>Chapter / test</th><th>Score</th><th>Time</th><th></th></tr>${list.map(r => `<tr><td>${when(r.submitted_at)}</td><td>${esc(r.student)}</td><td>${esc(classOf(r))}</td><td>${short(r.module)} · ${esc(r.module_title)}</td><td>${r.score}/${r.total} ${pct(r.percent)}</td><td>${mins(r.seconds)}</td><td><a href="#" data-open="${r.id}">Answers</a></td></tr>`).join('')}</table></div>`;
  }

  function detail(id) {
    const r = rows.find(x => x.id === id); if (!r) return;
    let h = `<p class="no-print"><a href="#" id="back">← Back to the gradebook</a></p><h1>${esc(r.student)}</h1><p class="sub">${esc(r.module_title)} · ${when(r.submitted_at)} · ${r.score}/${r.total} ${pct(r.percent)} · ${mins(r.seconds)}${classOf(r) ? ' · ' + esc(classOf(r)) : ''}</p>`;
    (r.answers || []).forEach((a, i) => { h += `<div class="card q ${a.ok ? 'right' : 'wrong'}"><div class="text"><span class="num">${i + 1}.</span>${esc(a.q)}</div><div>Answer: <b>${a.given ? esc(a.given) : '<span class="muted">(blank)</span>'}</b> ${a.ok ? '✓' : '✗ Correct: <b>' + esc(a.correct) + '</b>'}</div></div>`; });
    h += `<div class="row no-print"><button class="ghost small" id="del">Delete this submission</button></div>`;
    $('view').innerHTML = h; window.scrollTo(0, 0);
    $('back').onclick = e => { e.preventDefault(); render(); };
    $('del').onclick = async () => {
      if (!confirm(`Delete ${r.student}'s ${r.module_title} grade (${r.percent}%)? This can't be undone.`)) return;
      const { error } = await sb.from('med_math_grades').delete().eq('id', r.id);
      if (error) return alert(error.message);
      rows = rows.filter(x => x.id !== r.id); render();
    };
  }

  function csv(list) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Submitted', 'Student', 'Email', 'Class', 'Chapter', 'Title', 'Score', 'Total', 'Percent', 'Minutes'].map(q).join(',')]
      .concat(list.map(r => [new Date(r.submitted_at).toLocaleString(), r.student, r.email, classOf(r), short(r.module), r.module_title, r.score, r.total, r.percent, r.seconds == null ? '' : Math.round(r.seconds / 6) / 10].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'med-math-grades-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  $('signOut').onclick = async () => { await sb.auth.signOut(); signInView('Signed out.'); };
  load();
})();
