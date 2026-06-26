# jewllery-erpp — Jewel-ERP

An **offline-first Jewellery Store Management** application for the Indian market
(POS, old-gold exchange, Girvi gold loans, Karigar tracking, gold schemes, GST
billing and simplified accounting). Built to be wrapped as a local desktop app
(Tauri/Electron + SQLite) in a later phase.

## Tech stack
- **React 19 + TypeScript + Vite 7**
- **Tailwind CSS v4 + shadcn/ui** (dense, professional enterprise UI)
- **Dexie.js (IndexedDB)** for offline storage — all access abstracted behind
  `src/services/dbService.ts` so the engine can be swapped for SQLite later
- **Zustand** (UI state) · **React Query** · **React Hook Form + Zod** · **React Router**

## Features
- **Auth & multi-firm** — login + users/roles, multiple firms with isolated data,
  financial-year selection
- **Item Master** — auto net-weight, sequential barcodes, HUID, **barcode label printing**
- **Customers** — KYC, outstanding (Udhari) tracking
- **Unified POS** — barcode scan, URD old-gold exchange, CGST/SGST & IGST, TCS,
  bill/making discounts, walk-in customers, cash/UPI split, **WhatsApp send**,
  modify existing bill, F12 quick save
- **Receipt (Udhari collection)**, **Purchase & Suppliers**, **Gold Saving Schemes**
- **Girvi (gold loans)** with collateral photo + Pavati, **Karigar** metal tracking
- **Order Booking** (custom orders, advance, delivery; linked to Karigar)
- **Day Book**, **Reports** (party ledger, cash book, **GSTR-1** with CSV export)
- **Backup & restore** (JSON export/import)

## Getting started
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Default login on first run: **admin / admin** (change it in Settings).

## Project layout
- `src/db/` — Dexie schema, types, seed data
- `src/services/dbService.ts` — the single data-access layer
- `src/features/` — one folder per module (pos, items, customers, girvi, karigar, …)
- `docs/` — competitive analysis & gap analysis vs. the benchmark product
