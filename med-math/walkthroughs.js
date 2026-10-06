// "Watch how to do it" walkthroughs: one worked problem per chapter, played as an animated
// whiteboard with narration (the browser's built-in voice) and captions.
// Each step adds a line to the board (b) and says a sentence (s). A step with only s talks over the board.
window.MedMathVideos = {
  m1: { title: 'Adding and dividing fractions', steps: [
    { b: 'Add:  ⅓ + ¼', s: 'Let\'s add one third and one fourth.' },
    { b: 'Common denominator: 3 × 4 = <b>12</b>', s: 'You can only add fractions with the same bottom number. Twelve works, because both 3 and 4 go into it.' },
    { b: '⅓ = 4/12      ¼ = 3/12', s: 'One third is four twelfths. One fourth is three twelfths.' },
    { b: '4/12 + 3/12 = <b class="ans">7/12</b>', s: 'Add the tops and keep the bottom. The answer is seven twelfths.' },
    { b: 'Divide:  ¾ ÷ ½', s: 'Now let\'s divide three fourths by one half.' },
    { b: '¾ × 2/1 = 6/4', s: 'To divide, flip the second fraction and multiply. Three fourths times two over one is six fourths.' },
    { b: '6/4 = <b class="ans">1 ½</b>', s: 'Reduce it. Six fourths is one and one half.' }
  ] },
  m2: { title: 'Working with decimals', steps: [
    { b: 'Order: 0.25 mg     Have: 0.125 mg tablets', s: 'The order is 0.25 milligrams, and the tablets are 0.125 milligrams each. How many tablets do we give?' },
    { b: '0.25 ÷ 0.125', s: 'Divide what is ordered by what one tablet holds.' },
    { b: '250 ÷ 125', s: 'Move the decimal point three places to the right in both numbers, so we are dividing whole numbers.' },
    { b: '= <b class="ans">2 tablets</b>', s: 'Two hundred fifty divided by one hundred twenty five is two. Give two tablets.' },
    { b: '<span class="bad">.5 mg</span> → <b>0.5 mg</b>      <span class="bad">5.0 mg</span> → <b>5 mg</b>', s: 'Safety rules. Always put a zero before a decimal point, and never put a zero after a whole number. These two rules prevent tenfold dosing errors.' }
  ] },
  m3: { title: 'Solving a proportion', steps: [
    { b: 'Have: 250 mg in 5 mL     Order: 375 mg', s: 'A suspension has 250 milligrams in 5 milliliters. The order is 375 milligrams. How many milliliters?' },
    { b: '250 mg : 5 mL = 375 mg : x mL', s: 'Set up a proportion. Keep the units in the same order on both sides: milligrams to milliliters.' },
    { b: '250 × x = 5 × 375', s: 'Multiply the means and the extremes. The outside numbers multiplied equal the inside numbers multiplied.' },
    { b: '250x = 1,875', s: 'Five times 375 is 1,875.' },
    { b: 'x = 1,875 ÷ 250 = <b class="ans">7.5 mL</b>', s: 'Divide both sides by 250. The answer is 7.5 milliliters.' }
  ] },
  m4: { title: 'Percents in solutions', steps: [
    { b: 'How many grams of dextrose in 1,000 mL of D5W?', s: 'How many grams of dextrose are in a liter of D5W?' },
    { b: '5% = 5 g in every 100 mL', s: 'In a solution, percent means grams per 100 milliliters. Five percent is 5 grams in every 100 milliliters.' },
    { b: '1,000 mL ÷ 100 mL = 10', s: 'A thousand milliliters is ten groups of 100.' },
    { b: '5 g × 10 = <b class="ans">50 g</b>', s: 'Five grams times ten is 50 grams of dextrose.' },
    { b: '25% of 80 → 0.25 × 80 = <b class="ans">20</b>', s: 'To find a percent of any number, change the percent to a decimal and multiply. Twenty five percent of 80 is 20.' }
  ] },
  m5: { title: 'Metric conversions', steps: [
    { b: 'kg → g → mg → mcg     each step × 1,000', s: 'In the metric system, each step between kilograms, grams, milligrams, and micrograms is a thousand.' },
    { b: '0.4 mg = ? mcg', s: 'Let\'s change 0.4 milligrams to micrograms.' },
    { b: 'Big unit → small unit: <b>multiply</b> (move the point right)', s: 'Milligrams are bigger than micrograms, so the number gets bigger. Multiply by a thousand, or move the decimal point three places to the right.' },
    { b: '0.400 → 400.', s: 'Zero point four becomes four hundred.' },
    { b: '0.4 mg = <b class="ans">400 mcg</b>', s: 'So 0.4 milligrams equals 400 micrograms.' },
    { b: '750 mg = 0.75 g', s: 'Going from a small unit to a big unit, divide by a thousand. 750 milligrams is 0.75 grams.' }
  ] },
  m6: { title: 'Household measures', steps: [
    { b: '1 tsp = 5 mL    1 tbsp = 15 mL    1 oz = 30 mL', s: 'Memorize these: one teaspoon is 5 milliliters, one tablespoon is 15, and one ounce is 30.' },
    { b: '1 cup = 8 oz = 240 mL', s: 'One cup is 8 ounces, or 240 milliliters.' },
    { b: '1½ oz = ? mL', s: 'How many milliliters is one and a half ounces?' },
    { b: '1.5 × 30 mL = <b class="ans">45 mL</b>', s: 'Multiply by 30. One and a half ounces is 45 milliliters.' },
    { b: '2 tbsp = 2 × 3 = <b class="ans">6 tsp</b>', s: 'One tablespoon is three teaspoons, so two tablespoons is six teaspoons.' }
  ] },
  m7: { title: 'Converting between systems', steps: [
    { b: 'A patient weighs 165 lb. Weight in kg?', s: 'A patient weighs 165 pounds. What is that in kilograms?' },
    { b: '1 kg = 2.2 lb', s: 'The conversion factor is one kilogram equals 2.2 pounds.' },
    { b: '165 lb × (1 kg / 2.2 lb)', s: 'Multiply by a fraction that puts pounds on the bottom, so pounds cancel out.' },
    { b: '165 ÷ 2.2 = <b class="ans">75 kg</b>', s: 'One sixty five divided by 2.2 is 75 kilograms.' },
    { b: '20 kg × 2.2 = <b class="ans">44 lb</b>', s: 'Going the other way, multiply. Twenty kilograms is 44 pounds.' }
  ] },
  m8: { title: 'Temperature and military time', steps: [
    { b: '°C = (°F − 32) ÷ 1.8', s: 'To change Fahrenheit to Celsius, subtract 32, then divide by 1.8.' },
    { b: '101.3°F → (101.3 − 32) ÷ 1.8 = 69.3 ÷ 1.8', s: 'For 101.3 degrees Fahrenheit, 101.3 minus 32 is 69.3.' },
    { b: '= <b class="ans">38.5°C</b>', s: 'Divide by 1.8 and get 38.5 degrees Celsius.' },
    { b: '3:15 PM → 3 + 12 = <b class="ans">1515</b>', s: 'Military time. For afternoon and evening times, add 12 to the hour. Three fifteen PM is fifteen fifteen.' },
    { b: '12:30 AM → <b class="ans">0030</b>     7:05 AM → <b class="ans">0705</b>', s: 'Midnight hour starts with zero zero. Morning times keep their hour with a leading zero.' }
  ] },
  m9: { title: 'The rights of medication administration', steps: [
    { b: 'Right patient', s: 'Before every medication, check the rights. First, the right patient, using two identifiers like name and date of birth.' },
    { b: 'Right drug · Right dose', s: 'The right drug and the right dose. Compare the label to the order.' },
    { b: 'Right route · Right time', s: 'The right route and the right time.' },
    { b: 'Right documentation', s: 'And right documentation, charted right after you give it.' },
    { b: 'Check the label <b>3 times</b>', s: 'Check the label three times: when you take it out, when you prepare it, and at the bedside.' },
    { b: 'Error? <b class="ans">Assess the patient first</b>', s: 'If an error happens, assess the patient first. Then notify the provider and report it.' }
  ] },
  m10: { title: 'Reading a medication order', steps: [
    { b: 'Metoprolol 25 mg PO bid', s: 'Here is an order: metoprolol 25 milligrams P O, B I D.' },
    { b: 'Drug · Dose · Route · Frequency', s: 'Find each part. The drug is metoprolol. The dose is 25 milligrams. The route is by mouth. The frequency is twice a day.' },
    { b: 'bid = 2×/day   tid = 3×   qid = 4×', s: 'B I D means twice a day, T I D three times, and Q I D four times.' },
    { b: 'q6h → 24 ÷ 6 = <b class="ans">4 doses a day</b>', s: 'For every so many hours, divide 24 by the hours. Every six hours is four doses a day.' },
    { b: '<span class="bad">U</span>  <span class="bad">QD</span>  <span class="bad">5.0</span>  <span class="bad">.5</span>', s: 'Never use these: U for units, Q D, trailing zeros, or a missing leading zero. If an order is unclear, clarify it before giving it.' }
  ] },
  m11: { title: 'Using the MAR', steps: [
    { b: 'MAR = drug · dose · route · times', s: 'The medication administration record lists each drug, dose, route, and the times it is due.' },
    { b: 'Compare MAR ↔ original order', s: 'Always check the MAR against the prescriber\'s order.' },
    { b: 'Scan wristband + scan medication', s: 'With bar code scanning, scan the patient\'s wristband and then the medication.' },
    { b: 'Chart <b>right after</b> giving', s: 'Document right after you give the dose, never before.' },
    { b: 'PRN: reason + response', s: 'For an as-needed drug, chart why you gave it and how the patient responded.' }
  ] },
  m12: { title: 'Reading a medication label', steps: [
    { b: '<span class="lblmini">Amoxil® (amoxicillin) 250 mg/5 mL · 100 mL</span>', s: 'Let\'s read this label.' },
    { b: 'Brand: Amoxil®     Generic: amoxicillin', s: 'The brand name is capitalized with a registered mark. The generic name is lowercase, often in parentheses.' },
    { b: 'Strength: <b>250 mg per 5 mL</b>', s: 'The dosage strength is the amount of drug in each 5 milliliters: 250 milligrams.' },
    { b: 'Total volume: 100 mL', s: 'The bottle holds 100 milliliters in all.' },
    { b: 'Order 500 mg → 500/250 × 5 = <b class="ans">10 mL</b>', s: 'If the order is 500 milligrams, divide 500 by 250 and multiply by 5. Give 10 milliliters.' }
  ] },
  m13: { title: 'Ratio and proportion method', steps: [
    { b: 'Order: 75 mg     Have: 50 mg/mL', s: 'The order is 75 milligrams. We have 50 milligrams per milliliter.' },
    { b: 'Have : Quantity = Desired : x', s: 'Set it up as have is to quantity, as desired is to x.' },
    { b: '50 mg : 1 mL = 75 mg : x mL', s: '50 milligrams is to 1 milliliter as 75 milligrams is to x.' },
    { b: '50x = 75', s: 'Multiply the outside and the inside. Fifty x equals 75.' },
    { b: 'x = <b class="ans">1.5 mL</b>', s: 'Divide by 50. Give 1.5 milliliters.' }
  ] },
  m14: { title: 'Formula method', steps: [
    { b: '<b>D / H × Q = x</b>', s: 'The formula is desired over have, times quantity.' },
    { b: 'Order: 0.5 g     Have: 250 mg tablets', s: 'The order is half a gram, and we have 250 milligram tablets.' },
    { b: '0.5 g = 500 mg', s: 'First, make the units match. Half a gram is 500 milligrams.' },
    { b: '500 / 250 × 1 tablet', s: 'Desired is 500, have is 250, and the quantity is one tablet.' },
    { b: '= <b class="ans">2 tablets</b>', s: 'The answer is two tablets. Check that it makes sense: you rarely give more than three tablets.' }
  ] },
  m15: { title: 'Dimensional analysis', steps: [
    { b: 'Order: 250 mcg     Have: 0.5 mg per 2 mL', s: 'The order is 250 micrograms. We have 0.5 milligrams in 2 milliliters.' },
    { b: 'x mL =', s: 'Start with what you want: x milliliters.' },
    { b: 'x mL = <u>2 mL</u> / 0.5 mg', s: 'Put the drug strength first, with milliliters on top.' },
    { b: '× <u>1 mg</u> / 1,000 mcg × 250 mcg', s: 'Then line up a conversion so milligrams cancel, and end with the order in micrograms.' },
    { b: '= 500 / 500 = <b class="ans">1 mL</b>', s: 'Every unit cancels except milliliters. Multiply the tops, divide by the bottoms. The answer is 1 milliliter.' }
  ] },
  m16: { title: 'Oral medications', steps: [
    { b: 'Order: 375 mg PO     Have: 250 mg / 5 mL', s: 'The order is 375 milligrams by mouth, and the suspension has 250 milligrams in 5 milliliters.' },
    { b: '375 / 250 × 5 mL', s: 'Use desired over have, times quantity.' },
    { b: '= <b class="ans">7.5 mL</b>', s: 'The answer is 7.5 milliliters.' },
    { b: 'Shake suspensions · read at the meniscus', s: 'Shake a suspension first, and read the medicine cup at eye level at the bottom of the curve.' },
    { b: '<span class="bad">Do not crush</span> EC or ER tablets', s: 'Only cut scored tablets, and never crush enteric coated or extended release tablets.' }
  ] },
  m17: { title: 'Parenteral medications', steps: [
    { b: 'Order: heparin 5,000 units subcut', s: 'The order is heparin 5,000 units subcutaneously.' },
    { b: 'Have: 10,000 units/mL', s: 'The vial has 10,000 units per milliliter.' },
    { b: '5,000 / 10,000 × 1 mL = <b class="ans">0.5 mL</b>', s: 'Five thousand over ten thousand, times one milliliter, is 0.5 milliliters.' },
    { b: 'Under 1 mL → hundredths, 1 mL syringe', s: 'Doses under one milliliter are rounded to the hundredth and drawn up in a 1 milliliter syringe.' },
    { b: '1 mL or more → tenths', s: 'Doses of one milliliter or more are rounded to the tenth.' }
  ] },
  m18: { title: 'Reconstituting a powder', steps: [
    { b: 'Vial: 1 g powder. Add 4.8 mL → 200 mg/mL', s: 'The label says to add 4.8 milliliters of diluent to make 200 milligrams per milliliter.' },
    { b: 'Order: 500 mg', s: 'The order is 500 milligrams.' },
    { b: 'Use the <b>new</b> strength: 200 mg/mL', s: 'After mixing, use the concentration the label gives, not the amount of powder.' },
    { b: '500 / 200 × 1 mL = <b class="ans">2.5 mL</b>', s: 'Five hundred over two hundred, times one milliliter, is 2.5 milliliters.' },
    { b: 'Label: date · time · strength · initials', s: 'Label a multi-dose vial with the date, time, strength, and your initials.' }
  ] },
  m19: { title: 'Mixing insulin', steps: [
    { b: 'Order: regular 8 units + NPH 22 units', s: 'The order is 8 units of regular insulin and 22 units of N P H in one syringe.' },
    { b: 'Clear before cloudy', s: 'Remember: clear before cloudy. Draw up the regular insulin first.' },
    { b: 'Draw regular to <b>8</b>', s: 'Draw regular insulin to the 8 unit mark.' },
    { b: 'Add NPH to 8 + 22 = <b class="ans">30 units</b>', s: 'Then draw N P H until the syringe reads 30 units total.' },
    { b: 'U-100 = 100 units per mL', s: 'U 100 insulin has 100 units in each milliliter. Always use a matching insulin syringe.' }
  ] },
  m20: { title: 'IV solutions', steps: [
    { b: 'D = dextrose   W = water   NS = 0.9% NaCl', s: 'In IV fluid names, D is dextrose, W is water, and N S is normal saline, 0.9 percent sodium chloride.' },
    { b: '½NS = 0.45% NaCl', s: 'Half normal saline is 0.45 percent.' },
    { b: 'Grams of NaCl in 500 mL NS?', s: 'How many grams of salt are in 500 milliliters of normal saline?' },
    { b: '0.9 g per 100 mL × 5 = <b class="ans">4.5 g</b>', s: '0.9 grams in every 100 milliliters, times five, is 4.5 grams.' },
    { b: 'Macrodrip 10/15/20 · Microdrip 60 gtt/mL', s: 'Macrodrip tubing gives 10, 15, or 20 drops per milliliter. Microdrip gives 60.' }
  ] },
  m21: { title: 'IV flow rates', steps: [
    { b: 'Pump: mL/hr = mL ÷ hours', s: 'On a pump, milliliters per hour is the total volume divided by the hours.' },
    { b: '1,000 mL over 8 hr = <b class="ans">125 mL/hr</b>', s: 'A thousand milliliters over 8 hours is 125 milliliters per hour.' },
    { b: 'Gravity: gtt/min = mL × drop factor ÷ minutes', s: 'For gravity tubing, multiply the volume by the drop factor, then divide by the minutes.' },
    { b: '1,000 × 15 ÷ (8 × 60) = 15,000 ÷ 480', s: 'With a drop factor of 15: 1,000 times 15 is 15,000. Eight hours is 480 minutes.' },
    { b: '= 31.25 → <b class="ans">31 gtt/min</b>', s: 'That is 31.25, rounded to 31 drops per minute.' }
  ] },
  m22: { title: 'Heparin drips', steps: [
    { b: 'Bag: 25,000 units in 500 mL', s: 'The heparin bag has 25,000 units in 500 milliliters.' },
    { b: '25,000 ÷ 500 = <b>50 units/mL</b>', s: 'First find the concentration: 50 units per milliliter.' },
    { b: 'Order: 1,000 units/hr', s: 'The order is 1,000 units per hour.' },
    { b: '1,000 ÷ 50 = <b class="ans">20 mL/hr</b>', s: 'Divide by the concentration. Set the pump at 20 milliliters per hour.' },
    { b: 'Weight-based: 18 units/kg/hr × 80 kg = 1,440 units/hr', s: 'For a weight based protocol, multiply by kilograms first. 18 units per kilogram for an 80 kilogram patient is 1,440 units per hour.' }
  ] },
  m23: { title: 'Critical care drips', steps: [
    { b: 'Dopamine 400 mg in 250 mL', s: 'Dopamine 400 milligrams in 250 milliliters.' },
    { b: '400,000 mcg ÷ 250 mL = <b>1,600 mcg/mL</b>', s: 'The order will be in micrograms, so change 400 milligrams to 400,000 micrograms. That is 1,600 micrograms per milliliter.' },
    { b: 'Order: 5 mcg/kg/min     Weight: 80 kg', s: 'The order is 5 micrograms per kilogram per minute, for an 80 kilogram patient.' },
    { b: '5 × 80 × 60 = 24,000 mcg/hr', s: 'Five times 80 times 60 minutes is 24,000 micrograms per hour.' },
    { b: '24,000 ÷ 1,600 = <b class="ans">15 mL/hr</b>', s: 'Divide by the concentration. Set the pump at 15 milliliters per hour.' }
  ] },
  m24: { title: 'Weight-based dosing', steps: [
    { b: 'Child: 22 lb     Order: 15 mg/kg', s: 'A child weighs 22 pounds, and the order is 15 milligrams per kilogram.' },
    { b: '22 ÷ 2.2 = <b>10 kg</b>', s: 'Always change pounds to kilograms first. Twenty two divided by 2.2 is 10 kilograms.' },
    { b: '10 kg × 15 mg = <b>150 mg</b>', s: 'Ten kilograms times 15 milligrams is a 150 milligram dose.' },
    { b: 'Have: 160 mg / 5 mL → 150/160 × 5', s: 'The liquid has 160 milligrams in 5 milliliters. Use desired over have, times quantity.' },
    { b: '= <b class="ans">4.7 mL</b>', s: 'The answer is 4.7 milliliters.' },
    { b: 'Safe? Compare to the safe range first', s: 'Before giving it, check the dose against the safe range. If it is outside the range, hold it and call the prescriber.' }
  ] }
};
