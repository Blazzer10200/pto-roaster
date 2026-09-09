# September 9 release preparation

Release package and validation record. Publication is performed through the existing Sites backend and the manually dispatched GitHub Pages workflow.

## Release identity and artifacts

- Browser release: `a0eee9deee5c` (generated content fingerprint; package version remains `0.1.0` under the existing convention).
- Fresh frontend staging: `dist/releases/a0eee9deee5c/pages/`.
- Frontend archive: `dist/releases/a0eee9deee5c/pto-pages-a0eee9deee5c.zip`.
- Archive SHA-256: `F130284D4B3B830A39BC0B47B1AC00AF3095FD5DAABE33C312DCAA1CC8F4F285`.
- Archive contains exactly the 30 manifest assets, `release.json`, and `.nojekyll`. Every archived file was compared byte-for-byte by SHA-256 with the staged build. No local database, credentials, logs, or stale fingerprinted assets are included.
- Worker bundle: `dist/server/index.js`; Sites build metadata/migrations remain under `dist/.openai/`.
- User-facing changes: [RELEASE-NOTES.md](../RELEASE-NOTES.md), September 9 candidate. Older notes remain historical.

## Verification

- `npm test`: 90 passed, zero failures. Includes SQLite and hosted D1 auth/permissions/MFA/backup/finance coverage, plus two new session-persistence regressions. This result was reused after the final browser-only navigation correction; that path was checked directly in the browser.
- `npm run verify:build`: passed on the final application source. Syntax checks, Worker build, Pages build, manifest marker, and module dependency validation passed.
- `node verify-release.mjs dist/releases/a0eee9deee5c/pages`: passed, 30 assets.
- Code review covered the changed authentication/cookie paths, navigation and permission mapping, preservation of historical house receipts, presence payload restrictions, custom controls, UI preferences, and release packaging. The review found and corrected an address/page mismatch when Back navigation was cancelled with unsaved settings. No remaining actionable blocker was identified in that scope.
- Browser checks: password visibility toggle, failed sign-in/retry, registration layout, remembered sign-in on both preview ports, reload, sample logout isolation, custom filter selection/reset, keyboard dismissal/focus, reminder persistence, remembered finance sections/member-panel state, settings shortcuts, and desktop/320-pixel layouts.
- Real-browser closure/relaunch over 30 days was not simulated. Expiry and database-reopen behavior were tested with controlled time and persisted SQLite; browser reload and cross-preview interference were exercised directly. Hosted cookie behavior was covered by the existing D1 regression tests, not by changing the live site.
- After the navigation-cancellation result was captured, the disposable QA tab stopped responding to browser-control commands. The separate user-facing login tab remained accessible and showed the completed interface. This limits follow-up automation in that QA tab; it was not used as evidence of a passing check.

## Publication sequence when authorized

1. Include all release source changes and required new files, especially `select-ui.js` and the new tests. Keep `.local`, local SQLite/backups, logs, and `dist` out of source commits.
2. Confirm a current full encrypted production backup through the existing Owner backup workflow. This preparation does not download or change production data.
3. Deploy the backend to the existing Sites project/D1 binding first. It adds the roster-gated presence endpoint and retires new house obligations while retaining historical records. Do not create a fresh production database or reseed accounts.
4. Publish the matching frontend via the manually dispatched **Publish PTO Roaster** workflow, or the exact staged frontend artifact. The GitHub build from the same source should produce fingerprint `a0eee9deee5c`.
5. Verify the deployed `release.json`, login/MFA, My stash, Treasury/taxes/history, roster presence, and role-filtered Admin. Run the existing `verify-release.mjs` with the published frontend base URL to compare the release assets.
6. If reverting, restore the previous matched application release without replacing the current database. This candidate does not require a destructive data migration.

## Local operation

The persistent main preview runs at `http://127.0.0.1:4173/`; the disposable sample runs at `http://127.0.0.1:4174/`. Their cookie names are now isolated by preview port. Existing local sessions require one fresh sign-in after installing this change. The production cookie name and security attributes are unchanged.
