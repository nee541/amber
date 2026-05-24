# Product Expiry Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP product production-date, shelf-life, in-app reminder, filtering, settings, and recycle-bin experience described in `docs/prd/001-product-expiry-reminder.md`.

**Architecture:** Keep date calculation, status derivation, filtering, sorting, and seed data in pure TypeScript domain modules. Keep persistence behind a repository adapter so React components do not call storage APIs directly. Build a single-page React app with tabbed work areas for items, reminders, settings, and recycle bin.

**Tech Stack:** React 19, TypeScript, Vite, Node built-in test runner for domain tests, browser `localStorage` behind an adapter for the MVP client store.

---

### Task 1: Domain Model And Expiry Logic

**Files:**
- Create: `src/domain/expiry.ts`
- Create: `src/domain/expiry.test.ts`
- Create: `tsconfig.test.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

Add tests covering shelf-life date math, leap-year month addition, status calculation, reminder override precedence, default sorting, filtering out inactive/deleted records, and allowing duplicate names through separate item records.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test`

Expected: failure because `src/domain/expiry.ts` does not exist yet.

- [ ] **Step 3: Implement minimal domain logic**

Add exported types for `ShelfLifeUnit`, `ItemUserStatus`, `Item`, `Category`, `StorageLocation`, `Settings`, derived item view models, date helpers, status helpers, and collection helpers.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test`

Expected: all domain tests pass.

### Task 2: Local Repository Adapter

**Files:**
- Create: `src/adapters/productRepository.ts`
- Create: `src/adapters/productRepository.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving the repository seeds default categories/settings, persists items/categories/locations/settings, auto-creates typed categories/locations through app actions, and keeps item timestamps/deletion state.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test`

Expected: repository tests fail because the adapter is not implemented.

- [ ] **Step 3: Implement repository**

Create a storage abstraction with a browser `localStorage` implementation and an in-memory implementation for tests. Store a versioned `AmberProductState` payload.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test`

Expected: domain and repository tests pass.

### Task 3: Application State And Product Workflows

**Files:**
- Create: `src/app/productApp.ts`
- Create: `src/app/productApp.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for adding/editing/deleting/restoring/permanently deleting products, category/location create/rename/delete guards, global reminder changes, user-status restoration, and validation.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test`

Expected: app workflow tests fail because the app service is missing.

- [ ] **Step 3: Implement app service**

Create pure action functions that take state and return state, keeping mutation rules outside React.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test`

Expected: all tests pass.

### Task 4: React UI

**Files:**
- Replace: `src/App.tsx`
- Replace: `src/App.css`

- [ ] **Step 1: Build UI against app service**

Create tabs for product list, reminders, settings, and recycle bin. Include add/edit/detail flows, previews, filters, status controls, category/location management, global reminder settings, delete/restore/permanent delete flows, and default sorting.

- [ ] **Step 2: Run build verification**

Run: `pnpm build`

Expected: TypeScript and Vite build pass.

### Task 5: Requirement Review

**Files:**
- Read: `docs/prd/001-product-expiry-reminder.md`
- Inspect: changed source files

- [ ] **Step 1: Run full verification**

Run: `pnpm test`

Run: `pnpm build`

Expected: both commands pass.

- [ ] **Step 2: Dispatch subagent review**

Ask a fresh subagent to compare the implementation against every PRD acceptance criterion and report missing or incomplete behavior.

- [ ] **Step 3: Fix gaps and repeat**

If the subagent reports any gap, implement the fix, rerun verification, and repeat review until the PRD is fully covered.
