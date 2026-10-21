# PantryChef — Full-stack MVP for VibeHost

## Architecture and compatibility status

**Selected stack:** Node.js 20+, Express, `better-sqlite3`, SQLite, and a responsive HTML/CSS/JavaScript frontend served by the same Node process.

Why this choice:
- A single Node web service can serve both `/` and `/api/*`, which maps to a one-website deployment.
- SQLite provides persistent relational reads/writes for local development and a single-instance deployment.
- The code uses `PORT` and binds to `0.0.0.0`, typical requirements for managed app hosting.
- `DATABASE_PATH` is configurable so the database can be moved to a persistent mount if the hosting provides one.

**Important compatibility caveat:** VibeHost's public challenge guide says to connect a Git repository, configure a database, and deploy; it describes two background slots for one website and one database. However, the authenticated `/deploy` console does not expose its runtime/database options to this workspace. This package has therefore NOT been verified on VibeHost. Before deployment, confirm that the selected project runtime supports Node.js 20 and that either (a) SQLite on a persistent disk is allowed, or (b) the platform's provided database is PostgreSQL/MySQL and this app should be adapted to it. Do not assume a local filesystem survives redeploy/restart unless VibeHost documents a persistent volume.

If the database provisioned by VibeHost is PostgreSQL/MySQL, do not set `DATABASE_PATH` to a guessed value. Ask the platform for the connection variable names and migrate `src/db.js` to that database before launch.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
cp .env.example .env
npm install
npm test
npm start
```

Open `http://localhost:3000`.

The database initializes and seeds sample ingredients and recipes on startup. To initialize explicitly:

```bash
npm run db:init
```

## API routes

- `GET /api/health`
- `GET /api/ingredients`
- `GET /api/pantry`
- `POST /api/pantry`
- `PUT /api/pantry/:id`
- `DELETE /api/pantry/:id`
- `GET /api/recipes`
- `GET /api/suggestions`
- `POST /api/recipes/:id/cook`

## Included workflows

- Pantry CRUD (add/edit/delete).
- Recipe matching from stored recipes and pantry quantities (exact unit matching only).
- Shows present/missing ingredient quantities.
- Sorts recipes by match score, then near-expiry ingredients.
- Cook confirmation deducts required ingredients transactionally and rejects insufficient stock.
- Responsive UI with empty/error states.

## Known MVP limitations

- No authentication or multi-user isolation: current user is a fixed `local-user`. This is not suitable for public use with private inventories until authentication/authorization is added.
- Recipe quantities are compared only when units match exactly; no automatic conversion (e.g. grams to kilograms).
- Only two seed recipes; production recipe catalog needs more tested content.
- Expiry prioritization is a simple heuristic and not food-safety advice.
- SQLite persistence depends on VibeHost persistent disk support. For a separate managed DB, database adapter must be changed to match that service.
- No CSRF protection/rate limiting yet; add before broader public exposure.

## Deploy outline (verify in VibeHost UI)

1. Put this project in a new Git repository.
2. Connect the repository in VibeHost.
3. Select a Node.js runtime if offered, with Node.js 20+.
4. Build/install command: `npm install`; start command: `npm start`.
5. Configure `PORT` according to platform convention (the app defaults to 3000 but uses the injected `PORT`).
6. Confirm persistent disk or supported managed database. If SQLite on persistent disk is supported, set `DATABASE_PATH` to a path on that volume. If VibeHost provisions PostgreSQL/MySQL instead, pause and adapt database code to that service.
7. Deploy, then check `/api/health`, add an ingredient, refresh, and verify it persists.
