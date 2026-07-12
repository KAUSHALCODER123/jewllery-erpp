# Auth — Context

**Purpose:** Login gate. Choose the firm + financial year, authenticate a user, seed the session, and point the business DB at the chosen company.

## Key files
| File | Responsibility |
|------|----------------|
| `LoginPage.tsx` | The entire auth UI — company select, financial-year select, username/password form. Rendered by `App` when there is no session `user` (not a route). |

## Data model & entities
- **Company** (systemDb) — listed for the firm picker.
- **User** (systemDb) — verified by `authService.login`; session stores `{id, username, name, role}` (secrets stripped).
- Session shape (`useSession.setSession`): `{ user, companyId, company, financialYear }`.
- Financial-year helpers from `useSession`: `currentFinancialYear`, `financialYearOptions`.

## Services & data flow
- `authService.listCompanies()` — populate firm dropdown on mount (default to first).
- `authService.login(username, password)` — trims/case-insensitive username, checks `active`, compares `hashPassword(password, salt)` to `passwordHash`; throws on failure. Returns the sanitized user.
- On success: `setSession(...)`, then `localStorage[ACTIVE_COMPANY_KEY] = companyId`; if the chosen company differs from `activeCompanyId()` the app does `window.location.reload()` so the business DB singleton re-boots on the right firm.
- `authService` dispatches to SQLite auth (`makeSqliteAuth`) under Tauri when `SQLITE_CUTOVER_ENABLED`, else the Dexie `authServiceDexie` — same contract, so LoginPage is unaffected.

## User-facing flows
1. Pick firm + FY, enter username/password (default hint: `admin / admin`).
2. Submit → login → session set → possible reload.
3. First-run users are told to change the password later in **Settings → My Account**.

## Cross-feature connections
- **Settings** — user administration (`UsersAdmin`), firm management, and password change all use the same `authService` + systemDb; `MyAccount.changePassword` re-salts + re-hashes.
- **useSession** — the session it populates gates the whole app (`App` renders routes only when `user` exists) and supplies `company` to every print/template consumer.
- **db/database** — `ACTIVE_COMPANY_KEY` / `activeCompanyId` / company switching.

## Gotchas & notes
- Passwords use salted hashing (`salt` + `passwordHash` via `hashPassword`, `randomSalt` in authService); no plaintext stored.
- Changing the active firm forces a full page reload (the business DB is a singleton bound at boot).
- Logout / session-clear is handled elsewhere (AppLayout), not in this folder.
- LoginPage is a conditional render in `App.tsx` (`!user ? <LoginPage/> : <BrowserRouter>…`), so it has no URL path.
