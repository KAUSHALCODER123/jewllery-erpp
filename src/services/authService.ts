/**
 * Authentication & firm management service (offline, IndexedDB-backed).
 *
 * Passwords are salted and SHA-256 hashed via the Web Crypto API — never stored
 * in plain text. This is appropriate for a single-machine offline shop app; it
 * gates casual access and separates cashier vs owner roles.
 */

import { systemDb, type Company, type User, type UserRole } from "@/db/systemDb"

const nowIso = () => new Date().toISOString()

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")

const randomSalt = (): string => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return toHex(a.buffer)
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return toHex(digest)
}

export const authService = {
  /** First-run bootstrap: ensure a default firm + an owner account exist. */
  async bootstrap(): Promise<void> {
    const companyCount = await systemDb.companies.count()
    if (companyCount === 0) {
      await systemDb.companies.add({
        name: "My Jewellery Shop",
        city: "Pune",
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
  }): Promise<User> {
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

  async setActive(userId: number, active: boolean): Promise<void> {
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
