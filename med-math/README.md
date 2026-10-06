# Med Math Practice

Dosage-calculation practice for nursing students, following the book's 24 chapters (plus the Unit One pre-test and post-test).

- **Students** open `index.html`: https://sescobar1.github.io/booth-tracker/med-math/
  Each chapter has a short **lesson** (key points + a worked example), a **practice drill** with new numbers every time (graded on the spot with explanations, not sent anywhere), and a **test** that hands the grade in to the instructor. No account needed: they type their name, class, and the **class code**.
- **The instructor** opens `teacher.html` and signs in with the Booth Tracker email and password:
  - **Best scores**: one row per student, one column per chapter, with each student's best score. Tap a score to see their answers.
  - **Every submission**: date, student, chapter, score, and time taken. Filter by class, chapter, or student. **Download CSV** for a gradebook.
  - **Test bank**: every question with its answer key. Untick a question to leave it out of tests.
  - **Class code**: change the code each term, and choose whether students see the right answers after they hand in a test.

## How tests work

Tests come from the publisher's test bank, stored in the private `med_math_bank` table. The questions and answer keys are **never in this repository or the public page**. A student gets 10 random questions for a chapter (20 for the pre-test and post-test, drawn from Chapters 1–4), or every question if the chapter has fewer. The test is graded inside the database (`med_math_turn_in`), so the answer key isn't sent to the browser until the test is handed in. Grades go into `med_math_grades`, which only the instructor account can read.

Chapter 12 (Reading Medication Labels) has no usable bank questions (they all need label pictures), so its test uses generated label questions instead (`questions.js`).

Accepted answers: `7.5`, `7.5 mL`, `1,500`, `1/2` for 0.5, and fractions like `3/8` or `1 1/2` (fraction answers must be in lowest terms).

## Setup (already done for this site)

1. In Supabase, **SQL Editor → New query**: run `supabase-setup.sql`, then `supabase-bank.sql`.
2. Load the test bank (keep the zip and the SQL it makes out of this repo; `.gitignore` blocks the usual names):

       python3 -I med-math/tools/import-bank.py TestBank.zip YOUR-ACCOUNT-ID > bank.sql

   Paste `bank.sql` into the SQL Editor and run it. Running it again updates questions without making duplicates.
3. Set the class code on `teacher.html` → **Class code**.

The import skips the bank's Module 1 (Roman numerals, not in the book's table of contents), questions that need a picture, and "select all that apply" and essay questions. Bank Module 2 (Fractions) becomes Chapter 1, and so on through Module 25, which becomes Chapter 24. Four questions with wrong answer keys in the publisher's file were turned off; you can see them unticked under **Test bank**.

Files: `index.html` + `app.js` (students), `teacher.html` + `teacher.js` (gradebook), `questions.js` (lessons and practice-question generators), `config.js` (Supabase project, instructor account, passing score), `app.css`.
