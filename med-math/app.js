// Med Math practice: chapters, lessons, practice drills, and graded tests.
// - Practice drill: new numbers every time, graded on this device, not sent anywhere.
// - Test: questions come from the instructor's private test bank in Supabase (opened with the
//   class code) and are graded there, so the answer key never reaches the browser first. The grade
//   goes straight into the instructor's gradebook. A chapter with no bank questions uses a
//   generated test instead, handed in with med_math_submit.
(function () {
  const CFG = window.MEDMATH_CONFIG || {};
  const MM = window.MedMath;
  const KEY = CFG.storageKey || 'medMath';
  const PASS = CFG.passing || 80;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }
  };
  let profile = LS.get('Profile', { name: '', email: '', cls: '', code: '' });
  let history = LS.get('History', []);
  let current = LS.get('Current', null);            // the test or drill in progress, so a refresh doesn't lose it
  let info = LS.get('Info', { counts: {}, code_required: true }); // bank sizes per chapter (no questions)

  const best = id => history.filter(h => h.module === id).reduce((m, h) => Math.max(m, h.pct), -1);
  const pill = id => { const b = best(id); return b < 0 ? '<span class="pill none">Not taken</span>' : `<span class="pill ${b >= PASS ? 'pass' : 'fail'}">Best ${b}%</span>`; };
  const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const bankSize = m => (m.from || [m.id]).reduce((s, id) => s + (info.counts[id] || 0), 0);
  const testSize = m => { const n = bankSize(m); return n ? Math.min(m.kind === 'test' ? 20 : 10, n) : (m.count || 10); };
  const usesBank = m => bankSize(m) > 0;
  const saveCurrent = () => LS.set('Current', current);

  async function rpc(name, args) {
    const res = await fetch(CFG.sync.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.sync.key, Authorization: 'Bearer ' + CFG.sync.key },
      body: JSON.stringify(args)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'The server said ' + res.status);
    return body;
  }

  // ---------- views ----------
  function home() {
    let html = `<h1>Med Math for Nurses</h1><p class="sub">Each chapter has a short lesson, a practice drill you can repeat as often as you like, and a test. Your test grade goes to your instructor. Passing is ${PASS}%.</p>`;
    if (!profile.name) html += `<div class="card"><b>First, tell us who you are.</b><p class="muted" style="margin:4px 0 10px">Your name is sent with every test you hand in.</p><a class="btn" href="#me">Add my name</a></div>`;
    Object.entries(MM.UNITS).forEach(([u, title]) => {
      html += `<h2>${esc(title)}</h2>`;
      MM.MODULES.filter(m => m.unit === +u).forEach(m => {
        const isTest = m.kind === 'test';
        html += `<a class="card mod${isTest ? ' test' : ''}" href="#m/${m.id}"><span class="ch">${isTest ? (m.id === 'pre' ? 'PRE' : 'POST') : m.ch}</span><span class="t"><b>${esc(m.title)}</b><small>${isTest ? testSize(m) + '-question test' : 'Lesson · practice · ' + testSize(m) + '-question test'}</small></span>${pill(m.id)}</a>`;
      });
    });
    return html;
  }

  function moduleView(id) {
    const m = MM.byId(id);
    if (!m) return home();
    const tries = history.filter(h => h.module === id);
    let html = `<p class="muted" style="margin:0"><a href="#">← All chapters</a> · ${esc(MM.UNITS[m.unit])}</p>`;
    html += `<h1>${m.ch ? 'Chapter ' + m.ch + ': ' : ''}${esc(m.title)}</h1>`;
    if (m.lesson) {
      html += `<div class="card lesson"><b>Key points</b><ul>${m.lesson.points.map(p => `<li>${p}</li>`).join('')}</ul>
        <div class="example"><b>Worked example:</b> ${m.lesson.example}<ol>${m.lesson.steps.map(s => `<li>${s}</li>`).join('')}</ol></div></div>`;
    } else {
      html += `<div class="card"><p style="margin:0">${esc(m.blurb)}</p></div>`;
    }
    html += videoCards(m);
    const going = mode => current && current.id === id && current.mode === mode && !current.done;
    const testMode = usesBank(m) ? 'bank' : 'gen';
    html += `<div class="card"><b>Practice drill</b><p class="muted" style="margin:4px 0 12px">${m.count || 10} questions with new numbers each time. You see the answers and how to work them out. Practice isn't sent to your instructor.</p>
      <a class="btn ghost" href="#practice/${id}">${going('practice') ? 'Continue practice' : 'Practice'}</a></div>`;
    html += `<div class="card"><b>Test</b><p class="muted" style="margin:4px 0 12px">${testSize(m)} questions. Your grade goes to your instructor when you hand it in. Write answers as numbers (units are optional).</p>
      <div class="row"><a class="btn" href="#test/${id}">${going(testMode) ? 'Continue my test' : 'Start the test'}</a>${going(testMode) ? '<button class="ghost" id="restart">Start over</button>' : ''}</div></div>`;
    if (tries.length) html += `<h2>Your test grades</h2><div class="card scroll"><table><tr><th>When</th><th>Score</th><th>Sent</th></tr>${tries.slice().reverse().map(t => `<tr><td>${when(t.at)}</td><td>${t.score}/${t.total} (${t.pct}%)</td><td>${t.sent ? '✓' : 'Not yet'}</td></tr>`).join('')}</table></div>`;
    setTimeout(() => { const b = $('restart'); if (b) b.onclick = () => { current = null; saveCurrent(); location.hash = '#test/' + id; }; });
    return html;
  }

  function nameFields(withCode) {
    return `<div class="card"><div class="row" style="gap:12px;align-items:flex-end">
      <div style="flex:1;min-width:180px"><label class="f" for="pName">Your name</label><input type="text" id="pName" autocomplete="name" value="${esc(profile.name)}" placeholder="First and last name"></div>
      <div style="flex:1;min-width:140px"><label class="f" for="pCls">Class or section</label><input type="text" id="pCls" value="${esc(profile.cls)}" placeholder="Optional"></div>
      ${withCode ? `<div style="flex:1;min-width:140px"><label class="f" for="pCode">Class code</label><input type="text" id="pCode" autocapitalize="characters" value="${esc(profile.code)}" placeholder="From your instructor"></div>` : ''}
    </div></div>`;
  }
  const readProfile = () => { ['Name', 'Cls', 'Code'].forEach(k => { const el = $('p' + k); if (el) profile[k.toLowerCase()] = el.value.trim(); }); LS.set('Profile', profile); };

  function questionCard(q, i, a) {
    let h = `<div class="card q" id="q${i}"><div class="text"><span class="num">${i + 1}.</span>${q.prompt}</div>`;
    if (q.kind === 'mc') h += q.choices.map(c => `<label class="choice"><input type="radio" name="a${i}" value="${esc(c)}"${a[0] === c ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('');
    else for (let b = 0; b < (q.blanks || 1); b++) h += `<div class="ansrow"${b ? ' style="margin-top:6px"' : ''}><input class="ans" name="a${i}_${b}" inputmode="${q.frac ? 'text' : 'decimal'}" autocomplete="off" value="${esc(a[b] || '')}" placeholder="${q.frac ? 'e.g. 3/4' : 'Answer'}" aria-label="Answer to question ${i + 1}">${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}</div>`;
    return h + '</div>';
  }
  // Generated questions use the same card shape as bank questions.
  const fromGen = q => ({ prompt: q.q, kind: q.type === 'mc' ? 'mc' : 'blank', choices: q.choices || [], blanks: 1, unit: q.type === 'num' ? q.unit : '', frac: q.type === 'frac', gen: q });

  // Practice (mode 'practice'), generated test (mode 'gen') or test-bank test (mode 'bank').
  function quizView(id, mode) {
    const m = MM.byId(id);
    if (!m) return home();
    if (mode === 'test') mode = usesBank(m) ? 'bank' : 'gen';
    if (!current || current.id !== id || current.mode !== mode || current.done) {
      if (mode === 'bank') return startBank(m);
      current = { id, mode, started: Date.now(), questions: MM.buildTest(id).map(fromGen), answers: {} };
      saveCurrent();
    }
    const isTest = mode !== 'practice';
    let html = `<p class="muted" style="margin:0"><a href="#m/${id}">← Back to the lesson</a></p><h1>${esc(m.title)} · ${isTest ? 'Test' : 'Practice'}</h1>`;
    if (isTest) html += nameFields(false);
    html += '<form id="quizForm" novalidate>' + current.questions.map((q, i) => questionCard(q, i, current.answers[i] || [])).join('');
    html += `<div class="bar"><span class="muted" id="answered"></span><span class="row"><span class="status err" id="sendErr"></span><button type="submit" id="submitBtn">${isTest ? 'Hand in my test' : 'Check my answers'}</button></span></div></form>`;
    setTimeout(() => wireQuiz(m));
    return html;
  }

  function startBank(m) {
    const html = `<p class="muted" style="margin:0"><a href="#m/${m.id}">← Back to the lesson</a></p><h1>${esc(m.title)} · Test</h1>${nameFields(true)}
      <div class="card"><p style="margin:0 0 12px">${testSize(m)} questions from your instructor's test bank. When you hand it in, your grade goes to your instructor.</p>
      <div class="row"><button id="go">Start the test</button><span class="status err" id="goErr"></span></div></div>`;
    setTimeout(() => {
      $('go').onclick = async () => {
        readProfile();
        if (!profile.name) { $('goErr').textContent = 'Please enter your name.'; $('pName').focus(); return; }
        if (info.code_required && !profile.code) { $('goErr').textContent = 'Please enter the class code.'; $('pCode').focus(); return; }
        $('go').disabled = true; $('goErr').textContent = '';
        try {
          const qs = await rpc('med_math_quiz', { p_owner: CFG.ownerId, p_code: profile.code, p_module: m.id });
          if (!qs.length) throw new Error('This test has no questions yet.');
          current = { id: m.id, mode: 'bank', started: Date.now(), questions: qs, answers: {} };
          saveCurrent(); render();
        } catch (e) { $('goErr').textContent = e.message; $('go').disabled = false; }
      };
    });
    return html;
  }

  function wireQuiz(m) {
    const form = $('quizForm');
    const filled = i => (current.answers[i] || []).some(v => String(v || '').trim() !== '');
    const count = () => { $('answered').textContent = `${current.questions.filter((q, i) => filled(i)).length} of ${current.questions.length} answered`; };
    count();
    form.addEventListener('input', e => {
      const mt = e.target.name && e.target.name.match(/^a(\d+)(?:_(\d+))?$/);
      if (!mt) return;
      const a = current.answers[mt[1]] || (current.answers[mt[1]] = []);
      a[+(mt[2] || 0)] = e.target.value;
      saveCurrent(); count();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (current.mode !== 'practice') {
        readProfile();
        if (!profile.name) { $('pName').focus(); alert('Please enter your name so your instructor gets your grade.'); return; }
      }
      const blank = current.questions.filter((q, i) => !filled(i)).length;
      if (blank && !confirm(`${blank} question${blank > 1 ? 's are' : ' is'} not answered and will be marked wrong. ${current.mode === 'practice' ? 'Check anyway?' : 'Hand it in anyway?'}`)) return;
      if (current.mode === 'bank') return turnInBank(m);
      gradeHere(m);
    });
  }

  async function turnInBank(m) {
    const btn = $('submitBtn'); btn.disabled = true; $('sendErr').textContent = 'Grading…';
    try {
      const seconds = Math.round((Date.now() - current.started) / 1000);
      const r = await rpc('med_math_turn_in', {
        p_owner: CFG.ownerId, p_code: profile.code, p_student: profile.name, p_email: profile.email || '', p_class: profile.cls || '',
        p_module: m.id, p_title: m.title, p_seconds: seconds,
        p_responses: current.questions.map((q, i) => ({ id: q.id, given: (current.answers[i] || []).map(v => String(v || '').slice(0, 60)) }))
      });
      const byId = {}; r.results.forEach(x => { byId[x.id] = x; });
      current.results = current.questions.map(q => ({ ok: byId[q.id] && byId[q.id].ok, correct: byId[q.id] && byId[q.id].correct }));
      const entry = { uid: Date.now().toString(36), module: m.id, title: m.title, score: r.score, total: r.total, pct: +r.percent, seconds, at: new Date().toISOString(), sent: true };
      history.push(entry); LS.set('History', history);
      current.done = true; current.entryUid = entry.uid; saveCurrent();
      location.hash = '#result/' + m.id;
    } catch (err) {
      btn.disabled = false; $('sendErr').textContent = 'Not handed in yet: ' + err.message;
    }
  }

  // Practice drills and generated tests are graded on this device.
  function gradeHere(m) {
    const results = current.questions.map((q, i) => { const given = String((current.answers[i] || [])[0] || ''); return { ok: MM.check(q.gen, given), correct: q.gen.answer, given }; });
    const score = results.filter(r => r.ok).length, total = results.length, pct = Math.round(score / total * 1000) / 10;
    current.results = results; current.done = true;
    if (current.mode === 'gen') {
      const entry = { uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), module: m.id, title: m.title, score, total, pct, seconds: Math.round((Date.now() - current.started) / 1000), at: new Date().toISOString(), sent: false,
        answers: current.questions.map((q, i) => ({ q: plain(q.prompt).slice(0, 400), given: results[i].given.slice(0, 60), correct: String(q.gen.answer), ok: results[i].ok })) };
      history.push(entry); LS.set('History', history);
      current.entryUid = entry.uid;
    } else current.practice = { score, total, pct };
    saveCurrent();
    location.hash = '#result/' + m.id; // the results page hands a generated test in
  }

  function resultView(id) {
    const m = MM.byId(id);
    if (!current || current.id !== id || !current.done) { location.hash = '#m/' + id; return ''; }
    const practice = current.mode === 'practice';
    const e = practice ? current.practice : (history.find(h => h.uid === current.entryUid) || {});
    const pass = e.pct >= PASS;
    let status = '';
    if (current.mode === 'bank' || e.sent) status = '<span class="status ok">✓ Handed in to your instructor</span>';
    else if (current.mode === 'gen') status = 'Handing in your grade…';
    else status = '<span class="muted">Practice only. Not sent to your instructor.</span>';
    let html = `<p class="muted" style="margin:0"><a href="#m/${id}">← Back to the chapter</a></p><h1>${esc(m.title)} · ${practice ? 'Practice' : 'Test'} results</h1>`;
    html += `<div class="card score"><div class="big ${pass ? 'pass' : 'fail'}">${e.pct}%</div><div>${e.score} of ${e.total} correct${practice ? '' : ' · ' + (pass ? 'Passed' : 'Keep practicing. Passing is ' + PASS + '%')}</div>
      <div class="status" id="sendStatus">${status}</div>
      <div class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="#${practice ? 'practice' : 'test'}/${id}" id="again">${practice ? 'Practice again' : 'Take a new test'}</a>${practice ? `<a class="btn ghost" href="#test/${id}">Take the test</a>` : `<a class="btn ghost" href="#practice/${id}">Practice</a>`}<button class="ghost" onclick="print()">Print</button></div></div>`;
    current.questions.forEach((q, i) => {
      const r = current.results[i] || {};
      const given = (current.answers[i] || []).filter(v => String(v || '').trim()).join(', ');
      const correct = r.correct != null && r.correct !== '' ? `<b>Correct answer: ${esc(r.correct)}${q.unit ? ' ' + esc(q.unit) : ''}</b>` : '';
      const explain = q.gen && q.gen.explain ? q.gen.explain : '';
      const fb = (!r.ok ? correct : '') + (!r.ok && correct && explain ? '<br>' : '') + explain;
      html += `<div class="card q ${r.ok ? 'right' : 'wrong'}"><div class="text"><span class="num">${i + 1}.</span>${q.prompt}</div>
        <div>Your answer: <b>${given ? esc(given) : '<span class="muted">(blank)</span>'}</b> ${r.ok ? '✓' : '✗'}</div>${fb ? `<div class="fb">${fb}</div>` : ''}</div>`;
    });
    setTimeout(() => {
      $('again').onclick = () => { current = null; saveCurrent(); };
      if (current.mode === 'gen' && !e.sent) send(e);
    });
    return html;
  }

  function meView() {
    let html = `<p class="muted" style="margin:0"><a href="#">← All chapters</a></p><h1>My grades</h1>
      <div class="card"><label class="f" for="mName">Your name</label><input type="text" id="mName" autocomplete="name" value="${esc(profile.name)}" placeholder="First and last name">
      <label class="f" for="mEmail">School email</label><input type="email" id="mEmail" autocomplete="email" value="${esc(profile.email)}" placeholder="Optional">
      <label class="f" for="mCls">Class or section</label><input type="text" id="mCls" value="${esc(profile.cls)}" placeholder="Optional, e.g. NUR 101 Fall">
      <label class="f" for="mCode">Class code</label><input type="text" id="mCode" autocapitalize="characters" value="${esc(profile.code)}" placeholder="From your instructor">
      <div class="row" style="margin-top:14px"><button id="saveMe">Save</button><span class="muted" id="savedMsg"></span></div></div>`;
    const unsent = history.filter(h => !h.sent).length;
    if (unsent) html += `<div class="card"><b>${unsent} grade${unsent > 1 ? 's' : ''} not sent yet.</b> <button class="small" id="resend">Send now</button> <span id="resendMsg" class="muted"></span></div>`;
    html += '<h2>Best test score by chapter</h2><div class="card scroll"><table><tr><th>Chapter</th><th>Best</th><th>Tries</th></tr>';
    MM.MODULES.forEach(m => { const t = history.filter(h => h.module === m.id); html += `<tr><td>${m.ch ? m.ch + '. ' : ''}${esc(m.title)}</td><td>${t.length ? pill(m.id) : '<span class="muted">—</span>'}</td><td>${t.length || ''}</td></tr>`; });
    html += '</table></div><p class="muted">Your grades are saved on this device and handed in to your instructor. If you change devices, your instructor still has every test you handed in.</p>';
    setTimeout(() => {
      $('saveMe').onclick = () => { profile = { name: $('mName').value.trim(), email: $('mEmail').value.trim(), cls: $('mCls').value.trim(), code: $('mCode').value.trim() }; LS.set('Profile', profile); $('savedMsg').textContent = 'Saved.'; };
      const r = $('resend'); if (r) r.onclick = async () => { $('resendMsg').textContent = 'Sending…'; for (const h of history.filter(x => !x.sent)) await send(h); render(); };
    });
    return html;
  }

  // ---------- videos ----------
  // A YouTube or Vimeo link the instructor added on teacher.html, turned into a safe embed address.
  function embedUrl(u) {
    let m = String(u || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0';
    m = String(u || '').match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? 'https://player.vimeo.com/video/' + m[1] : null;
  }
  window.MedMathEmbedUrl = embedUrl;

  function videoCards(m) {
    let h = '';
    const url = embedUrl((info.videos || {})[m.id]);
    if (url) h += `<div class="card"><b>🎬 Video from your instructor</b><div class="embed"><iframe src="${esc(url)}" title="Video: ${esc(m.title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div></div>`;
    const v = (window.MedMathVideos || {})[m.id];
    if (v) {
      h += `<div class="card video"><div class="vhead"><b>▶ Watch how to do it</b><span class="muted">${esc(v.title)} · ${v.steps.length} steps</span></div>
        <div class="board" id="vBoard" aria-live="polite"><div class="vstart">Press <b>Play</b> to watch a worked problem, step by step.</div></div>
        <div class="caption" id="vCap"></div>
        <div class="prog" aria-hidden="true"><i id="vBar"></i></div>
        <div class="vctl"><button id="vPlay">▶ Play</button><button class="ghost small" id="vBack" aria-label="Back one step">⏮ Back</button><button class="ghost small" id="vNext" aria-label="Next step">Next ⏭</button>
        <label class="vvoice"><input type="checkbox" id="vVoice"${LS.get('Voice', true) ? ' checked' : ''}> Voice</label></div></div>`;
      setTimeout(() => player(Object.assign({ id: m.id }, v)));
    }
    return h;
  }

  // Which sentences have a natural-voice recording (made on GitHub by tools/make-audio.py).
  let narration = null;
  fetch('audio/manifest.json').then(r => r.ok ? r.json() : null).then(j => { narration = j; }).catch(() => {});

  // Picks the most natural-sounding English voice the device has (neural / enhanced voices first).
  function bestVoice() {
    const synth = window.speechSynthesis; if (!synth) return null;
    const score = vc => {
      const n = vc.name;
      if (!/^en(-|_|$)/i.test(vc.lang)) return -1;
      return (/natural/i.test(n) ? 60 : 0) + (/neural/i.test(n) ? 55 : 0) + (/premium/i.test(n) ? 50 : 0) + (/enhanced/i.test(n) ? 45 : 0)
        + (/online/i.test(n) ? 25 : 0) + (/google/i.test(n) ? 20 : 0) + (/\b(aria|jenny|ava|samantha|allison|zoe|emma|michelle|guy|evan|nathan)\b/i.test(n) ? 15 : 0)
        + (/en[-_]US/i.test(vc.lang) ? 10 : 0) + (vc.localService ? 0 : 5) - (/compact|espeak|fred|zarvox|albert|bad news|bells|boing|bubbles|cellos|whisper|trinoids|junior|ralph|kathy/i.test(n) ? 80 : 0);
    };
    return synth.getVoices().filter(vc => score(vc) >= 0).sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (window.speechSynthesis) window.speechSynthesis.getVoices();

  // Plays a walkthrough: each step writes a line on the board and reads the caption aloud.
  let stopPlayer = () => {};
  function player(v) {
    stopPlayer();
    const board = $('vBoard'), cap = $('vCap'), bar = $('vBar'), playBtn = $('vPlay'), voice = $('vVoice');
    if (!board) return;
    let idx = -1, playing = false, timer = null, utter = null, audio = null;
    const synth = window.speechSynthesis;
    const clear = () => { clearTimeout(timer); timer = null; if (synth) synth.cancel(); utter = null; if (audio) { audio.pause(); audio = null; } };
    const draw = () => {
      const lines = v.steps.slice(0, idx + 1).filter(st => st.b);
      board.innerHTML = lines.length ? lines.map((st, i) => `<div class="vline${i === lines.length - 1 && st === v.steps[idx] ? ' now' : ''}">${st.b}</div>`).join('') : '<div class="vstart">Press <b>Play</b> to watch a worked problem, step by step.</div>';
      board.scrollTop = board.scrollHeight;
      cap.textContent = idx >= 0 ? v.steps[idx].s : '';
      bar.style.width = ((idx + 1) / v.steps.length * 100) + '%';
      playBtn.textContent = playing ? '⏸ Pause' : idx >= v.steps.length - 1 ? '↺ Watch again' : idx >= 0 ? '▶ Resume' : '▶ Play';
    };
    const next = () => { if (!playing) return; if (idx >= v.steps.length - 1) { playing = false; draw(); return; } go(idx + 1); };
    const go = i => {
      clear(); idx = Math.max(-1, Math.min(v.steps.length - 1, i)); draw();
      if (!playing || idx < 0) return;
      const text = v.steps[idx].s, wait = Math.max(2600, text.length * 62), key = v.id + '-' + idx;
      const done = () => { timer = setTimeout(next, 700); };
      if (!voice.checked) { timer = setTimeout(next, wait); return; }
      // A recording made with the natural voice, if it says exactly this sentence.
      if (narration && narration[key] === text) {
        audio = new Audio('audio/' + key + '.mp3');
        const a = audio;
        a.onended = () => { if (a === audio) done(); };
        a.onerror = () => { if (a === audio) { audio = null; speak(text, wait); } };
        a.play().catch(() => { if (a === audio) { audio = null; speak(text, wait); } });
        return;
      }
      speak(text, wait);
    };
    // The device's most natural built-in voice, for sentences without a recording.
    const speak = (text, wait) => {
      if (!synth) { timer = setTimeout(next, wait); return; }
      utter = new SpeechSynthesisUtterance(text); utter.rate = 0.95; utter.lang = 'en-US';
      const best = bestVoice(); if (best) utter.voice = best;
      const u = utter; utter.onend = () => { if (u === utter) timer = setTimeout(next, 700); };
      synth.speak(utter);
      timer = setTimeout(next, wait * 1.8 + 1500); // in case the browser never reports the end
    };
    playBtn.onclick = () => {
      if (playing) { playing = false; clear(); draw(); return; }
      playing = true; go(idx < 0 || idx >= v.steps.length - 1 ? 0 : idx); // start, restart, or resume this step
    };
    $('vBack').onclick = () => go(idx - 1);
    $('vNext').onclick = () => go(idx + 1);
    voice.onchange = () => { LS.set('Voice', voice.checked); if (playing) go(idx); };
    stopPlayer = () => { playing = false; clear(); };
  }

  // ---------- hand in a generated test ----------
  const sending = new Set();
  async function send(entry) {
    const st = $('sendStatus');
    if (!CFG.sync || !CFG.ownerId) { if (st) st.innerHTML = '<span class="status err">Grades can\'t be sent yet: this site isn\'t connected to a gradebook.</span>'; return; }
    if (entry.sent || !entry.answers || sending.has(entry.uid)) return;
    sending.add(entry.uid);
    try {
      await rpc('med_math_submit', { p_owner: CFG.ownerId, p_student: profile.name || 'Unknown', p_email: profile.email || '', p_class: profile.cls || '', p_module: entry.module, p_title: entry.title, p_score: entry.score, p_total: entry.total, p_seconds: entry.seconds, p_answers: entry.answers });
      entry.sent = true; LS.set('History', history);
      if (st) st.innerHTML = '<span class="status ok">✓ Handed in to your instructor</span>';
    } catch (err) {
      if (st) st.innerHTML = `<span class="status err">Your grade is saved on this device but couldn't be sent (${esc(err.message)}). It will try again next time you open the site, or use <a href="#me">My grades → Send now</a>.</span>`;
    } finally { sending.delete(entry.uid); }
  }

  // ---------- router ----------
  function render() {
    stopPlayer();
    const [view, id] = location.hash.replace(/^#/, '').split('/');
    const html = view === 'm' ? moduleView(id) : view === 'practice' ? quizView(id, 'practice') : view === 'test' ? quizView(id, 'test') : view === 'result' ? resultView(id) : view === 'me' ? meView() : home();
    $('view').innerHTML = html;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  render();
  // How many bank questions each chapter has (counts only, no questions), then refresh the page.
  if (CFG.sync && CFG.ownerId) rpc('med_math_info', { p_owner: CFG.ownerId }).then(r => {
    const changed = JSON.stringify(r) !== JSON.stringify(info);
    info = r; LS.set('Info', info);
    if (changed && !/^#(practice|test)\//.test(location.hash)) render();
  }).catch(() => {});
  // Retry any generated-test grades that didn't go through last time.
  setTimeout(() => history.filter(h => !h.sent).forEach(h => send(h)), 1500);
})();
