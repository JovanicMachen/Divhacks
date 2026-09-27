# Campus Connect — frontend

Next.js (App Router) + TypeScript + Tailwind v4 app showing what's happening on
Columbia's campus on an interactive map, plus a Supabase-backed account area.

## Run locally

```bash
cd frontend
npm install
npm run dev -- -p 43127
```

Open http://127.0.0.1:43127.

## Supabase

The app uses one browser client (`src/lib/supabase/client.ts`) configured from
public env vars in `frontend/.env.local` (never commit this file):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
# optional, defaults to "avatars"
NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET=avatars
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted in place of the publishable key.
Only the public key is used; there is no service-role access.

Without these variables the account area runs in **local preview**: sign-in,
profile edits, and photos are kept in this browser's localStorage so the flow
can be exercised, and the UI says so.

### Database

`/profile` and `/profile/edit` read and write `public.profiles` (keyed by the
auth user's UUID). The columns they need, a username format check, a unique
username index, RLS policies, and the public `avatars` Storage bucket are in
`supabase/migrations/20260926120000_profile_account_fields.sql`. The migration is
additive (`add column if not exists`, no drops or renames) — review it, then run
it in the Supabase SQL editor or with `supabase db push`.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Campus map, event drawer, search, filters, Post Event |
| `/events/[id]` | Map with that event open |
| `/profile` | Profile header, stats, and Posted / Attending / Saved tabs (`?tab=`) |
| `/profile/edit` | Edit photo, display name, username, bio, website, university |
| `/settings` | Account settings placeholder and sign out |
