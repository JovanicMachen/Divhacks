# Campus Connect — backend

This folder is the database. It is SQL you run in your Supabase project. Nothing here is a server you start, and nothing here is imported by the web app.

The web app talks to Supabase directly from the browser, using the public key in `frontend/.env.local`. See [`frontend/README.md`](../frontend/README.md).

## Which files to run

Paste each file into the Supabase SQL editor and run it once. Every file only adds things; none drops or renames a table or column.

**The live Campus Connect database** (it already has an `events` table):

1. [`20260926120000_profile_account_fields.sql`](supabase/migrations/20260926120000_profile_account_fields.sql) — Profile columns, profile security rules, and the public `avatars` bucket.
2. [`20260926220000_events_live_schema_compat.sql`](supabase/migrations/20260926220000_events_live_schema_compat.sql) — Adds the event columns the app needs to the existing tables, fills `source` for existing rows, and limits posting, editing and deleting to the owner of a student event. Going and Saved rows stay with the user who made them. It stops without changing anything if `events` already has a column that means the same thing as one it would add. The last result table lists what it changed and any **ACTION NEEDED** rows.

3. [`20260926230000_notifications.sql`](supabase/migrations/20260926230000_notifications.sql) — Creates `notifications`, one row per user per notification. Each user can only read, mark read, and remove their own. A per-user `dedupe_key` stops the same notification being created twice, and the table is added to realtime so it syncs across that user's devices.

4. [`20260926240000_event_photos.sql`](supabase/migrations/20260926240000_event_photos.sql) — Adds `events.image_url` for an optional cover photo, and a check that the URL points inside the poster's own `event-images/<user id>/<event id>/` folder. It stops without changing anything if file 2 hasn't run yet or if `events` already has a photo-like column. It does not touch the `event-images` bucket or its policies.

Do not run `20260926200000_events_ownership.sql` on the live database. It is for a brand-new database with no `events` table.

**A brand-new database** (no `events` table yet): run `120000`, then `200000`, then `220000`, then `230000`, then `240000`. The `event-images` bucket and its folder policies are set up in the Supabase dashboard, not by these files.

Official campus listings are not stored here. They ship with the frontend and cannot be deleted by a student account.
