# Band Volunteers

One place for Band Boosters volunteers, instead of SignUpGenius for adults and BAND for students.

- **Update from SignUpGenius**: while volunteers keep using SignUpGenius, copy the sign-up page (Select All, Copy) and paste it in. New sign-ups and phone numbers come in, spot counts update, and you choose whether to remove anyone who canceled. Under More → Sign-up page you can also make the Share link and QR code point to SignUpGenius.
- **Sign-up page** (`signup.html`): parents, adults, and students pick a job and sign up with their cell number. Each job shows how many spots are open. Volunteers can add the shift to their calendar and cancel from the same phone.
- **Share**: one link and QR code for the whole season or for one event. Share to BAND, post to the Facebook group, text it, save the QR picture, or print a flyer.
- **Events**: add an event and the jobs you need filled (for example, Concession Stand: 16). **Copy to a new date** sets up the next game in seconds.
- **Text volunteers**: one at a time with their name and job filled in, or as group texts (20 people per group). You don't need to save anyone to your contacts.
- **Check in** on your phone at the event, or print a **sign-in sheet** with the names already filled in and blank lines for walk-ins.
- **People** remembers everyone's number and adds up their hours for the school year. Download a CSV, or save everyone to your phone contacts.

## Setup

Sign in with the same email and password as the Booth Tracker. The data lives in the same Supabase project (tables starting with `vol_`; see `supabase-setup.sql`). The sign-up page only uses the `vol_board`, `vol_signup`, `vol_mine`, and `vol_cancel` functions, which never show phone numbers or emails.
