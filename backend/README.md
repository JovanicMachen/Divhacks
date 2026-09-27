# Campus Connect — backend

This folder is the database. It is SQL you run in your Supabase project. Nothing here is a server you start, and nothing here is imported by the web app.

The web app talks to Supabase directly from the browser, using the public key in `frontend/.env.local`. See [`frontend/README.md`](../frontend/README.md).

## Which files to run

Paste each file into the Supabase SQL editor and run it once. Every file only adds things; none drops or renames a table or column.

**The live Campus Connect database** (it already has an `events` table):

1. [`20260926120000_profile_account_fields.sql`](supabase/migrations/20260926120000_profile_account_fields.sql) — Profile columns, profile security rules, and the public `avatars` bucket.
2. [`20260926221000_events_live_schema_compat_v2.sql`](supabase/migrations/20260926221000_events_live_schema_compat_v2.sql) — Reuses the live `start_time`, `end_time`, `latitude` and `longitude` columns and adds only `source`, `location_id` and `host_name`. It fills `source` for existing rows and limits posting, editing and deleting to the owner of a student event. Going and Saved rows stay with the user who made them. It stops without changing anything if `events` also has `starts_at`, `ends_at`, `lat` or `lng`. The last result table lists what it changed and any **ACTION NEEDED** rows.

3. [`20260926230000_notifications.sql`](supabase/migrations/20260926230000_notifications.sql) — Creates `notifications`, one row per user per notification. Each user can only read, mark read, and remove their own. A per-user `dedupe_key` stops the same notification being created twice, and the table is added to realtime so it syncs across that user's devices.

4. [`20260926240000_event_photos.sql`](supabase/migrations/20260926240000_event_photos.sql) — Adds `events.image_url` for an optional cover photo, and a check that the URL points inside the poster's own `event-images/<user id>/<event id>/` folder. It stops without changing anything if file 2 hasn't run yet or if `events` already has a photo-like column. It does not touch the `event-images` bucket or its policies.

5. [`20260927001000_campus_feedback.sql`](supabase/migrations/20260927001000_campus_feedback.sql) — Creates `campus_feedback` so a student can share an Ask Gemini answer with everyone else who is signed in. Each person can only add or remove their own note. The table is added to realtime.

6. [`20260927010000_event_status_and_chat.sql`](supabase/migrations/20260927010000_event_status_and_chat.sql) — Lets an organizer cancel their event without deleting it, and gives every event a live chat room.
   - `events` gains `status` (`active`, `abandoned` or `ended`; every existing row starts `active`), `abandoned_at` (set by the database clock), and `pinned_message_id` (one organizer message pinned in the chat).
   - Only the owner of a student event can cancel it, a cancelled event can't be restored, and official listings can't be cancelled.
   - Creates `event_messages`. Signed-in users can read any event's chat and post as themselves while the event is active and before `end_time`. Authors can soft-delete their own messages, and nobody can edit or hard-delete them.
   - Deleted text moves to `event_message_deletions`, which no client can read.
   - `event_messages` is added to realtime.
   - It stops without changing anything if `events` already has a status-like or pinned-message-like column it didn't create.

7. [`20260927020000_rallies_organizations.sql`](supabase/migrations/20260927020000_rallies_organizations.sql) — Adds Rallies, organization accounts and informational paid events without changing `events.status`.
   - Rally columns on `events`:
     - `event_type` (`event` or `rally`)
     - `rally_status` (`forming`, `active` or `expired`)
     - `rally_min_participants` (2–20) and `rally_expires_at` (2–15 minutes)
     - `rally_anonymous`
     - `rally_participant_count` and `rally_activated_at`, which only the database sets
   - Organization and price columns on `events`: `organization_event` (set by the database from the poster's profile), `is_paid` and `price_display`.
   - `profiles` gains `is_org` and `org_verified_at`. Only the server can set them; a trigger ignores them in normal profile edits.
   - New table `rally_participants`: one row per person per Rally. You can only add or remove your own row, and only while the Rally is open. The database counts rows, switches a Rally to `active` when it reaches its minimum, and `expire_rallies()` marks unfilled ones `expired`. The creator joins automatically.
   - New table `admin_event_actions`: a private log of the demo admin override.
   - If `pg_cron` is enabled, Rallies are also expired every minute on the server.

8. [`20260927030000_going_and_chat_access.sql`](supabase/migrations/20260927030000_going_and_chat_access.sql) — Stores I'm Going in a new `event_going` table so the database can check it.
   - One row per person per event. `event_id` is text so official listings can be joined too.
   - Each person can only see, add and remove their own rows, and can only add while the event is open.
   - Adds a restrictive rule on `event_messages`: a message can only be posted by someone going to the event, its organizer, or someone who joined its Rally.
   - Going reaches the same person's other devices through realtime.

Do not run `20260926200000_events_ownership.sql` on the live database. It is for a brand-new database with no `events` table.

**A brand-new database** (no `events` table yet): run `120000`, then `200000`, then `221000`, then `230000`, then `240000`, then `27001000`, then `27010000`, then `27020000`, then `27030000`. The `event-images` bucket and its folder policies are set up in the Supabase dashboard, not by these files.

Official campus listings are not stored here. They ship with the frontend and cannot be deleted by a student account.
