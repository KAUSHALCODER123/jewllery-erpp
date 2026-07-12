# Lightweight Permissions and Audit

The ERP uses three roles: **Staff**, **Manager**, and **Owner**. Existing `cashier`
accounts migrate automatically to `staff`.

## Policy

- Staff can perform normal billing, receipts, purchases, orders, Girvi, schemes,
  rates, and stock work.
- A reason—not an owner PIN—is required for changing an existing rate, editing a
  previous-day invoice, adjusting an existing stock item, cancelling an invoice,
  and discounts above the configured direct limit.
- Discounts above the configured high threshold require a Manager or Owner.
  Managers and Owners still enter a reason, keeping the event accountable.
- Owner-only operations are user/role administration, backup restore, reopening
  closed financial years, and permanent deletion.
- Manager or Owner is the intended boundary for major irreversible stock actions.

## Audit

Audit records are written quietly to `audit_log` with timestamp, user, action,
entity/id, reason, and before/after JSON where applicable. They do not interrupt
ordinary work and are included in backup/migration data.

## Discount settings

`Company.discountDirectLimit` defaults to ₹500. `discountReasonLimit` defaults to
₹2,000. Both are configurable under Settings → Print & Rates.

## Follow-up

- Add an owner-facing audit viewer/filter/export screen.
- Implement financial-year close/reopen state; reopening must remain Owner-only.
- Apply the Manager/Owner boundary when future bulk stock-write-off/import tools
  are introduced.
- Replace browser prompts with a reusable reason dialog if richer notes or
  attachments become necessary.
