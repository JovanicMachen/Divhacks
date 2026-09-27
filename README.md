# Campus Connect

Two folders. The app is the frontend. The database is the backend. There is no separate API server.

| Folder | What it is |
| --- | --- |
| [`frontend/`](frontend/) | The Next.js web app: map, events, sign-in, and profile. |
| [`backend/`](backend/) | The Supabase database. Two SQL files, run in order. |

The branch to use is **`feat/supabase-backend`**. It is the only branch that contains both folders.

## Run the app

```bash
cd frontend
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for env vars and routes.

## Set up the database

Run the two files in [`backend/supabase/migrations/`](backend/supabase/migrations/) in the Supabase SQL editor, oldest filename first. Details are in [`backend/README.md`](backend/README.md).
