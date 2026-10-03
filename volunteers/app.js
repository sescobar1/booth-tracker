// Band Volunteers: one sign-up page for adults and students (share the link or QR code),
// plus group texts, phone check-in, printable sign-in sheets, and volunteer hours.
// Everything saves on the device first; db.js keeps it matched with the cloud when signed in.
const CFG = window.VOL_CONFIG || {};
const KEY = CFG.storageKey || 'bandVolunteers';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Shaana's night-before text for concession stand volunteers.
const CONCESSION_TEMPLATE = { id: 'conc', name: 'Concession stand – night before', text: 'Thank you so much for signing up to work the Russellville concession stand {when}! We truly appreciate your time and dedication to our band program. 💛\nA few important reminders:\n\n• Please arrive by {arrive}.\n• If someone is working the admission gate, just let them know you are there to work the concession stand.\n• When you arrive, please sign in on the sign-in sheet and indicate whether you would like trip credit or volunteer hours.\n• As a thank-you for volunteering, we will provide you with a free drink and one entrée item for dinner. You also get unlimited volunteer water.\n• If you have long hair, please make sure it is pulled back or pinned up while working.\n• Wear comfortable closed-toe shoes—you will be on your feet!\n• You must remain in your assigned position the entire time. We ask that you do not leave to go watch the band at halftime, or any other time.\n• Please do not bring children unless they have signed up to work through their band director.\n\nIf you have any questions, please let me know. If you are unable to attend, please text me separately, and make sure to tell me your name when you text.\n{stillneed}If you know someone who might be willing to help us {day}, please send them our way!\nAgain, thank you for volunteering and supporting our band program. We truly appreciate your help! 🎶💛\n\nThanks, S.Escobar' };
const DEFAULT_TEMPLATES = [
  CONCESSION_TEMPLATE,
  { id: 't1', name: 'Reminder', text: 'Hi {first}! Reminder: you signed up to help{job} at {event} on {date}{time}. Thank you for supporting the band! – {from}' },
  { id: 't2', name: 'Thank you', text: 'Thank you, {first}, for volunteering at {event}! The band couldn\'t do it without you. – {from}' },
  { id: 't3', name: 'Still need help', text: 'Hi {first}! We still need volunteers for {event} on {date}{time}. Can you help? Sign up here: {link} – {from}' },
  { id: 't4', name: 'Where to go', text: 'Hi {first}! For {event} on {date}, please check in with me at {location}{time}. Text me if you\'re running late. – {from}' }
];

function blank() {
  return { people: [], events: [], jobs: [], slots: [], templates: DEFAULT_TEMPLATES.slice(), settings: { from: '', org: 'Band Boosters' } };
}

// `data` is global so sync.js can swap in another device's copy.
var data = (() => {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.people) return Object.assign(blank(), d); } catch (e) {}
  return blank();
})();
// Devices set up before the concession stand text existed get it once (and keep it deleted if removed).
if (!data.settings.hasConcession) {
  if (!data.templates.some(t => t.id === 'conc')) data.templates.unshift(Object.assign({}, CONCESSION_TEMPLATE));
  data.settings.hasConcession = true;
}

window.save = function () {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('Could not save on this device: ' + e.message); }
};

// ---------- formatting ----------
const pad = n => String(n).padStart(2, '0');
const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDay(new Date());
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function digits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length >= 10 ? d.slice(-10) : '';
}
const fmtPhone = p => { const d = digits(p); return d ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : (p || ''); };
const e164 = p => '+1' + digits(p);

function fmtDate(iso, long) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const opts = { weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString([], opts);
}
function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + ap;
}
const fmtRange = (a, b) => a ? fmtTime(a) + (b ? '–' + fmtTime(b) : '') : '';
const clock = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

// Dates from spreadsheets come as 10/3/2026, 2026-10-03, "Fri, Oct 3, 2026", or a spreadsheet day number.
function parseDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isoDay(v);
  const s = String(v).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(m[1]) + '-' + pad(m[2]); }
  m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    let y = m[3] ? Number(m[3]) : new Date().getFullYear();
    return y + '-' + pad(mo) + '-' + pad(m[2]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Math.round((Number(s) - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  return '';
}
function parseTime(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  let m = s.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?/i);
  if (m) { let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return pad(h) + ':' + pad(m[2] || 0); }
  m = s.match(/(?:^|\s|T)(\d{1,2}):(\d{2})/);
  if (m) return pad(m[1]) + ':' + m[2];
  return '';
}

function splitName(full) {
  let s = String(full || '').replace(/\s+/g, ' ').trim();
  if (!s) return { first: '', last: '' };
  if (s.includes(',')) { const [l, f] = s.split(',').map(x => x.trim()); return { first: f || '', last: l || '' }; }
  const parts = s.split(' ');
  if (parts.length === 1) return { first: s, last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}
const fullName = p => p ? ((p.first || '') + ' ' + (p.last || '')).trim() || '(no name)' : '(removed)';
const sortName = p => ((p.last || '') + ' ' + (p.first || '')).toLowerCase();

// ---------- lookups ----------
const person = id => data.people.find(p => p.id === id);
const event = id => data.events.find(e => e.id === id);
const slotsFor = evId => data.slots.filter(s => s.eventId === evId);
const jobsFor = evId => data.jobs.filter(j => j.eventId === evId).sort((a, b) => (a.sort - b.sort) || (a.start || '').localeCompare(b.start || '') || a.role.localeCompare(b.role));
const filledOf = jobId => data.slots.filter(s => s.jobId === jobId).length;
// The job a volunteer belongs to, matched by name; made on the spot for imports and walk-ins.
function jobFor(evId, role, create) {
  const r = (role || '').trim().toLowerCase();
  let j = jobsFor(evId).find(x => x.role.toLowerCase() === r) || (!r && jobsFor(evId).length === 1 ? jobsFor(evId)[0] : null);
  if (!j && create) { j = { id: uid(), eventId: evId, role: (role || '').trim() || 'Volunteer', need: 0, start: '', end: '', sort: jobsFor(evId).length }; data.jobs.push(j); }
  return j;
}
const signedIn = () => !!(window.volSync && window.volSync.user());
// Link to the public sign-up page, for the whole season or one event.
function signupUrl(evId) {
  if (data.settings.signupLink) return data.settings.signupLink;
  const u = new URL('signup.html', location.href.split('#')[0]);
  const me = signedIn() ? window.volSync.user().id : CFG.ownerId;
  if (me && me !== CFG.ownerId) u.searchParams.set('o', me);
  if (evId) u.searchParams.set('e', evId);
  return u.href;
}
const typeLabel = t => t === 'student' ? 'Student' : 'Adult';

// The same person can sign up on both sites; match by phone, then email, then name.
function findPerson(p) {
  const d = digits(p.phone), em = (p.email || '').trim().toLowerCase(), nm = (p.first + ' ' + p.last).trim().toLowerCase();
  return (d && data.people.find(x => digits(x.phone) === d)) ||
    (em && data.people.find(x => (x.email || '').toLowerCase() === em)) ||
    (nm && data.people.find(x => (x.first + ' ' + x.last).trim().toLowerCase() === nm)) || null;
}
function upsertPerson(p) {
  const hit = findPerson(p);
  if (hit) {
    if (!hit.phone && digits(p.phone)) hit.phone = digits(p.phone);
    if (!hit.email && p.email) hit.email = p.email.trim();
    if (!hit.parent && p.parent) hit.parent = p.parent;
    return { person: hit, isNew: false };
  }
  const np = { id: uid(), first: p.first || '', last: p.last || '', phone: digits(p.phone) || '', email: (p.email || '').trim(), type: p.type || 'adult', parent: p.parent || '', notes: '' };
  data.people.push(np);
  return { person: np, isNew: true };
}

function hoursOf(s) {
  if (!s.inAt || !s.outAt) return 0;
  return Math.max(0, (new Date(s.outAt) - new Date(s.inAt)) / 36e5);
}
// School year runs August through July.
function schoolYearStart(d = new Date()) { const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return y + '-08-01'; }
const fmtHours = h => (Math.round(h * 10) / 10).toString();

// ---------- UI helpers ----------
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
window.toast = toast;

function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; document.body.classList.add('locked'); }
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; document.body.classList.remove('locked'); }
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast((what || 'Text') + ' copied.'); }
  catch (e) { prompt('Copy this:', text); }
}

// ---------- texting ----------
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function smsHref(numbers, body) {
  const b = encodeURIComponent(body || '');
  const nums = numbers.map(e164);
  if (nums.length === 1) return 'sms:' + nums[0] + (isIOS() ? '&' : '?') + 'body=' + b;
  if (isIOS()) return 'sms://open?addresses=' + nums.join(',') + '&body=' + b;
  const sep = /SAMSUNG|SM-/i.test(navigator.userAgent) ? ';' : ',';
  return 'sms:' + nums.join(sep) + '?body=' + b;
}
// "tonight", "tomorrow night", or "on Friday night" (morning events drop "night").
function whenWords(ev, start, short) {
  if (!ev) return '';
  const days = Math.round((new Date(ev.date + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
  const night = !start || start >= '15:00';
  if (days === 0) return night ? 'tonight' : 'today';
  if (days === 1) return 'tomorrow' + (night && !short ? ' night' : '');
  const wd = new Date(ev.date + 'T12:00').toLocaleDateString([], { weekday: 'long' });
  if (days > 1 && days < 7) return 'on ' + wd + (night && !short ? ' night' : '');
  return 'on ' + fmtDate(ev.date, true);
}
function fillMessage(text, ev, slot, p) {
  const start = (slot && slot.start) || (ev && ev.start);
  const role = slot && slot.role;
  const open = ev ? eventCounts(ev).open : 0;
  return String(text || '')
    .replace(/\{when\}/g, whenWords(ev, start, false))
    .replace(/\{day\}/g, whenWords(ev, start, true))
    .replace(/\{arrive\}/g, start ? fmtTime(start) : 'your start time')
    .replace(/\{open\}/g, String(open))
    .replace(/\{stillneed\}/g, open ? 'We are also still looking for ' + open + ' more volunteer' + (open === 1 ? '' : 's') + '.\n' : '')
    .replace(/\{first\}/g, p ? (p.first || 'there') : 'everyone')
    .replace(/\{name\}/g, p ? fullName(p) : 'everyone')
    .replace(/\{event\}/g, ev ? ev.name : '')
    .replace(/\{date\}/g, ev ? fmtDate(ev.date, true) : '')
    .replace(/\{time\}/g, start ? ' at ' + fmtTime(start) : '')
    .replace(/\{job\}/g, role ? ' with ' + role : '')
    .replace(/\{role\}/g, role || '')
    .replace(/\{location\}/g, (ev && ev.location) || 'the band room')
    .replace(/\{from\}/g, data.settings.from || data.settings.org || 'Band Boosters')
    .replace(/\{link\}/g, signupUrl(ev && ev.id))
    .replace(/\s+–\s*$/, '');
}

// ---------- routing ----------
function route() {
  const [tab, id] = (location.hash.slice(1) || 'events').split('/');
  const tabOf = { event: 'events', checkin: 'events', sheet: 'events', import: 'more', sug: 'events' };
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tabOf[tab] || tab)));
  const views = { events: viewEvents, event: viewEvent, checkin: viewCheckin, sheet: viewSheet, people: viewPeople, import: viewImport, more: viewMore, share: viewShare, sug: viewSug };
  (views[tab] || viewEvents)(id);
  window.scrollTo(0, 0);
}
window.render = () => { const y = window.scrollY; const keepImport = location.hash.startsWith('#import') && imp; if (!keepImport) route(); window.scrollTo(0, y); };
window.addEventListener('hashchange', route);
$('topShare').onclick = () => { location.hash = 'share'; };

// ---------- Events ----------
function eventCounts(ev) {
  const ss = slotsFor(ev.id);
  const ppl = ss.map(s => person(s.personId)).filter(Boolean);
  return {
    total: ss.length,
    adults: ppl.filter(p => p.type !== 'student').length,
    students: ppl.filter(p => p.type === 'student').length,
    noPhone: ppl.filter(p => !digits(p.phone)).length,
    inNow: ss.filter(s => s.inAt).length,
    need: jobsFor(ev.id).reduce((t, j) => t + Number(j.need || 0), 0),
    open: jobsFor(ev.id).reduce((t, j) => t + Math.max(0, Number(j.need || 0) - filledOf(j.id)), 0)
  };
}
function eventCard(ev) {
  const c = eventCounts(ev);
  return '<a class="card event" href="#event/' + ev.id + '">' +
    '<div class="when"><b>' + esc(fmtDate(ev.date)) + '</b><span>' + esc(fmtRange(ev.start, ev.end)) + '</span></div>' +
    '<div class="what"><b>' + esc(ev.name) + '</b>' + (ev.location ? '<span>' + esc(ev.location) + '</span>' : '') +
    '<div class="chips">' + (c.need ? '<span class="chip ' + (c.open ? 'gold' : 'ok') + '">' + (c.open ? c.open + ' open of ' + c.need : 'Full') + '</span>' : '') +
    '<span class="chip">' + c.adults + ' adults</span><span class="chip student">' + c.students + ' students</span>' + (ev.isPublic === false ? '<span class="chip">Hidden</span>' : '') +
    (c.noPhone ? '<span class="chip warn">' + c.noPhone + ' need phone</span>' : '') + '</div></div></a>';
}
function viewEvents() {
  const t = today();
  const up = data.events.filter(e => e.date >= t).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const past = data.events.filter(e => e.date < t).sort((a, b) => b.date.localeCompare(a.date));
  $('view').innerHTML =
    (signedIn() ? '' : '<div class="card pad"><h2>Sign in</h2><div data-syncbox></div></div>') + quickLinks() +
    '<div class="row-actions"><a class="button" href="#sug">🔄 Update from SignUpGenius</a><button type="button" class="ghost" id="newEvent">+ New event</button><a class="button ghost" href="#share">📣 Share sign-up link</a></div>' +
    (data.events.length || !signedIn() ? '' : '<div class="empty"><h2>Welcome!</h2><p>Add an event and the jobs you need filled, then share your sign-up link or QR code.</p></div>') +
    (up.length ? '<h2>Coming up</h2>' + up.map(eventCard).join('') : (data.events.length ? '<p class="helper">No upcoming events. Import sign-ups or add one.</p>' : '')) +
    (past.length ? '<details class="past"><summary>Past events (' + past.length + ')</summary>' + past.map(eventCard).join('') + '</details>' : '');
  $('newEvent').onclick = () => editEvent();
  if (window.volSync) window.volSync.renderBox();
}

const EVENT_IDEAS = ['Football game concessions', 'Marching competition', 'Home game – stands help', 'Uniform fitting', 'Chaperones', 'Fundraiser', 'Band camp', 'Concert', 'Pit crew / equipment'];
function editEvent(id, copyFrom) {
  const src = copyFrom ? event(copyFrom) : null;
  const ev = id ? event(id) : { name: src ? src.name : '', date: src ? '' : today(), start: src ? src.start : '', end: src ? src.end : '', location: src ? src.location : '', notes: src ? src.notes : '', isPublic: true };
  // Work on a copy of the jobs so Cancel leaves them alone.
  let jobs = (id ? jobsFor(id) : src ? jobsFor(src.id).map(j => Object.assign({}, j, { id: null })) : [{ role: 'Concession Stand', need: 10, start: '', end: '' }]).map(j => Object.assign({}, j));
  openModal('<h2>' + (id ? 'Edit event' : src ? 'Copy of ' + esc(src.name) : 'New event') + '</h2>' +
    '<label>Event<input id="evName" list="evIdeas" value="' + esc(ev.name) + '" placeholder="RHS vs. Lake Hamilton"></label>' +
    '<datalist id="evIdeas">' + EVENT_IDEAS.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<div class="grid3"><label>Date<input id="evDate" type="date" value="' + esc(ev.date) + '"></label>' +
    '<label>Starts<input id="evStart" type="time" value="' + esc(ev.start) + '"></label>' +
    '<label>Ends<input id="evEnd" type="time" value="' + esc(ev.end) + '"></label></div>' +
    '<label>Where<input id="evLoc" value="' + esc(ev.location) + '" placeholder="Cyclone Stadium Concession Stand"></label>' +
    '<label>Notes for volunteers<textarea id="evNotes" rows="2" placeholder="Wear a band shirt. Park by the field house.">' + esc(ev.notes) + '</textarea></label>' +
    '<h3>Jobs to fill</h3><p class="helper">How many people each job needs. Leave times blank to use the event times.</p><div id="evJobs"></div>' +
    '<button type="button" class="ghost small" id="evAddJob">+ Add a job</button>' +
    '<label class="check"><input type="checkbox" id="evPublic"' + (ev.isPublic !== false ? ' checked' : '') + '> Show on the sign-up page</label>' +
    '<div class="row-actions"><button type="button" id="evSave">Save</button><button type="button" class="ghost" id="evCancel">Cancel</button>' +
    (id ? '<button type="button" class="ghost" id="evCopy">Copy to a new date</button><button type="button" class="danger" id="evDel">Delete</button>' : '') + '</div>');
  const readJobs = () => document.querySelectorAll('#evJobs .jobrow').forEach((row, i) => {
    Object.assign(jobs[i], { role: row.querySelector('.jRole').value.trim(), need: Math.max(0, Number(row.querySelector('.jNeed').value) || 0), start: row.querySelector('.jStart').value, end: row.querySelector('.jEnd').value });
  });
  const drawJobs = () => {
    $('evJobs').innerHTML = jobs.map((j, i) => '<div class="jobrow"><input class="jRole" list="jobIdeas" value="' + esc(j.role) + '" placeholder="Job">' +
      '<label>Need<input class="jNeed" type="number" min="0" inputmode="numeric" value="' + esc(j.need) + '"></label>' +
      '<label>From<input class="jStart" type="time" value="' + esc(j.start) + '"></label><label>To<input class="jEnd" type="time" value="' + esc(j.end) + '"></label>' +
      '<button type="button" class="icon" data-rm="' + i + '" title="Remove job">✕</button>' +
      (j.id ? '<span class="sub">' + filledOf(j.id) + ' signed up</span>' : '') + '</div>').join('') +
      '<datalist id="jobIdeas">' + JOB_IDEAS.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>';
    $('evJobs').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      readJobs();
      const j = jobs[Number(b.dataset.rm)];
      if (j.id && filledOf(j.id) && !confirm(filledOf(j.id) + ' people signed up for ' + j.role + '. Remove the job anyway? They stay on the event under Other.')) return;
      jobs.splice(Number(b.dataset.rm), 1); drawJobs();
    });
  };
  drawJobs();
  $('evAddJob').onclick = () => { readJobs(); jobs.push({ role: '', need: 1, start: '', end: '' }); drawJobs(); };
  $('evCancel').onclick = closeModal;
  $('evSave').onclick = () => {
    readJobs();
    const name = $('evName').value.trim(), date = $('evDate').value;
    if (!name || !date) { toast('Give the event a name and date.'); return; }
    if (jobs.some(j => !j.role)) { toast('Give each job a name, or remove it.'); return; }
    Object.assign(ev, { name, date, start: $('evStart').value, end: $('evEnd').value, location: $('evLoc').value.trim(), notes: $('evNotes').value.trim(), isPublic: $('evPublic').checked });
    if (!id) { ev.id = uid(); data.events.push(ev); }
    const keep = new Set(jobs.filter(j => j.id).map(j => j.id));
    data.jobs.filter(j => j.eventId === ev.id && !keep.has(j.id)).forEach(j => data.slots.forEach(s => { if (s.jobId === j.id) s.jobId = null; }));
    data.jobs = data.jobs.filter(j => j.eventId !== ev.id || keep.has(j.id));
    jobs.forEach((j, i) => {
      const row = j.id && data.jobs.find(x => x.id === j.id);
      const vals = { role: j.role, need: j.need, start: j.start, end: j.end, sort: i };
      if (row) { Object.assign(row, vals); data.slots.forEach(s => { if (s.jobId === row.id) s.role = j.role; }); }
      else data.jobs.push(Object.assign({ id: uid(), eventId: ev.id }, vals));
    });
    window.save(); closeModal();
    if (!id) location.hash = 'event/' + ev.id; else route();
  };
  if (id) $('evCopy').onclick = () => { closeModal(); editEvent(null, id); };
  if (id) $('evDel').onclick = () => {
    if (!confirm('Delete ' + ev.name + ' and its ' + slotsFor(id).length + ' sign-ups? People stay in your People list.')) return;
    data.events = data.events.filter(e => e.id !== id);
    data.jobs = data.jobs.filter(j => j.eventId !== id);
    data.slots = data.slots.filter(s => s.eventId !== id);
    window.save(); closeModal(); location.hash = 'events';
  };
}
const JOB_IDEAS = ['Concession Stand', 'Hospitality Room', 'Security', 'Tally Room', 'Chaperone', 'Pit Crew', 'Water / Snacks', 'Uniforms', 'Ticket Table', 'Setup', 'Cleanup'];

// A link to one event can open before the list has loaded from the cloud; wait instead of bouncing away.
function missingEvent() {
  $('view').innerHTML = '<a class="back" href="#events">‹ Events</a><p class="helper">' + (signedIn() ? 'This event was deleted or moved.' : 'Loading… If this doesn\'t change, sign in on the Events tab.') + '</p>';
}

// Shortcuts to the other places the coordinator works (set under More → Your links).
const LINKS = [['drive', '📁', 'Google Drive'], ['band', '🟢', 'BAND'], ['facebook', '📘', 'Facebook'], ['signupLink', '📝', 'SignUpGenius']];
function quickLinks() {
  const have = LINKS.filter(([k]) => data.settings[k]);
  return have.length ? '<div class="quick">' + have.map(([k, icon, label]) => '<a href="' + esc(data.settings[k]) + '" target="_blank" rel="noopener">' + icon + ' ' + label + '</a>').join('') + '</div>' : '';
}

let evFilter = 'all';
function viewEvent(id) {
  const ev = event(id);
  if (!ev) { missingEvent(); return; }
  const c = eventCounts(ev);
  const ss = slotsFor(id).map(s => ({ s, p: person(s.personId) })).filter(x => x.p)
    .filter(x => evFilter === 'all' || (evFilter === 'student' ? x.p.type === 'student' : evFilter === 'adult' ? x.p.type !== 'student' : !digits(x.p.phone)))
    .sort((a, b) => ((a.s.role || 'zzz') + (a.s.start || '') + sortName(a.p)).localeCompare((b.s.role || 'zzz') + (b.s.start || '') + sortName(b.p)));
  const volRow = ({ s, p }) => {
    const d = digits(p.phone);
    return '<div class="vol" data-slot="' + s.id + '">' +
      '<div class="who"><b>' + esc(fullName(p)) + '</b> <span class="chip ' + (p.type === 'student' ? 'student' : '') + '">' + typeLabel(p.type) + '</span>' +
      '<span class="sub">' + esc([fmtRange(s.start, s.end), d ? fmtPhone(d) : 'No phone yet', s.source].filter(Boolean).join(' · ')) + '</span>' +
      (s.inAt ? '<span class="sub ok">✓ In ' + clock(s.inAt) + (s.outAt ? ' – out ' + clock(s.outAt) + ' (' + fmtHours(hoursOf(s)) + ' h)' : '') + '</span>' : '') + '</div>' +
      '<div class="acts">' + (d ? '<a class="icon" href="' + esc(smsHref([d], '')) + '" title="Text">💬</a><a class="icon" href="tel:' + e164(d) + '" title="Call">📞</a>' : '<button type="button" class="icon edit" title="Add phone">✏️</button>') + '</div></div>';
  };
  const jobIds = new Set(jobsFor(id).map(j => j.id));
  let rows = jobsFor(id).map(j => {
    const mine = ss.filter(x => x.s.jobId === j.id), filled = filledOf(j.id), open = Math.max(0, j.need - filled);
    return '<h3 class="role">' + esc(j.role) + (j.start ? ' <small>' + esc(fmtRange(j.start, j.end)) + '</small>' : '') +
      '<span class="fill' + (open ? '' : ' full') + '">' + filled + ' of ' + j.need + (open ? ' · ' + open + ' open' : ' · full') + '</span></h3>' +
      (mine.map(volRow).join('') || (evFilter === 'all' ? '<p class="helper">No one yet.</p>' : ''));
  }).join('');
  const other = ss.filter(x => !jobIds.has(x.s.jobId));
  if (other.length) rows += '<h3 class="role">Other</h3>' + other.map(volRow).join('');
  const f = (k, label) => '<button type="button" class="seg' + (evFilter === k ? ' on' : '') + '" data-f="' + k + '">' + label + '</button>';
  $('view').innerHTML =
    '<a class="back" href="#events">‹ Events</a>' + (ev.isPublic === false ? '<p class="chip">Hidden from the sign-up page</p>' : '') +
    '<div class="event-head"><h1>' + esc(ev.name) + '</h1><p>' + esc(fmtDate(ev.date, true)) + (ev.start ? ' · ' + esc(fmtRange(ev.start, ev.end)) : '') + (ev.location ? ' · ' + esc(ev.location) : '') + '</p>' +
    (ev.notes ? '<p class="helper">' + esc(ev.notes) + '</p>' : '') + '<button type="button" class="linkish" id="evEdit">Edit event</button></div>' +
    '<div class="big-actions">' +
    '<button type="button" id="textAll">💬<span>Text volunteers</span></button>' +
    '<a class="button" href="#checkin/' + id + '">✅<span>Check in (' + c.inNow + '/' + c.total + ')</span></a>' +
    '<a class="button" href="#sheet/' + id + '">🖨<span>Sign-in sheet</span></a>' +
    '<button type="button" id="addVol">➕<span>Add volunteer</span></button>' +
    '<a class="button" href="#share/' + id + '">📣<span>Share link</span></a></div>' +
    '<div class="segs">' + f('all', 'All ' + c.total) + f('adult', 'Adults ' + c.adults) + f('student', 'Students ' + c.students) + (c.noPhone ? f('nophone', 'Need phone ' + c.noPhone) : '') + '</div>' +
    (rows || '<p class="helper">No jobs or volunteers yet. Tap Edit event to add the jobs you need filled.</p>') +
    '<div class="row-actions"><a class="button ghost" href="#import/' + id + '">⬆ Import a list into this event</a></div>';
  $('evEdit').onclick = () => editEvent(id);
  $('textAll').onclick = () => openTexter(id);
  $('addVol').onclick = () => addVolunteer(id);
  document.querySelectorAll('.seg').forEach(b => b.onclick = () => { evFilter = b.dataset.f; viewEvent(id); });
  document.querySelectorAll('.vol').forEach(el => el.addEventListener('click', e => { if (e.target.closest('a.icon')) return; editSlot(el.dataset.slot); }));
}

function personFields(p) {
  return '<div class="grid2"><label>First name<input id="pFirst" value="' + esc(p.first) + '"></label><label>Last name<input id="pLast" value="' + esc(p.last) + '"></label></div>' +
    '<div class="grid2"><label>Cell phone<input id="pPhone" type="tel" inputmode="tel" value="' + esc(fmtPhone(p.phone)) + '"></label>' +
    '<label>Adult or student<select id="pType"><option value="adult"' + (p.type !== 'student' ? ' selected' : '') + '>Adult</option><option value="student"' + (p.type === 'student' ? ' selected' : '') + '>Student</option></select></label></div>' +
    '<div class="grid2"><label>Email<input id="pEmail" type="email" value="' + esc(p.email) + '"></label><label>Parent / student name<input id="pParent" value="' + esc(p.parent) + '" placeholder="optional"></label></div>';
}
function readPerson(p) {
  Object.assign(p, { first: $('pFirst').value.trim(), last: $('pLast').value.trim(), phone: digits($('pPhone').value) || $('pPhone').value.trim(), type: $('pType').value, email: $('pEmail').value.trim(), parent: $('pParent').value.trim() });
}
const toTime = iso => iso ? pad(new Date(iso).getHours()) + ':' + pad(new Date(iso).getMinutes()) : '';
const fromTime = (date, t) => { if (!t) return null; const [y, m, d] = date.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, d, h, mi).toISOString(); };

function editSlot(sid) {
  const s = data.slots.find(x => x.id === sid); if (!s) return;
  const p = person(s.personId), ev = event(s.eventId);
  openModal('<h2>' + esc(fullName(p)) + '</h2><p class="helper">Changes to name, phone, and type apply everywhere this person volunteers.</p>' +
    personFields(p) +
    '<h3>At ' + esc(ev.name) + '</h3>' +
    '<label>Job<input id="sRole" list="eRoles" value="' + esc(s.role) + '" placeholder="Concession Stand"></label><datalist id="eRoles">' + jobsFor(ev.id).map(j => '<option value="' + esc(j.role) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Starts<input id="sStart" type="time" value="' + esc(s.start) + '"></label><label>Ends<input id="sEnd" type="time" value="' + esc(s.end) + '"></label></div>' +
    '<div class="grid2"><label>Checked in<input id="sIn" type="time" value="' + toTime(s.inAt) + '"></label><label>Checked out<input id="sOut" type="time" value="' + toTime(s.outAt) + '"></label></div>' +
    '<div class="row-actions"><button type="button" id="sSave">Save</button><button type="button" class="ghost" id="sCancel">Cancel</button><button type="button" class="danger" id="sDel">Remove from event</button></div>');
  $('sCancel').onclick = closeModal;
  $('sSave').onclick = () => {
    readPerson(p);
    const job = jobFor(ev.id, $('sRole').value, true);
    Object.assign(s, { jobId: job.id, role: job.role, start: $('sStart').value, end: $('sEnd').value, inAt: fromTime(ev.date, $('sIn').value), outAt: fromTime(ev.date, $('sOut').value) });
    window.save(); closeModal(); route();
  };
  $('sDel').onclick = () => {
    if (!confirm('Remove ' + fullName(p) + ' from ' + ev.name + '?')) return;
    data.slots = data.slots.filter(x => x.id !== sid); window.save(); closeModal(); route();
  };
}

function addVolunteer(evId, walkIn) {
  const roles = [...new Set(jobsFor(evId).map(j => j.role).concat(slotsFor(evId).map(s => s.role)).filter(Boolean))];
  openModal('<h2>' + (walkIn ? 'Walk-in volunteer' : 'Add volunteer') + '</h2>' +
    '<label>Someone you already have<input id="aFind" list="aPeople" placeholder="Start typing a name"></label>' +
    '<datalist id="aPeople">' + data.people.slice().sort((a, b) => sortName(a).localeCompare(sortName(b))).map(p => '<option value="' + esc(fullName(p)) + (p.phone ? ' · ' + esc(fmtPhone(p.phone)) : '') + '">').join('') + '</datalist>' +
    '<p class="helper">…or someone new:</p>' + personFields({ type: 'adult' }) +
    '<label>Job<input id="sRole" list="aRoles" value="' + esc(roles[0] || '') + '" placeholder="Concession Stand"></label><datalist id="aRoles">' + roles.map(r => '<option value="' + esc(r) + '">').join('') + '</datalist>' +
    '<div class="grid2"><label>Starts<input id="sStart" type="time"></label><label>Ends<input id="sEnd" type="time"></label></div>' +
    '<div class="row-actions"><button type="button" id="aSave">' + (walkIn ? 'Add and check in' : 'Add') + '</button><button type="button" class="ghost" id="aCancel">Cancel</button></div>');
  $('aCancel').onclick = closeModal;
  $('aFind').onchange = () => {
    const name = $('aFind').value.split(' · ')[0].trim().toLowerCase();
    const p = data.people.find(x => fullName(x).toLowerCase() === name);
    if (p) { $('pFirst').value = p.first; $('pLast').value = p.last; $('pPhone').value = fmtPhone(p.phone); $('pType').value = p.type; $('pEmail').value = p.email || ''; $('pParent').value = p.parent || ''; }
  };
  $('aSave').onclick = () => {
    const tmp = {}; readPerson(tmp);
    if (!tmp.first && !tmp.last) { toast('Enter a name.'); return; }
    const { person: p } = upsertPerson(tmp);
    Object.assign(p, { type: tmp.type }); if (digits(tmp.phone)) p.phone = digits(tmp.phone);
    const job = jobFor(evId, $('sRole').value, true);
    if (job.need < filledOf(job.id) + 1) job.need = filledOf(job.id) + 1;
    data.slots.push({ id: uid(), eventId: evId, jobId: job.id, personId: p.id, role: job.role, start: $('sStart').value, end: $('sEnd').value, source: walkIn ? 'Walk-in' : 'Added', inAt: walkIn ? new Date().toISOString() : null, outAt: null });
    window.save(); closeModal(); route(); toast(fullName(p) + ' added.');
  };
}

// ---------- Texting ----------
function openTexter(evId) {
  const ev = event(evId);
  const list = slotsFor(evId).map(s => ({ s, p: person(s.personId) })).filter(x => x.p).sort((a, b) => sortName(a.p).localeCompare(sortName(b.p)));
  let who = 'all';
  const tplOpts = data.templates.map(t => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('');
  openModal('<h2>Text volunteers</h2><p class="helper">' + esc(ev.name) + ' · ' + esc(fmtDate(ev.date)) + '</p>' +
    '<div class="segs" id="tWho"><button type="button" class="seg on" data-w="all">Everyone</button><button type="button" class="seg" data-w="adult">Adults</button><button type="button" class="seg" data-w="student">Students</button><button type="button" class="seg" data-w="out">Not checked in</button></div>' +
    '<label>Message<select id="tTpl">' + tplOpts + '<option value="">(blank)</option></select></label>' +
    '<textarea id="tText" rows="4"></textarea>' +
    '<p class="helper">{first} becomes each person\'s first name when you text one at a time, and “everyone” in a group text.</p>' +
    '<div id="tPick" class="pick"></div>' +
    '<div class="row-actions stack"><button type="button" id="tOne">Text one at a time (personal, recommended)</button><div id="tGroups"></div>' +
    '<button type="button" class="ghost" id="tCopyNums">Copy phone numbers</button><button type="button" class="ghost" id="tCopyMsg">Copy message</button><button type="button" class="ghost" id="tClose">Close</button></div>');
  const tpl = () => data.templates.find(t => t.id === $('tTpl').value);
  $('tText').value = tpl() ? tpl().text : '';
  $('tTpl').onchange = () => { $('tText').value = tpl() ? tpl().text : ''; };
  const chosen = () => [...document.querySelectorAll('#tPick input:checked')].map(i => list[Number(i.value)]);
  function drawPick() {
    $('tPick').innerHTML = list.map((x, i) => {
      const show = who === 'all' || (who === 'student' ? x.p.type === 'student' : who === 'adult' ? x.p.type !== 'student' : !x.s.inAt);
      const d = digits(x.p.phone);
      return show ? '<label class="check"><input type="checkbox" value="' + i + '"' + (d ? ' checked' : ' disabled') + '> ' + esc(fullName(x.p)) + ' <span class="sub">' + (d ? esc(fmtPhone(d)) : 'no phone') + '</span>' + (x.s.textedAt ? ' <span class="sub ok">texted</span>' : '') + '</label>' : '';
    }).join('') || '<p class="helper">Nobody here.</p>';
    drawGroups();
  }
  // Carriers cap group texts around 20 people, so big lists go out in batches.
  function drawGroups() {
    const nums = chosen().map(x => digits(x.p.phone));
    const batches = []; for (let i = 0; i < nums.length; i += 20) batches.push(nums.slice(i, i + 20));
    $('tGroups').innerHTML = batches.map((b, i) => '<button type="button" class="ghost" data-batch="' + i + '">Open group text' + (batches.length > 1 ? ' ' + (i + 1) + ' of ' + batches.length : '') + ' (' + b.length + ')</button>').join('');
    $('tGroups').querySelectorAll('button').forEach(btn => btn.onclick = () => {
      location.href = smsHref(batches[Number(btn.dataset.batch)], fillMessage($('tText').value, ev, null, null));
    });
  }
  $('tPick').addEventListener('change', drawGroups);
  $('tWho').querySelectorAll('.seg').forEach(b => b.onclick = () => { who = b.dataset.w; $('tWho').querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); drawPick(); });
  $('tCopyNums').onclick = () => copy(chosen().map(x => fmtPhone(x.p.phone)).join(', '), 'Phone numbers');
  $('tCopyMsg').onclick = () => copy(fillMessage($('tText').value, ev, null, null), 'Message');
  $('tClose').onclick = closeModal;
  $('tOne').onclick = () => { const q = chosen(); if (!q.length) { toast('Pick at least one person with a phone number.'); return; } textOneByOne(ev, q, $('tText').value); };
  drawPick();
}

function textOneByOne(ev, queue, text) {
  let i = 0;
  function step() {
    if (i >= queue.length) { closeModal(); route(); toast('All ' + queue.length + ' texts done.'); return; }
    const { s, p } = queue[i];
    const msg = fillMessage(text, ev, s, p);
    openModal('<h2>Text ' + (i + 1) + ' of ' + queue.length + '</h2>' +
      '<p><b>' + esc(fullName(p)) + '</b> · ' + esc(fmtPhone(p.phone)) + '</p><div class="bubble">' + esc(msg) + '</div>' +
      '<div class="row-actions stack"><a class="button" id="oSend" href="' + esc(smsHref([p.phone], msg)) + '">💬 Open text to ' + esc(p.first || 'them') + '</a>' +
      '<button type="button" id="oNext">' + (i + 1 < queue.length ? 'Next person ›' : 'Done') + '</button>' +
      '<button type="button" class="ghost" id="oSkip">Skip</button><button type="button" class="ghost" id="oStop">Stop</button></div>' +
      '<p class="helper">Tap Open text, press Send in Messages, then come back here and tap Next.</p>');
    $('oSend').onclick = () => { s.textedAt = new Date().toISOString(); window.save(); };
    $('oNext').onclick = () => { i++; step(); };
    $('oSkip').onclick = () => { i++; step(); };
    $('oStop').onclick = () => { closeModal(); route(); };
  }
  step();
}

// ---------- Check-in ----------
let ciSearch = '';
function viewCheckin(id) {
  const ev = event(id);
  if (!ev) { missingEvent(); return; }
  const all = slotsFor(id).map(s => ({ s, p: person(s.personId) })).filter(x => x.p).sort((a, b) => sortName(a.p).localeCompare(sortName(b.p)));
  const inCount = all.filter(x => x.s.inAt).length;
  $('view').innerHTML = '<a class="back" href="#event/' + id + '">‹ ' + esc(ev.name) + '</a>' +
    '<h1>Check in</h1><p class="helper">' + inCount + ' of ' + all.length + ' here · ' + esc(fmtDate(ev.date)) + '</p>' +
    '<input id="ciFind" type="search" placeholder="Find a name" value="' + esc(ciSearch) + '">' +
    '<div id="ciList"></div><div class="row-actions"><button type="button" id="ciWalk">+ Walk-in volunteer</button><a class="button ghost" href="#sheet/' + id + '">🖨 Paper sign-in sheet</a></div>';
  function draw() {
    const q = ciSearch.toLowerCase();
    $('ciList').innerHTML = all.filter(x => !q || fullName(x.p).toLowerCase().includes(q)).map(({ s, p }) => {
      const state = s.outAt ? 'done' : s.inAt ? 'in' : 'wait';
      return '<div class="ci ' + state + '"><div class="who"><b>' + esc(fullName(p)) + '</b> <span class="chip ' + (p.type === 'student' ? 'student' : '') + '">' + typeLabel(p.type) + '</span>' +
        '<span class="sub">' + esc([s.role, fmtRange(s.start, s.end)].filter(Boolean).join(' · ')) + '</span>' +
        (s.inAt ? '<span class="sub ok">In ' + clock(s.inAt) + (s.outAt ? ' · out ' + clock(s.outAt) + ' · ' + fmtHours(hoursOf(s)) + ' h' : '') + '</span>' : '') + '</div>' +
        (state === 'wait' ? '<button type="button" data-in="' + s.id + '">Check in</button>' : state === 'in' ? '<button type="button" class="ghost" data-out="' + s.id + '">Check out</button>' : '<button type="button" class="ghost small" data-undo="' + s.id + '">Undo</button>') + '</div>';
    }).join('') || '<p class="helper">No one matches.</p>';
  }
  draw();
  $('ciFind').oninput = e => { ciSearch = e.target.value; draw(); };
  $('ciList').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = data.slots.find(x => x.id === (b.dataset.in || b.dataset.out || b.dataset.undo)); if (!s) return;
    if (b.dataset.in) s.inAt = new Date().toISOString();
    else if (b.dataset.out) s.outAt = new Date().toISOString();
    else if (b.dataset.undo) s.outAt = null;
    window.save(); viewCheckin(id);
  };
  $('ciWalk').onclick = () => addVolunteer(id, true);
}

// ---------- Printable sign-in sheet ----------
const CREDIT_CELL = '<td class="credit">☐ Trip credit<br>☐ Volunteer hours</td>';
let sheetOpts = { style: 'booster', split: false, blanks: 8, phone: true };
function viewSheet(id) {
  const ev = event(id);
  if (!ev) { missingEvent(); return; }
  const list = slotsFor(id).map(s => ({ s, p: person(s.personId) })).filter(x => x.p)
    .sort((a, b) => ((a.s.role || '') + sortName(a.p)).localeCompare((b.s.role || '') + sortName(b.p)));
  const table = (title, rows) => {
    let body = rows.map((x, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(fullName(x.p)) + '</b>' + (sheetOpts.split ? '' : ' <small>' + typeLabel(x.p.type) + '</small>') + '</td><td>' + esc([x.s.role, fmtRange(x.s.start, x.s.end)].filter(Boolean).join(', ')) + '</td>' +
      (sheetOpts.phone ? '<td>' + esc(fmtPhone(x.p.phone)) + '</td>' : '') + '<td></td><td></td>' + CREDIT_CELL + '<td></td></tr>').join('');
    for (let i = 0; i < sheetOpts.blanks; i++) body += '<tr class="blankrow"><td>' + (rows.length + i + 1) + '</td><td></td><td></td>' + (sheetOpts.phone ? '<td></td>' : '') + '<td></td><td></td>' + CREDIT_CELL + '<td></td></tr>';
    return '<section class="sheetpage"><div class="sheethead"><div><h1>' + esc(data.settings.org || 'Band Boosters') + ' Volunteer Sign-In' + (title ? ' – ' + title : '') + '</h1>' +
      '<p><b>' + esc(ev.name) + '</b> · ' + esc(fmtDate(ev.date, true)) + (ev.start ? ' · ' + esc(fmtRange(ev.start, ev.end)) : '') + (ev.location ? ' · ' + esc(ev.location) : '') + '</p></div></div>' +
      '<table class="signin"><thead><tr><th>#</th><th>Name</th><th>Job / time</th>' + (sheetOpts.phone ? '<th>Phone</th>' : '') + '<th>Time in</th><th>Time out</th><th>Trip credit or hours?</th><th>Signature</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<p class="sheetfoot">Thank you for supporting the band! Please sign in when you arrive and sign out when you leave.</p></section>';
  };
  // The Band Boosters' own layout (matches the Volunteer Sign In Sheet in Google Drive): adults, then students.
  const booster = () => {
    const adults = list.filter(x => x.p.type !== 'student'), kids = list.filter(x => x.p.type === 'student');
    const credit = 'Volunteer Hrs OR Name of Student you are volunteering for';
    const food = 'Food Item &amp; Drink Item';
    const rows = (xs, phone) => xs.map((x, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(fullName(x.p)) + '</b></td>' + (phone ? '<td class="ph">' + esc(fmtPhone(x.p.phone)) + '</td>' : '') + '<td></td><td></td></tr>').join('') +
      Array.from({ length: sheetOpts.blanks }, (_, i) => '<tr class="blankrow"><td>' + (xs.length + i + 1) + '</td><td></td>' + (phone ? '<td></td>' : '') + '<td></td><td></td></tr>').join('');
    const head = (label, phone) => '<thead><tr><th>#</th><th>Volunteer Name<br><span class="grp">' + label + '</span></th>' + (phone ? '<th>Cell number</th>' : '') + '<th>' + credit + '</th><th>' + food + '<br><span class="perk">You get 1 soda, unlimited volunteer water and 1 food item for free</span></th></tr></thead>';
    const showPhone = sheetOpts.phone;
    return '<section class="sheetpage booster"><div class="sheethead"><h1>' + esc(data.settings.org || 'Band Boosters') + ' – Volunteer Sign In Sheet</h1>' +
      '<p><b>' + esc(ev.name) + '</b> · ' + esc(fmtDate(ev.date, true)) + (ev.start ? ' · ' + esc(fmtRange(ev.start, ev.end)) : '') + (ev.location ? ' · ' + esc(ev.location) : '') + '</p></div>' +
      '<table class="signin boost">' + head('Adults', true && showPhone) + '<tbody>' + rows(adults, showPhone) + '</tbody></table>' +
      '<table class="signin boost">' + head('Students', false) + '<tbody>' + rows(kids, false) + '</tbody></table></section>';
  };
  const sheets = sheetOpts.style === 'booster' ? booster() : sheetOpts.split
    ? table('Adults', list.filter(x => x.p.type !== 'student')) + table('Students', list.filter(x => x.p.type === 'student'))
    : table('', list);
  $('view').innerHTML = '<div class="no-print"><a class="back" href="#event/' + id + '">‹ ' + esc(ev.name) + '</a>' +
    '<div class="sheet-opts"><label>Layout <select id="shStyle"><option value="booster"' + (sheetOpts.style === 'booster' ? ' selected' : '') + '>Band Boosters sheet (adults, then students)</option><option value="times"' + (sheetOpts.style === 'times' ? ' selected' : '') + '>Time in / time out sheet</option></select></label>' +
    (sheetOpts.style === 'booster' ? '' : '<label class="check"><input type="checkbox" id="shSplit"' + (sheetOpts.split ? ' checked' : '') + '> Separate adult and student sheets</label>') +
    '<label class="check"><input type="checkbox" id="shPhone"' + (sheetOpts.phone ? ' checked' : '') + '> Show cell numbers</label>' +
    '<label>Blank lines for walk-ins <input id="shBlank" type="number" min="0" max="40" value="' + sheetOpts.blanks + '"></label>' +
    '<button type="button" id="shPrint">🖨 Print</button></div><p class="helper">Blank lines are added to each table for walk-ins. On a phone, Print lets you AirPrint or save as PDF.</p></div>' + sheets;
  $('shStyle').onchange = e => { sheetOpts.style = e.target.value; viewSheet(id); };
  if ($('shSplit')) $('shSplit').onchange = e => { sheetOpts.split = e.target.checked; viewSheet(id); };
  $('shPhone').onchange = e => { sheetOpts.phone = e.target.checked; viewSheet(id); };
  $('shBlank').onchange = e => { sheetOpts.blanks = Math.max(0, Math.min(40, Number(e.target.value) || 0)); viewSheet(id); };
  $('shPrint').onclick = () => window.print();
}

// ---------- People ----------
let pplSearch = '', pplFilter = 'all';
function personStats(p) {
  const ss = data.slots.filter(s => s.personId === p.id);
  const sy = schoolYearStart();
  const thisYear = ss.filter(s => { const ev = event(s.eventId); return ev && ev.date >= sy; });
  return { events: ss.length, yearEvents: thisYear.length, hours: thisYear.reduce((t, s) => t + hoursOf(s), 0) };
}
function viewPeople() {
  const f = (k, label) => '<button type="button" class="seg' + (pplFilter === k ? ' on' : '') + '" data-f="' + k + '">' + label + '</button>';
  const noPhone = data.people.filter(p => !digits(p.phone)).length;
  $('view').innerHTML = '<h1>People</h1><p class="helper">' + data.people.length + ' volunteers. Phone numbers you add here are remembered for every event.</p>' +
    '<input id="pFind" type="search" placeholder="Search names or numbers" value="' + esc(pplSearch) + '">' +
    '<div class="segs">' + f('all', 'All') + f('adult', 'Adults') + f('student', 'Students') + (noPhone ? f('nophone', 'Need phone ' + noPhone) : '') + '</div>' +
    '<div id="pList"></div>' +
    '<div class="row-actions"><button type="button" id="pNew">+ Add person</button><button type="button" class="ghost" id="pVcf">📇 Save to phone contacts</button><button type="button" class="ghost" id="pHours">⏱ Hours report (CSV)</button></div>';
  function draw() {
    const q = pplSearch.toLowerCase(), qd = pplSearch.replace(/\D/g, '');
    const list = data.people.filter(p => pplFilter === 'all' || (pplFilter === 'student' ? p.type === 'student' : pplFilter === 'adult' ? p.type !== 'student' : !digits(p.phone)))
      .filter(p => !q || fullName(p).toLowerCase().includes(q) || (qd.length >= 3 && digits(p.phone).includes(qd)))
      .sort((a, b) => sortName(a).localeCompare(sortName(b)));
    $('pList').innerHTML = list.map(p => {
      const st = personStats(p);
      return '<div class="vol" data-p="' + p.id + '"><div class="who"><b>' + esc(fullName(p)) + '</b> <span class="chip ' + (p.type === 'student' ? 'student' : '') + '">' + typeLabel(p.type) + '</span>' +
        '<span class="sub">' + esc(digits(p.phone) ? fmtPhone(p.phone) : 'No phone yet') + (p.parent ? ' · ' + esc(p.parent) : '') + '</span>' +
        '<span class="sub">' + st.yearEvents + ' events this school year' + (st.hours ? ' · ' + fmtHours(st.hours) + ' hours' : '') + '</span></div>' +
        (digits(p.phone) ? '<div class="acts"><a class="icon" href="' + esc(smsHref([p.phone], '')) + '">💬</a><a class="icon" href="tel:' + e164(p.phone) + '">📞</a></div>' : '') + '</div>';
    }).join('') || '<p class="helper">No one yet. Import sign-ups to fill this in.</p>';
  }
  draw();
  $('pFind').oninput = e => { pplSearch = e.target.value; draw(); };
  document.querySelectorAll('.seg').forEach(b => b.onclick = () => { pplFilter = b.dataset.f; viewPeople(); });
  $('pList').onclick = e => { if (e.target.closest('a.icon')) return; const el = e.target.closest('[data-p]'); if (el) editPerson(el.dataset.p); };
  $('pNew').onclick = () => editPerson();
  $('pVcf').onclick = exportContacts;
  $('pHours').onclick = exportHours;
}

function editPerson(id) {
  const p = id ? person(id) : { first: '', last: '', phone: '', email: '', type: 'adult', parent: '', notes: '' };
  const hist = id ? data.slots.filter(s => s.personId === id).map(s => ({ s, ev: event(s.eventId) })).filter(x => x.ev).sort((a, b) => b.ev.date.localeCompare(a.ev.date)) : [];
  openModal('<h2>' + (id ? esc(fullName(p)) : 'Add person') + '</h2>' + personFields(p) +
    '<label>Notes<textarea id="pNotes" rows="2">' + esc(p.notes) + '</textarea></label>' +
    (hist.length ? '<h3>Volunteered</h3><ul class="hist">' + hist.map(x => '<li><a href="#event/' + x.ev.id + '">' + esc(fmtDate(x.ev.date)) + ' – ' + esc(x.ev.name) + '</a>' + (x.s.role ? ' · ' + esc(x.s.role) : '') + (hoursOf(x.s) ? ' · ' + fmtHours(hoursOf(x.s)) + ' h' : '') + '</li>').join('') + '</ul>' : '') +
    '<div class="row-actions"><button type="button" id="pSave">Save</button><button type="button" class="ghost" id="pCancel">Cancel</button>' + (id ? '<button type="button" class="danger" id="pDel">Delete</button>' : '') + '</div>');
  $('pCancel').onclick = closeModal;
  document.querySelectorAll('.hist a').forEach(a => a.addEventListener('click', closeModal));
  $('pSave').onclick = () => {
    readPerson(p); p.notes = $('pNotes').value.trim();
    if (!p.first && !p.last) { toast('Enter a name.'); return; }
    if (!id) { p.id = uid(); data.people.push(p); }
    window.save(); closeModal(); route();
  };
  if (id) $('pDel').onclick = () => {
    if (!confirm('Delete ' + fullName(p) + ' and remove them from ' + hist.length + ' events?')) return;
    data.people = data.people.filter(x => x.id !== id); data.slots = data.slots.filter(s => s.personId !== id);
    window.save(); closeModal(); route();
  };
}

function exportContacts() {
  const list = data.people.filter(p => digits(p.phone));
  if (!list.length) { toast('No phone numbers yet.'); return; }
  const v = s => String(s || '').replace(/([,;\\])/g, '\\$1');
  const cards = list.map(p => ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + v(p.last) + ';' + v(p.first) + ';;;', 'FN:' + v(fullName(p)), 'TEL;TYPE=CELL:' + e164(p.phone),
    p.email ? 'EMAIL:' + v(p.email) : '', 'ORG:' + v(data.settings.org || 'Band Boosters'), 'NOTE:Band volunteer (' + typeLabel(p.type) + ')' + (p.parent ? ' – ' + v(p.parent) : ''), 'END:VCARD'].filter(Boolean).join('\r\n'));
  download('band-volunteers.vcf', cards.join('\r\n'), 'text/vcard');
}
const csvCell = x => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x);
function exportHours() {
  const sy = schoolYearStart();
  const rows = [['Last name', 'First name', 'Adult/Student', 'Phone', 'Email', 'Events this school year', 'Hours this school year', 'Events (all time)']];
  data.people.slice().sort((a, b) => sortName(a).localeCompare(sortName(b))).forEach(p => {
    const st = personStats(p);
    rows.push([p.last, p.first, typeLabel(p.type), fmtPhone(p.phone), p.email || '', st.yearEvents, fmtHours(st.hours), st.events]);
  });
  download('volunteer-hours-' + sy.slice(0, 4) + '.csv', rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

// ---------- Import ----------
// Column names vary between SignUpGenius reports and BAND copies, so guess each field from its header.
const FIELDS = [
  ['first', 'First name', /first/],
  ['last', 'Last name', /last/],
  ['name', 'Full name', /^(name|full ?name|volunteer|member|student|participant|your name)$|volunteer name|member name|student name/],
  ['phone', 'Phone', /phone|mobile|cell/],
  ['email', 'Email', /e-?mail/],
  ['role', 'Job / slot', /^item$|slot|task|role|job|position|activity|shift|what/],
  ['date', 'Date', /date|day/],
  ['start', 'Start time', /start|^time$|from/],
  ['end', 'End time', /end|until|^to$/],
  ['event', 'Event / sign-up title', /sign ?-?up( name| title)?$|event|title/],
  ['location', 'Location', /location|where|place/],
  ['parent', 'Parent / student name', /parent|guardian|child|comment/]
];
let imp = null; // import in progress

function guessMap(headers) {
  const map = {}; const used = new Set();
  FIELDS.forEach(([k, , re]) => {
    const i = headers.findIndex((h, j) => !used.has(j) && re.test(String(h).toLowerCase().trim()));
    if (i >= 0) { map[k] = i; used.add(i); }
  });
  if (map.name != null && map.first != null && map.last != null) delete map.name;
  return map;
}
function findHeaderRow(rows) {
  let best = 0, bestScore = -1;
  rows.slice(0, 15).forEach((r, i) => {
    const score = r.filter(c => c && FIELDS.some(([, , re]) => re.test(String(c).toLowerCase().trim()))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return bestScore >= 2 ? best : -1;
}

function entriesFromTable() {
  const m = imp.map, val = (r, k) => m[k] != null ? String(r[m[k]] == null ? '' : r[m[k]]).trim() : '';
  return imp.rows.map(r => {
    let first = val(r, 'first'), last = val(r, 'last');
    if (!first && !last) ({ first, last } = splitName(val(r, 'name')));
    const dateRaw = val(r, 'date');
    return { include: true, first, last, phone: val(r, 'phone'), email: val(r, 'email'), role: val(r, 'role'), parent: val(r, 'parent'),
      date: parseDate(dateRaw), start: parseTime(val(r, 'start')) || (m.start == null ? parseTime(dateRaw) : ''), end: parseTime(val(r, 'end')),
      event: val(r, 'event'), location: val(r, 'location') };
  }).filter(e => e.first || e.last);
}

// BAND sign-ups usually get copied as plain lines. Lines like "Concessions (3/5)" or "Uniforms:" start a new job.
function entriesFromLines(text) {
  const out = []; let role = '';
  const phoneRe = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/, emailRe = /[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i;
  text.split(/\r?\n/).forEach(raw => {
    let line = raw.trim();
    if (!line) return;
    if (/:$/.test(line) || /\(\s*\d+\s*\/\s*\d+\s*\)/.test(line) || /^#+\s/.test(line)) { role = line.replace(/[:#]|\(\s*\d+\s*\/\s*\d+\s*\)/g, '').trim(); return; }
    const phone = (line.match(phoneRe) || [''])[0], email = (line.match(emailRe) || [''])[0];
    let name = line.replace(phone, '').replace(email, '').replace(/^\s*(\d+[.)]|[-•*✓✔☑])\s*/, '').replace(/\((student|adult|parent)\)/ig, '').replace(/[|,;–—-]+\s*$/, '').replace(/\s[|–—-]\s.*$/, '').trim();
    if (!/[a-z]/i.test(name) || name.split(/\s+/).length > 5) return;
    const { first, last } = splitName(name);
    out.push({ include: true, first, last, phone, email, role, parent: '', date: '', start: '', end: '', event: '', location: '' });
  });
  return out;
}

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xls|xlsm|ods|csv|txt|tsv)$/.test(name) || file.type.includes('sheet') || file.type.includes('csv')) {
    await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', raw: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    return { rows };
  }
  throw new Error('Choose the Excel or CSV file you downloaded (it ends in .xlsx or .csv).');
}
function loadXlsx() {
  return new Promise((ok, no) => {
    if (window.XLSX) return ok();
    const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the spreadsheet reader.'));
    document.head.appendChild(s);
  });
}

function startTable(rows, source) {
  rows = rows.filter(r => r.some(c => String(c).trim()));
  const h = findHeaderRow(rows);
  if (h < 0) { startEntries(entriesFromLines(rows.map(r => r.filter(Boolean).join(' ')).join('\n')), source); return; }
  imp = Object.assign(imp || {}, { mode: 'table', source, headers: rows[h].map(String), rows: rows.slice(h + 1) });
  imp.map = guessMap(imp.headers);
  imp.entries = entriesFromTable();
  drawImport();
}
function startEntries(entries, source) {
  imp = Object.assign(imp || {}, { mode: 'lines', source, entries });
  drawImport();
}

function viewImport(evId) {
  if (evId && !(imp && imp.target === evId)) imp = null;
  if (!imp) {
    const ev = evId && event(evId);
    $('view').innerHTML = '<a class="back" href="#more">‹ More</a><h1>Import a list</h1><p class="helper">For moving over sign-ups you already have. New sign-ups come in by themselves from your sign-up page.</p>' + (ev ? '<p class="helper">Into <b>' + esc(ev.name) + '</b> (' + esc(fmtDate(ev.date)) + ')</p>' : '') +
      '<div class="card pad"><h2>🟢 SignUpGenius <small>(adults)</small></h2>' +
      '<ol class="steps"><li>On a computer, open SignUpGenius → <b>Reports</b> (or <b>Sign Ups → Created → Run report</b>).</li><li>Choose the sign-up and the dates, then <b>Export → Excel</b> or <b>CSV</b>.</li><li>Upload that file here. Phone numbers come in if your sign-up asks for them.</li></ol>' +
      '<label class="button file">Choose SignUpGenius file<input type="file" id="fSug" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div>' +
      '<div class="card pad"><h2>🟣 BAND <small>(students)</small></h2>' +
      '<ol class="steps"><li>In the BAND app, open the sign-up post (or the member list).</li><li>Press and hold the list, choose <b>Copy</b>, and paste it below. One name per line works best; a line like <i>Concessions:</i> starts a new job.</li><li>Or upload a file if you have one.</li></ol>' +
      '<textarea id="bandText" rows="7" placeholder="Concessions:\nJane Doe\nSam Smith 501-555-0123\n\nWater crew:\nAlex Lee"></textarea>' +
      '<div class="row-actions"><button type="button" id="bandGo">Use pasted list</button><label class="button ghost file">Upload a file<input type="file" id="fBand" accept=".xlsx,.xls,.csv,.txt" hidden></label></div></div>' +
      '<div class="card pad"><h2>Another list</h2><p class="helper">Any spreadsheet with names (and phone numbers if you have them), like a student roster with parent cell numbers. People already here are matched, not duplicated.</p>' +
      '<label class="button ghost file">Upload a file<input type="file" id="fOther" accept=".xlsx,.xls,.csv,.txt" hidden></label></div>';
    const onFile = source => async e => {
      const file = e.target.files[0]; if (!file) return;
      try { imp = { target: evId || null }; const { rows } = await readFile(file); startTable(rows, source); }
      catch (err) { imp = null; toast(err.message); }
    };
    $('fSug').onchange = onFile('SignUpGenius');
    $('fBand').onchange = onFile('BAND');
    $('fOther').onchange = onFile('List');
    $('bandGo').onclick = () => {
      const t = $('bandText').value.trim(); if (!t) { toast('Paste the BAND list first.'); return; }
      imp = { target: evId || null };
      const lines = t.split(/\r?\n/);
      if (lines[0].includes('\t')) startTable(lines.map(l => l.split('\t')), 'BAND');
      else startEntries(entriesFromLines(t), 'BAND');
    };
    return;
  }
  drawImport();
}

function groupsOf(entries) {
  const g = new Map();
  entries.forEach(e => {
    const k = (e.date || '') + '|' + (e.event || '');
    if (!g.has(k)) g.set(k, { date: e.date, event: e.event, location: e.location, start: e.start, entries: [] });
    const grp = g.get(k); grp.entries.push(e);
    if (e.start && (!grp.start || e.start < grp.start)) grp.start = e.start;
  });
  return [...g.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function drawImport() {
  const defType = imp.type || (imp.source === 'BAND' ? 'student' : 'adult');
  imp.type = defType;
  const groups = groupsOf(imp.entries);
  imp.groups = groups;
  const evOpts = (grp) => {
    const near = data.events.slice().sort((a, b) => (grp.date ? Math.abs(new Date(a.date) - new Date(grp.date)) - Math.abs(new Date(b.date) - new Date(grp.date)) : b.date.localeCompare(a.date)));
    const match = imp.target || (grp.date && (data.events.find(e => e.date === grp.date && grp.event && e.name.toLowerCase() === grp.event.toLowerCase()) || data.events.find(e => e.date === grp.date) || {}).id) || '';
    // A phone list with no dates (from Import → Another list) goes to People only unless an event is picked.
    grp.choice = grp.choice != null ? grp.choice : (match || (imp.source === 'List' && !grp.date ? NO_EVENT : ''));
    return '<option value="' + NO_EVENT + '"' + (grp.choice === NO_EVENT ? ' selected' : '') + '>📇 People list only (no event)</option><option value=""' + (grp.choice === '' ? ' selected' : '') + '>➕ New event</option>' + near.map(e => '<option value="' + e.id + '"' + (grp.choice === e.id ? ' selected' : '') + '>' + esc(fmtDate(e.date) + ' – ' + e.name) + '</option>').join('');
  };
  const mapUI = imp.mode === 'table' ? '<details class="card pad"' + (imp.map.first == null && imp.map.name == null ? ' open' : '') + '><summary>Columns found in the file (tap to fix)</summary><div class="grid2">' +
    FIELDS.map(([k, label]) => '<label>' + label + '<select data-map="' + k + '"><option value="">—</option>' + imp.headers.map((h, i) => '<option value="' + i + '"' + (imp.map[k] === i ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>').join('') + '</select></label>').join('') +
    '</div></details>' : '';
  const n = imp.entries.filter(e => e.include).length;
  $('view').innerHTML = '<h1>Check the import</h1><p class="helper">From ' + esc(imp.source) + ' · ' + imp.entries.length + ' names found</p>' + mapUI +
    '<label>These volunteers are<select id="iType"><option value="adult"' + (defType === 'adult' ? ' selected' : '') + '>Adults</option><option value="student"' + (defType === 'student' ? ' selected' : '') + '>Students</option></select></label>' +
    groups.map((g, gi) => '<div class="card pad"><h3>' + (g.date ? esc(fmtDate(g.date, true)) : 'No date in the list') + (g.event ? ' · ' + esc(g.event) : '') + ' <small>(' + g.entries.length + ')</small></h3>' +
      '<label>Put these in<select data-group="' + gi + '">' + evOpts(g) + '</select></label>' +
      '<div class="newev" data-newev="' + gi + '"' + (g.choice !== '' ? ' hidden' : '') + '><div class="grid2"><label>Event name<input data-nname="' + gi + '" list="evIdeas2" value="' + esc(g.newName != null ? g.newName : (g.event || '')) + '" placeholder="Football game concessions"></label>' +
      '<label>Date<input type="date" data-ndate="' + gi + '" value="' + esc(g.newDate || g.date || '') + '"></label></div></div>' +
      '<div class="pick">' + g.entries.map(e => { const i = imp.entries.indexOf(e); return '<label class="check"><input type="checkbox" data-inc="' + i + '"' + (e.include ? ' checked' : '') + '> ' + esc((e.first + ' ' + e.last).trim()) +
        ' <span class="sub">' + esc([e.role, fmtRange(e.start, e.end), e.phone ? fmtPhone(e.phone) : '', findPerson(e) ? 'already in People' : ''].filter(Boolean).join(' · ')) + '</span></label>'; }).join('') + '</div></div>').join('') +
    '<datalist id="evIdeas2">' + EVENT_IDEAS.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<div class="row-actions"><button type="button" id="iGo">Add ' + n + ' volunteers</button><button type="button" class="ghost" id="iCancel">Start over</button></div>';
  document.querySelectorAll('[data-map]').forEach(s => s.onchange = () => {
    if (s.value === '') delete imp.map[s.dataset.map]; else imp.map[s.dataset.map] = Number(s.value);
    imp.entries = entriesFromTable(); drawImport();
  });
  $('iType').onchange = e => { imp.type = e.target.value; };
  document.querySelectorAll('[data-group]').forEach(s => s.onchange = () => { const g = groups[Number(s.dataset.group)]; g.choice = s.value; document.querySelector('[data-newev="' + s.dataset.group + '"]').hidden = s.value !== ''; });
  document.querySelectorAll('[data-nname]').forEach(i => i.oninput = () => { groups[Number(i.dataset.nname)].newName = i.value; });
  document.querySelectorAll('[data-ndate]').forEach(i => i.oninput = () => { groups[Number(i.dataset.ndate)].newDate = i.value; });
  document.querySelectorAll('[data-inc]').forEach(c => c.onchange = () => { imp.entries[Number(c.dataset.inc)].include = c.checked; $('iGo').textContent = 'Add ' + imp.entries.filter(e => e.include).length + ' volunteers'; });
  $('iCancel').onclick = () => { const t = imp.target; imp = null; viewImport(t); };
  $('iGo').onclick = runImport;
}

const NO_EVENT = 'people-only';
function runImport() {
  const groups = imp.groups;
  for (const g of groups) {
    if (!g.choice && g.entries.some(e => e.include)) {
      const name = (g.newName != null ? g.newName : g.event || '').trim(), date = g.newDate || g.date;
      if (!name || !date) { toast('Give each new event a name and date.'); return; }
    }
  }
  let added = 0, already = 0, newPeople = 0, phones = 0, lastEv = null;
  groups.forEach(g => {
    const inc = g.entries.filter(e => e.include); if (!inc.length) return;
    if (g.choice === NO_EVENT) {
      inc.forEach(e => {
        const before = findPerson(e), had = before && digits(before.phone);
        const { isNew } = upsertPerson(Object.assign({}, e, { type: imp.type }));
        if (isNew) newPeople++; else if (!had && digits(e.phone)) phones++;
      });
      return;
    }
    let ev = g.choice && event(g.choice);
    if (!ev) {
      ev = { id: uid(), name: (g.newName != null ? g.newName : g.event).trim(), date: g.newDate || g.date, start: g.start || '', end: '', location: g.location || '', notes: '', isPublic: true };
      data.events.push(ev);
    }
    lastEv = ev;
    inc.forEach(e => {
      const { person: p, isNew } = upsertPerson(Object.assign({}, e, { type: imp.type }));
      if (isNew) newPeople++;
      const job = jobFor(ev.id, e.role, true);
      const dup = data.slots.find(s => s.eventId === ev.id && s.personId === p.id && s.jobId === job.id);
      if (dup) { already++; if (!dup.start && e.start) { dup.start = e.start; dup.end = e.end; } return; }
      if (job.need < filledOf(job.id) + 1) job.need = filledOf(job.id) + 1;
      data.slots.push({ id: uid(), eventId: ev.id, jobId: job.id, personId: p.id, role: job.role, start: e.start, end: e.end, source: imp.source, inAt: null, outAt: null });
      added++;
    });
  });
  window.save();
  const usedGroups = groups.filter(g => g.entries.some(e => e.include)).length;
  imp = null;
  if (!lastEv) toast('People list updated: ' + newPeople + ' new people, ' + phones + ' phone numbers added.');
  else toast('Added ' + added + ' sign-ups' + (newPeople ? ', ' + newPeople + ' new people' : '') + (phones ? ', ' + phones + ' phone numbers' : '') + (already ? '. ' + already + ' were already there.' : '.'));
  location.hash = usedGroups === 1 && lastEv ? 'event/' + lastEv.id : !lastEv ? 'people' : 'events';
}

// ---------- Update from SignUpGenius ----------
// Volunteers keep signing up on SignUpGenius. Copying the sign-up page (select all, copy) and pasting
// it here brings in new sign-ups and phone numbers, updates spot counts, and flags cancellations.
const DAYS = /^(mon|tues|wednes|thurs|fri|satur|sun)day$/i;
const SLOTS = /^(\d+)\s+of\s+(\d+)\s+slots?\s+filled/i;
const PHONE_LINE = /^\+?[\d\s().-]{10,}$/;
function parseSug(text) {
  const lines = text.replace(/\t/g, '\n').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const events = []; let ev = null, job = null, stage = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], next = lines[i + 1] || '';
    if (/^©|want no ads|^view plans|^dates (are )?shown|^date$|^location$|^available slot$/i.test(l)) continue;
    const dm = l.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) { ev = { date: dm[3] + '-' + pad(dm[1]) + '-' + pad(dm[2]), start: '', end: '', name: '', location: '', jobs: [] }; events.push(ev); job = null; stage = 'time';
      const rest = l.slice(dm[0].length).trim(); if (rest) lines.splice(i + 1, 0, rest); continue; }
    if (!ev) continue;
    if (SLOTS.test(next)) { const m = next.match(SLOTS); job = { role: l.replace(/\s+volunteers?$/i, '').trim() || 'Volunteer', need: Number(m[2]), filled: Number(m[1]), people: [] }; ev.jobs.push(job); i++; stage = 'people'; continue; }
    if (stage === 'time') {
      const times = l.match(/\d{1,2}(:\d{2})?\s*[ap]\.?m/gi);
      if (times) { times.forEach(t => { if (!ev.start) ev.start = parseTime(t); else if (!ev.end) ev.end = parseTime(t); }); continue; }
      if (DAYS.test(l)) continue;
      const at = l.split(/\s+@\s*/);
      ev.name = at[0].trim(); ev.location = (at[1] || '').trim(); stage = 'title'; continue;
    }
    if (stage === 'people' && job) {
      if (PHONE_LINE.test(l) && digits(l)) { const p = job.people[job.people.length - 1]; if (p && !p.phone) p.phone = digits(l); continue; }
      if (/^[A-Z]{1,3}$/.test(l)) continue;
      if (/^(sign ?up|swap|cancel|edit|comment)/i.test(l)) continue;
      const truncated = /(\.\.\.|…)$/.test(l);
      const { first, last } = splitName(l.replace(/(\.\.\.|…)$/, '').trim());
      job.people.push({ first, last, phone: '', truncated });
    }
  }
  return events.filter(e => e.date);
}
// SignUpGenius cuts long names short ("Samantha Mitche..."), so match on phone, then on the start of the name.
function findSugPerson(x) {
  const d = digits(x.phone);
  if (d) { const hit = data.people.find(p => digits(p.phone) === d); if (hit) return hit; }
  const f = x.first.toLowerCase(), l = x.last.toLowerCase();
  return data.people.find(p => (p.first || '').toLowerCase() === f && (x.truncated ? (p.last || '').toLowerCase().startsWith(l) : (p.last || '').toLowerCase() === l)) || null;
}
let sugPlan = null;
function planSug(parsed) {
  return parsed.map(pe => {
    const sameDay = data.events.filter(e => e.date === pe.date);
    const ev = sameDay.find(e => e.name.toLowerCase() === pe.name.toLowerCase()) || (sameDay.length === 1 ? sameDay[0] : null);
    const jobs = pe.jobs.map(pj => {
      const job = ev && jobFor(ev.id, pj.role, false);
      const listed = pj.people.map(x => {
        const p = findSugPerson(x);
        const slot = p && job && data.slots.find(s => s.jobId === job.id && s.personId === p.id);
        return { x, p, slot, phoneNew: !!(p && x.phone && digits(p.phone) !== x.phone) };
      });
      const keep = new Set(listed.filter(r => r.slot).map(r => r.slot.id));
      const gone = job ? data.slots.filter(s => s.jobId === job.id && s.source === 'SignUpGenius' && !keep.has(s.id)).map(s => ({ s, p: person(s.personId), remove: !s.inAt })) : [];
      return { pj, job, listed, gone };
    });
    return { pe, ev, jobs };
  });
}
function viewSug() {
  if (!sugPlan) {
    $('view').innerHTML = '<a class="back" href="#events">‹ Events</a><h1>Update from SignUpGenius</h1>' +
      '<ol class="steps"><li>Open your sign-up on SignUpGenius (on your phone or computer).</li>' +
      '<li>Select everything on the page: on a computer press <b>Ctrl+A</b> (or ⌘A), on a phone press and hold, then <b>Select All</b>.</li>' +
      '<li>Copy, then paste it below.</li></ol>' +
      '<textarea id="sugText" rows="9" placeholder="10/08/2026&#10;4:15pm-&#10;9:30pm&#10;Thursday&#10;RJHS vs. Beebe @Cyclone Stadium Concession Stand&#10;Concession Stand Volunteer&#10;3 of 16 slots filled&#10;…"></textarea>' +
      '<div class="row-actions"><button type="button" id="sugGo">Check what changed</button></div>' +
      '<p class="helper">New sign-ups and phone numbers are added, spot counts are updated, and you choose whether to remove anyone who is no longer on SignUpGenius.</p>';
    $('sugGo').onclick = () => {
      const parsed = parseSug($('sugText').value);
      if (!parsed.length) { toast('No sign-ups found. Copy the whole SignUpGenius page, including the dates.'); return; }
      sugPlan = planSug(parsed); viewSug();
    };
    return;
  }
  let adds = 0, phones = 0, gone = 0, newEvents = 0;
  const body = sugPlan.map((pl, ei) => {
    if (!pl.ev) newEvents++;
    return '<div class="card pad"><h3>' + esc(fmtDate(pl.pe.date)) + ' · ' + esc(pl.ev ? pl.ev.name : pl.pe.name) + (pl.ev ? '' : ' <span class="chip gold">new event</span>') + '</h3>' +
      pl.jobs.map((pj, ji) => {
        const rows = pj.listed.map(r => {
          if (!r.slot) adds++; if (r.phoneNew) phones++;
          const nm = r.p ? fullName(r.p) : (r.x.first + ' ' + r.x.last).trim() + (r.x.truncated ? '…' : '');
          const tag = !r.slot ? '<span class="chip gold">new sign-up</span>' : r.phoneNew ? '<span class="chip">new phone</span>' : '<span class="sub">already here</span>';
          return '<div class="sugrow">' + esc(nm) + (r.x.phone ? ' <span class="sub">' + esc(fmtPhone(r.x.phone)) + '</span>' : '') + ' ' + tag + '</div>';
        }).join('');
        const goneRows = pj.gone.map((g, gi) => { if (g.remove) gone++; return '<label class="check"><input type="checkbox" data-gone="' + ei + '.' + ji + '.' + gi + '"' + (g.remove ? ' checked' : '') + '> Remove ' + esc(fullName(g.p)) + ' <span class="sub">(no longer on SignUpGenius' + (g.s.inAt ? ', already checked in' : '') + ')</span></label>'; }).join('');
        const needChange = pj.job && pj.job.need !== pj.pj.need ? ' <span class="chip">needs ' + pj.job.need + ' → ' + pj.pj.need + '</span>' : '';
        return '<p><b>' + esc(pj.pj.role) + '</b> · ' + pj.pj.filled + ' of ' + pj.pj.need + needChange + '</p>' + rows + goneRows;
      }).join('') + '</div>';
  }).join('');
  $('view').innerHTML = '<a class="back" href="#events">‹ Events</a><h1>What changed</h1>' +
    '<p class="helper" id="sugSum"></p>' + body +
    '<div class="row-actions"><button type="button" id="sugApply">Update my list</button><button type="button" class="ghost" id="sugBack">Start over</button></div>';
  $('sugSum').textContent = [adds + ' new sign-ups', phones + ' new phone numbers', gone + ' to remove', newEvents ? newEvents + ' new events' : ''].filter(Boolean).join(' · ');
  document.querySelectorAll('[data-gone]').forEach(c => c.onchange = () => { const [a, b, g] = c.dataset.gone.split('.').map(Number); sugPlan[a].jobs[b].gone[g].remove = c.checked; });
  $('sugBack').onclick = () => { sugPlan = null; viewSug(); };
  $('sugApply').onclick = applySug;
}
function applySug() {
  let added = 0, removed = 0;
  sugPlan.forEach(pl => {
    let ev = pl.ev;
    if (!ev) { ev = { id: uid(), name: pl.pe.name || 'Band event', date: pl.pe.date, start: pl.pe.start, end: pl.pe.end, location: pl.pe.location, notes: '', isPublic: true }; data.events.push(ev); }
    pl.jobs.forEach(pj => {
      const job = pj.job || jobFor(ev.id, pj.pj.role, true);
      job.need = Math.max(pj.pj.need, filledOf(job.id));
      pj.listed.forEach(r => {
        let p = r.p;
        if (!p) { p = { id: uid(), first: r.x.first, last: r.x.last, phone: r.x.phone, email: '', type: 'adult', parent: '', notes: '' }; data.people.push(p); }
        else if (r.x.phone) p.phone = r.x.phone;
        if (!data.slots.some(s => s.jobId === job.id && s.personId === p.id)) {
          data.slots.push({ id: uid(), eventId: ev.id, jobId: job.id, personId: p.id, role: job.role, start: '', end: '', source: 'SignUpGenius', inAt: null, outAt: null }); added++;
        }
      });
      const drop = new Set(pj.gone.filter(g => g.remove).map(g => g.s.id));
      removed += drop.size;
      data.slots = data.slots.filter(s => !drop.has(s.id));
    });
  });
  window.save();
  sugPlan = null;
  toast('Updated: ' + added + ' added, ' + removed + ' removed.');
  location.hash = 'events';
}

// ---------- Share link and QR code ----------
function loadQr() {
  return new Promise((ok, no) => {
    if (window.qrcode) return ok();
    const s = document.createElement('script'); s.src = 'vendor/qrcode.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the QR maker.'));
    document.head.appendChild(s);
  });
}
function makeQr(text) { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr; }
function qrPng(qr, px) {
  const n = qr.getModuleCount(), margin = 4, cell = Math.max(1, Math.floor(px / (n + margin * 2)));
  const c = document.createElement('canvas'); c.width = c.height = cell * (n + margin * 2);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + margin) * cell, (r + margin) * cell, cell, cell);
  return c;
}
function shareText(ev) {
  const org = data.settings.org || 'the band';
  return ev
    ? 'We need volunteers for ' + ev.name + ' on ' + fmtDate(ev.date, true) + (ev.start ? ' at ' + fmtTime(ev.start) : '') + '! Adults and students can sign up here: ' + signupUrl(ev.id)
    : 'Help ' + org + '! Parents, adults, and students can sign up to volunteer here: ' + signupUrl();
}
async function viewShare(evId) {
  const ev = evId && event(evId);
  const url = signupUrl(ev && ev.id);
  const upcoming = data.events.filter(e => e.date >= today() && e.isPublic !== false).sort((a, b) => a.date.localeCompare(b.date));
  $('view').innerHTML = '<div class="no-print">' + (ev ? '<a class="back" href="#event/' + ev.id + '">‹ ' + esc(ev.name) + '</a>' : '') +
    '<h1>Share your sign-up link</h1>' + (data.settings.signupLink ? '<p class="helper">This shares your SignUpGenius link. Change it under More → Sign-up page.</p>' : '') +
    (signedIn() ? '' : '<p class="chip warn">Sign in (More → Account) so new events and jobs show on the page.</p>') +
    '<label>Link for<select id="shWhich"><option value="">The whole season (all upcoming events)</option>' + upcoming.map(e => '<option value="' + e.id + '"' + (ev && ev.id === e.id ? ' selected' : '') + '>' + esc(fmtDate(e.date) + ' – ' + e.name) + '</option>').join('') + '</select></label>' +
    '<div class="linkbox"><input id="shUrl" readonly value="' + esc(url) + '"></div>' +
    '<div class="share-grid">' +
    '<button type="button" id="shShare">📤<span>Share…</span></button>' +
    '<button type="button" id="shCopy">🔗<span>Copy link</span></button>' +
    '<button type="button" id="shBand">🟢<span>Post to BAND</span></button>' +
    '<button type="button" id="shFb">📘<span>Post to Facebook</span></button>' +
    '<button type="button" id="shText">💬<span>Text the link</span></button>' +
    '<button type="button" id="shPng">⬇<span>Save QR picture</span></button>' +
    '<button type="button" id="shPrint">🖨<span>Print QR flyer</span></button></div>' +
    '<p class="helper"><b>Post to BAND</b> and <b>Post to Facebook</b> copy the message below and open your BAND or Facebook group. Start a new post and paste.</p>' +
    '<label>Message to go with the link<textarea id="shMsg" rows="3">' + esc(shareText(ev)) + '</textarea></label></div>' +
    '<section class="flyer"><h1>' + esc(data.settings.org || 'Band Boosters') + '</h1><h2>' + (ev ? esc(ev.name) : 'Volunteers Needed!') + '</h2>' +
    (ev ? '<p class="big">' + esc(fmtDate(ev.date, true)) + (ev.start ? ' · ' + esc(fmtRange(ev.start, ev.end)) : '') + '</p>' : '<p class="big">Parents, adults, and students</p>') +
    '<div id="shQr" class="qr"></div><p class="scan">Scan with your phone camera to sign up</p><p class="url">' + esc(url) + '</p>' +
    (!ev && upcoming.length ? '<ul class="flyer-events">' + upcoming.slice(0, 8).map(e => '<li><b>' + esc(fmtDate(e.date)) + '</b> ' + esc(e.name) + '</li>').join('') + '</ul>' : '') +
    '<p class="thanks">Thank you for supporting our band!</p></section>';
  $('shWhich').onchange = e => { location.hash = 'share' + (e.target.value ? '/' + e.target.value : ''); };
  $('shCopy').onclick = () => copy(url, 'Link');
  $('shShare').onclick = () => {
    if (navigator.share) navigator.share({ title: data.settings.title || 'Volunteer sign-up', text: $('shMsg').value.replace(url, '').trim(), url }).catch(() => {});
    else copy($('shMsg').value, 'Message and link');
  };
  // Copy first (while the tap still counts as the person's action), then open the group to paste into.
  const copyAndOpen = async (where, fallback) => {
    try { await navigator.clipboard.writeText($('shMsg').value); toast('Message copied. Start a post and paste it.'); } catch (e) {}
    window.open(where || fallback, '_blank', 'noopener');
  };
  $('shFb').onclick = () => copyAndOpen(data.settings.facebook, 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url));
  $('shBand').onclick = () => copyAndOpen(data.settings.band, 'https://www.band.us/');
  $('shText').onclick = () => { location.href = 'sms:' + (isIOS() ? '&' : '?') + 'body=' + encodeURIComponent($('shMsg').value); };
  $('shPrint').onclick = () => window.print();
  try {
    await loadQr();
    const qr = makeQr(url);
    $('shQr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true, alt: 'QR code for ' + url });
    $('shPng').onclick = () => qrPng(qr, 1200).toBlob(b => {
      const name = 'signup-qr' + (ev ? '-' + ev.date : '') + '.png';
      const file = new File([b], name, { type: 'image/png' });
      if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    });
  } catch (e) { $('shQr').textContent = e.message; }
}

// ---------- More ----------
function viewMore() {
  $('view').innerHTML = '<h1>More</h1>' +
    '<div class="card pad"><h2>Your info</h2><div class="grid2"><label>Group name<input id="mOrg" value="' + esc(data.settings.org) + '"></label>' +
    '<label>Sign texts as<input id="mFrom" value="' + esc(data.settings.from) + '" placeholder="Shaana, Volunteer Coordinator"></label></div></div>' +
    '<div class="card pad"><h2>Text messages</h2><p class="helper">Fill-ins: {first} {name} {event} {date} {time} {arrive} {when} (tomorrow night) {day} (tomorrow) {stillneed} {open} {job} {location} {from} {link}</p><div id="mTpls"></div><button type="button" class="ghost" id="mAddTpl">+ Add a message</button></div>' +
    '<div class="card pad"><h2>Sign-up page</h2><label>Page title<input id="mTitle" value="' + esc(data.settings.title || '') + '" placeholder="Band Booster & Parent Volunteer Opportunities"></label>' +
    '<label>Where volunteers sign up<select id="mWhere"><option value="">My own sign-up page</option><option value="sug"' + (data.settings.signupLink ? ' selected' : '') + '>SignUpGenius</option></select></label>' +
    '<label' + (data.settings.signupLink ? '' : ' hidden') + ' id="mSugWrap">SignUpGenius sign-up link (open your sign-up, tap Share, copy the link)<input id="mSug" type="url" value="' + esc(data.settings.signupLink || '') + '" placeholder="https://www.signupgenius.com/go/…"></label>' +
    '<h3>Your links</h3><p class="helper">Shortcuts at the top of Events. Only you see these.</p>' +
    '<label>Google Drive<input id="mDrive" type="url" value="' + esc(data.settings.drive || '') + '" placeholder="https://drive.google.com/…"></label>' +
    '<label>BAND<input id="mBand" type="url" value="' + esc(data.settings.band || '') + '" placeholder="https://www.band.us/band/…"></label>' +
    '<label>Facebook group link<input id="mFb" type="url" value="' + esc(data.settings.facebook || '') + '" placeholder="https://www.facebook.com/groups/…"></label>' +
    '<label>Welcome note<textarea id="mIntro" rows="2" placeholder="Thank you for supporting the band!">' + esc(data.settings.intro || '') + '</textarea></label>' +
    '<div class="row-actions"><a class="button ghost" href="#share">📣 Share link and QR code</a><a class="button ghost" href="' + esc(signupUrl()) + '" target="_blank" rel="noopener">See the page</a></div></div>' +
    '<div class="card pad"><h2>Account and sync</h2><div data-syncbox></div></div>' +
    '<div class="card pad"><h2>Import a list</h2><p class="helper">Move over sign-ups you already have in SignUpGenius, BAND, or a spreadsheet.</p><a class="button ghost" href="#import">⬆ Import</a></div>' +
    '<div class="card pad"><h2>Back up</h2><p class="helper">Your list saves on this device (and in the cloud when signed in). Download a backup now and then.</p>' +
    '<div class="row-actions"><button type="button" class="ghost" id="mBackup">Download backup</button><label class="button ghost file">Restore a backup<input type="file" id="mRestore" accept=".json" hidden></label></div></div>' +
    '<div class="card pad"><h2>How it fits together</h2><ul class="steps"><li><b>Add events</b> with the jobs you need filled, then <b>share your sign-up link or QR code</b> on BAND, Facebook, email, or a printed flyer. Adults and students sign up in the same place and give a cell number.</li>' +
    '<li><b>Text volunteers</b> from the event: one at a time with their name filled in, or as a group text. You don\'t have to save anyone to your contacts.</li>' +
    '<li><b>Sign-in sheet</b> prints with names already filled in, plus blank lines for walk-ins. Or use <b>Check in</b> on your phone and the hours are tracked for you.</li>' +
    '<li><b>People</b> remembers phone numbers, so a student you add a number for once is ready next time.</li></ul></div>';
  const drawTpls = () => {
    $('mTpls').innerHTML = data.templates.map((t, i) => '<div class="tpl"><input data-tn="' + i + '" value="' + esc(t.name) + '"><textarea rows="3" data-tt="' + i + '">' + esc(t.text) + '</textarea><button type="button" class="linkish" data-td="' + i + '">Delete</button></div>').join('');
    $('mTpls').querySelectorAll('[data-tn]').forEach(x => x.onchange = () => { data.templates[x.dataset.tn].name = x.value; window.save(); });
    $('mTpls').querySelectorAll('[data-tt]').forEach(x => x.onchange = () => { data.templates[x.dataset.tt].text = x.value; window.save(); });
    $('mTpls').querySelectorAll('[data-td]').forEach(x => x.onclick = () => { data.templates.splice(Number(x.dataset.td), 1); window.save(); drawTpls(); });
  };
  drawTpls();
  $('mAddTpl').onclick = () => { data.templates.push({ id: uid(), name: 'New message', text: 'Hi {first}! ' }); window.save(); drawTpls(); };
  $('mOrg').onchange = e => { data.settings.org = e.target.value.trim(); window.save(); };
  $('mFrom').onchange = e => { data.settings.from = e.target.value.trim(); window.save(); };
  $('mTitle').onchange = e => { data.settings.title = e.target.value.trim(); window.save(); };
  $('mFb').onchange = e => { data.settings.facebook = e.target.value.trim(); window.save(); };
  $('mDrive').onchange = e => { data.settings.drive = e.target.value.trim(); window.save(); };
  $('mBand').onchange = e => { data.settings.band = e.target.value.trim(); window.save(); };
  $('mWhere').onchange = e => { $('mSugWrap').hidden = !e.target.value; if (!e.target.value) { data.settings.signupLink = ''; $('mSug').value = ''; window.save(); } };
  $('mSug').onchange = e => {
    const v = e.target.value.trim();
    if (v && !/^https?:\/\//.test(v)) { toast('Paste the whole link, starting with https://'); return; }
    data.settings.signupLink = v; window.save(); toast(v ? 'Your Share screen and QR code now point to SignUpGenius.' : 'Using your own sign-up page.');
  };
  $('mIntro').onchange = e => { data.settings.intro = e.target.value.trim(); window.save(); };
  $('mBackup').onclick = () => download('band-volunteers-backup-' + today() + '.json', JSON.stringify(data, null, 1), 'application/json');
  $('mRestore').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.people || !d.events) throw new Error('That isn\'t a Band Volunteers backup.');
      if (!confirm('Replace everything on this device with the backup (' + d.people.length + ' people, ' + d.events.length + ' events)?')) return;
      Object.keys(data).forEach(k => delete data[k]); Object.assign(data, blank(), d); window.save(); toast('Backup restored.'); route();
    } catch (err) { toast(err.message); }
  };
  if (window.volSync) window.volSync.renderBox();
}

route();
