# Workspace release — September 2026

## Daily use

- Owner opens on a dashboard for requests, incomplete profiles, money owed, Thursday obligations, upcoming events, and personal updates. Treasurer opens on Treasury; Member opens on My stash. Pages have bookmarkable addresses and browser Back support.
- My stash puts account-linked band entry beside receipts, with color-coded band tiles and a running total. Quantities and notes save as a private device draft for 24 hours. Navigation and reload restore that draft; submitting, discarding, or signing out clears it. Drafts are not submitted deposits and do not sync between devices.
- Treasury separates Payouts, Transactions, Weekly bills, Cashbook, and Owner finance settings. Members receive only their own financial records. Treasury viewers can see all balances; managers can record payments. Owner can confirm their own payout; other managers still need another finance manager for their own payout.
- Full and partial payments apply to the oldest outstanding deposits. A partial payment reduces money owed without inventing a conversion between cash and individual band quantities. The band counts show original contents of still-unpaid deposits.
- Members can withdraw an unpaid deposit and reuse its quantities in a corrected draft. Managers can reject incorrect deposits with a reason. Partly paid deposits require the Owner to reverse their payment before withdrawal or rejection.
- Owner corrections create an attributed reversal, preserve the original receipt, reopen the affected balance, and adjust linked cashbook entries. Nothing silently erases paid history.
- Transactions have reference/name/State-ID search, status and date filters, batches of 20, and CSV export. Cash history has batches of 20 and its own CSV export. CSV text is escaped against spreadsheet formula interpretation.

## Gang money

- Thursday house and gang taxes remain $5,000 each by default, in Central time. Unpaid weeks carry forward; paid, remaining, and overdue totals are visible. Owner can schedule future Thursday amount changes without rewriting existing receipts.
- The optional cashbook begins only when Owner enters the actual opening cash balance. Band submissions create member balances, not cash income. Record money received separately. Later confirmed payouts and weekly bills subtract cash automatically. Earlier payments are not deducted again.
- Cashbook includes income, expenses, Owner reconciliation, and a balance after reserving outstanding bills and member payouts. This is a record of actions taken in game, not a money-transfer integration.
- Owner can require verification for new deposits. A manager verifies quantities, then separately confirms payment. Older deposits keep their original verification requirement.

## People and gang activity

- People is a searchable directory with approved, pending, denied, disabled, and incomplete-profile filters. Expand a person to edit their profile, choose Member/Treasurer/Admin-only presets, preview effective permissions, disable sign-in, or delete the account.
- Actual access changes revoke that person's sessions. Unchanged saves keep sessions. Revision checks prevent an old form from re-enabling a disabled account. Moving pages between navigation categories preserves existing effective permissions.
- Roster rank remains distinct from website access. Owner remains protected. Existing live role assignments are retained; this release does not silently demote other administrators.
- Empty navigation categories and unused band types can be removed. Bands referenced by saved receipts must be made inactive instead.
- Calendar includes events, cancellation history, RSVPs, attendance, and shared away dates. Leadership notes are returned only to users with roster-management access. Personal updates include approvals, payout receipts, deposit corrections, and upcoming events.
- Sign-in includes Show password. Existing remembered sessions, authenticator enrollment, recovery codes, and verified operator recovery remain supported.

## Reliability and operation

- Active pages check changes about every three seconds, use targeted refreshes, and back off after connection failures. Member payout updates can refresh while preserving an unfinished band draft. Price changes retain quantities and require review of refreshed rates.
- Account activity retains the actor's name in new audit records, even after account deletion. Access edits show role and sign-in changes. Older audit entries without a stored actor cannot recover a deleted name.
- Full encrypted backups include account-linked finance, cashbook, calendar, and private notes. Settings clearly labels its smaller roster/earlier-ledger export. Hosted daily backups show their saved UTC day rather than an invented timestamp.
- Browser scripts and styles use content fingerprints. A release indicator offers reload when a newer build becomes available. Builds normalize line endings so Windows and GitHub produce identical browser releases.

## Verification and boundaries

SQLite and hosted D1 regression tests cover privacy, partial payouts, reversals, cashbook accounting, duplicate/stale writes, calendar permissions, private notes, account access conflicts, and backup restoration. Browser walkthroughs cover Owner and Member workflows, two-session payout refresh with a saved draft, role presets, calendar creation, cashbook setup, and a 390-pixel mobile layout.

Discord integrations are intentionally deferred. FiveM presence or character/inventory synchronization still needs the server operator's resources and a separately authorized bridge; no server connection is represented as live. Existing recovery remains identity-checked; no unverified administrative password-reset shortcut was added.

History currently pages its display in the browser. The hosted state document retains its 1.4 MB limit; Owner screens expose a workspace-size estimate, which excludes some security state. Normalized storage, server-side pagination, and push delivery remain scale-driven follow-ups before approaching that limit.
