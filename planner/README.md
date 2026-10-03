# Planner

A calendar, task list, daily notes and document library in one app. It works offline and syncs between phone and computer.

- **Today**:
  - what's on today, plus past-due tasks
  - a notes box for the day
  - the next 7 days
  - a quick-add box that reads dates and times ("Dentist friday 3pm", "Band trip 10/23 to 10/25")
- **Calendar**: a month grid showing everything:
  - planner events
  - Google, Outlook and iCloud calendars
  - band volunteer events from Band Volunteers
  - bills and paydays from Money
- **Tasks**: lists (Home, Band, Booth…), due dates, ❗ important, repeating tasks.
- **Files**: upload documents or photos into folders and attach them to an event or task. Files are private to the account.
- **Calendars**: paste a calendar's private iCal link. The `planner-ics` function fetches it, because browsers can't read those links directly. Repeating events, skipped dates and moved dates are handled.
- **Feed**: `planner-feed` serves the planner as an iCal feed behind a secret key, so Google, Outlook or an iPhone can subscribe to it.
- **Add to calendar**: each event has Add to Google / Outlook / .ics buttons.

Sign in with the same login as the Booth Tracker. Data lives in the `planner_*` tables and the private `planner` storage bucket. The two Supabase Edge Functions' source is in `functions/`.
