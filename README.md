# Booth Tracker

A simple, browser-based tracker for booth purchases, market sales, and restocking. It starts with September 2026 data and saves additions in your browser.

## Use

Open the site, add purchases as you buy inventory, and review the restock list before your next booth refresh.

## Data

- `profit-worksheet-data.json` holds every expense and sold item from the Profit Worksheet, grouped by month (September 2025 – December 2026).
- `relic-inventory-2026-10-02.csv` holds the current Relic inventory.

## Booths and inventory

- Use the **Booth editor** tab to move every line with the same item name (across all months, sold and purchased) to a booth in one step.
- On **Purchases** and **Sold items**, filter the list (for example "squish"), tick the rows or use the select-all box, pick a booth, and click **Assign selected**.
- Purchases are added to **Overall inventory** automatically (uncheck the box for rent, supplies, and fees). **Store inventory** shows what is listed in your Relic store.

## Item documents

Use the **Item documents** tab (or the **Docs** column on the Inventory tab) to attach receipts, invoices, photos, or tags to any item. Files are stored in this browser.
