# PTO Roaster

A simple FiveM gang hub with a roster, customizable ranks, availability, gang notes, a band ledger, partial payments, and JSON backups.

## Roster

The home screen shows current, active, and inactive member counts. Invite members to create an account with their character name, username, five-digit State ID, and in-game phone number. Approve & add to roster creates a linked profile with a selected gang rank. Existing approved accounts can be added through Invite member → Add existing account, and old roster entries can be explicitly linked from Edit member. Linking preserves their rank, status, joined date, and notes. Callsign is no longer shown; historical callsigns remain in backups. Status is maintained manually; there is no live FiveM server connection. Archive departed members to retain their details without counting them against the roster limit; restore them by editing their status in Archive.

Settings controls the gang name, ordered rank list, and roster limit (0 means unlimited). The limit is informational, not a hard block. Gang notes hold shared reminders. Approved accounts submit their own bands; earlier ledger contacts remain separate from website accounts. Legacy backups without a roster load with an empty roster and retain their purchase history.

### Removing people

- **Roster → member → Remove from roster** deletes that roster profile and its notes, while keeping the website account and finance history. The approved account can be added back through Add existing account. Use **Archive** for a restorable roster profile instead.
- **People & roles → People → Disable sign-in temporarily** keeps the account and roster entry, revokes current sessions, and allows access to be restored later.
- **People → Delete account** permanently removes the login, authenticator/recovery credentials, sessions, and linked roster profile after typing the exact username. The Owner and your own account cannot be deleted. Pending deposits must be settled or rejected first; paid/rejected finance records and Activity remain. Account administration is required. Deletion does not remove historical encrypted backups.

Roster removal and account deletion are logged and appear on other active screens through the existing change polling. Roles such as Admin/Member control access; a person named Gang Leader is an account, not a separate role.

## Bands and gang finances

The main navigation separates **My stash** (personal finances), **Treasury** (gang finances), and **People & roles** (account administration). Unauthorized pages are hidden and their server endpoints enforce the same permissions.

To assign a role, open **People & roles**, find the person on the default **People** tab, check the desired roles under **Assign website roles**, and click **Save roles & access**. Each role explains its access, and the form previews whether that person will see only their own balance or all balances. Multiple roles combine their permissions: Member plus Admin still has Admin access. Use **Role permissions** to edit a role's page access.

| Default role | Finance view | Administration |
| --- | --- | --- |
| Member | Own stash and own unpaid/paid history | No account, role, or price management |
| Treasurer | Every member's unpaid stash by band type; payout and weekly-bill management | No account/role management or band-price settings |
| Admin / Owner | All finance records | Account/role and settings management; Owner remains protected |

Existing sites receive the Treasurer preset once; existing role assignments and any custom Treasurer role are preserved. Assign the role to the person handling money. Treasury shows quantity and value for Loose change, White, Blue, Purple and Brown bands (or the configured band names), per member and across all pending deposits. Only pending deposits contribute to these totals; saved rates are retained even when prices change.

**My stash** uses the signed-in account automatically. Members enter quantities at the configured band rates and an optional stash note. The server supplies the account, rates, timestamp and unpaid status. Deposits accumulate in that member's outstanding balance; saved rates do not change when Settings rates change later.

**Treasury** shows the member payout queue and the two Thursday expenses: **$5,000 gang house + $5,000 gang taxes**, tracked in Central time. Tracking starts from the upcoming Thursday when finance tracking is first opened. Unpaid weeks carry forward; each weekly payment is unique by bill and Thursday. These are gang expenses, not automatically divided member dues, and the app records payments made in game rather than transferring money.

My stash View allows submitting and viewing one's own deposits. Treasury View shows gang finances; Treasury Manage confirms payouts, rejects incorrect deposits with a reason, and records weekly payments. The Owner can confirm any payout, including their own. Other finance managers need another authorized manager to confirm their own payout. The default Member role gains My stash View once when it has no explicit Bands/category restriction; existing custom restrictions are respected. Recruiter roles must include the permissions of roles they grant, including My stash View when approving the default Member role.

Confirm paid clears the member's pending deposits while retaining each entry and who confirmed payment. Member screens refresh automatically, including profile name changes. Payouts check both the displayed amount and the exact pending deposits so concurrent changes cannot silently pay different entries, even if the total stays the same. Request IDs prevent duplicate submissions/payments on retry. Incorrect entries retain the rejection reason in history.

Earlier manual ledger records remain under **Earlier ledger records & outside players**. They are never matched to accounts by name. Full encrypted backups include account-linked deposits, payout history and weekly bills. The ordinary JSON export/restore covers roster and earlier ledger records; restoring it preserves the current account-linked finance history.

## Run locally

### Development login and permissions

The account security panel now provides authenticator enrollment, recovery codes, session revocation, and an Owner-controlled admin MFA requirement. People & roles includes Activity and encrypted full Backups. See [SECURITY.md](./SECURITY.md) for setup, recovery, backup restoration, and the remaining hosted deployment requirements.
Admins can open **People & roles → Online** to see approved users active in the last two minutes and their current page. Visible tabs check in every 45 seconds; the list refreshes every 15 seconds. Closed or hidden tabs age out, and signed-out sessions disappear immediately. Ordinary members cannot read this list.

The local server uses a separate SQLite database at `.local/pto-dev.sqlite` (ignored by Git). Open the preview and create the first Owner account; no default password is provided. The Owner has permanent full access. After setup, the login page offers **Create account** with a username, password, and in-character roleplay name. Self-registration always creates a pending account with no roles or workspace access. The applicant sees **Awaiting approval** until an authorized reviewer approves or declines the request. Owners/access managers can edit character names, usernames, State IDs, phone numbers, and website roles in **People & roles → People**. Profile changes update the linked roster entry, including after a username change. A username change changes the login name without changing the password or account ID. Other administrators cannot edit the protected Owner’s identity. Existing accounts and passwords are preserved; their old email login still works alongside their derived username. Passwords use salted scrypt hashes; session tokens are random, hashed in storage, and delivered through HttpOnly/SameSite cookies. The server binds only to loopback. Recovery codes provide account recovery; no email-based reset service or Discord OAuth is connected.

**Join requests** has its own View/Manage permission. Owners and the default Admin role can review requests; custom roles can receive this permission without access to global account administration. Approval requires Manage on both Join requests and Roster, at least one website role, a gang rank for a new profile, and complete State ID/phone details. Reviewers can only grant permissions within their own access; reviewers without account administration cannot change applicant names or usernames. Pending and declined accounts cannot read or change workspace data. The navigation badge shows pending requests; session status and affected pages refresh every 3 seconds while the tab is visible, and applicants can check immediately with **Check status**. Notifications are in-app only. Approving an account and creating or explicitly linking its roster profile happen atomically. Existing entries are never matched by name automatically. Reviewers can reopen a declined request with Review again, preserving the existing login and reserved State ID without granting access. State IDs are unique across accounts, stored as strings to preserve leading zeroes. Existing accounts with blank new fields remain usable until an administrator completes them.

Roster managers can edit gang ranks, roster status, joined dates, and notes. Editing linked identity details also requires Manage on People & roles. Archiving a member retains the account and history; disabling website access is a separate, explicit account action. Profile revisions and workspace revisions reject stale edits. Linked identities cannot be changed, removed, or relinked through a records-only backup restore. Restore full encrypted backups for account recovery.

Roles grant **No access**, **View**, or **Manage**. Category defaults can be overridden for individual pages. Multiple roles combine the strongest grant. **Manage** on **People & roles** is global account/role administration; other page managers cannot edit permissions. Backend reads filter unauthorized roster/ledger fields. Writes enforce field ownership; Bands managers may append records without modifying old ledger entries. Role updates take effect on each request; account changes revoke its sessions. Existing browser-only data remains in localStorage and can be imported by the Owner in Settings.

The hosted Worker now enforces the same approval, page permission, and MFA gates using Cloudflare D1. Keep me signed in uses a 30-day HttpOnly cookie; unchecking it uses a browser-session cookie with a 12-hour server expiry. GitHub Pages uses a Secure, partitioned cookie so reloads can restore authentication, plus a current-page bearer fallback. No password or token is saved in localStorage, sessionStorage, or a URL. Same-origin hosted sessions use Secure/HttpOnly/SameSite=Strict cookies. Sign-out, revocation, account disable, and recovery still invalidate sessions. A one-time operator migration imports existing accounts and workspace data; public Owner signup is disabled. Publish only on explicit instruction.

Requires Node.js 24 or newer for the SQLite integration tests. Run `npm ci` to install the build tools.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Run `npm test` for the ledger calculation and backup validation tests.

## First preview

New workspaces start with an empty roster, no ledger players or transactions, blank gang notes, and unset band prices. Set actual prices in Settings. Test fixtures are separate modules excluded from published assets. Existing login accounts remain intact; the one-time default Member permission update is described above.

Features:
- My stash: account-linked stash quantities, locked price snapshots, an optional note, and a running outstanding balance.
- Treasury: member payout confirmations, rejection reasons, and permanent paid/reviewed history.
- Thursday house and gang-tax tracking with unpaid weeks carried forward.
- Earlier ledger contacts retain notes, purchase histories, searchable paid/open filters, and existing partial-payment controls.
- Settings for workspace name and item names, colors, default prices, order, and visibility.
- Ordinary roster/earlier-ledger exports and full encrypted backups including account-linked finances.
- Original price snapshots retained in purchase history; amounts calculated in integer cents.

New stash deposits remain the same records when paid and move from outstanding to history. Earlier purchase/drop-off records and backups remain compatible. Quantities are individual band/item counts; no unstated stack-size conversion is assumed.

## Public access and storage

The public frontend opens without a ChatGPT account, but PTO login and approval are required to access workspace records. Server permissions control every read and write. Ledger players are balance records for members and outside players; creating a ledger player does not create a website account or grant access.

SQLite/D1 stores the validated ledger document and immutable save revisions. Updates use an atomic revision check, so stale devices cannot overwrite newer data. Same-origin and JSON validation checks still apply to writes. A failed or uncertain save blocks additional saves until reload. Visible tabs check for changes every 3 seconds and when returning to the tab. Roster, account details, requests, and Activity refresh when their version changes. Open dialogs and unsaved forms are preserved; a notice tells the user when new data is waiting. Reviewed requests leave every active review queue, while unchanged pending drafts are preserved. Use **Reload latest** to discard a stale draft explicitly. The database schema is managed by generated Drizzle migrations.

The local server stores protected accounts and records in SQLite. Earlier browser-only data remains available for explicit Owner import. Production never falls back to browser storage if the cloud API is unavailable. Export local records and use **Restore backup** on the hosted site to migrate real records intentionally. Restore replaces the shared ledger after confirmation; existing SQL revisions remain available for operator recovery. Each upload is capped at 950,000 bytes to fit the document storage design; move to normalized per-entry storage before a ledger approaches that size.

## Build and publish

Development remains at http://127.0.0.1:4173 with its own protected SQLite database. Keep this preview running while editing; do not publish unless requested.

The public frontend target is https://blazzer10200.github.io/pto-roaster/. `npm run build:pages` creates only browser assets in `dist/pages`. The GitHub workflow **Publish PTO Roaster** runs only through manual dispatch, never automatically on push. It does not need database credentials. `api-config.js` routes this exact GitHub hostname to the existing public Sites API; the Worker allows CORS only for that GitHub origin and its own origin. SQLite and save revisions remain in the existing database, so moving the frontend does not copy or reset records. Deploy backend changes through Sites before dispatching a frontend release that depends on them.

`npm run check`, `npm test`, and `npm run build` validate and build the site. The build emits a Cloudflare-compatible Worker in `dist/server/index.js`, browser files in `dist/client`, and Sites metadata/migrations in `dist/.openai`. Sites provisions D1 and applies migrations on deployment. `.openai/hosting.json` contains logical configuration only; never put credentials there.

The source repository and production site are managed by the Sites connector. The site audience is public, as requested by its owner. The application does not require or use ChatGPT identity headers.

Google Fonts supplies DM Sans and Manrope when available; system sans-serif is the offline fallback.
