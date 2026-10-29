// Grocery helpers shared by hub pages (copied from planner/app.js so lists match the Planner).
const AISLES = [
  ['Produce', /lettuce|tomato|onion|garlic|pepper|potato|carrot|celery|banana|apple|berr|grape|lemon|lime|avocado|cilantro|spinach|broccoli|corn|cucumber|fruit|vegetable|salad|mushroom|zucchini|green bean|orange|herb|parsley|jalape/i],
  ['Meat & seafood', /beef|chicken|pork|turkey|sausage|bacon|ham|steak|shrimp|fish|salmon|tuna|ground|hot dog|pepperoni|meat/i],
  ['Dairy & eggs', /milk|cheese|butter|egg|yogurt|cream|sour cream|half.and.half|creamer/i],
  ['Bakery & bread', /bread|bun|tortilla|roll|bagel|muffin|biscuit|croissant|pita/i],
  ['Frozen', /frozen|ice cream|pizza|fries|tater|waffle/i],
  ['Pantry', /rice|pasta|spaghetti|noodle|sauce|bean|soup|broth|stock|flour|sugar|oil|vinegar|spice|seasoning|salt|pepper|cereal|oat|peanut butter|jelly|syrup|can|taco shell|chip|cracker|ketchup|mustard|mayo|dressing|honey|pancake mix|salsa|cookie|snack|granola/i],
  ['Drinks', /water|soda|juice|coffee|tea|gatorade|drink/i],
  ['Household', /paper|towel|toilet|soap|detergent|trash|foil|wrap|bag|dish|cleaner|wipes|shampoo|toothpaste|diaper|napkin|plate|cup/i]
];
// Canned/boxed things are pantry and "garlic bread" is bakery, so those are checked before produce.
const AISLE_CHECK = ['Frozen', 'Bakery & bread', 'Pantry*', 'Meat & seafood', 'Dairy & eggs', 'Produce', 'Pantry', 'Drinks', 'Household'];
const PANTRY_FIRST = /goldfish|crackers?|peanut butter|cream of|\bcans?\b|canned|jar|packets?|box(ed)?|seasoning|sauce|\bmix\b|diced|crushed|dried|broth/i;
function aisleOf(text) {
  for (const a of AISLE_CHECK) {
    if (a === 'Pantry*') { if (PANTRY_FIRST.test(text)) return 'Pantry'; continue; }
    if (AISLES.find(x => x[0] === a)[1].test(text)) return a;
  }
  return 'Other';
}
function ingredientName(line) {
  const t = String(line).replace(/\(.*?\)/g, ' ').trim();
  const name = t.replace(/^[\d\s\/.,½¼¾⅓⅔⅛-]+/, '').replace(/^(cups?|c\.|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|cans?|pkgs?|packages?|packets?|bags?|boxes?|jars?|bunch(es)?|cloves?|heads?|large|small|medium|dozen|slices?|sticks?|bottles?|containers?|pints?|quarts?|gallons?|loaf|loaves)\.?\s+(of\s+)?/i, '').replace(/,.*$/, '').trim();
  return (name || t).charAt(0).toUpperCase() + (name || t).slice(1);
}
const amountOf = line => (String(line).match(/^[\d\s\/.,½¼¾⅓⅔⅛-]+(?:\s*(?:cups?|c\.|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|cans?|pkgs?|packages?|packets?|bags?|boxes?|jars?|bunch(?:es)?|cloves?|heads?|dozen|slices?|sticks?|bottles?|containers?|pints?|quarts?|gallons?|loaf|loaves)\.?)?/i) || [''])[0].trim();
