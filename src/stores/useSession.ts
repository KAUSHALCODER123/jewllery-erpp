import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Company, UserRole } from "@/db/systemDb"

export interface SessionUser {
  id: number
  username: string
  name: string
  role: UserRole
}

interface SessionState {
  user: SessionUser | null
  companyId: number | null
  company: Company | null
  financialYear: string | null
  setSession: (s: {
    user: SessionUser
    companyId: number
    company: Company
    financialYear: string
  }) => void
  setCompanyProfile: (company: Company) => void
  logout: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      companyId: null,
      company: null,
      financialYear: null,
      setSession: ({ user, companyId, company, financialYear }) =>
        set({ user, companyId, company, financialYear }),
      setCompanyProfile: (company) => set({ company }),
      logout: () => set({ user: null }),
    }),
    { name: "jewel.session" },
  ),
)

/** Indian financial-year labels (Apr–Mar) around the current year. */
export function financialYearOptions(): string[] {
  const now = new Date()
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const opts: string[] = []
  for (let y = startYear + 1; y >= startYear - 2; y--) {
    opts.push(`${y}-${(y + 1) % 100}`)
  }
  return opts
}

export const currentFinancialYear = (): string => financialYearOptions()[1]
