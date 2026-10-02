// Settings for this copy of Booth Tracker: who it belongs to, their booths, trips and recipes.
// The blank starter copy for friends uses starter/config.js instead.
window.BOOTH_CONFIG = {
  owner: 'Shaana',
  storeName: "Y'allternative Market",       // the store your booths are in
  storeShort: "Y'allternative",            // shorter name for tight spots
  car: { name: '2025 Ford Explorer', mpg: 27 }, // used for gas cost estimates
  // Supabase project for syncing between devices: { url: 'https://xxxx.supabase.co', key: 'anon public key' }.
  // Leave null to type it in on each device under Import & backup -> Sync between devices.
  sync: null,
  storageKey: 'boothMonthlyTracker',      // where this copy saves on the device
  docsDb: 'boothDocuments',               // where receipt photos are saved on the device
  startMonth: '2025-09',                  // first month in the month lists
  endMonth: '2026-12',
  seedData: true,                         // load the Profit Worksheet and Relic inventory files
  smartBooths: true,                      // pick a booth from the item name (rules in index.html)
  autoRent: false,                        // rent already comes from the worksheet lines
  mileageFromJan: true,                   // fill scheduled trips from January 1
  recipeCards: true,                      // show the Print recipe cards button
  setup: false,                           // no welcome setup needed
  booths: [
    { code: 'L19', name: 'Squishies', rent: 80 },
    { code: 'W2', name: 'Handmade cards', rent: 40 },
    { code: 'FC', name: 'Cookies', rent: 20 },
    { code: 'C4', name: 'Clothes & everything else', rent: 400 }
  ],
  cookieBooth: 'FC',
  // Pick a booth from an item name (s is the lowercase name). The fourth booth catches everything else.
  guessBooth(s, BOOTHS) {
    if (/^l19\b/.test(s)) return BOOTHS[0];
    if (/^(w2|s4)\b/.test(s)) return BOOTHS[1];
    if (/^(fc|front counter)\b/.test(s)) return BOOTHS[2];
    if (/^c4\b|booth rent|gallery rent/.test(s)) return BOOTHS[3];
    if (/cookie(?!\s*cutter)|brownie|cupcake|muffin|no[- ]bake/.test(s)) return BOOTHS[2];
    if (/squish|squeez|dumpling|slime|fidget|picky pad|fuggler|surprise box|crochet (animal|cat)|blind box|mystery|stress ball|mochi|\bbutters?\b|capybara|dachshund/.test(s)&&!/butter bell|bronzer/.test(s)) return BOOTHS[0];
    if (/\bcards?\b/.test(s)&&!/credit|skin|wallet|playing|game|go fish|affirmation|date night|sensual|scratch|tarot|deck|score|gift card/.test(s)) return BOOTHS[1];
    return BOOTHS[3];
  },
  // Batches made before the cookie tracker existed, added once.
  seedBatches: [{ recipe: 'nobake', made: '2026-09-30' }, { recipe: 'chocchip', made: '2026-09-30' }],
  towns: [['Russellville', 5], ['Dardanelle', 10], ['Atkins', 15], ['Conway', 46], ['Sherwood', 76]],
  // Bump routesVersion when the trips below change so phones pick up the new schedule once.
  routesVersion: 6,
  // Trip names already in the log that should read differently (old name, new name).
  renameTrips: [['Relic store', "Y'allternative"]],
  // Wednesday store trips stopped in October 2026. Before that they were every other Wednesday,
  // counting back from Sept 30, so only those stay in the log.
  keepPastTrips: [{ route: 'store', days: [3], before: '2026-10-03', everyOtherFrom: '2026-09-30' }],
  routes: [
    { id: 'store', name: "Y'allternative", detail: 'Russellville ⇄ Sherwood', miles: 76, round: true, days: [0] },
    // Fridays: one loop, Russellville → St. Joe's in Conway (46) → Relic in Sherwood (32) → home (76).
    { id: 'storeFri', name: "Y'allternative + St. Joe's", detail: 'Russellville → Conway → Sherwood → home', miles: 154, round: false, days: [5] },
    { id: 'pricebreak', name: 'Price Break', detail: 'Russellville', miles: 5, round: true, days: [2, 6] },
    { id: 'conway', name: "St. Joe's", detail: 'Russellville ⇄ Conway', miles: 46, round: true, days: [] },
    { id: 'goodwill', name: 'Goodwill', detail: 'Russellville', miles: 5, round: true, days: [] },
    { id: 'marvas', name: "Marva's", detail: 'Russellville', miles: 5, round: true, days: [] },
    { id: 'dardanelle', name: 'Dardanelle thrift store', detail: 'Dardanelle', miles: 10, round: true, days: [] },
    { id: 'atkins', name: 'Atkins thrift store', detail: 'Atkins', miles: 15, round: true, days: [] }
  ],
  // Shaana's recipes with Walmart prices: Great Value everything except Jiffy peanut butter.
  recipes: [
    { id: 'nobake', name: 'No-bake cookies', perBatch: 16, packaging: 0, price: 2.00, shelf: 7, ingredients: [
      { name: 'Butter (GV 4 sticks)', pack: 2.89, packAmt: 4, unit: 'sticks', use: 1 },
      { name: 'Cocoa (GV 8 oz)', pack: 5.17, packAmt: 2.67, unit: 'cups', use: 0.25 },
      { name: 'Vanilla (GV, est.)', pack: 4.48, packAmt: 12, unit: 'tsp', use: 1 },
      { name: 'Sugar (GV 4 lb)', pack: 2.97, packAmt: 9, unit: 'cups', use: 2 },
      { name: 'Milk (GV gallon, est.)', pack: 2.88, packAmt: 16, unit: 'cups', use: 0.5 },
      { name: 'Peanut butter (Jiffy 40 oz)', pack: 6.97, packAmt: 4.4, unit: 'cups', use: 1 },
      { name: 'Quick oats (GV 42 oz)', pack: 4.18, packAmt: 14, unit: 'cups', use: 2.25 },
      { name: 'Cellophane bags (100 pk)', pack: 7.64, packAmt: 100, unit: 'bags', use: 16 }
    ] },
    { id: 'chocchip', name: 'Chocolate chip cookies', perBatch: 16, packaging: 0, price: 2.00, shelf: 7, ingredients: [
      { name: 'Butter (GV 4 sticks)', pack: 2.89, packAmt: 4, unit: 'sticks', use: 2 },
      { name: 'White sugar (GV 4 lb)', pack: 2.97, packAmt: 9, unit: 'cups', use: 0.5 },
      { name: 'Brown sugar (GV 2 lb)', pack: 2.34, packAmt: 4.5, unit: 'cups', use: 1 },
      { name: 'Vanilla (GV, est.)', pack: 4.48, packAmt: 12, unit: 'tsp', use: 2 },
      { name: 'Eggs (GV dozen)', pack: 1.67, packAmt: 12, unit: 'eggs', use: 2 },
      { name: 'Flour (GV 5 lb)', pack: 2.38, packAmt: 18, unit: 'cups', use: 3 },
      { name: 'Corn starch (GV 16 oz)', pack: 1.92, packAmt: 168, unit: 'tsp', use: 1 },
      { name: 'Baking soda (GV, est.)', pack: 0.98, packAmt: 94, unit: 'tsp', use: 0.75 },
      { name: 'Salt (GV, est.)', pack: 0.78, packAmt: 123, unit: 'tsp', use: 0.75 },
      { name: 'Chocolate chips (GV 12 oz bag)', pack: 3.86, packAmt: 1, unit: 'bag', use: 1 },
      { name: 'Cellophane bags (100 pk)', pack: 7.64, packAmt: 100, unit: 'bags', use: 16 }
    ] }
  ]
};
