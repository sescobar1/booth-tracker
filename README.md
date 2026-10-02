# Booth Tracker

A phone-first tracker for booth sales, purchases, rent, inventory, and restocking. Data is saved on the device you use it on.

## Install it on your phone

Open the site in Safari (iPhone) or Chrome (Android), then choose **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android). It opens full screen and works without signal.

## Everyday use

- **Home** shows this month's numbers, a to-do list (this week's trips, Relic import, backup, restock), and booth performance.
- Tap **+ Sold item**, **+ Purchase**, or the round **+** button to add something in seconds. The booth is picked for you from the item name, and you can snap a receipt photo with a purchase.
- **Import & backup → Import from Relic**: upload the Relic sales export (CSV or Excel). Sales go into the right month and booth, and sales already in the tracker are skipped. Upload the Relic inventory export to refresh your store inventory.
- **Restock** lists repeat sellers that are out or running low, and slow movers sitting 60+ days without a sale.
- **Mileage** has your regular trips (Relic store in Sherwood 3×/week, Price Break 2×/week, Conway 1×/week). Tap **Log trip** to log the round trip; edit miles or add trips under **Edit my regular trips**.
- **Purchases** show unit cost and a sell price (2× unit cost by default). Type over any sell price to set your own; it carries into overall and store inventory, where prices are editable too.
- **Reports** has year totals by booth and month (including the mileage deduction), best sellers per booth, and a CSV download or printable summary for taxes.
- **Booth editor** moves every line with the same item name to a booth in one step. On **Purchases** and **Sold items**, tick rows and use **Assign selected** for one month.

## Back up your data

Everything lives on the device you use, so back up regularly: **Import & backup → Back up now**, then save the file to Files or Google Drive. **Restore from a backup** loads it on any phone or computer.

## Data files

- `profit-worksheet-data.json`: every expense and sold item from the Profit Worksheet by month, with booths.
- `relic-inventory-2026-10-02.csv`: the starting Relic inventory.
