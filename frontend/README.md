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

This folder does not contain the database. Profile and event tables live in
[`../backend`](../backend/README.md). Run those two SQL files in the Supabase
SQL editor before sign-in, profiles, or posted events can be stored.

### Auth

Everything except `/login`, `/signup`, and `/reset-password` requires a
session (`src/components/auth/AuthGate.tsx`). Signed-out visitors are sent to
`/login` (with `?next=` for deep links); signed-in visitors hitting `/login` or
`/signup` go to `/`. Sessions are persisted by supabase-js, so a refresh keeps
you signed in. Sign-up passes `display_name` in user metadata for the
`auth.users` → `profiles` trigger; if email confirmation is on, the page asks
the user to check their email instead of signing them in.

Forgot password stays on `/login` and asks Supabase to email a recovery link.
The link returns to `/reset-password` on the current site (the deployed site
in production). After the new password is saved, the session is cleared and
the person signs in again at `/login`.

## Routes

| Route | What it is |
| --- | --- |
| `/login` | Sign in, with a forgot-password link |
| `/signup` | Create an account |
| `/reset-password` | Choose a new password from the reset email link |
| `/` | Campus map, event drawer, search, filters, Post Event, Ask Gemini |
| `/events/[id]` | Map with that event open |
| `/profile` | Profile header, stats, and Posted / Attending / Saved tabs (`?tab=`) |
| `/profile/edit` | Edit photo, display name, username, bio, website, university |
| `/settings` | Account settings placeholder and sign out |

Ask Gemini sits beside the map on a wide screen and as a sheet on a phone. It answers from the events on the map. Set `GEMINI_API_KEY` in `.env.local` (server only) for live Gemini replies. Sharing an answer writes `campus_feedback` so other signed-in students can read it. Run that SQL file from [`../backend`](../backend/README.md).

### Rallies, organizations and demo codes

A Rally is a short-lived post from Post Event → Rally. It needs a minimum number of students (2–20) within a window (2–15 minutes). Joins are real rows in `rally_participants`, and the database counts them. A Rally that fills in time becomes **Rally on**; one that doesn't expires and leaves the map. "Rally anonymously" shows "Anonymous student" to everyone else, while `created_by` still holds the real owner.

Two temporary hackathon codes are checked only on the server. Set them as server environment variables, never with a `NEXT_PUBLIC_` prefix:

| Variable | Used by |
| --- | --- |
| `CAMPUS_ADMIN_EVENT_CODE` | `POST /api/admin/event` — the ••• → Admin Event Action on any stored event (delete or cancel) |
| `CAMPUS_ORG_ACCESS_CODE` | `POST /api/organization` — Settings → Become an Organization |
| `SUPABASE_SERVICE_ROLE_KEY` | Both routes, to change rows after the code is verified |

Leave a code unset to turn that feature off. Failed codes are rate-limited per caller. Admin actions are logged by user, event, action and time, and never with the code.
