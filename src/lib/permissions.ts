import type { UserRole } from "@/db/systemDb"
export type SensitiveAction = "daily" | "reasoned" | "manage_users" | "restore_backup" | "reopen_financial_year" | "permanent_delete" | "irreversible_stock"
export function normalizeRole(role: string | undefined): UserRole { return role === "cashier" ? "staff" : role === "owner" || role === "manager" ? role : "staff" }
export function can(role: UserRole | string | undefined, action: SensitiveAction): boolean { const r=normalizeRole(role); if(action==="daily"||action==="reasoned") return true; if(action==="irreversible_stock") return r==="manager"||r==="owner"; return r==="owner" }
export interface DiscountPolicy { directLimit:number; reasonLimit:number }
export type DiscountDecision="allow"|"reason"|"manager"
export function discountDecision(role:UserRole|string|undefined,discount:number,policy:DiscountPolicy):DiscountDecision { const n=Math.max(0,discount||0); if(n<=Math.max(0,policy.directLimit))return"allow"; if(n<=Math.max(policy.directLimit,policy.reasonLimit))return"reason"; return normalizeRole(role)==="staff"?"manager":"reason" }
export function assertAllowed(role:UserRole|string|undefined,action:SensitiveAction):void { if(!can(role,action))throw new Error("This action is restricted to an authorised role") }
