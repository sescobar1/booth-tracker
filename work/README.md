# Cecilia's Work Clock

One page on Mom's phone (`index.html`, same sign-in as Money and the Planner):
- Big **Clock in / Clock out** button for Cecilia, with a live timer and pay so far ($10 an hour; `config.js` → `rate`, and each shift keeps its own rate).
- Totals (Earned, Spent, Available) and a check register: finished shifts are deposits, **Spent** (something bought for her) and **Cash** (money handed to her) come off, **Bonus** adds.
- Tap any line to fix or delete it; add a shift she forgot to clock.
- Data: Supabase tables `work_shifts` and `work_register`, private to Mom's account.
