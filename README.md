# PTO Roaster

A simple FiveM gang hub with a roster, customizable ranks, availability, gang notes, a band ledger, partial payments, and JSON backups.

## Roster

The home screen shows current, active, and inactive member counts. Add or edit members with an in-game name, optional callsign, rank, joined date, and notes. Status is maintained manually; there is no live FiveM server connection. Archive departed members to retain their details without counting them against the roster limit; restore them by editing their status in Archive.

Settings controls the gang name, ordered rank list, and roster limit (0 means unlimited). The limit is informational, not a hard block. Gang notes hold shared reminders. Roster members and band-account contacts are separate; recording someone's bands does not enroll them in the gang. Existing backups load with an empty roster and retain all purchase history.

## Run locally

Requires Node.js 24 or newer for the SQLite integration tests. Run `npm ci` to install the build tools.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Run `npm test` for the ledger calculation and backup validation tests.

## First preview

The local development server opens a clearly labeled demo workspace with sample prices and records. Choose **Start my ledger** to switch to a separate empty local ledger, then set actual prices in Settings. The hosted site always starts with an empty online ledger and never imports sample data automatically.

Features:
- Drop-off entries: receive a player's bands now, leave the amount paid at zero, and track the full amount owed to that player.
- Dashboard showing who is owed money, with each player's combined outstanding balance across visits.
- Player-level payments automatically applied to their oldest unpaid entries first, with payment history preserved on each receipt.
- One record-bands form beside the unpaid player list; no entry-type choice, charts, or period summaries.
- Custom searchable player picker with arrow-key navigation, Enter to select, Escape to cancel, and click-away dismissal.
- Quantity entry using prices from Settings, with optional payment and note fields tucked into an expandable section.
- Contacts with notes, purchase histories, and outstanding balances.
- Searchable purchase history and paid/open filters.
- Settings for workspace name and item names, colors, default prices, order, and visibility.
- Backup export and validated backup restore with a replacement confirmation.
- Original price snapshots retained in purchase history; amounts calculated in integer cents.

All new records use the same band-entry flow, so an unpaid delivery is not counted twice when it is paid. Existing purchase and drop-off records and backups remain compatible. Quantities are individual band/item counts; no unstated stack-size conversion is assumed.

## Public access and storage

The hosted site is intentionally public and opens without a ChatGPT account or any login. Everyone with the URL can read and manage the same shared ledger. Players in the ledger are records, not login accounts. Settings shows this shared-access scope. Anonymous changes are recorded as `public`, not attributed to a person.

SQLite/D1 stores the validated ledger document and immutable save revisions. Updates use an atomic revision check, so stale devices cannot overwrite newer data. Same-origin and JSON validation checks still apply to writes. A failed or uncertain save blocks additional saves until reload. Use **Reload latest** when moving between devices; this version does not live-stream other devices' edits. The database schema is managed by generated Drizzle migrations.

The local server retains browser-only demo/personal storage for development. Production never falls back to browser storage if the cloud API is unavailable. Export local records and use **Restore backup** on the hosted site to migrate real records intentionally. Restore replaces the shared ledger after confirmation; existing SQL revisions remain available for operator recovery. Each upload is capped at 950,000 bytes to fit the document storage design; move to normalized per-entry storage before a ledger approaches that size.

## Build and publish

Development remains at http://127.0.0.1:4173 with separate browser data. Keep this preview running while editing; do not publish unless requested.

The public frontend target is https://blazzer10200.github.io/pto-roaster/. `npm run build:pages` creates only browser assets in `dist/pages`. The GitHub workflow **Publish PTO Roaster** runs only through manual dispatch, never automatically on push. It does not need database credentials. `api-config.js` routes this exact GitHub hostname to the existing public Sites API; the Worker allows CORS only for that GitHub origin and its own origin. SQLite and save revisions remain in the existing database, so moving the frontend does not copy or reset records. Deploy backend changes through Sites before dispatching a frontend release that depends on them.

`npm run check`, `npm test`, and `npm run build` validate and build the site. The build emits a Cloudflare-compatible Worker in `dist/server/index.js`, browser files in `dist/client`, and Sites metadata/migrations in `dist/.openai`. Sites provisions D1 and applies migrations on deployment. `.openai/hosting.json` contains logical configuration only; never put credentials there.

The source repository and production site are managed by the Sites connector. The site audience is public, as requested by its owner. The application does not require or use ChatGPT identity headers.

Google Fonts supplies DM Sans and Manrope when available; system sans-serif is the offline fallback.
