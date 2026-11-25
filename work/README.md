# Cecilia's Work Clock

- `clock.html?t=…` is Cecilia's page: a big Clock in / Clock out button, a live timer and pay so far, and her pay register (read only). The `t` is her Planner family link token; the page remembers it, so the home-screen icon works.
- `index.html` is Mom's page (same sign-in as Money and the Planner): clock her in or out, add **Spent** (something bought for her), **Cash** (money handed to her) or **Bonus**, fix or delete any shift or entry, add a forgotten shift, and share her link.
- Pay is $10 an hour (`config.js` → `rate`; each shift keeps its own rate, editable per shift).
- Data: Supabase tables `work_shifts` and `work_register` (private to Mom's account), plus `work_info` / `work_clock` functions that only work with the family link.
