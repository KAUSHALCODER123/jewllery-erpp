# Settings — Context

**Purpose:** Central configuration: shop/firm profile, print & rate/loyalty defaults, multi-firm management, user administration, self password change, database backup/restore (incl. Google Drive folder), and WhatsApp message templates.

## Key files
| File | Responsibility |
|------|----------------|
| `SettingsPage.tsx` | All seven tabs, each an in-file component: `ShopProfile`, `PrintSettings`, `Firms`, `UsersAdmin` (owner-only), `MyAccount`, `Backup`, `NotificationTemplates`. |

## Data model & entities
- **Company** (systemDb) — profile (`name`,`address`,`city`,`gstin`,`phone`), print config (`printPaperSize`,`printShowLogo`,`printLogoUrl`,`printBank*`,`printTermsText`,`printShowHuid`,`printAccentColor`,`receiptLanguage`), rate/loyalty defaults (`defaultGstRate`,`defaultHsnCode`,`loyaltyEarnPerGram`,`loyaltyRupeesPerPoint`,`loyaltyMaxPoints`), and WhatsApp templates (`templateInvoice`,`templateDues`,`templateGirvi`,`templateScheme`).
- **User** (systemDb) — `username`,`name`,`role` (`owner`|`manager`|`cashier`), `active`, `salt`+`passwordHash`.
- **BackupFile** — JSON envelope (`app:"jewel-erp"`, `scope:"company"|"system"`, `tables`/`companiesData`, `system`, `exportedAt`).

## Services & data flow
- `authService` — `updateCompany`, `listCompanies`, `addCompany`, `listUsers`, `addUser`, `setActive`, `changePassword`. Company edits also push into `useSession.setCompanyProfile` so live UI/print pick them up immediately.
- `maintenanceService` — `exportCompany` / `exportSystem`, `importCompany` / `importSystem` (restore reloads the app).
- `driveBackup` — `driveBackupSupported`, `getDriveFolder`, `pickDriveFolder`, `writeBackupToDrive` (Tauri-only; writes JSON into a synced Google Drive folder).
- `switchCompany` / `activeCompanyId` (`db/database`) — Firms tab switch sets `localStorage` + reloads.
- Excel export via `@/lib/excel` (`exportWorkbook`), CSV via `downloadText`.

## User-facing flows
1. **Shop Profile / Print & Rates** — edit → save → `updateCompany` + session update.
2. **Firms** — add firm; switch active firm (confirms, reloads). Each firm = separate business DB.
3. **Users** (owner only) — add user, enable/disable (admin user protected).
4. **My Account** — change own password (min 4 chars).
5. **Backup** — scope (active firm / whole system) → download JSON (restorable) or Excel (view-only) or push to Drive folder; **Restore** validates the file, previews record/table/firm counts, requires typing `RESTORE`, then overwrites and reloads.
6. **Msg Templates** — edit the four WhatsApp templates with `{{tag}}` placeholders; "Reset to Default" repopulates from `defaultWaTemplate(kind, receiptLanguage)`.

## Cross-feature connections
- Company print settings drive **POS invoice**, **Girvi Pavati**, **Schemes ChitReceipt**, **receipt-designer**.
- Templates consumed by WhatsApp flows in **POS**, **Reports (dues)**, **Girvi**, **Schemes**.
- Loyalty/GST/HSN defaults consumed by **POS** and **Reports**.
- **Auth** — Users/firm data is the same systemDb the LoginPage reads; password change here mirrors login auth.

## Gotchas & notes
- Google Drive backup is desktop (Tauri) only; the web build shows an "installed app only" notice (fs/dialog plugins are dynamic-imported).
- Restore is destructive and reloads; system-scope restore replaces all firms + users.
- Owner-gated UsersAdmin (`user.role === "owner"`), else `NoAccess`.
- The Google Drive section starts ≈ line 995; accent-colour presets map hex↔named mode in `PrintSettings`.
