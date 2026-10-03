# Money

A check register, bank statement matching, and tax papers in one app. It works offline and syncs between phone and computer.

- **Register**: add an expense or income in a few taps. A payee you've used before fills in its category. Tap ✓ to mark an entry cleared. Shows your balance, cleared total and running balance.
- **Spending**: totals by category and month by month. Transfers between your own accounts are left out.
- **Bank**: upload the bank's CSV, Excel or OFX download. Lines are matched to the register by amount and date, allowing for rounded-up amounts (within $1), and get marked cleared. You can add lines the bank has that the register doesn't with one tap. Register entries that haven't reached the bank yet are listed.
- **Taxes**: a yearly checklist of papers to gather (upload each one), receipts, and deduction totals from entries marked for taxes. Download a CSV or print a summary for your tax preparer.
- **Import**: brings in a CheckBook app export. Running it again skips entries that are already there.

Sign in with the same login as the Booth Tracker. Data lives in the `money_*` tables. Files go in the private `money` storage bucket, where each person can only open their own folder.
