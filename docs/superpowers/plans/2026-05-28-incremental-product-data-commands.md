# Incremental Product Data Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-state product persistence with command-oriented SQLite writes for the existing product expiry MVP.

**Architecture:** Keep TypeScript domain validation and state transitions as the UI-facing source of behavior, but persist each accepted action through a dedicated repository method and Tauri command. Rust commands write only the affected rows inside a SQLite transaction and return the freshly read state after commit.

**Tech Stack:** React + TypeScript, Tauri v2 Rust commands, system SQLite C API, pnpm tests, Cargo tests.

---

### Task 1: Rust Incremental Store API

**Files:**
- Modify: `src-tauri/src/product_store.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests**

Add tests that call path-level functions which do not exist yet:

```rust
create_product_item_at_path(&path, item, Some(category), Some(location));
update_product_item_at_path(&path, item, None, None);
set_product_item_user_status_at_path(&path, "item-1", "archived", "2026-01-03T00:00:00.000Z");
migrate_and_delete_product_category_at_path(&path, "category-a", "category-b", "2026-01-04T00:00:00.000Z");
update_product_default_reminder_days_at_path(&path, 14);
```

Expected first run: Cargo test fails because these path-level functions are undefined.

- [ ] **Step 2: Implement row helpers**

Add focused helpers for `INSERT categories`, `INSERT storage_locations`, `INSERT items`, `UPDATE items`, category/location update and delete, settings update, and transaction wrapper returning `read_state()`.

- [ ] **Step 3: Add Tauri commands**

Expose commands:

```rust
create_product_item
update_product_item
set_product_item_user_status
move_product_item_to_trash
restore_product_item_from_trash
permanently_delete_product_item
create_product_category
rename_product_category
delete_product_category
migrate_and_delete_product_category
create_product_storage_location
rename_product_storage_location
delete_product_storage_location
migrate_and_delete_product_storage_location
update_product_default_reminder_days
```

Each command returns `AmberProductState`.

- [ ] **Step 4: Verify Rust**

Run:

```bash
cd src-tauri && cargo test
cd src-tauri && cargo check
```

Expected: all tests pass.

### Task 2: TypeScript Repository Interface

**Files:**
- Modify: `src/adapters/productRepository.ts`
- Modify: `tests/product-repository.test.mjs`

- [ ] **Step 1: Write failing adapter tests**

Update the remote repository test to assert command names and payloads for item create/update, status changes, trash operations, category/location management, migration, and reminder settings.

Expected first run: `pnpm test` fails because repository methods do not exist.

- [ ] **Step 2: Implement repository methods**

Replace UI usage of `save(fullState)` with methods that call the Tauri commands above and return the updated `AmberProductState`. Keep `load()` and `reset()` for startup/test support.

- [ ] **Step 3: Verify TypeScript adapter**

Run:

```bash
pnpm test
```

Expected: adapter tests and existing domain/app tests pass.

### Task 3: React Integration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace generic commit persistence**

Keep `productApp` pure functions for validation and local next-state calculation, but pass a repository operation into `commit()` so persistence is command-specific.

- [ ] **Step 2: Diff auto-created references for form submit**

When adding or editing a product, derive newly created category/location from `result.state` relative to the previous state and pass only those optional rows with the item command.

- [ ] **Step 3: Use command-specific persistence for every action**

Wire existing UI actions to repository methods: item create/update, status, trash, permanent delete, global reminder, category/location create/rename/delete/migration.

- [ ] **Step 4: Verify UI build**

Run:

```bash
pnpm test
pnpm build
```

Expected: tests and TypeScript build pass.

### Task 4: xhigh Review And Fixes

**Files:**
- Read-only review over changed files.

- [ ] **Step 1: Spawn xhigh code review subagent**

Ask it to verify that no product UI action still persists through `save_product_state`, that Rust writes are incremental, that transactions are scoped correctly, and that tests cover representative actions.

- [ ] **Step 2: Fix real review findings**

Fix Critical/Important findings and rerun:

```bash
pnpm test
pnpm build
cd src-tauri && cargo test
cd src-tauri && cargo check
```

Expected: all checks pass.
