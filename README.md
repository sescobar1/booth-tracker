# Booth Tracker

A phone-first tracker for booth sales, purchases, rent, inventory, and restocking. Data is saved on the device you use it on.

## Install it on your phone

Open the site in Safari (iPhone) or Chrome (Android), then choose **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android). It opens full screen and works without signal.

## Everyday use

- **Home** shows this month's numbers, a to-do list (this week's trips, Relic import, backup, restock), and booth performance.
- Tap **+ Sold item**, **+ Purchase**, or the round **+** button to add something in seconds. The booth is picked for you from the item name, and you can snap a receipt photo with a purchase.
- **Import & backup → Import from Relic**: upload the Relic sales export (CSV or Excel). Sales go into the right month and booth, and sales already in the tracker are skipped. Upload the Relic inventory export to refresh your store inventory.
- **Restock** lists repeat sellers that are out or running low, and slow movers sitting 60+ days without a sale.
- **Work** logs your shifts (date, hours, pay) and shows work income by month and year, including the shifts from your worksheet.
- **Miles** logs scheduled trips automatically (Relic store Sun/Wed/Fri, Price Break Tue/Sat, St. Joe's in Conway Fri). Tap **Didn't go** to remove a day. **My places** (Goodwill, Marva's, Dardanelle, Atkins, or your own) log with one tap; each trip shows estimated gas cost (set your MPG and gas price under **Your car**) and the tax deduction; edit miles or add trips under **Edit my regular trips**.
- **Purchases** show unit cost and a sell price (2× unit cost by default). Type over any sell price to set your own; it carries into overall and store inventory, where prices are editable too.
- **Amazon** (More → Amazon orders) logs things you order for the booth with order number and invoice; they count as purchases.
- **Cookie costs** (More) figures cost per batch and per cookie for no-bake and chocolate chip cookies (16 per batch), profit after Relic's fee, and how many cover the FC rent. Edit ingredient prices to match your receipts; **I baked a batch** adds the batch cost to this month's purchases.
- **This week** (More → This week): the next 7 days at a glance (trips, cookie pull dates, tax due dates) with **Add to my calendar**, and a weekly recap of sales, top sellers, booths, miles, and what sold out. The recap shows on To do each Sunday.
- **Baking plan** (Cookie costs): how many batches to bake from the last 4 weeks of cookie sales and fresh cookies still out, plus a shareable Walmart shopping list.
- **Thrift run list** (Restock): sold-out and hot-selling items to look for, with your own additions and a share button.
- **Pricing helper**: typing an item in any purchase or sale form shows what it usually sells for, how fast, and what to pay to double your money.
- **Holiday prep** (More): this season's key dates (Halloween, Thanksgiving, Black Friday, Small Business Saturday, Christmas) with prep tips, plus last October–December's best sellers and how many to have ready.
- **What if…** (More): try dropping a booth, changing prices or cookie price, or changing trips per week, and see the change in monthly take-home.
- **Taxes** shows business profit for taxes (sales, purchases, rent, IRS mileage deduction), what to set aside, quarterly estimated payment dates with a Paid column, and a CSV for your tax preparer.
- **Receipts**: tap **📷 Snap a receipt** on Purchases, or the 📷 on any purchase line (even past months), to save a receipt photo with it.
- **Price tags**: Inventory → **Print price tags** prints Avery 5160 labels (30 per sheet) with item, price, booth, and SKU.
- **Reports** also has a booth report card and sales by day of the week; Home shows profit after gas and a monthly profit goal.
- **Reports** has year totals by booth and month (including the mileage deduction), best sellers per booth, and a CSV download or printable summary for taxes.
- **Booth editor** moves every line with the same item name to a booth in one step. On **Purchases** and **Sold items**, tick rows and use **Assign selected** for one month.

## Back up your data

Everything lives on the device you use, so back up regularly: **Import & backup → Back up now**, then save the file to Files or Google Drive. **Restore from a backup** loads it on any phone or computer.

## Data files

- `profit-worksheet-data.json`: every expense and sold item from the Profit Worksheet by month, with booths.
- `relic-inventory-2026-10-02.csv`: the starting Relic inventory.

## Sharing with a friend (blank starter)

- `config.js` holds this copy's settings: owner, booths and rent, towns, regular trips, recipes, and booth rules.
- `starter/` is a blank copy with a welcome setup; share `https://sescobar1.github.io/booth-tracker/starter/guide.html`. It saves to its own storage, so it never sees this copy's data.
- `booth-tracker-starter.zip` is a kit a friend can upload to their own GitHub Pages site (steps are in the guide).
- After changing `index.html`, `mobile.js`, `mobile.css`, or `sw.js`, run `python3 tools/build-starter.py` to rebuild the starter and kit.

## Sync between devices (Supabase)

Everything saves on the device first, so the app works without signal. To keep a phone and a
computer in sync, connect a free [Supabase](https://supabase.com) project:

1. Create a project at supabase.com.
2. In the project, open **SQL Editor → New query**, paste `supabase-setup.sql`, and tap **Run**.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
4. In the app, go to **More → Import & backup → Sync between devices**, paste both, and tap **Connect**
   (or put them in `sync` in `config.js` so every device is connected already).
5. Tap **Create account**, confirm the email, then **Sign in** with the same email and password on each device.

Changes appear on the other devices within a couple of seconds. Receipt photos stay on the device they were taken on.
The anon key is meant to be public; Row Level Security keeps each person's data private to their sign-in.

## Selling smarts

**More → Selling smarts** (or **🔍 Should I buy it?** on the dashboard):

- **Should I buy?** Type what you found and the price. It shows what similar items sold for at your booths, how fast they sell, how many you already have in the store, the most to pay to double your money, and a Buy / Maybe / Pass call, plus links to eBay, Mercari, Facebook Marketplace and Google prices.
- **Photo lookup:** take a photo or choose one from the camera roll, then open it in Google Lens to see what it is and what it sells for.
- **Best price:** what you've paid before (price each, with bulk lots set aside), prices you've saved at other stores, and links that open Google Shopping, Walmart, Amazon, Temu, AliExpress, eBay, Dollar Tree and Facebook Marketplace sorted cheapest first.
- **Aging stock:** store items by days since they were listed (30 / 60 / 90+), with a suggested markdown for each.
- **Price check:** items that sell fast enough to charge more, and items priced above what they usually sell for.
- **Markdowns:** every price drop (from these tools, the Inventory page, or a lower price in a new store inventory upload) and whether the item sold afterward.
