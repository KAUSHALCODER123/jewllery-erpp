/**
 * SQLite implementation of authService — the shared system DB (users +
 * companies), mirroring the Dexie version. Built on makeTableRepo over an
 * injectable executor (the system-DB executor in production; a fake in tests) so
 * every method's SQL is unit-testable without a live Tauri runtime.
 *
 * Behind the cutover flag: authService dispatches to this only when
 * SQLITE_CUTOVER_ENABLED && isTauri(). Off by default.
 */

import type { Company, User, UserRole } from "@/db/systemDb"
import { makeTableRepo, type SqlExecutor } from "@/db/sqliteRepo"
import { decodeRow } from "@/db/sqlBuilder"
import { typesFor } from "@/db/sqliteSchema"
import { hashPassword, randomSalt } from "@/services/passwordHash"

const nowIso = () => new Date().toISOString()

export function makeSqliteAuth(exec: SqlExecutor) {
  const companiesRepo = makeTableRepo("companies", typesFor("companies"), exec)
  const usersRepo = makeTableRepo("users", typesFor("users"), exec)

  // Memoised like the Dexie bootstrap so concurrent callers (React StrictMode)
  // share one run and never double-insert the default firm + admin.
  let bootstrapPromise: Promise<void> | null = null
  const runBootstrap = async (): Promise<void> => {
    if ((await companiesRepo.count()) === 0) {
      await companiesRepo.add({ name: "My Jewellery Shop", city: "Pune", createdAt: nowIso() } as never)
    }
    if ((await usersRepo.count()) === 0) {
      const salt = randomSalt()
      await usersRepo.add({
        username: "admin",
        name: "Owner",
        role: "owner",
        salt,
        passwordHash: await hashPassword("admin", salt),
        active: true,
        createdAt: nowIso(),
      } as never)
    }
  }

  const findByUsername = async (username: string): Promise<User | undefined> => {
    const rows = await exec.query<Record<string, unknown>>(
      "SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1",
      [username.trim()],
    )
    return rows[0] ? decodeRow<User>(rows[0], typesFor("users")) : undefined
  }

  return {
    bootstrap(): Promise<void> {
      if (!bootstrapPromise) bootstrapPromise = runBootstrap()
      return bootstrapPromise
    },

    listCompanies: () => companiesRepo.getAll(["id", "ASC"]) as unknown as Promise<Company[]>,
    getCompany: (id: number) => companiesRepo.get(id) as unknown as Promise<Company | undefined>,

    async addCompany(input: Omit<Company, "id" | "createdAt">): Promise<Company> {
      const record: Omit<Company, "id"> = { ...input, createdAt: nowIso() }
      return (await companiesRepo.add(record as never)) as unknown as Company
    },

    updateCompany: (id: number, patch: Partial<Company>) => companiesRepo.update(id, patch as never),

    listUsers: () => usersRepo.getAll(["username", "ASC"]) as unknown as Promise<User[]>,

    async addUser(input: { username: string; name: string; role: UserRole; password: string }): Promise<User> {
      if (await findByUsername(input.username)) throw new Error("Username already exists")
      const salt = randomSalt()
      const record: Omit<User, "id"> = {
        username: input.username.trim(),
        name: input.name.trim(),
        role: input.role,
        salt,
        passwordHash: await hashPassword(input.password, salt),
        active: true,
        createdAt: nowIso(),
      }
      return (await usersRepo.add(record as never)) as unknown as User
    },

    async setActive(userId: number, active: boolean): Promise<void> {
      await usersRepo.update(userId, { active } as never)
    },

    async changePassword(userId: number, newPassword: string): Promise<void> {
      const salt = randomSalt()
      await usersRepo.update(userId, { salt, passwordHash: await hashPassword(newPassword, salt) } as never)
    },

    /** Verify credentials. Returns the user (minus secrets) or throws. */
    async login(username: string, password: string): Promise<{ id: number; username: string; name: string; role: UserRole }> {
      const user = await findByUsername(username)
      if (!user) throw new Error("Invalid username or password")
      if (!user.active) throw new Error("This account is disabled")
      const hash = await hashPassword(password, user.salt)
      if (hash !== user.passwordHash) throw new Error("Invalid username or password")
      return { id: user.id!, username: user.username, name: user.name, role: user.role }
    },
  }
}
