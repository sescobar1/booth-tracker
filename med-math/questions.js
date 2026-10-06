// Med Math for Nurses: lessons and practice tests, one entry per chapter of the book.
// Most questions are generated with new numbers each time, so a student can retake a test
// and get fresh practice. Conceptual chapters (9–12) draw from a bank of multiple-choice items.
(function () {
  // ---------- helpers ----------
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rnd = (x, p = 0) => { const f = Math.pow(10, p); return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f; };
  const fmt = x => { const v = rnd(x, 4); return Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(v); };
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const red = (n, d) => { const g = gcd(n, d); return [n / g, d / g]; };
  const fs = (n, d) => { [n, d] = red(n, d); if (d === 1) return String(n); if (n > d) { const w = Math.floor(n / d); return w + ' ' + (n - w * d) + '/' + d; } return n + '/' + d; };
  const ROUND = { 0: 'Round to the nearest whole number.', 1: 'Round to the nearest tenth.', 2: 'Round to the nearest hundredth.' };

  // Question builders. tol is how far off an answer may be and still count (for rounding differences).
  const num = (q, ans, o = {}) => ({ type: 'num', q: q + (o.places != null && !o.noRound ? ' <span class="rnd">' + ROUND[o.places] + '</span>' : ''), answer: o.places != null ? rnd(ans, o.places) : rnd(ans, 4), tol: o.tol || 0, unit: o.unit || '', explain: o.explain || '' });
  const frac = (q, n, d, explain, improper) => { const [a, b] = red(n, d); return { type: 'frac', q: q + ' <span class="rnd">Write it in lowest terms (for example 3/4 or 1 1/2).</span>', answer: improper && b !== 1 ? a + '/' + b : fs(a, b), n: a, d: b, explain }; };
  const mc = (q, right, wrong, explain) => { const choices = shuffle([right].concat([...new Set(wrong.map(String))].filter(w => w !== String(right)))); return { type: 'mc', q, choices, answer: right, explain: explain || '' }; };
  const bankItem = it => () => mc(it.q, it.a, it.w, it.e);

  // ---------- Unit 1: Math review ----------
  const fractions = [
    () => { const d = pick([4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]), k = pick([2, 3, 4, 5]); let n = R(1, d - 1); while (gcd(n, d) === 1) n = R(1, d - 1); return frac(`Reduce ${n * k}/${d * k} to lowest terms.`, n, d, `Divide the top and bottom by their greatest common factor: ${n * k}/${d * k} = ${fs(n, d)}.`); },
    () => { const d = pick([2, 3, 4, 5, 6, 8]), w = R(1, 4), r = R(1, d - 1), n = w * d + r; return frac(`Change ${n}/${d} to a mixed number.`, n, d, `${n} ÷ ${d} = ${w} remainder ${r}, so ${n}/${d} = ${fs(n, d)}.`); },
    () => { const d = pick([3, 4, 5, 8]), w = R(1, 5), r = R(1, d - 1); return frac(`Change ${w} ${fs(r, d)} to an improper fraction.`, w * d + r, d, `(${w} × ${d}) + ${r} = ${w * d + r}, so the answer is ${fs(w * d + r, d).includes(' ') ? red(w * d + r, d).join('/') : fs(w * d + r, d)}.`, true); },
    () => { const a = pick([2, 3, 4, 5, 6, 8]), b = pick([2, 3, 4, 5, 6, 8].filter(x => x !== a)), x = R(1, a - 1), y = R(1, b - 1); return frac(`Add: ${fs(x, a)} + ${fs(y, b)}`, x * b + y * a, a * b, `Use a common denominator of ${a * b / gcd(a, b)}: the sum is ${fs(x * b + y * a, a * b)}.`); },
    () => { let a, b, x, y; do { a = pick([2, 3, 4, 6, 8]); b = pick([3, 4, 5, 6, 8, 12].filter(v => v !== a)); x = R(1, a - 1); y = R(1, b - 1); } while (x / a <= y / b); return frac(`Subtract: ${fs(x, a)} − ${fs(y, b)}`, x * b - y * a, a * b, `Find a common denominator, then subtract the numerators: ${fs(x * b - y * a, a * b)}.`); },
    () => { const a = pick([2, 3, 4, 5, 8]), b = pick([2, 3, 4, 5, 6, 10]), x = R(1, a - 1), y = R(1, b - 1); return frac(`Multiply: ${fs(x, a)} × ${fs(y, b)}`, x * y, a * b, `Multiply across: (${x} × ${y}) / (${a} × ${b}) = ${fs(x * y, a * b)}.`); },
    () => { const a = pick([2, 3, 4, 5, 8]), b = pick([2, 3, 4, 6]), x = R(1, a - 1), y = R(1, b - 1); return frac(`Divide: ${fs(x, a)} ÷ ${fs(y, b)}`, x * b, a * y, `Invert the second fraction and multiply: ${fs(x, a)} × ${b}/${y} = ${fs(x * b, a * y)}.`); },
    () => { const s = shuffle([[1, 2], [1, 3], [2, 3], [3, 4], [1, 4], [3, 8], [5, 8], [1, 6], [5, 6], [2, 5], [3, 5], [7, 8]]).slice(0, 4); const big = s.reduce((m, f) => f[0] / f[1] > m[0] / m[1] ? f : m); return mc('Which fraction has the <b>greatest</b> value?', fs(...big), s.filter(f => f !== big).map(f => fs(...f)), 'Change each to a decimal (top ÷ bottom) and compare. ' + fs(...big) + ' = ' + fmt(big[0] / big[1]) + '.'); },
    () => { const [n, d] = pick([[1, 4], [3, 4], [1, 8], [3, 8], [5, 8], [2, 5], [1, 3], [2, 3], [7, 20], [9, 25]]); return num(`Change ${n}/${d} to a decimal.`, n / d, { places: 2, explain: `${n} ÷ ${d} = ${fmt(n / d)}, which rounds to ${fmt(rnd(n / d, 2))}.` }); },
    () => { const t = pick([2, 3, 4]), dose = pick([[1, 2], [1, 4], [3, 4]]); return frac(`A patient takes ${fs(...dose)} tablet ${t} times a day. How many tablets is that per day?`, dose[0] * t, dose[1], `${fs(...dose)} × ${t} = ${fs(dose[0] * t, dose[1])} tablets per day.`); }
  ];

  const decimals = [
    () => { const a = rnd(R(10, 999) / 100, 2), b = rnd(R(10, 999) / 100, 2); return num(`Add: ${a} + ${b}`, a + b, { explain: `Line up the decimal points: ${a} + ${b} = ${fmt(a + b)}.` }); },
    () => { let a = rnd(R(100, 2000) / 100, 2), b = rnd(R(10, 999) / 100, 2); if (b > a) [a, b] = [b, a]; return num(`Subtract: ${a} − ${b}`, a - b, { explain: `Line up the decimal points: ${a} − ${b} = ${fmt(a - b)}.` }); },
    () => { const a = rnd(R(11, 99) / 10, 1), b = rnd(R(2, 50) / 100, 2); return num(`Multiply: ${a} × ${b}`, a * b, { places: 2, explain: `${a} × ${b} = ${fmt(a * b)}. Count the decimal places in both numbers to place the point.` }); },
    () => { const b = pick([0.2, 0.25, 0.4, 0.5, 1.5, 2.5, 0.125]), a = rnd(b * R(2, 12) + pick([0, 0.1, 0.3]), 2); return num(`Divide: ${a} ÷ ${b}`, a / b, { places: 2, explain: `Move the decimal point in both numbers so the divisor is a whole number, then divide: ${fmt(a / b)}.` }); },
    () => { const v = R(1000, 99999) / 1000; return num(`Round ${v} to the nearest tenth.`, v, { places: 1, noRound: true, explain: `Look at the hundredths digit: 5 or more rounds up. ${v} → ${rnd(v, 1)}.` }); },
    () => { const v = R(10000, 999999) / 10000; return num(`Round ${v} to the nearest hundredth.`, v, { places: 2, noRound: true, explain: `Look at the thousandths digit: 5 or more rounds up. ${v} → ${rnd(v, 2)}.` }); },
    () => { const [n, d] = pick([[1, 4], [1, 2], [3, 4], [1, 5], [2, 5], [1, 8], [3, 8], [1, 20], [3, 25], [1, 10], [7, 10]]); return frac(`Change ${fmt(n / d)} to a fraction.`, n, d, `${fmt(n / d)} = ${Math.round(n / d * 1000)}/1000, which reduces to ${fs(n, d)}.`); },
    () => { const s = shuffle([0.5, 0.05, 0.25, 0.125, 0.3, 0.75, 0.075, 1.2, 0.9]).slice(0, 4); const m = Math.max(...s); return mc('Which decimal is the <b>largest</b>?', String(m), s.filter(x => x !== m).map(String), 'Compare place by place starting with the tenths.'); },
    () => { const v = pick(['.5', '.25', '.1', '.4', '.125']); return mc(`A dose is written as "${v} mg". How should it be written to prevent an error?`, '0' + v + ' mg', [v + '0 mg', v.slice(1) + ' mg', v + ' mg (no change)'], 'Always put a leading zero before a decimal point (0' + v + ' mg) so the point is not missed.'); },
    () => { const v = pick([1, 2, 5, 10, 25]); return mc(`A dose is written as "${v}.0 mg". How should it be written?`, v + ' mg', [v + '.0 mg (no change)', '0' + v + '.0 mg', v + '.00 mg'], `Never use a trailing zero: ${v}.0 mg can be misread as ${v}0 mg.`); },
    () => { const h = pick([0.125, 0.25, 0.5]), t = pick([0.5, 1, 2, 1.5].filter(x => x * h !== 0)), o = h * t; return num(`The order is ${fmt(o)} mg. Tablets on hand are ${h} mg each. How many tablets will you give?`, t, { unit: 'tablets', explain: `${fmt(o)} ÷ ${h} = ${fmt(t)} tablets.` }); }
  ];

  const ratio = [
    () => { const a = R(2, 9), b = R(2, 12), k = R(2, 6); return num(`Solve for x:  ${a} : ${b} = ${a * k} : x`, b * k, { explain: `Multiply the means and extremes: ${a}x = ${b} × ${a * k}, so x = ${b * k}.` }); },
    () => { const a = R(2, 9), b = R(3, 15), c = R(2, 20); return num(`Solve for x:  ${a}/${b} = ${c}/x`, b * c / a, { places: 1, explain: `Cross-multiply: ${a}x = ${b} × ${c} = ${b * c}, so x = ${b * c} ÷ ${a} = ${fmt(b * c / a)}.` }); },
    () => { const a = R(1, 5) * pick([1, 2, 3]), b = R(2, 9) * pick([2, 3]); return frac(`Write the ratio ${a} : ${b} as a fraction.`, a, b, `${a} : ${b} = ${a}/${b} = ${fs(a, b)}.`); },
    () => { const h = pick([125, 250, 500]), v = 5, o = h * pick([0.5, 1, 1.5, 2, 0.8]); return num(`A suspension has ${h} mg in ${v} mL. The order is ${fmt(o)} mg. How many mL will you give?`, o * v / h, { places: 1, unit: 'mL', explain: `${h} mg : ${v} mL = ${fmt(o)} mg : x mL → ${h}x = ${fmt(o * v)} → x = ${fmt(o * v / h)} mL.` }); },
    () => { const h = pick([5, 10, 20, 25, 50]), t = pick([0.5, 1.5, 2, 3]), o = h * t; return num(`Tablets are ${h} mg each. The order is ${fmt(o)} mg. How many tablets will you give?`, t, { unit: 'tablets', explain: `${h} mg : 1 tab = ${fmt(o)} mg : x tab → x = ${fmt(t)} tablets.` }); },
    () => mc('Epinephrine 1:1,000 means:', '1 g in 1,000 mL (1 mg/mL)', ['1 mg in 1,000 mL', '1 mL in 1,000 g', '1 mcg in 1,000 mL'], 'A ratio strength is grams per mL: 1 g in 1,000 mL = 1,000 mg in 1,000 mL = 1 mg/mL.'),
    () => { const a = R(2, 6) * 2, b = R(1, 4) * 2, k = gcd(a, b); return mc(`Reduce the ratio ${a} : ${b} to lowest terms.`, (a / k) + ' : ' + (b / k), [(a / 2) + ' : ' + (b / 2 + 1), (b / k) + ' : ' + (a / k), (a / k + 1) + ' : ' + (b / k)].filter(x => x !== (a / k) + ' : ' + (b / k)), `Divide both sides by ${k}.`); },
    () => { const mg = pick([2, 4, 10, 40]), ml = pick([1, 2]), o = mg / ml * pick([0.5, 1.5, 0.25, 2]); return num(`A vial contains ${mg} mg per ${ml} mL. How many mL contain ${fmt(o)} mg?`, o * ml / mg, { places: 2, unit: 'mL', explain: `${mg} : ${ml} = ${fmt(o)} : x → x = ${fmt(o * ml / mg)} mL.` }); }
  ];

  const percent = [
    () => { const p = pick([5, 12.5, 0.9, 45, 2.5, 150, 0.45, 75]); return num(`Change ${p}% to a decimal.`, p / 100, { explain: `Divide by 100 (move the point two places left): ${p}% = ${fmt(p / 100)}.` }); },
    () => { const d = pick([0.35, 0.08, 0.125, 1.5, 0.004, 0.6]); return num(`Change ${d} to a percent.`, d * 100, { unit: '%', explain: `Multiply by 100 (move the point two places right): ${d} = ${fmt(d * 100)}%.` }); },
    () => { const [n, d] = pick([[1, 4], [3, 5], [1, 8], [7, 20], [2, 3], [1, 3], [5, 8]]); return num(`Change ${n}/${d} to a percent.`, n / d * 100, { places: 1, unit: '%', explain: `${n} ÷ ${d} × 100 = ${fmt(n / d * 100)}%.` }); },
    () => { const p = pick([10, 15, 20, 25, 30, 40, 60, 5]), n = R(4, 40) * 5; return num(`What is ${p}% of ${n}?`, n * p / 100, { explain: `${p / 100} × ${n} = ${fmt(n * p / 100)}.` }); },
    () => { const b = R(4, 20) * 5, a = Math.round(b * pick([0.2, 0.25, 0.4, 0.6, 0.75, 0.1])); return num(`${a} is what percent of ${b}?`, a / b * 100, { places: 1, unit: '%', explain: `(${a} ÷ ${b}) × 100 = ${fmt(a / b * 100)}%.` }); },
    () => { const p = pick([5, 10, 20, 25, 50, 40]), [n, d] = red(p, 100); return mc(`Write ${p}% as a ratio in lowest terms.`, n + ' : ' + d, [p + ' : 1', d + ' : ' + n, '1 : ' + p], `${p}% = ${p}/100 = ${n}/${d}, written ${n} : ${d}.`); },
    () => { const p = pick([5, 10]), v = pick([250, 500, 1000]); return num(`How many grams of dextrose are in ${v} mL of D${p}W (${p}% dextrose)?`, p * v / 100, { unit: 'g', explain: `${p}% means ${p} g per 100 mL: ${p} × ${v} ÷ 100 = ${fmt(p * v / 100)} g.` }); },
    () => { const p = pick([0.9, 0.45]), v = pick([250, 500, 1000]); return num(`How many grams of sodium chloride are in ${v} mL of ${p}% NaCl?`, p * v / 100, { places: 2, unit: 'g', explain: `${p} g per 100 mL × ${v} mL ÷ 100 = ${fmt(p * v / 100)} g.` }); },
    () => { const w = R(120, 220), l = R(4, 15); return num(`A patient weighed ${w} lb and lost ${l} lb. What percent of body weight was lost?`, l / w * 100, { places: 1, unit: '%', explain: `(${l} ÷ ${w}) × 100 = ${fmt(l / w * 100)}%.` }); }
  ];

  // ---------- Unit 2: Systems of measurement ----------
  const metric = [
    () => { const g = pick([0.1, 0.25, 0.5, 1.5, 2, 0.03, 0.005]); return num(`${g} g = ? mg`, g * 1000, { unit: 'mg', explain: `1 g = 1,000 mg, so multiply by 1,000 (move the point 3 places right): ${fmt(g * 1000)} mg.` }); },
    () => { const mg = pick([250, 500, 750, 1500, 50, 5]); return num(`${mg} mg = ? g`, mg / 1000, { unit: 'g', explain: `Divide by 1,000 (move the point 3 places left): ${fmt(mg / 1000)} g.` }); },
    () => { const mg = pick([0.1, 0.125, 0.25, 0.4, 0.05, 1.5]); return num(`${mg} mg = ? mcg`, mg * 1000, { unit: 'mcg', explain: `1 mg = 1,000 mcg: ${fmt(mg * 1000)} mcg.` }); },
    () => { const mcg = pick([200, 400, 125, 50, 1500, 88]); return num(`${mcg} mcg = ? mg`, mcg / 1000, { unit: 'mg', explain: `Divide by 1,000: ${fmt(mcg / 1000)} mg.` }); },
    () => { const l = pick([0.5, 1, 1.5, 2.5, 0.25, 0.1]); return num(`${l} L = ? mL`, l * 1000, { unit: 'mL', explain: `1 L = 1,000 mL: ${fmt(l * 1000)} mL.` }); },
    () => { const ml = pick([250, 500, 1200, 750, 50]); return num(`${ml} mL = ? L`, ml / 1000, { unit: 'L', explain: `Divide by 1,000: ${fmt(ml / 1000)} L.` }); },
    () => { const kg = pick([2.5, 3.2, 0.8, 1.25, 70]); return num(`${kg} kg = ? g`, kg * 1000, { unit: 'g', explain: `1 kg = 1,000 g: ${fmt(kg * 1000)} g.` }); },
    () => { const cm = pick([25, 150, 7.5, 2]); return num(`${cm} cm = ? mm`, cm * 10, { unit: 'mm', explain: `1 cm = 10 mm: ${fmt(cm * 10)} mm.` }); },
    () => mc('Which is written correctly in metric notation?', '0.5 mg', ['.5 mg', '½ mg', 'mg 0.5'], 'Metric: the number comes first, decimals not fractions, with a leading zero.'),
    () => mc('The Joint Commission and ISMP recommend writing micrograms as:', 'mcg', ['µg', 'ug', 'mg'], 'µg can be misread as mg, a 1,000-fold error. Write mcg.')
  ];

  const apothecary = [
    () => { const t = pick([1, 2, 3, 0.5, 1.5]); return num(`${t} tsp = ? mL`, t * 5, { unit: 'mL', explain: `1 tsp = 5 mL: ${t} × 5 = ${fmt(t * 5)} mL.` }); },
    () => { const t = pick([1, 2, 0.5, 3]); return num(`${t} tbsp = ? mL`, t * 15, { unit: 'mL', explain: `1 tbsp = 15 mL: ${t} × 15 = ${fmt(t * 15)} mL.` }); },
    () => { const o = pick([1, 2, 4, 6, 8, 1.5, 0.5]); return num(`${o} oz = ? mL`, o * 30, { unit: 'mL', explain: `1 oz = 30 mL: ${o} × 30 = ${fmt(o * 30)} mL.` }); },
    () => { const ml = pick([60, 90, 120, 240, 45, 15]); return num(`${ml} mL = ? oz`, ml / 30, { unit: 'oz', explain: `Divide by 30: ${fmt(ml / 30)} oz.` }); },
    () => { const t = pick([1, 2, 3]); return num(`${t} tbsp = ? tsp`, t * 3, { unit: 'tsp', explain: `1 tbsp = 3 tsp: ${t * 3} tsp.` }); },
    () => { const o = pick([1, 2, 3]); return num(`${o} oz = ? tbsp`, o * 2, { unit: 'tbsp', explain: `1 oz = 2 tbsp: ${o * 2} tbsp.` }); },
    () => { const c = pick([0.5, 1, 1.5, 2]); return num(`${c} cup(s) = ? mL (1 cup = 8 oz)`, c * 240, { unit: 'mL', explain: `1 cup = 8 oz = 240 mL: ${fmt(c * 240)} mL.` }); },
    () => { const g = pick([1, 5, 10, 0.5]); return num(`Using gr 1 = 60 mg, gr ${fmt(g)} = ? mg`, g * 60, { unit: 'mg', explain: `${fmt(g)} × 60 = ${fmt(g * 60)} mg.` }); },
    () => mc('Insulin, heparin, and penicillin are often measured in:', 'units', ['grains', 'drams', 'minims'], 'Units measure a drug\'s action, not its weight. Always write out "units". Never write "U".'),
    () => mc('Potassium chloride is often measured in:', 'milliequivalents (mEq)', ['units', 'grains', 'drops'], 'Electrolytes such as KCl are ordered in mEq.')
  ];

  const lbkg = () => { const lb = R(90, 260); return num(`A patient weighs ${lb} lb. What is the weight in kg? (1 kg = 2.2 lb)`, lb / 2.2, { places: 1, unit: 'kg', tol: 0.05, explain: `${lb} ÷ 2.2 = ${fmt(lb / 2.2)} kg.` }); };
  const converting = [
    lbkg,
    () => { const kg = R(3, 110); return num(`${kg} kg = ? lb (1 kg = 2.2 lb)`, kg * 2.2, { places: 1, unit: 'lb', explain: `${kg} × 2.2 = ${fmt(kg * 2.2)} lb.` }); },
    () => { const inch = R(20, 74); return num(`${inch} inches = ? cm (1 in = 2.54 cm)`, inch * 2.54, { places: 1, unit: 'cm', explain: `${inch} × 2.54 = ${fmt(inch * 2.54)} cm.` }); },
    () => { const cm = R(45, 190); return num(`${cm} cm = ? inches (1 in = 2.54 cm)`, cm / 2.54, { places: 1, unit: 'in', tol: 0.05, explain: `${cm} ÷ 2.54 = ${fmt(cm / 2.54)} in.` }); },
    () => { const ml = pick([7.5, 10, 15, 2.5, 20]); return num(`${ml} mL = ? tsp`, ml / 5, { unit: 'tsp', explain: `1 tsp = 5 mL: ${ml} ÷ 5 = ${fmt(ml / 5)} tsp.` }); },
    () => { const g = pick([0.3, 0.075, 1.2, 0.015]); return num(`${g} g = ? mcg`, g * 1e6, { unit: 'mcg', explain: `g → mg (× 1,000) → mcg (× 1,000): ${fmt(g * 1e6)} mcg.` }); },
    () => { const o = pick([2, 3, 5, 6]), t = o * 2; return num(`A patient drank ${o} oz of juice. How many tablespoons is that?`, t, { unit: 'tbsp', explain: `1 oz = 2 tbsp: ${o} × 2 = ${t} tbsp.` }); },
    () => { const lb = R(5, 12), oz = R(1, 15); return num(`A newborn weighs ${lb} lb ${oz} oz. What is the weight in kg? (16 oz = 1 lb, 1 kg = 2.2 lb)`, (lb + oz / 16) / 2.2, { places: 2, unit: 'kg', tol: 0.01, explain: `${oz} oz ÷ 16 = ${fmt(oz / 16)} lb. ${fmt(lb + oz / 16)} lb ÷ 2.2 = ${fmt((lb + oz / 16) / 2.2)} kg.` }); },
    () => { const mg = pick([0.25, 0.4, 0.6]); return num(`${mg} mg = ? g`, mg / 1000, { unit: 'g', explain: `Divide by 1,000: ${fmt(mg / 1000)} g.` }); }
  ];

  const to24 = (h, m, pm) => { let H = h % 12 + (pm ? 12 : 0); return String(H).padStart(2, '0') + String(m).padStart(2, '0'); };
  const additional = [
    () => { const f = R(960, 1040) / 10; return num(`Convert ${f}°F to °C.  °C = (°F − 32) ÷ 1.8`, (f - 32) / 1.8, { places: 1, unit: '°C', tol: 0.05, explain: `(${f} − 32) ÷ 1.8 = ${fmt((f - 32) / 1.8)}°C.` }); },
    () => { const c = R(355, 405) / 10; return num(`Convert ${c}°C to °F.  °F = (°C × 1.8) + 32`, c * 1.8 + 32, { places: 1, unit: '°F', tol: 0.05, explain: `(${c} × 1.8) + 32 = ${fmt(c * 1.8 + 32)}°F.` }); },
    () => { const h = R(1, 12), m = pick([0, 15, 30, 45, 5]), pm = Math.random() < 0.5, ans = to24(h, m, pm); const opts = new Set([ans]); while (opts.size < 4) opts.add(to24(R(1, 12), pick([0, 15, 30, 45, 5]), Math.random() < 0.5)); return mc(`Write ${h}:${String(m).padStart(2, '0')} ${pm ? 'PM' : 'AM'} in military (24-hour) time.`, ans, [...opts].filter(x => x !== ans), pm ? 'For PM times after noon, add 12 to the hour.' : (h === 12 ? '12 AM (midnight) is 0000.' : 'AM times keep the hour, with a leading zero.')); },
    () => { const H = R(0, 23), m = pick([0, 10, 30, 45]), t = String(H).padStart(2, '0') + String(m).padStart(2, '0'); const std = (H2, m2) => ((H2 % 12) || 12) + ':' + String(m2).padStart(2, '0') + (H2 < 12 ? ' AM' : ' PM'); const ans = std(H, m); const opts = new Set([ans]); while (opts.size < 4) opts.add(std(R(0, 23), pick([0, 10, 30, 45]))); return mc(`What is ${t} in standard (12-hour) time?`, ans, [...opts].filter(x => x !== ans), 'Hours 13–23: subtract 12 and use PM. 0000–0059 is 12 AM.'); },
    () => { const a = pick([4, 6, 8]), b = pick([120, 240, 180]), c = pick([1, 2]), d = pick([100, 150, 250]); return num(`Intake for a shift: ${a} oz coffee, ${b} mL water, ${c} cup(s) of broth (1 cup = 240 mL), and IV fluid ${d} mL. What is the total intake in mL?`, a * 30 + b + c * 240 + d, { unit: 'mL', explain: `${a} × 30 + ${b} + ${c} × 240 + ${d} = ${a * 30 + b + c * 240 + d} mL.` }); },
    () => { const u = [R(200, 450), R(150, 400), R(200, 500)], e = R(50, 200); return num(`Output for a shift: urine ${u.join(' mL, ')} mL, and emesis ${e} mL. What is the total output in mL?`, u[0] + u[1] + u[2] + e, { unit: 'mL', explain: `Add them: ${u[0] + u[1] + u[2] + e} mL.` }); },
    () => { const ft = R(4, 6), inch = R(0, 11), cm = (ft * 12 + inch) * 2.54; return num(`A patient is ${ft} ft ${inch} in tall. What is the height in cm?`, cm, { places: 1, unit: 'cm', explain: `${ft} × 12 + ${inch} = ${ft * 12 + inch} in × 2.54 = ${fmt(cm)} cm.` }); },
    () => mc('A normal oral temperature in Celsius is about:', '37°C', ['32°C', '98.6°C', '42°C'], '98.6°F = 37°C.')
  ];

  // ---------- Unit 3: Administration and calculation methods ----------
  const bank9 = [
    { q: 'Which is one of the "rights" of medication administration?', a: 'Right route', w: ['Right pharmacy', 'Right price', 'Right brand name'], e: 'The rights include patient, drug, dose, route, time, and documentation (plus reason and response).' },
    { q: 'Before giving a medication, how many patient identifiers must you check?', a: 'Two (such as name and date of birth)', w: ['One (room number)', 'One (name only)', 'None if you know the patient'], e: 'Use two identifiers. A room number is never an identifier.' },
    { q: 'The abbreviation SL means the drug is given:', a: 'Under the tongue', w: ['Between the cheek and gum', 'By injection under the skin', 'Through a feeding tube'], e: 'SL = sublingual. Buccal is between the cheek and gum.' },
    { q: 'Which tablet should NOT be crushed?', a: 'Enteric-coated or extended-release tablet', w: ['Scored plain tablet', 'Chewable tablet', 'Plain uncoated tablet'], e: 'Crushing EC/ER forms destroys the coating or releases the whole dose at once.' },
    { q: 'You find a medication error after giving a dose. What do you do first?', a: 'Assess the patient', w: ['Fill out the incident report', 'Call the pharmacy', 'Wait to see if anything happens'], e: 'Check the patient first, then notify the provider and follow the facility\'s reporting policy.' },
    { q: 'The Z-track technique is used for:', a: 'IM injections of irritating drugs', w: ['Intradermal skin tests', 'IV push drugs', 'Sublingual tablets'], e: 'Z-track seals the drug in the muscle so it does not leak into the tissue.' },
    { q: 'A patient refuses a medication. The nurse should:', a: 'Find out why, document the refusal, and tell the provider', w: ['Hide it in food', 'Leave it at the bedside', 'Give it anyway'], e: 'Patients have the right to refuse. Document it and report it.' },
    { q: 'Which route usually has the fastest onset?', a: 'Intravenous (IV)', w: ['Oral (PO)', 'Subcutaneous', 'Transdermal'], e: 'IV drugs go straight into the bloodstream.' },
    { q: 'A transdermal medication is given:', a: 'Through a patch on the skin', w: ['By mouth', 'Into the rectum', 'Into the muscle'], e: 'Transdermal = absorbed through the skin.' },
    { q: 'The nurse checks the medication label how many times before giving it?', a: 'Three times', w: ['Once', 'Twice', 'Only if unsure'], e: 'Check when you take it out, when you prepare it, and at the bedside.' },
    { q: 'Which needle angle is used for an IM injection?', a: '90 degrees', w: ['10–15 degrees', '45 degrees only', '5 degrees'], e: 'IM is 90°. Subcut is 45–90°. Intradermal is 10–15°.' },
    { q: 'The "right time" usually allows a dose to be given within:', a: '30–60 minutes of the scheduled time (per facility policy)', w: ['4 hours', 'Any time that shift', '5 minutes only'], e: 'Most facilities allow 30–60 minutes for routine scheduled drugs. Time-critical drugs have a narrower window.' }
  ];
  const freq = [['bid', 2], ['tid', 3], ['qid', 4], ['q4h', 6], ['q6h', 4], ['q8h', 3], ['q12h', 2], ['q3h', 8], ['daily', 1]];
  const bank10 = [
    { q: 'What does "prn" mean?', a: 'As needed', w: ['Every night', 'Before meals', 'Immediately'], e: 'prn = pro re nata, as needed.' },
    { q: 'What does "stat" mean?', a: 'Immediately', w: ['As needed', 'Twice a day', 'At bedtime'], e: 'Give a stat order right away.' },
    { q: 'What does "ac" mean?', a: 'Before meals', w: ['After meals', 'At bedtime', 'With water'], e: 'ac = ante cibum (before meals). pc = after meals.' },
    { q: 'What does "NPO" mean?', a: 'Nothing by mouth', w: ['No pain ordered', 'Normal by mouth', 'Night prn only'], e: 'NPO = nil per os.' },
    { q: 'Which abbreviation is on the Joint Commission "Do Not Use" list?', a: 'U (for units)', w: ['mL', 'mg', 'PO'], e: 'U can be misread as 0 or 4. Write "units".' },
    { q: 'Which is on the "Do Not Use" list?', a: 'QD (daily)', w: ['bid', 'tid', 'mcg'], e: 'QD and QOD are easily confused. Write "daily" or "every other day".' },
    { q: 'A complete medication order includes all EXCEPT:', a: 'The patient\'s room number', w: ['Drug name', 'Dose and route', 'Prescriber\'s signature'], e: 'An order needs the patient\'s name, date and time, drug, dose, route, frequency, and the prescriber\'s signature.' },
    { q: 'An order reads "Lasix 40 mg PO." What is missing?', a: 'Frequency', w: ['Route', 'Dose', 'Drug name'], e: 'There is no time or frequency. Clarify it with the prescriber.' },
    { q: 'A standing order is:', a: 'Carried out as written until it is stopped', w: ['Given only once', 'Given only when the patient asks', 'A verbal order'], e: 'For example, "Metoprolol 25 mg PO bid".' },
    { q: 'If an order is unclear or seems unsafe, the nurse should:', a: 'Clarify it with the prescriber before giving it', w: ['Give it as written', 'Guess the intent', 'Ask the patient'], e: 'The nurse is responsible for every dose they give.' }
  ];
  const ordersGen = [
    () => { const [a, n] = pick(freq); return num(`An order is written "${a}". How many doses will the patient receive in 24 hours?`, n, { unit: 'doses', explain: a.startsWith('q') ? `24 ÷ ${a.slice(1, -1)} = ${n} doses.` : `${a} = ${n} time(s) a day.` }); },
    () => { const d = pick([250, 500]), [a, n] = pick(freq.filter(f => f[1] > 1 && f[1] <= 4)); return num(`Amoxicillin ${d} mg PO ${a} is ordered. How many mg will the patient get in 24 hours?`, d * n, { unit: 'mg', explain: `${d} mg × ${n} doses = ${d * n} mg.` }); }
  ];
  const bank11 = [
    { q: 'A unit-dose system means:', a: 'Each dose is packaged and labeled separately', w: ['A month\'s supply in one bottle', 'Drugs are kept at the patient\'s home', 'Doses are mixed on the unit'], e: 'Unit dose cuts down on errors and waste.' },
    { q: 'An automated dispensing cabinet (for example Pyxis or Omnicell):', a: 'Stores medications on the unit and tracks who removes them', w: ['Replaces the MAR', 'Makes nurse checks unnecessary', 'Is only for IV fluids'], e: 'ADCs control access and record each removal.' },
    { q: 'When should a dose be documented on the MAR?', a: 'Right after it is given', w: ['Before preparing it', 'At the end of the shift', 'Only if the patient asks'], e: 'Never chart ahead. Document right after giving it.' },
    { q: 'Wasting part of a controlled substance requires:', a: 'A second licensed witness', w: ['No one else', 'The patient\'s signature', 'A pharmacist only, by phone'], e: 'Controlled substance waste must be witnessed and documented.' },
    { q: 'Bar-code medication administration (BCMA) scans:', a: 'The patient\'s wristband and the medication', w: ['Only the medication', 'Only the nurse\'s badge', 'The pharmacy order slip'], e: 'Scanning both checks the right patient and the right drug.' },
    { q: 'When documenting a prn medication, the nurse should also record:', a: 'Why it was given and how the patient responded', w: ['The cost', 'The pharmacy\'s phone number', 'Nothing else'], e: 'For prn drugs, chart the reason and the effect (such as a pain score after 30–60 minutes).' },
    { q: 'If a dose is held, the nurse should:', a: 'Document the reason according to policy (often by circling the time)', w: ['Leave it blank', 'Mark it given', 'Erase the order'], e: 'Always document why a dose was held.' },
    { q: 'An eMAR is:', a: 'An electronic medication administration record', w: ['An emergency medication cart', 'A pharmacy invoice', 'A type of IV pump'], e: 'eMARs link to orders and bar-code scanning.' },
    { q: 'Controlled substances must be counted:', a: 'At each change of shift (per policy)', w: ['Once a year', 'Only when one is missing', 'Never'], e: 'Counts make sure every dose is accounted for.' },
    { q: 'Transcribing an order onto the MAR should be checked by:', a: 'Comparing the MAR with the original order', w: ['Asking the patient', 'Memory', 'The previous day\'s MAR only'], e: 'Always check the MAR against the prescriber\'s order.' }
  ];

  // Medication labels (made up for practice; they are not real product labels).
  const LABELS = [
    { brand: 'Amoxil', generic: 'amoxicillin', form: 'oral suspension', mg: 250, per: 5, total: 100, unit: 'mg' },
    { brand: 'Keflex', generic: 'cephalexin', form: 'oral suspension', mg: 125, per: 5, total: 200, unit: 'mg' },
    { brand: 'Lanoxin', generic: 'digoxin', form: 'injection', mg: 0.25, per: 1, total: 2, unit: 'mg' },
    { brand: 'Phenergan', generic: 'promethazine', form: 'injection', mg: 25, per: 1, total: 1, unit: 'mg' },
    { brand: 'Zofran', generic: 'ondansetron', form: 'injection', mg: 2, per: 1, total: 20, unit: 'mg' },
    { brand: 'Lasix', generic: 'furosemide', form: 'injection', mg: 10, per: 1, total: 4, unit: 'mg' },
    { brand: 'Tylenol', generic: 'acetaminophen', form: 'oral solution', mg: 160, per: 5, total: 120, unit: 'mg' },
    { brand: 'Synthroid', generic: 'levothyroxine', form: 'tablets', mg: 50, per: 1, total: 90, unit: 'mcg', tab: true },
    { brand: 'Lopressor', generic: 'metoprolol tartrate', form: 'tablets', mg: 25, per: 1, total: 100, unit: 'mg', tab: true },
    { brand: 'Toradol', generic: 'ketorolac', form: 'injection', mg: 30, per: 1, total: 1, unit: 'mg' }
  ];
  const labelHtml = L => `<div class="label"><div class="lbl-brand">${L.brand}<sup>®</sup></div><div class="lbl-gen">(${L.generic})</div><div class="lbl-str">${L.tab ? L.mg + ' ' + L.unit + ' per tablet' : L.mg + ' ' + L.unit + '/' + (L.per === 1 ? 'mL' : L.per + ' mL')}</div><div class="lbl-form">${L.form} · ${L.tab ? L.total + ' tablets' : L.total + ' mL'}</div><div class="lbl-ndc">NDC 0000-${R(1000, 9999)}-${R(10, 99)} · For practice only</div></div>`;
  const labelsGen = [
    () => { const L = pick(LABELS); return mc(labelHtml(L) + 'What is the <b>generic</b> name of this drug?', L.generic, shuffle(LABELS.filter(x => x !== L)).slice(0, 2).map(x => x.generic).concat(L.brand), 'The generic name is the one in lowercase, often in parentheses. The brand has the ® mark.'); },
    () => { const L = pick(LABELS); const s = L.tab ? L.mg + ' ' + L.unit + ' per tablet' : L.mg + ' ' + L.unit + ' per ' + L.per + ' mL'; return mc(labelHtml(L) + 'What is the dosage strength?', s, [L.total + (L.tab ? ' tablets' : ' mL'), (L.mg * 2) + ' ' + L.unit + (L.tab ? ' per tablet' : ' per ' + L.per + ' mL'), L.mg + ' ' + (L.unit === 'mg' ? 'mcg' : 'mg') + (L.tab ? ' per tablet' : ' per ' + L.per + ' mL')], 'The strength is the amount of drug in each tablet or mL.'); },
    () => { const L = pick(LABELS.filter(x => !x.tab)); return num(labelHtml(L) + 'What is the total volume in the container?', L.total, { unit: 'mL', explain: `The label shows ${L.total} mL.` }); },
    () => { const L = pick(LABELS.filter(x => !x.tab)); return num(labelHtml(L) + `How many ${L.unit} of drug are in the whole container?`, L.mg / L.per * L.total, { unit: L.unit, explain: `${L.mg} ${L.unit} per ${L.per} mL × ${L.total} mL = ${fmt(L.mg / L.per * L.total)} ${L.unit}.` }); },
    () => { const L = pick(LABELS.filter(x => !x.tab)), o = L.mg * pick([0.5, 1, 1.5, 2]); return num(labelHtml(L) + `The order is ${fmt(o)} ${L.unit}. How many mL will you give?`, o / L.mg * L.per, { places: 1, unit: 'mL', explain: `(${fmt(o)} ÷ ${L.mg}) × ${L.per} mL = ${fmt(o / L.mg * L.per)} mL.` }); },
    () => { const L = pick(LABELS.filter(x => x.tab)), t = pick([0.5, 1, 2]); return num(labelHtml(L) + `The order is ${fmt(L.mg * t)} ${L.unit}. How many tablets will you give?`, t, { unit: 'tablets', explain: `${fmt(L.mg * t)} ÷ ${L.mg} = ${t} tablet(s).` }); },
    () => { const L = pick(LABELS); return mc(labelHtml(L) + 'What is the form of this drug?', L.form, ['capsules', 'transdermal patch', 'suppository', 'tablets', 'injection', 'oral suspension'].filter(f => f !== L.form).slice(0, 3), 'The form tells you how it is supplied and given.'); }
  ];

  // Dosage problems shared by the three method chapters; the explanation shows that method.
  const DRUGS = [
    { n: 'furosemide', h: 40, form: 'tab', u: 'mg' }, { n: 'metoprolol', h: 25, form: 'tab', u: 'mg' },
    { n: 'levothyroxine', h: 0.05, form: 'tab', u: 'mg', alt: 'mcg' }, { n: 'amoxicillin', h: 250, q: 5, form: 'liq', u: 'mg' },
    { n: 'cephalexin', h: 125, q: 5, form: 'liq', u: 'mg' }, { n: 'morphine', h: 4, q: 1, form: 'inj', u: 'mg' },
    { n: 'ondansetron', h: 2, q: 1, form: 'inj', u: 'mg' }, { n: 'acetaminophen', h: 160, q: 5, form: 'liq', u: 'mg' },
    { n: 'digoxin', h: 0.25, q: 1, form: 'inj', u: 'mg', alt: 'mcg' }, { n: 'prednisone', h: 10, form: 'tab', u: 'mg' }
  ];
  function dose(method) {
    const d = pick(DRUGS), mult = d.form === 'tab' ? pick([0.5, 1, 1.5, 2, 3]) : pick([0.5, 0.75, 1.5, 2, 1.25, 0.8]);
    const Q = d.form === 'tab' ? 1 : d.q, D = rnd(d.h * mult, 4), ans = D / d.h * Q;
    // Some orders are written in the other unit so a conversion is needed first.
    const useAlt = d.alt && Math.random() < 0.6, shown = useAlt ? fmt(D * 1000) + ' mcg' : fmt(D) + ' mg';
    const what = d.form === 'tab' ? 'tablets' : 'mL', have = d.form === 'tab' ? `${fmt(d.h)} mg tablets` : `${fmt(d.h)} mg per ${Q} mL`;
    const conv = useAlt ? `First convert: ${fmt(D * 1000)} mcg = ${fmt(D)} mg. ` : '';
    const ex = {
      rp: `${conv}${fmt(d.h)} mg : ${Q} ${what === 'tablets' ? 'tab' : 'mL'} = ${fmt(D)} mg : x → ${fmt(d.h)}x = ${fmt(D * Q)} → x = ${fmt(ans)} ${what}.`,
      formula: `${conv}D/H × Q = ${fmt(D)}/${fmt(d.h)} × ${Q} = ${fmt(ans)} ${what}.`,
      da: `x ${what === 'tablets' ? 'tab' : 'mL'} = ${Q} ${what === 'tablets' ? 'tab' : 'mL'}/${fmt(d.h)} mg${useAlt ? ' × 1 mg/1,000 mcg × ' + fmt(D * 1000) + ' mcg' : ' × ' + fmt(D) + ' mg'} = ${fmt(ans)} ${what}.`
    }[method];
    return num(`Order: ${d.n} ${shown}. Available: ${have}. How many ${what} will you give?`, ans, { places: what === 'mL' ? (ans < 1 ? 2 : 1) : undefined, unit: what, explain: ex });
  }
  const gtoMgDose = method => () => { const h = pick([250, 500]), g = pick([0.5, 1]), ans = g * 1000 / h; return num(`Order: ${g} g PO. Available: ${h} mg tablets. How many tablets will you give?`, ans, { unit: 'tablets', explain: method === 'da' ? `x tab = 1 tab/${h} mg × 1,000 mg/1 g × ${g} g = ${fmt(ans)} tablets.` : `${g} g = ${g * 1000} mg; ${g * 1000} ÷ ${h} = ${fmt(ans)} tablets.` }); };
  const lbDose = method => () => { const lb = R(110, 240), kg = lb / 2.2, per = pick([1, 2, 0.5]), mg = kg * per; return num(`Order: ${per} mg/kg for a patient who weighs ${lb} lb. How many mg is the dose?`, mg, { places: 1, unit: 'mg', tol: 0.2, explain: method === 'da' ? `x mg = ${per} mg/kg × 1 kg/2.2 lb × ${lb} lb = ${fmt(mg)} mg.` : `${lb} ÷ 2.2 = ${fmt(kg)} kg; × ${per} mg/kg = ${fmt(mg)} mg.` }); };
  const methodGens = m => [() => dose(m), () => dose(m), () => dose(m), gtoMgDose(m), lbDose(m), () => dose(m)];

  // ---------- Unit 4: Oral, parenteral, reconstitution, insulin ----------
  const oral = [
    () => dose('formula'), () => dose('formula'),
    () => { const h = pick([5, 10, 20]), t = pick([1, 2, 0.5]), times = pick([2, 3, 4]); return num(`Order: ${h * t} mg PO ${{ 2: 'bid', 3: 'tid', 4: 'qid' }[times]}. Tablets are ${h} mg. How many tablets will the patient take in one day?`, t * times, { unit: 'tablets', explain: `${t} tablet(s) per dose × ${times} doses = ${fmt(t * times)} tablets.` }); },
    () => { const h = pick([125, 250]), o = pick([375, 500, 200, 300]); return num(`Order: ${o} mg PO. Available: oral suspension ${h} mg/5 mL. How many mL?`, o * 5 / h, { places: 1, unit: 'mL', explain: `${o}/${h} × 5 mL = ${fmt(o * 5 / h)} mL.` }); },
    () => { const ml = pick([7.5, 10, 15, 5]); return num(`You need to give ${ml} mL with a dosing cup marked in teaspoons. How many tsp is that?`, ml / 5, { unit: 'tsp', explain: `${ml} ÷ 5 = ${fmt(ml / 5)} tsp.` }); },
    () => mc('A tablet that may be safely cut in half usually:', 'Has a score line', ['Is enteric-coated', 'Is extended-release (XL, ER)', 'Is a capsule'], 'Only cut scored tablets, and only when the drug reference allows it.'),
    () => mc('When measuring liquid in a medicine cup, read it at:', 'The bottom of the meniscus, at eye level', ['The top of the meniscus', 'Any angle', 'The rim of the cup'], 'Hold the cup at eye level and read the lowest point of the curve.'),
    () => { const h = 0.125, o = pick([0.25, 0.375, 0.0625]); return num(`Order: ${fmt(o * 1000)} mcg PO. Available: ${h} mg tablets. How many tablets?`, o / h, { unit: 'tablets', explain: `${fmt(o * 1000)} mcg = ${o} mg; ${o} ÷ ${h} = ${fmt(o / h)} tablets.` }); }
  ];

  const syr = v => v <= 1 ? 2 : 1;
  const parenteral = [
    () => dose('formula'),
    () => { const h = pick([2, 4, 10, 15]), o = rnd(h * pick([0.5, 0.75, 0.25, 1.5]), 2), v = o / h; return num(`Order: morphine ${fmt(o)} mg IV. Available: ${h} mg/mL. How many mL? (Round to tenths if more than 1 mL, hundredths if less.)`, v, { places: syr(v), unit: 'mL', explain: `${fmt(o)} ÷ ${h} × 1 mL = ${fmt(v)} mL.` }); },
    () => { const h = pick([5000, 10000]), o = pick([2500, 5000, 7500]), v = o / h; return num(`Order: heparin ${o.toLocaleString()} units subcut. Available: ${h.toLocaleString()} units/mL. How many mL?`, v, { places: 2, unit: 'mL', explain: `${o.toLocaleString()} ÷ ${h.toLocaleString()} = ${fmt(v)} mL.` }); },
    () => { const h = pick([25, 50]), o = pick([12.5, 25, 35, 40]), v = o / h; return num(`Order: promethazine ${o} mg IM. Available: ${h} mg/mL. How many mL?`, v, { places: syr(v), unit: 'mL', explain: `${o}/${h} × 1 mL = ${fmt(v)} mL.` }); },
    () => { const v = pick([0.3, 0.25, 0.45, 0.6]); return mc(`To give ${v} mL accurately, which syringe is best?`, '1 mL (tuberculin) syringe', ['5 mL syringe', '10 mL syringe', '3 mL syringe marked in 0.5 mL'], 'Small volumes under 1 mL are measured in a 1 mL syringe marked in hundredths.'); },
    () => mc('The maximum volume usually given IM in the ventrogluteal site of an adult is:', '3 mL', ['10 mL', '0.5 mL', '1 mL'], 'Most adults can take up to about 3 mL in a large muscle. The deltoid takes about 1 mL or less.'),
    () => { const h = pick([0.5, 0.25]), o = pick([0.125, 0.25, 0.375].filter(x => x <= h * 2)); return num(`Order: digoxin ${fmt(o * 1000)} mcg IV. Available: ${h} mg/2 mL. How many mL?`, o / h * 2, { places: 2, unit: 'mL', explain: `${fmt(o * 1000)} mcg = ${o} mg; ${o}/${h} × 2 mL = ${fmt(o / h * 2)} mL.` }); },
    () => { const pct = pick([1, 2]), ml = pick([2, 5]); return num(`How many mg of lidocaine are in ${ml} mL of ${pct}% lidocaine?`, pct * 10 * ml, { unit: 'mg', explain: `${pct}% = ${pct} g/100 mL = ${pct * 10} mg/mL; × ${ml} mL = ${pct * 10 * ml} mg.` }); }
  ];

  const recon = [
    () => { const vial = pick([500, 1000, 2000]), dil = pick([2, 4, 5, 10]), conc = vial / dil, o = conc * pick([0.5, 0.75, 1.5, 1]); return num(`A vial of drug has ${vial} mg of powder. The label says: add ${dil} mL sterile water to make ${fmt(conc)} mg/mL. The order is ${fmt(o)} mg. How many mL?`, o / conc, { places: syr(o / conc), unit: 'mL', explain: `${fmt(o)} ÷ ${fmt(conc)} = ${fmt(o / conc)} mL.` }); },
    () => { const vial = pick([1, 2]), dil = pick([3, 4]), conc = pick([250, 330]), o = pick([250, 500]); return num(`Ceftriaxone ${vial} g vial: add ${dil} mL lidocaine to make about ${conc} mg/mL. Order: ${o} mg IM. How many mL?`, o / conc, { places: syr(o / conc), unit: 'mL', explain: `${o} ÷ ${conc} = ${fmt(o / conc)} mL.` }); },
    () => { const g = pick([1, 2, 5]), o = pick([250, 500]); return num(`A vial has ${g} g of drug. How many full ${o} mg doses can you get from it?`, Math.floor(g * 1000 / o), { unit: 'doses', explain: `${g * 1000} mg ÷ ${o} mg = ${fmt(g * 1000 / o)} → ${Math.floor(g * 1000 / o)} full doses.` }); },
    () => { const units = pick([1000000, 5000000]), dil = units === 1000000 ? pick([[9.6, 100000], [4.6, 200000]]) : pick([[18, 250000], [8, 500000]]), o = pick([300000, 400000, 500000]); return num(`Penicillin G ${units.toLocaleString()} units vial. Add ${dil[0]} mL diluent to make ${dil[1].toLocaleString()} units/mL. Order: ${o.toLocaleString()} units. How many mL?`, o / dil[1], { places: 1, unit: 'mL', explain: `${o.toLocaleString()} ÷ ${dil[1].toLocaleString()} = ${fmt(o / dil[1])} mL.` }); },
    () => mc('After reconstituting a multi-dose vial, the nurse labels it with:', 'Date, time, concentration, and nurse\'s initials', ['Only the patient\'s name', 'Nothing; the pharmacy does this', 'Only the expiration date printed on the box'], 'A label makes sure the next nurse knows its strength and when it expires.'),
    () => mc('Which is a diluent?', 'Sterile water for injection', ['The drug powder', 'Alcohol pad', 'Heparin flush'], 'A diluent is the liquid added to dissolve a powder.'),
    () => { const conc = pick([100, 200, 250]), total = pick([5, 10, 20]); return num(`After you add diluent, the vial holds ${total} mL at ${conc} mg/mL. How many mg are in the vial?`, conc * total, { unit: 'mg', explain: `${conc} × ${total} = ${conc * total} mg.` }); }
  ];

  const insulin = [
    () => { const n = R(10, 30), r = R(3, 12); return num(`Order: NPH insulin ${n} units and regular insulin ${r} units subcut, mixed in one syringe. What is the total in the U-100 syringe?`, n + r, { unit: 'units', explain: `${n} + ${r} = ${n + r} units.` }); },
    () => mc('When mixing regular and NPH insulin in one syringe, draw up:', 'Regular (clear) first, then NPH (cloudy)', ['NPH (cloudy) first', 'Either one first', 'They are never mixed'], '"Clear before cloudy" keeps NPH from getting into the regular vial.'),
    () => { const bg = R(140, 380); const scale = [[150, 0], [200, 2], [250, 4], [300, 6], [350, 8], [999, 10]]; const u = scale.find(s => bg <= s[0])[1]; return num(`Sliding scale (regular insulin): 0–150 = 0 units; 151–200 = 2 units; 201–250 = 4 units; 251–300 = 6 units; 301–350 = 8 units; over 350 = 10 units and call the provider. The blood glucose is ${bg} mg/dL. How many units?`, u, { unit: 'units', explain: `${bg} falls in the range for ${u} units.` }); },
    () => { const mlh = pick([2, 3, 4, 5, 6, 8]), conc = 1; return num(`An insulin drip has 100 units regular insulin in 100 mL NS. It runs at ${mlh} mL/hr. How many units/hr is the patient getting?`, mlh * conc, { unit: 'units/hr', explain: `100 units/100 mL = 1 unit/mL; ${mlh} mL/hr × 1 = ${mlh} units/hr.` }); },
    () => { const uh = pick([3, 5, 7, 10]); return num(`An insulin drip has 50 units regular insulin in 250 mL NS. The order is ${uh} units/hr. What is the rate in mL/hr?`, uh / 0.2, { unit: 'mL/hr', explain: `50/250 = 0.2 unit/mL; ${uh} ÷ 0.2 = ${uh / 0.2} mL/hr.` }); },
    () => mc('Which insulin is rapid-acting?', 'Lispro (Humalog)', ['Glargine (Lantus)', 'NPH (Humulin N)', 'Detemir (Levemir)'], 'Lispro, aspart, and glulisine are rapid-acting. Glargine and detemir are long-acting.'),
    () => mc('Which insulin is usually used for a continuous IV insulin drip?', 'Regular insulin', ['NPH', 'Glargine', '70/30 mix'], 'IV drips use regular insulin. Cloudy (NPH), mixed, and long-acting insulins are never given IV.'),
    () => mc('A U-100 insulin syringe holds 100 units in:', '1 mL', ['100 mL', '10 mL', '0.1 mL'], 'U-100 means 100 units per mL.'),
    () => { const u = pick([15, 25, 35, 40]); return mc(`For a dose of ${u} units, which syringe is the best choice?`, u <= 30 ? '0.3 mL (30-unit) syringe' : '0.5 mL (50-unit) syringe', [u <= 30 ? '1 mL (100-unit) syringe' : '0.3 mL (30-unit) syringe', '3 mL syringe', 'Tuberculin syringe'], 'Use the smallest insulin syringe that holds the dose, for accuracy.'); }
  ];

  // ---------- Unit 5: IV, heparin, critical care, weight-based ----------
  const ivSol = [
    () => { const p = pick([5, 10]), v = pick([500, 1000, 250]); return num(`How many grams of dextrose are in ${v} mL of D${p}W?`, p * v / 100, { unit: 'g', explain: `${p} g/100 mL × ${v} mL = ${p * v / 100} g.` }); },
    () => { const v = pick([500, 1000]); return num(`How many grams of NaCl are in ${v} mL of 0.9% NaCl (normal saline)?`, 0.9 * v / 100, { unit: 'g', explain: `0.9 g/100 mL × ${v} = ${fmt(0.9 * v / 100)} g.` }); },
    () => mc('Normal saline (NS) is:', '0.9% sodium chloride', ['0.45% sodium chloride', '5% dextrose in water', 'Lactated Ringer\'s'], '½NS = 0.45% NaCl.'),
    () => mc('Which IV solution is isotonic?', '0.9% NaCl', ['0.45% NaCl', 'D10W', '3% NaCl'], 'NS and LR are isotonic. 0.45% is hypotonic. D10W and 3% are hypertonic.'),
    () => mc('D5½NS contains:', '5% dextrose and 0.45% sodium chloride', ['5% dextrose and 0.9% NaCl', '0.5% dextrose', '5% sodium chloride'], '½NS = 0.45% NaCl.'),
    () => mc('A microdrip (minidrip) IV set delivers:', '60 gtt/mL', ['10 gtt/mL', '15 gtt/mL', '20 gtt/mL'], 'Macrodrip sets are 10, 15, or 20 gtt/mL. Microdrip is always 60.'),
    () => mc('An electronic infusion pump is programmed in:', 'mL/hr', ['gtt/min', 'mg/kg', 'units/mL'], 'Pumps run in mL/hr. Gravity tubing is counted in gtt/min.'),
    () => mc('A secondary (piggyback) IV bag is hung:', 'Higher than the primary bag', ['Lower than the primary bag', 'At the same height', 'Below the patient'], 'The higher bag runs first.'),
    () => mc('Signs of IV infiltration include:', 'Cool, pale, swollen skin at the site', ['Red, warm streak up the vein', 'Fever only', 'Bradycardia'], 'Infiltration: cool, pale, puffy. Phlebitis: red, warm, tender.'),
    () => mc('Lactated Ringer\'s solution contains:', 'Sodium, potassium, calcium, chloride, and lactate', ['Only dextrose', 'Only sodium chloride', 'Albumin'], 'LR is a balanced isotonic electrolyte solution.')
  ];

  const ivCalc = [
    () => { const v = pick([500, 1000, 250, 100]), h = pick([2, 4, 6, 8, 10, 12]); return num(`Infuse ${v} mL over ${h} hours by pump. What rate in mL/hr?`, v / h, { places: 0, unit: 'mL/hr', explain: `${v} ÷ ${h} = ${fmt(v / h)} mL/hr.` }); },
    () => { const v = pick([1000, 500]), h = pick([6, 8, 10, 12]), df = pick([10, 15, 20]); return num(`Infuse ${v} mL over ${h} hours. Drop factor ${df} gtt/mL. How many gtt/min?`, v * df / (h * 60), { places: 0, unit: 'gtt/min', explain: `(${v} × ${df}) ÷ (${h} × 60) = ${fmt(v * df / (h * 60))} gtt/min.` }); },
    () => { const v = pick([50, 100, 250]), m = pick([20, 30, 45, 60]), df = pick([10, 15, 20, 60]); return num(`Infuse ${v} mL over ${m} minutes. Drop factor ${df} gtt/mL. How many gtt/min?`, v * df / m, { places: 0, unit: 'gtt/min', explain: `(${v} × ${df}) ÷ ${m} = ${fmt(v * df / m)} gtt/min.` }); },
    () => { const v = pick([50, 100]), m = pick([20, 30, 45]); return num(`An IV piggyback of ${v} mL is to run over ${m} minutes on a pump. What rate in mL/hr?`, v / m * 60, { places: 0, unit: 'mL/hr', explain: `(${v} ÷ ${m}) × 60 = ${fmt(v / m * 60)} mL/hr.` }); },
    () => { const v = pick([1000, 500, 250]), r = pick([75, 100, 125, 150, 50]), t = v / r; return num(`${v} mL is running at ${r} mL/hr. How many hours will it take?`, t, { places: 1, unit: 'hr', explain: `${v} ÷ ${r} = ${fmt(t)} hours.` }); },
    () => { const r = pick([75, 100, 125, 150]), h = pick([3, 4, 6, 8]); return num(`An IV runs at ${r} mL/hr. How many mL will infuse in ${h} hours?`, r * h, { unit: 'mL', explain: `${r} × ${h} = ${r * h} mL.` }); },
    () => { const mlh = pick([60, 90, 120, 100]); return num(`With a microdrip set (60 gtt/mL), an order for ${mlh} mL/hr runs at how many gtt/min?`, mlh, { unit: 'gtt/min', explain: 'With a 60 gtt/mL set, gtt/min = mL/hr.' }); },
    () => { const gtt = pick([21, 25, 31, 42]), df = pick([15, 20, 10]); return num(`A gravity IV is running at ${gtt} gtt/min with a ${df} gtt/mL set. What is the rate in mL/hr?`, gtt * 60 / df, { places: 0, unit: 'mL/hr', explain: `(${gtt} × 60) ÷ ${df} = ${fmt(gtt * 60 / df)} mL/hr.` }); }
  ];

  const heparin = [
    () => { const bag = pick([[25000, 500], [25000, 250], [20000, 500]]), mlh = pick([10, 12, 15, 18, 20]), c = bag[0] / bag[1]; return num(`Heparin ${bag[0].toLocaleString()} units in ${bag[1]} mL D5W is running at ${mlh} mL/hr. How many units/hr is the patient getting?`, mlh * c, { unit: 'units/hr', explain: `${bag[0].toLocaleString()}/${bag[1]} = ${c} units/mL; × ${mlh} mL/hr = ${mlh * c} units/hr.` }); },
    () => { const bag = pick([[25000, 500], [25000, 250]]), uh = pick([800, 1000, 1200, 1500, 900]), c = bag[0] / bag[1]; return num(`Order: heparin ${uh.toLocaleString()} units/hr IV. Available: ${bag[0].toLocaleString()} units in ${bag[1]} mL. What rate in mL/hr?`, uh / c, { places: 1, unit: 'mL/hr', explain: `${c} units/mL; ${uh} ÷ ${c} = ${fmt(uh / c)} mL/hr.` }); },
    () => { const kg = R(55, 120), b = 80; return num(`Weight-based heparin protocol: bolus ${b} units/kg. The patient weighs ${kg} kg. What is the bolus dose in units?`, kg * b, { unit: 'units', explain: `${kg} × ${b} = ${(kg * b).toLocaleString()} units.` }); },
    () => { const kg = R(55, 110), rate = 18, c = 50; return num(`Heparin protocol: start at ${rate} units/kg/hr. The patient weighs ${kg} kg. The bag is 25,000 units in 500 mL. What is the rate in mL/hr?`, kg * rate / c, { places: 1, unit: 'mL/hr', explain: `${kg} × ${rate} = ${kg * rate} units/hr; ÷ 50 units/mL = ${fmt(kg * rate / c)} mL/hr.` }); },
    () => { const lb = R(130, 250), kg = rnd(lb / 2.2, 1); return num(`A ${lb} lb patient gets a heparin bolus of 80 units/kg. How many units? (Round kg to tenths first.)`, kg * 80, { places: 0, unit: 'units', tol: 5, explain: `${lb} ÷ 2.2 = ${kg} kg; × 80 = ${fmt(kg * 80)} units.` }); },
    () => { const o = pick([5000, 7500, 2500]), h = pick([5000, 10000]); return num(`Order: heparin ${o.toLocaleString()} units subcut q12h. Available: ${h.toLocaleString()} units/mL. How many mL?`, o / h, { places: 2, unit: 'mL', explain: `${o.toLocaleString()} ÷ ${h.toLocaleString()} = ${fmt(o / h)} mL.` }); },
    () => mc('The lab test most often used to adjust an IV heparin drip is:', 'aPTT (or anti-Xa)', ['INR', 'Hemoglobin A1c', 'BUN'], 'aPTT or anti-Xa is used for heparin. INR is used for warfarin.'),
    () => mc('The antidote for heparin is:', 'Protamine sulfate', ['Vitamin K', 'Naloxone', 'Flumazenil'], 'Vitamin K reverses warfarin.')
  ];

  const critical = [
    () => { const kg = R(50, 110), mcg = pick([3, 5, 8, 10]), c = 400 * 1000 / 250; return num(`Dopamine 400 mg in 250 mL D5W. Order: ${mcg} mcg/kg/min. Weight ${kg} kg. What rate in mL/hr?`, mcg * kg * 60 / c, { places: 1, unit: 'mL/hr', tol: 0.1, explain: `Concentration = 400,000 mcg ÷ 250 mL = 1,600 mcg/mL. ${mcg} × ${kg} × 60 = ${mcg * kg * 60} mcg/hr; ÷ 1,600 = ${fmt(mcg * kg * 60 / c)} mL/hr.` }); },
    () => { const mgmin = pick([1, 2, 3, 4]); return num(`Lidocaine 2 g in 500 mL D5W. Order: ${mgmin} mg/min. What rate in mL/hr?`, mgmin * 60 / 4, { unit: 'mL/hr', explain: `2,000 mg ÷ 500 mL = 4 mg/mL. ${mgmin} × 60 = ${mgmin * 60} mg/hr; ÷ 4 = ${mgmin * 15} mL/hr.` }); },
    () => { const mlh = pick([15, 20, 30, 45]), c = 400 * 1000 / 250; return num(`Dopamine 400 mg in 250 mL is running at ${mlh} mL/hr. How many mcg/min is the patient getting?`, mlh * c / 60, { places: 1, unit: 'mcg/min', explain: `1,600 mcg/mL × ${mlh} mL/hr = ${mlh * c} mcg/hr; ÷ 60 = ${fmt(mlh * c / 60)} mcg/min.` }); },
    () => { const kg = R(60, 100), mlh = pick([10, 15, 20, 25]), c = 1600; return num(`Dobutamine 400 mg in 250 mL runs at ${mlh} mL/hr. The patient weighs ${kg} kg. How many mcg/kg/min?`, mlh * c / 60 / kg, { places: 1, unit: 'mcg/kg/min', tol: 0.1, explain: `${mlh} × 1,600 = ${mlh * c} mcg/hr; ÷ 60 = ${fmt(mlh * c / 60)} mcg/min; ÷ ${kg} kg = ${fmt(mlh * c / 60 / kg)} mcg/kg/min.` }); },
    () => { const mcgmin = pick([2, 4, 5, 8, 10]); return num(`Norepinephrine 4 mg in 250 mL. Order: ${mcgmin} mcg/min. What rate in mL/hr?`, mcgmin * 60 / 16, { places: 1, unit: 'mL/hr', explain: `4,000 mcg ÷ 250 mL = 16 mcg/mL. ${mcgmin} × 60 = ${mcgmin * 60} mcg/hr; ÷ 16 = ${fmt(mcgmin * 60 / 16)} mL/hr.` }); },
    () => { const mcgmin = pick([5, 10, 20, 30]); return num(`Nitroglycerin 50 mg in 250 mL. Order: ${mcgmin} mcg/min. What rate in mL/hr?`, mcgmin * 60 / 200, { places: 1, unit: 'mL/hr', explain: `50,000 mcg ÷ 250 = 200 mcg/mL. ${mcgmin} × 60 ÷ 200 = ${fmt(mcgmin * 60 / 200)} mL/hr.` }); },
    () => { const from = pick([5, 10]), step = 5, to = from + step * R(1, 3); return num(`Nitroglycerin 50 mg/250 mL is at ${from} mcg/min. Titrate up by ${step} mcg/min to ${to} mcg/min. What is the new rate in mL/hr?`, to * 60 / 200, { places: 1, unit: 'mL/hr', explain: `${to} × 60 ÷ 200 mcg/mL = ${fmt(to * 60 / 200)} mL/hr.` }); },
    () => { const mgh = pick([2, 4, 6]), c = pick([[100, 100], [50, 250]]); return num(`Diltiazem ${c[0]} mg in ${c[1]} mL. Order: ${mgh} mg/hr. What rate in mL/hr?`, mgh * c[1] / c[0], { places: 1, unit: 'mL/hr', explain: `${c[0]}/${c[1]} = ${fmt(c[0] / c[1])} mg/mL; ${mgh} ÷ ${fmt(c[0] / c[1])} = ${fmt(mgh * c[1] / c[0])} mL/hr.` }); }
  ];

  const bsa = (cm, kg) => Math.sqrt(cm * kg / 3600);
  const weight = [
    lbkg,
    () => { const kg = rnd(R(80, 400) / 10, 1), per = pick([10, 15, 20, 5]); return num(`Order: ${per} mg/kg PO. The child weighs ${kg} kg. What is the dose in mg?`, kg * per, { places: 1, unit: 'mg', explain: `${kg} × ${per} = ${fmt(kg * per)} mg.` }); },
    () => { const lb = R(18, 70), kg = lb / 2.2, per = pick([10, 15]), mg = kg * per; return num(`Acetaminophen ${per} mg/kg is ordered for a child who weighs ${lb} lb. How many mg? (Use the unrounded kg.)`, mg, { places: 1, unit: 'mg', tol: 0.5, explain: `${lb} ÷ 2.2 = ${fmt(kg)} kg; × ${per} = ${fmt(mg)} mg.` }); },
    () => { const kg = R(10, 30), lo = 25, hi = 50, n = 3, dose = pick([100, 150, 200, 250, 300, 400, 500]), dLo = kg * lo / n, dHi = kg * hi / n, safe = dose >= dLo - 0.5 && dose <= dHi + 0.5; return mc(`Safe range: ${lo}–${hi} mg/kg/day divided q8h. The child weighs ${kg} kg. The order is ${dose} mg q8h. Is the dose safe?`, safe ? 'Yes, it is within the safe range' : (dose > dHi ? 'No, it is too high' : 'No, it is too low'), ['Yes, it is within the safe range', 'No, it is too high', 'No, it is too low'].filter(x => x !== (safe ? 'Yes, it is within the safe range' : (dose > dHi ? 'No, it is too high' : 'No, it is too low'))), `Per day: ${kg * lo}–${kg * hi} mg. Per dose (÷ 3): ${fmt(dLo)}–${fmt(dHi)} mg. The order is ${dose} mg.`); },
    () => { const cm = R(90, 180), kg = R(15, 90); return num(`Find the BSA (m²) for a patient ${cm} cm tall who weighs ${kg} kg.  BSA = √(cm × kg ÷ 3600)`, bsa(cm, kg), { places: 2, unit: 'm²', tol: 0.01, explain: `√(${cm} × ${kg} ÷ 3600) = √${fmt(cm * kg / 3600)} = ${fmt(bsa(cm, kg))} m².` }); },
    () => { const b = rnd(R(60, 200) / 100, 2), per = pick([100, 250, 50, 75]); return num(`Order: ${per} mg/m². The patient's BSA is ${b} m². What is the dose in mg?`, b * per, { places: 1, unit: 'mg', explain: `${b} × ${per} = ${fmt(b * per)} mg.` }); },
    () => { const kg = R(8, 25), per = pick([5, 10]), conc = pick([100, 160, 200]), mg = kg * per; return num(`Order: ${per} mg/kg for a ${kg} kg child. Available: ${conc} mg/5 mL. How many mL?`, mg / conc * 5, { places: 1, unit: 'mL', explain: `${kg} × ${per} = ${mg} mg; ${mg}/${conc} × 5 = ${fmt(mg / conc * 5)} mL.` }); },
    () => { const kg = R(60, 100), per = pick([1, 1.5, 0.5]), conc = 10; return num(`Enoxaparin ${per} mg/kg subcut is ordered for a ${kg} kg adult. Available: 100 mg/mL. How many mL?`, kg * per / 100, { places: 2, unit: 'mL', explain: `${kg} × ${per} = ${fmt(kg * per)} mg; ÷ 100 mg/mL = ${fmt(kg * per / 100)} mL.` }); },
    () => { const kg = R(5, 20), per = 100; return num(`Maintenance fluids for the first 10 kg are 100 mL/kg/day. How many mL/day for a ${Math.min(kg, 10)} kg infant?`, Math.min(kg, 10) * per, { unit: 'mL/day', explain: `${Math.min(kg, 10)} × 100 = ${Math.min(kg, 10) * 100} mL/day.` }); }
  ];

  // ---------- Lessons ----------
  const L = (points, example, steps) => ({ points, example, steps });
  const MODULES = [
    { id: 'pre', unit: 1, kind: 'test', title: 'Unit One Pre-Test', from: ['m1', 'm2', 'm3', 'm4'], count: 20,
      blurb: 'See what you already know before starting the math review. Twenty questions on fractions, decimals, ratio and proportion, and percentages.' },
    { id: 'm1', unit: 1, ch: 1, title: 'Fractions', gens: fractions, lesson: L([
      'A fraction is a part of a whole: <b>numerator</b> (top) ÷ <b>denominator</b> (bottom).',
      '<b>Reduce</b> by dividing the top and bottom by the same number until no common factor is left.',
      '<b>Add or subtract</b>: find a common denominator first, then add or subtract the numerators.',
      '<b>Multiply</b>: multiply the tops and the bottoms. <b>Divide</b>: flip the second fraction and multiply.',
      'Mixed number ↔ improper fraction: 2 ¾ = (2 × 4 + 3)/4 = 11/4.'
    ], 'Add ⅓ + ¼.', ['Common denominator is 12.', '⅓ = 4/12 and ¼ = 3/12.', '4/12 + 3/12 = <b>7/12</b>.']) },
    { id: 'm2', unit: 1, ch: 2, title: 'Decimals', gens: decimals, lesson: L([
      'Line up the decimal points to add or subtract.',
      'To multiply, count the total decimal places in both numbers and put that many in the answer.',
      'To divide, move the point in the divisor to make it a whole number, and move the dividend\'s point the same number of places.',
      'Rounding: look one place to the right. 5 or more rounds up.',
      '<b>Safety:</b> always use a <b>leading zero</b> (0.5 mg) and <b>never a trailing zero</b> (5 mg, not 5.0 mg).'
    ], 'Give 0.25 mg using 0.125 mg tablets.', ['0.25 ÷ 0.125', 'Move both points 3 places: 250 ÷ 125', '= <b>2 tablets</b>']) },
    { id: 'm3', unit: 1, ch: 3, title: 'Ratio and Proportion', gens: ratio, lesson: L([
      'A ratio compares two numbers: 1 : 4 is read "1 to 4" and is the same as ¼.',
      'A proportion says two ratios are equal: a : b = c : d.',
      '<b>Means and extremes</b>: the product of the means (b × c) equals the product of the extremes (a × d).',
      'As fractions, cross-multiply: a/b = c/x → a·x = b·c.',
      'Keep the units in the same order on both sides (mg : mL = mg : mL).'
    ], 'You have 250 mg in 5 mL. Give 375 mg.', ['250 mg : 5 mL = 375 mg : x mL', '250x = 1,875', 'x = <b>7.5 mL</b>']) },
    { id: 'm4', unit: 1, ch: 4, title: 'Percentages', gens: percent, lesson: L([
      'Percent means "per 100": 25% = 25/100 = 0.25.',
      'Percent → decimal: move the point 2 places left. Decimal → percent: move it 2 places right.',
      'Percent of a number: change the percent to a decimal and multiply.',
      'In solutions, % = grams per 100 mL. D5W has 5 g dextrose per 100 mL.',
      'What percent is A of B? (A ÷ B) × 100.'
    ], 'How many grams of dextrose are in 1,000 mL of D5W?', ['5% = 5 g per 100 mL', '5 × (1,000 ÷ 100)', '= <b>50 g</b>']) },
    { id: 'post', unit: 1, kind: 'test', title: 'Unit One Post-Test', from: ['m1', 'm2', 'm3', 'm4'], count: 20,
      blurb: 'Show what you learned in Unit One. Twenty new questions on fractions, decimals, ratio and proportion, and percentages.' },

    { id: 'm5', unit: 2, ch: 5, title: 'Metric System', gens: metric, lesson: L([
      'Base units: <b>gram</b> (weight), <b>liter</b> (volume), <b>meter</b> (length).',
      '1 kg = 1,000 g · 1 g = 1,000 mg · 1 mg = 1,000 mcg · 1 L = 1,000 mL.',
      'Bigger unit → smaller unit: multiply (move the point right). Smaller → bigger: divide (move the point left).',
      'Write the number first, then the abbreviation: 0.5 mg. Use decimals, not fractions.',
      'Write <b>mcg</b>, not µg.'
    ], '0.4 mg = ? mcg', ['mg → mcg is big → small, so multiply by 1,000.', '0.4 × 1,000', '= <b>400 mcg</b>']) },
    { id: 'm6', unit: 2, ch: 6, title: 'Apothecary and Household Systems and Additional Measures', gens: apothecary, lesson: L([
      '1 tsp = 5 mL · 1 tbsp = 15 mL = 3 tsp · 1 oz = 30 mL = 2 tbsp · 1 cup = 8 oz = 240 mL.',
      'Apothecary grains are rarely used. When you see them, gr 1 = 60 mg (some labels use 65 mg).',
      '<b>Units</b> (insulin, heparin) and <b>milliequivalents (mEq)</b> (electrolytes) measure strength, not weight.',
      'Teach families to use an oral syringe or dosing cup, not kitchen spoons.'
    ], '1½ oz = ? mL', ['1 oz = 30 mL', '1.5 × 30', '= <b>45 mL</b>']) },
    { id: 'm7', unit: 2, ch: 7, title: 'Converting Within and Between Systems', gens: converting, lesson: L([
      'Know the key equivalents: 1 kg = 2.2 lb · 1 in = 2.54 cm · 1 oz = 30 mL · 1 tsp = 5 mL.',
      'Set up a ratio and proportion, or multiply by a conversion factor so the unwanted units cancel.',
      'lb → kg: divide by 2.2. kg → lb: multiply by 2.2.',
      'For multi-step conversions (g → mg → mcg), go one step at a time.'
    ], 'A patient weighs 165 lb. Weight in kg?', ['165 lb × (1 kg / 2.2 lb)', '= 75', '= <b>75 kg</b>']) },
    { id: 'm8', unit: 2, ch: 8, title: 'Additional Conversions Useful in the Health Care Setting', gens: additional, lesson: L([
      '°F → °C: (°F − 32) ÷ 1.8. °C → °F: (°C × 1.8) + 32.',
      'Military time uses 4 digits and no AM/PM. For 1 PM to 11 PM, add 12 (3:15 PM = 1515). Midnight is 0000.',
      'Intake and output (I&O) are recorded in mL. Change oz and cups to mL before adding.',
      'Height: inches × 2.54 = cm.'
    ], 'Convert 101.3°F to °C.', ['101.3 − 32 = 69.3', '69.3 ÷ 1.8', '= <b>38.5°C</b>']) },

    { id: 'm9', unit: 3, ch: 9, title: 'Medication Administration', bank: bank9, lesson: L([
      'The rights: right <b>patient, drug, dose, route, time, documentation</b>, plus right reason and right response.',
      'Use two identifiers (name and date of birth). Check the label three times.',
      'Routes include PO, SL, buccal, IM, subcut, ID, IV, topical, transdermal, inhalation, and rectal.',
      'Do not crush enteric-coated or extended-release forms.',
      'If an error happens, assess the patient first, then notify the provider and report it.'
    ], 'Which of these is NOT a right of medication administration: right route, right brand, right time?', ['Route and time are rights.', 'Brand is not; generic substitution is common.', 'Answer: <b>right brand</b>.']) },
    { id: 'm10', unit: 3, ch: 10, title: 'Understanding and Interpreting Medication Orders', bank: bank10, gens: ordersGen, lesson: L([
      'A complete order has the patient\'s name, date and time, drug, dose, route, frequency, and the prescriber\'s signature.',
      'Common abbreviations: bid (2×/day), tid (3×), qid (4×), q4h (every 4 hours), prn (as needed), stat (now), ac/pc (before/after meals), NPO.',
      'Do-Not-Use list: U, IU, QD, QOD, trailing zeros, a missing leading zero, MS/MSO₄/MgSO₄.',
      'Doses per day for "q_h" orders: 24 ÷ hours.',
      'Clarify any order that is incomplete, unclear, or unsafe before giving it.'
    ], 'How many doses per day is "q6h"?', ['24 hours ÷ 6', '= <b>4 doses</b>']) },
    { id: 'm11', unit: 3, ch: 11, title: 'Medication Administration Records and Drug Distribution Systems', bank: bank11, lesson: L([
      'The MAR (or eMAR) lists each drug, dose, route, and time. It is checked against the original order.',
      'Document right after giving a dose, never before. Record the reason for any held or refused dose.',
      'For prn drugs, document the reason and the response.',
      'Distribution systems: unit dose, stock supply, and automated dispensing cabinets.',
      'Controlled substances: count at shift change, and have a witness for waste.'
    ], 'When do you chart a scheduled dose?', ['After you give it.', 'Never before.', 'Answer: <b>right after giving it</b>.']) },
    { id: 'm12', unit: 3, ch: 12, title: 'Reading Medication Labels', gens: labelsGen, lesson: L([
      'Find the <b>brand</b> name (capitalized, ®) and the <b>generic</b> name (lowercase).',
      'The <b>dosage strength</b> is the amount of drug per tablet or per mL (for example 250 mg/5 mL).',
      'Also check the form, total volume or count, route, expiration date, and storage or mixing directions.',
      'Labels in this module are made up for practice.'
    ], 'A label reads 125 mg/5 mL, 200 mL. How many mg are in the bottle?', ['125 mg ÷ 5 mL = 25 mg/mL', '25 × 200', '= <b>5,000 mg</b>']) },
    { id: 'm13', unit: 3, ch: 13, title: 'Dosage Calculation Using the Ratio and Proportion Method', gens: methodGens('rp'), lesson: L([
      'Set up: <b>known (have)</b> = <b>desired (want)</b>.',
      'H : Q = D : x, where H = dose on hand, Q = the quantity it comes in, D = desired dose.',
      'Make sure the units match before you set up the proportion (convert first).',
      'Solve: H·x = Q·D, then x = Q·D ÷ H.'
    ], 'Order: 75 mg. Have: 50 mg/mL.', ['50 mg : 1 mL = 75 mg : x mL', '50x = 75', 'x = <b>1.5 mL</b>']) },
    { id: 'm14', unit: 3, ch: 14, title: 'Dosage Calculation Using the Formula Method', gens: methodGens('formula'), lesson: L([
      'Formula: <b>D/H × Q = x</b>',
      'D = desired dose (ordered), H = have (on hand), Q = quantity (the tablet or mL it comes in).',
      'D and H must be in the same unit. Convert first.',
      'Check that the answer makes sense: you rarely give more than 3 tablets or 3 mL IM.'
    ], 'Order: 0.5 g. Have: 250 mg tablets.', ['0.5 g = 500 mg', '500/250 × 1 tab', '= <b>2 tablets</b>']) },
    { id: 'm15', unit: 3, ch: 15, title: 'Dosage Calculation Using the Dimensional Analysis Method', gens: methodGens('da'), lesson: L([
      'Start with the unit you want (x mL or x tab) on the left.',
      'Line up fractions so each unwanted unit cancels: top of one, bottom of the next.',
      'Put conversion factors right in the setup (1 g/1,000 mg, 1 kg/2.2 lb).',
      'Multiply across the tops, divide by the bottoms.'
    ], 'Order: 250 mcg. Have: 0.5 mg/2 mL.', ['x mL = 2 mL/0.5 mg × 1 mg/1,000 mcg × 250 mcg', '= 500/500', '= <b>1 mL</b>']) },

    { id: 'm16', unit: 4, ch: 16, title: 'Oral Medications', gens: oral, lesson: L([
      'Forms: tablets (scored, enteric-coated, extended-release), capsules, and liquids (solutions, suspensions, elixirs).',
      'Only cut scored tablets. Never crush EC/ER. Shake suspensions before measuring.',
      'Read liquids at the bottom of the meniscus, at eye level. Use an oral syringe for small amounts.',
      'Usual max: about 3 tablets per dose. Recheck if your answer is more.'
    ], 'Order: 375 mg. Have: 250 mg/5 mL.', ['375/250 × 5 mL', '= <b>7.5 mL</b>']) },
    { id: 'm17', unit: 4, ch: 17, title: 'Parenteral Medications', gens: parenteral, lesson: L([
      'Parenteral = injection: ID, subcut, IM, IV.',
      'Round to the tenth for doses of 1 mL or more. Round to the hundredth (1 mL syringe) for doses under 1 mL.',
      'Pick the smallest syringe that holds the dose.',
      'Usual IM volumes: deltoid ≤ 1 mL, ventrogluteal/vastus lateralis up to 3 mL in adults.',
      'Solution percent: 1% = 10 mg/mL.'
    ], 'Order: heparin 5,000 units. Have: 10,000 units/mL.', ['5,000/10,000 × 1 mL', '= <b>0.5 mL</b>']) },
    { id: 'm18', unit: 4, ch: 18, title: 'Reconstitution of Solutions', gens: recon, lesson: L([
      'Powders are mixed with a diluent (sterile water, NS, or bacteriostatic water) as the label directs.',
      'The label gives the volume to add and the <b>concentration</b> it makes (for example 250 mg/mL).',
      'Then use D/H × Q with the new concentration.',
      'Label multi-dose vials with the date, time, concentration, and your initials, and follow the storage directions.'
    ], 'Add 4.8 mL to make 100 mg/mL. Order: 250 mg.', ['250/100 × 1 mL', '= <b>2.5 mL</b>']) },
    { id: 'm19', unit: 4, ch: 19, title: 'Insulin', gens: insulin, lesson: L([
      'U-100 insulin = 100 units/mL. Use the matching insulin syringe (30, 50, or 100 units).',
      'Rapid-acting: lispro, aspart. Short: regular. Intermediate: NPH. Long: glargine, detemir.',
      'Mixing: draw <b>clear (regular) before cloudy (NPH)</b>. Total = regular + NPH units.',
      'IV insulin drips use regular insulin. Never give cloudy (NPH), mixed, or long-acting insulin IV. Sliding scales give units based on blood glucose.',
      'Drip: units/hr = mL/hr × units per mL.'
    ], 'Regular 8 units + NPH 22 units.', ['Draw regular first (8 units).', 'Then NPH to 8 + 22.', 'Total = <b>30 units</b>']) },

    { id: 'm20', unit: 5, ch: 20, title: 'Intravenous Solutions and Equipment', gens: ivSol, lesson: L([
      'Solution names: D = dextrose, W = water, NS = 0.9% NaCl, ½NS = 0.45% NaCl, LR = lactated Ringer\'s.',
      '% = grams per 100 mL: 1,000 mL D5W has 50 g dextrose.',
      'Isotonic: NS, LR (and D5W in the bag). Hypotonic: 0.45% NaCl. Hypertonic: D10W, 3% NaCl, D5NS.',
      'Tubing: macrodrip 10/15/20 gtt/mL, microdrip 60 gtt/mL. Pumps run in mL/hr.',
      'Watch the site for infiltration (cool, pale, swollen) and phlebitis (red, warm, tender).'
    ], 'Grams of NaCl in 500 mL NS?', ['0.9 g per 100 mL', '0.9 × 5', '= <b>4.5 g</b>']) },
    { id: 'm21', unit: 5, ch: 21, title: 'Intravenous Calculations', gens: ivCalc, lesson: L([
      'Pump rate: <b>mL/hr = total mL ÷ hours</b>.',
      'Gravity drip: <b>gtt/min = (mL × drop factor) ÷ minutes</b>.',
      'Infusion time: hours = mL ÷ mL/hr.',
      'With a microdrip set (60 gtt/mL), gtt/min = mL/hr.',
      'Round gtt/min and pump rates to whole numbers unless the pump allows tenths.'
    ], '1,000 mL over 8 hr, drop factor 15.', ['(1,000 × 15) ÷ (8 × 60)', '= 15,000 ÷ 480', '= 31.25 → <b>31 gtt/min</b>']) },
    { id: 'm22', unit: 5, ch: 22, title: 'Heparin Calculations', gens: heparin, lesson: L([
      'Find the concentration: units ÷ mL (25,000 units/500 mL = 50 units/mL).',
      'units/hr = mL/hr × units/mL. mL/hr = units/hr ÷ units/mL.',
      'Weight-based: bolus (for example 80 units/kg) and infusion (for example 18 units/kg/hr). Use kg.',
      'Adjust using aPTT or anti-Xa per protocol. The antidote is protamine sulfate.',
      'Heparin is a high-alert drug: get an independent double-check.'
    ], 'Order 1,000 units/hr; bag 25,000 units/500 mL.', ['50 units/mL', '1,000 ÷ 50', '= <b>20 mL/hr</b>']) },
    { id: 'm23', unit: 5, ch: 23, title: 'Critical Care Calculations', gens: critical, lesson: L([
      'Get the concentration in the units of the order (mg → mcg if the order is in mcg).',
      'mcg/min → mL/hr: (mcg/min × 60) ÷ mcg/mL.',
      'mcg/kg/min → mL/hr: (mcg × kg × 60) ÷ mcg/mL.',
      'mL/hr → dose: work backward. (mL/hr × concentration) ÷ 60 (÷ kg).',
      'Titrate in steps per protocol, and recalculate the rate for each new dose.'
    ], 'Dopamine 400 mg/250 mL, 5 mcg/kg/min, 80 kg.', ['400,000 ÷ 250 = 1,600 mcg/mL', '5 × 80 × 60 = 24,000 mcg/hr', '24,000 ÷ 1,600 = <b>15 mL/hr</b>']) },
    { id: 'm24', unit: 5, ch: 24, title: 'Pediatric and Adult Dosage Calculations Based on Weight', gens: weight, lesson: L([
      'Change lb to kg first (÷ 2.2).',
      'Dose = mg/kg × kg. For "per day" ranges, divide by the number of doses to get the per-dose range.',
      'Safe dose check: compare the ordered dose with the safe range. If it is outside the range, hold it and call the prescriber.',
      'BSA (m²) = √(height cm × weight kg ÷ 3600). Dose = dose per m² × BSA.',
      'Then use D/H × Q to find the volume.'
    ], 'Child 22 lb; 15 mg/kg; have 160 mg/5 mL.', ['22 ÷ 2.2 = 10 kg', '10 × 15 = 150 mg', '150/160 × 5 = <b>4.7 mL</b>']) }
  ];

  const UNITS = {
    1: 'Unit One · Math Review',
    2: 'Unit Two · Systems of Measurement',
    3: 'Unit Three · Methods of Administration and Calculation',
    4: 'Unit Four · Oral and Parenteral Dosage Forms and Insulin',
    5: 'Unit Five · IV, Heparin, Critical Care, and Weight-Based Calculations'
  };

  const byId = id => MODULES.find(m => m.id === id);

  // Build a fresh test: a mix of every question type in the chapter, then filled with more.
  function buildTest(id) {
    const m = byId(id);
    if (m.from) {
      const per = Math.ceil(m.count / m.from.length);
      return shuffle(m.from.flatMap(f => buildFrom(byId(f), per))).slice(0, m.count);
    }
    return buildFrom(m, m.count || 10);
  }
  function buildFrom(m, n) {
    let pool = [];
    if (m.bank) pool = pool.concat(shuffle(m.bank).map(bankItem));
    const gens = m.gens ? shuffle(m.gens) : [];
    const out = [], seen = new Set();
    // Bank items once each; generators round-robin.
    const bankCount = m.bank ? Math.min(pool.length, m.gens ? n - Math.min(m.gens.length, 2) : n) : 0;
    for (let i = 0; i < bankCount; i++) out.push(pool[i]());
    let g = 0, guard = 0;
    while (out.length < n && gens.length && guard++ < 200) {
      const q = gens[g++ % gens.length]();
      if (seen.has(q.q)) continue;
      seen.add(q.q); out.push(q);
    }
    return shuffle(out).slice(0, n);
  }

  // Grading. Accepts "7.5", "7.5 mL", "1,500", fractions like "3/4" and mixed numbers like "1 1/2".
  function parseNum(s) {
    s = String(s || '').trim().replace(/,/g, '');
    const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)\b/);
    if (mixed) return +mixed[1] + (+mixed[2] / +mixed[3]);
    const f = s.match(/^(-?\d+)\s*\/\s*(\d+)\b/);
    if (f) return +f[2] ? +f[1] / +f[2] : NaN;
    const n = s.match(/^-?(\d+\.?\d*|\.\d+)/);
    return n ? parseFloat(n[0]) : NaN;
  }
  function parseFrac(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) return { n: +m[1] * +m[3] + +m[2], d: +m[3], mixed: true, part: [+m[2], +m[3]] };
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return { n: +m[1], d: +m[2] };
    m = s.match(/^(\d+)$/);
    if (m) return { n: +m[1], d: 1 };
    return null;
  }
  function check(q, given) {
    if (given == null || String(given).trim() === '') return false;
    if (q.type === 'mc') return given === q.answer;
    if (q.type === 'frac') {
      const p = parseFrac(given);
      if (!p || !p.d) return false;
      if (p.n * q.d !== q.n * p.d) return false;
      // Must be in lowest terms (the fraction part, for a mixed number).
      const part = p.mixed ? p.part : [p.n, p.d];
      return gcd(part[0], part[1]) === 1 || part[1] === 1;
    }
    const v = parseNum(given);
    if (isNaN(v)) return false;
    return Math.abs(v - q.answer) <= (q.tol || 0) + 1e-6 * Math.max(1, Math.abs(q.answer));
  }

  window.MedMath = { MODULES, UNITS, byId, buildTest, check, parseNum };
})();
