# CI Release Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CI and Release pass on Linux/macOS/Windows x64 and ARM64 for the current Tauri app.

**Architecture:** Replace direct system SQLite linking with `libsqlite3-sys` bundled SQLite so Windows runners no longer need a preinstalled `sqlite3.lib`. Keep workflow changes narrow: install the missing Linux AppImage helper package and remove Tauri action inputs no longer accepted by the current action.

**Tech Stack:** GitHub Actions, Tauri v2, Rust, `libsqlite3-sys`, pnpm, Cargo.

---

### Task 1: Bundle SQLite for Rust Builds

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/product_store.rs`
- Modify: `src-tauri/Cargo.lock`

- [ ] **Step 1: Add bundled SQLite dependency**

Add the dependency:

```toml
libsqlite3-sys = { version = "0.35.0", features = ["bundled"] }
```

- [ ] **Step 2: Replace custom SQLite FFI bindings**

In `src-tauri/src/product_store.rs`, import SQLite types, constants, and functions from `libsqlite3_sys` and remove the manual `#[link(name = "sqlite3")]` extern block. Keep the existing `Database` and `Statement` wrapper APIs unchanged.

- [ ] **Step 3: Verify locally**

Run:

```bash
env CARGO_HOME=.cache/cargo-home cargo test --manifest-path src-tauri/Cargo.toml --locked
env CARGO_HOME=.cache/cargo-home cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Expected: both commands exit 0.

### Task 2: Fix Linux AppImage Dependencies

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add `xdg-utils` to Linux dependency installation**

Add `xdg-utils` to each Linux `apt-get install` package list. This provides `/usr/bin/xdg-open`, which Tauri AppImage bundling requires on Linux ARM64.

- [ ] **Step 2: Keep the package list consistent**

Ensure CI and Release install the same Linux build dependency set so matrix checks and release builds fail in the same place if a dependency is missing.

### Task 3: Update Tauri Action Inputs

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Remove unsupported inputs**

Remove:

```yaml
uploadWorkflowArtifacts: true
workflowArtifactNamePattern: Amber_[version]_[platform]_[arch]_[bundle]
releaseAssetNamePattern: Amber_[version]_[platform]_[arch][_setup][ext]
```

- [ ] **Step 2: Use the current asset naming input**

Add:

```yaml
assetNamePattern: Amber_[version]_[platform]_[arch][_setup][ext]
```

Expected: Release logs no longer emit "Unexpected input(s)" warnings for the Tauri action.

### Task 4: Local Verification

**Files:**
- No additional file edits.

- [ ] **Step 1: Run web checks**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands exit 0.

- [ ] **Step 2: Run Rust checks**

Run:

```bash
env CARGO_HOME=.cache/cargo-home cargo test --manifest-path src-tauri/Cargo.toml --locked
env CARGO_HOME=.cache/cargo-home cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Expected: both commands exit 0.

### Task 5: Remote Verification

**Files:**
- No additional file edits unless remote CI exposes a new root cause.

- [ ] **Step 1: Commit and push**

Run:

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/product_store.rs docs/superpowers/plans/2026-05-28-ci-release-infrastructure.md
git commit -m "ci: fix release matrix infrastructure"
git push origin main
```

Expected: push triggers main CI.

- [ ] **Step 2: Re-run PR checks**

Rebase or rerun Dependabot PR checks for PR #1 and PR #2 after `main` contains the fix.

Expected: PR CI no longer fails on Windows SQLite linking. PR #1 may still fail if pnpm's minimum release age policy rejects its fresh lockfile entry; in that case, re-run after the policy window has elapsed or let Dependabot recreate the PR.

- [ ] **Step 3: Re-run release**

Trigger Release from the updated workflow and wait for all matrix jobs.

Expected: Linux x64, Linux ARM64, macOS Intel, macOS Apple Silicon, Windows x64, and Windows ARM64 release jobs complete successfully and upload assets.
