/**
 * Authentication & firm management service (offline, IndexedDB-backed).
 *
 * Passwords are salted and SHA-256 hashed via the Web Crypto API — never stored
 * in plain text. This is appropriate for a single-machine offline shop app; it
 * gates casual access and separates cashier vs owner roles.
 */

import { systemDb, DEFAULT_COMPANY, type Company, type User, type UserRole } from "@/db/systemDb"
import { isTauri, systemExecutor } from "@/db/sqlite"
import { SQLITE_CUTOVER_ENABLED } from "@/db/persistence"
import { makeSqliteAuth } from "@/services/sqliteAuth"
import { hashPassword, randomSalt } from "@/services/passwordHash"
import { assertAllowed } from "@/lib/permissions"

export { hashPassword }

const nowIso = () => new Date().toISOString()

/**
 * Memoised so concurrent callers (e.g. React StrictMode double-invoking the
 * bootstrap effect in dev) share one run — otherwise both see an empty table and
 * each insert a duplicate default firm + admin.
 */
let bootstrapPromise: Promise<void> | null = null

async function runBootstrap(): Promise<void> {
  await systemDb.users.where("role").equals("cashier" as UserRole).modify({ role: "staff" })
  const companyCount = await systemDb.companies.count()
  if (companyCount === 0) {
    await systemDb.companies.add({
      ...DEFAULT_COMPANY,
      createdAt: nowIso(),
    })
  }
  const userCount = await systemDb.users.count()
  if (userCount === 0) {
    const salt = randomSalt()
    await systemDb.users.add({
      username: "admin",
      name: "Owner",
      role: "owner",
      salt,
      passwordHash: await hashPassword("admin", salt),
      active: true,
      createdAt: nowIso(),
    })
  }
}

const authServiceDexie = {
  /** First-run bootstrap: ensure a default firm + an owner account exist. */
  bootstrap(): Promise<void> {
    if (!bootstrapPromise) bootstrapPromise = runBootstrap()
    return bootstrapPromise
  },

  listCompanies: (): Promise<Company[]> => systemDb.companies.orderBy("id").toArray(),
  getCompany: (id: number): Promise<Company | undefined> => systemDb.companies.get(id),

  async addCompany(input: Omit<Company, "id" | "createdAt">): Promise<Company> {
    const record: Company = { ...input, createdAt: nowIso() }
    const id = await systemDb.companies.add(record)
    return { ...record, id }
  },

  updateCompany: (id: number, patch: Partial<Company>): Promise<void> =>
    systemDb.companies.update(id, patch).then(() => undefined),

  listUsers: (): Promise<User[]> => systemDb.users.orderBy("username").toArray(),

  async addUser(input: {
    username: string
    name: string
    role: UserRole
    password: string
    actorRole: UserRole
  }): Promise<User> {
    assertAllowed(input.actorRole, "manage_users")
    const existing = await systemDb.users
      .where("username")
      .equalsIgnoreCase(input.username)
      .first()
    if (existing) throw new Error("Username already exists")
    const salt = randomSalt()
    const record: User = {
      username: input.username.trim(),
      name: input.name.trim(),
      role: input.role,
      salt,
      passwordHash: await hashPassword(input.password, salt),
      active: true,
      createdAt: nowIso(),
    }
    const id = await systemDb.users.add(record)
    return { ...record, id }
  },

  async setActive(userId: number, active: boolean, actorRole: UserRole): Promise<void> {
    assertAllowed(actorRole, "manage_users")
    await systemDb.users.update(userId, { active })
  },

  async changePassword(userId: number, newPassword: string): Promise<void> {
    const salt = randomSalt()
    await systemDb.users.update(userId, {
      salt,
      passwordHash: await hashPassword(newPassword, salt),
    })
  },

  /** Verify credentials. Returns the user (minus secrets) or throws. */
  async login(username: string, password: string): Promise<{
    id: number
    username: string
    name: string
    role: UserRole
  }> {
    const user = await systemDb.users
      .where("username")
      .equalsIgnoreCase(username.trim())
      .first()
    if (!user) throw new Error("Invalid username or password")
    if (!user.active) throw new Error("This account is disabled")
    const hash = await hashPassword(password, user.salt)
    if (hash !== user.passwordHash) throw new Error("Invalid username or password")
    return { id: user.id!, username: user.username, name: user.name, role: user.role }
  },
}

/**
 * Dispatched auth service: SQLite (shared system DB) when the cutover is enabled
 * under Tauri, else the Dexie implementation above. Same contract, so LoginPage /
 * App / Settings are unaffected. Off by default → pure Dexie.
 */
export const authService =
  SQLITE_CUTOVER_ENABLED && isTauri() ? makeSqliteAuth(systemExecutor) : authServiceDexie
