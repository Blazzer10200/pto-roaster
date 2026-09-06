# PTO Roaster

A simple FiveM gang hub with a roster, customizable ranks, availability, gang notes, a band ledger, partial payments, and JSON backups.

## Roster

The home screen shows current, active, and inactive member counts. Add or edit members with an in-game name, optional callsign, rank, joined date, and notes. Status is maintained manually; there is no live FiveM server connection. Archive departed members to retain their details without counting them against the roster limit; restore them by editing their status in Archive.

Settings controls the gang name, ordered rank list, and roster limit (0 means unlimited). The limit is informational, not a hard block. Gang notes hold shared reminders. Roster members and band-account contacts are separate; recording someone's bands does not enroll them in the gang. Existing backups load with an empty roster and retain all purchase history.

## Run locally

### Development login and permissions

The account security panel now provides authenticator enrollment, recovery codes, session revocation, and an Owner-controlled admin MFA requirement. Roles & access includes Activity and encrypted full Backups. See [SECURITY.md](./SECURITY.md) for setup, recovery, backup restoration, and the remaining hosted deployment requirements.
Admins can open **Roles & access → Online** to see approved users active in the last two minutes and their current page. Visible tabs check in every 45 seconds; the list refreshes every 15 seconds. Closed or hidden tabs age out, and signed-out sessions disappear immediately. Ordinary members cannot read this list.

The local server uses a separate SQLite database at `.local/pto-dev.sqlite` (ignored by Git). Open the preview and create the first Owner account; no default password is provided. The Owner has permanent full access. After setup, the login page offers **Create account** with a username, password, and in-character roleplay name. Self-registration always creates a pending account with no roles or workspace access. The applicant sees **Awaiting approval** until an authorized reviewer approves or declines the request. Owners/access managers can also create approved accounts and assign multiple roles in **Roles & access**. Existing accounts and passwords are preserved; their old email login still works alongside their derived username. Passwords use salted scrypt hashes; session tokens are random, hashed in storage, and delivered through HttpOnly/SameSite cookies. The server binds only to loopback. Recovery codes provide account recovery; no email-based reset service or Discord OAuth is connected.

**Join requests** has its own View/Manage permission. Owners and the default Admin role can review requests; custom roles can receive this permission without access to global account administration. Approval requires at least one role, and reviewers can only grant permissions within their own access. Pending and declined accounts cannot read or change workspace data. The navigation badge shows pending requests; session status refreshes every 30 seconds while the tab is visible, and applicants can check immediately with **Check status**. Notifications are in-app only. Approving an account does not automatically add a roster member.

Roles grant **No access**, **View**, or **Manage**. Category defaults can be overridden for individual pages. Multiple roles combine the strongest grant. **Manage** on **Roles & access** is global account/role administration; other page managers cannot edit permissions. Backend reads filter unauthorized roster/ledger fields. Writes enforce field ownership; Bands managers may append records without modifying old ledger entries. Role updates take effect on each request; account changes revoke its sessions. Existing browser-only data remains in localStorage and can be imported by the Owner in Settings.

The hosted Worker now enforces the same approval, page permission, and MFA gates using Cloudflare D1. GitHub Pages uses an in-memory bearer session; reloading the page requires signing in again. No session token is stored in browser storage or a URL. Same-origin hosted sessions use Secure/HttpOnly/SameSite cookies. A one-time operator migration imports existing accounts and workspace data; public Owner signup is disabled. Publish only on explicit instruction.

Requires Node.js 24 or newer for the SQLite integration tests. Run `npm ci` to install the build tools.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Run `npm test` for the ledger calculation and backup validation tests.

## First preview

New workspaces start with an empty roster, no player accounts or transactions, blank gang notes, and unset band prices. Set actual prices in Settings. Test fixtures are separate modules excluded from published assets. Existing login accounts and permissions remain intact.

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

The local server stores protected accounts and records in SQLite. Earlier browser-only data remains available for explicit Owner import. Production never falls back to browser storage if the cloud API is unavailable. Export local records and use **Restore backup** on the hosted site to migrate real records intentionally. Restore replaces the shared ledger after confirmation; existing SQL revisions remain available for operator recovery. Each upload is capped at 950,000 bytes to fit the document storage design; move to normalized per-entry storage before a ledger approaches that size.

## Build and publish

Development remains at http://127.0.0.1:4173 with its own protected SQLite database. Keep this preview running while editing; do not publish unless requested.

The public frontend target is https://blazzer10200.github.io/pto-roaster/. `npm run build:pages` creates only browser assets in `dist/pages`. The GitHub workflow **Publish PTO Roaster** runs only through manual dispatch, never automatically on push. It does not need database credentials. `api-config.js` routes this exact GitHub hostname to the existing public Sites API; the Worker allows CORS only for that GitHub origin and its own origin. SQLite and save revisions remain in the existing database, so moving the frontend does not copy or reset records. Deploy backend changes through Sites before dispatching a frontend release that depends on them.

`npm run check`, `npm test`, and `npm run build` validate and build the site. The build emits a Cloudflare-compatible Worker in `dist/server/index.js`, browser files in `dist/client`, and Sites metadata/migrations in `dist/.openai`. Sites provisions D1 and applies migrations on deployment. `.openai/hosting.json` contains logical configuration only; never put credentials there.

The source repository and production site are managed by the Sites connector. The site audience is public, as requested by its owner. The application does not require or use ChatGPT identity headers.

Google Fonts supplies DM Sans and Manrope when available; system sans-serif is the offline fallback.
