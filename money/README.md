# Money

A check register, bank statement matching, and tax papers in one app. It works offline and syncs between phone and computer.

- **Register**: add an expense or income in a few taps. A payee you've used before fills in its category. Tap ✓ to mark an entry cleared. Shows your balance, cleared total and running balance.
- **Two balances**: 🏦 Bank shows what has cleared, at the bank's exact amounts, so it matches the available balance. 📒 Register includes pending entries and your rounding.
- **Rounding**: when the bank fills in an amount, bills over 5¢ round up to the next dollar and deposits round down. The exact bank amount is kept too. You can change this in More.
- **Recurring**: monthly bills and deposits, added on the 1st or another day you choose. Suggested from your register and bank history, with a "Coming up" list and the balance after it.
- **Categories**: entries are sorted automatically by name. Change one and the app offers to change the rest with that name, and remembers it.
- **Spending & reports**: a ring chart by category, month-by-month bars, any date range grouped by category, payee or month. Download as CSV or print. Transfers between your own accounts are left out.
- **Siri**: an iPhone Shortcut opens `#add?type=expense&amt=12.50&payee=Sonic` to add an entry by voice (steps under More → Siri).
- **Bank**: upload the bank's CSV, Excel or OFX download. Lines are matched to the register by amount and date, allowing for rounded-up amounts (within $1), and get marked cleared. You can add lines the bank has that the register doesn't with one tap. Register entries that haven't reached the bank yet are listed.
- **Taxes**: a yearly checklist of papers to gather (upload each one), receipts, and deduction totals from entries marked for taxes. Download a CSV or print a summary for your tax preparer.
- **Import**: brings in a CheckBook app export. Running it again skips entries that are already there.

Sign in with the same login as the Booth Tracker. Data lives in the `money_*` tables. Files go in the private `money` storage bucket, where each person can only open their own folder.
