# Campus Connect — backend

This folder is the database. It is SQL you run in your Supabase project. Nothing here is a server you start, and nothing here is imported by the web app.

The web app talks to Supabase directly from the browser, using the public key in `frontend/.env.local`. See [`frontend/README.md`](../frontend/README.md).

## Run these two files, in this order

In the Supabase SQL editor, paste and run each file once. Both are safe to run again: they only add tables, columns, and policies, and they never drop or rename anything.

1. [`supabase/migrations/20260926120000_profile_account_fields.sql`](supabase/migrations/20260926120000_profile_account_fields.sql) — Adds the profile columns the account pages read and write (`display_name`, `username`, `bio`, `website`, `university`, `avatar_url`), keeps each user limited to their own row, and creates the public `avatars` storage bucket.

2. [`supabase/migrations/20260926200000_events_ownership.sql`](supabase/migrations/20260926200000_events_ownership.sql) — Creates `events`, `event_attendees`, and `saved_events`, so signed-in users can read events but can only create or delete their own student events, and Going and Saved rows belong to the user who made them.

Official campus listings are not stored here. They ship with the frontend and cannot be deleted by a student account.
