# Campus Connect

Two folders. The app is the frontend. The database is the backend. There is no separate API server.

| Folder | What it is |
| --- | --- |
| [`frontend/`](frontend/) | The Next.js web app: map, events, sign-in, and profile. |
| [`backend/`](backend/) | The Supabase database. SQL files you run by hand, in order. |

The branch to deploy is **`feat/supabase-backend`**. `main` does not contain the app.

## Run locally

```bash
cd frontend
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for routes.

## Deploy so real users share one campus

1. Point the host (Vercel or `npm run build && npm run start`) at **`feat/supabase-backend`**, with the app root set to `frontend/`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the host's environment. The names are in [`frontend/.env.example`](frontend/.env.example). Without them the app runs a browser-only preview and each visitor has a separate campus.
3. In the Supabase SQL editor, run the files in [`backend/README.md`](backend/README.md), in that order. The profile file has already been run on the live database.
4. In Supabase Auth settings, set the site URL to the deployed address and allow redirects to `/` and `/reset-password`.

Do not add the service-role key to the frontend. Database access is limited by the row-level security in those SQL files.
