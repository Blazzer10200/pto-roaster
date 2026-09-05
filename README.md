# Bandbook

A responsive FiveM purchase ledger with customizable bands, purchase calculations, contacts, partial payments, and JSON backups.

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

## Storage and login

The hosted site uses Sites-managed ChatGPT sign-in and a private access allowlist. All allowed visitors are trusted ledger managers and share the same ledger. Players in the ledger are records, not login accounts. Do not make this site public or invite players unless they should be able to see and manage the entire ledger.

The Worker rejects requests without dispatcher-provided identity. SQLite/D1 stores the validated ledger document and immutable save revisions. Updates use an atomic revision check, so stale devices cannot overwrite newer data. A failed or uncertain save blocks additional saves until reload. Use **Reload latest** when moving between devices; this version does not live-stream other devices' edits. The database schema is managed by generated Drizzle migrations.

The local server retains browser-only demo/personal storage for development. Production never falls back to browser storage if the cloud API is unavailable. Export local records and use **Restore backup** on the hosted site to migrate real records intentionally. Restore replaces the shared ledger after confirmation; existing SQL revisions remain available for operator recovery. Each upload is capped at 950,000 bytes to fit the document storage design; move to normalized per-entry storage before a ledger approaches that size.

## Build and publish

`npm run check`, `npm test`, and `npm run build` validate and build the site. The build emits a Cloudflare-compatible Worker in `dist/server/index.js`, browser files in `dist/client`, and Sites metadata/migrations in `dist/.openai`. Sites provisions D1 and applies migrations on deployment. `.openai/hosting.json` contains logical configuration only; never put credentials there.

The source repository and production site are managed by the Sites connector. Preserve the current owner-only access policy until a specific manager is authorized. The Worker must remain behind the Sites dispatcher, which verifies identity and strips spoofed identity headers. It must not be exposed directly on an unprotected origin.

Google Fonts supplies DM Sans and Manrope when available; system sans-serif is the offline fallback.
