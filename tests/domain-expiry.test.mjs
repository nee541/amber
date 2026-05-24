import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateExpiryDate,
  createDerivedItem,
  filterItems,
  getEffectiveReminderDays,
  sortItemsForDefaultList,
} from "../.test-dist/domain/expiry.js";

const baseCategory = { id: "cat-food", name: "食品", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const baseLocation = { id: "loc-fridge", name: "冰箱", createdAt: "2026-01-01", updatedAt: "2026-01-01" };

function item(overrides = {}) {
  return {
    id: overrides.id ?? "item-1",
    name: overrides.name ?? "牛奶",
    categoryId: overrides.categoryId ?? baseCategory.id,
    productionDate: overrides.productionDate ?? "2026-01-01",
    shelfLifeValue: overrides.shelfLifeValue ?? 30,
    shelfLifeUnit: overrides.shelfLifeUnit ?? "day",
    quantity: overrides.quantity,
    storageLocationId: Object.hasOwn(overrides, "storageLocationId") ? overrides.storageLocationId : baseLocation.id,
    note: overrides.note,
    customReminderDays: overrides.customReminderDays,
    userStatus: overrides.userStatus ?? "active",
    deletedAt: overrides.deletedAt,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("calculates expiry dates with day, month, year, and leap-year clamping rules", () => {
  assert.equal(calculateExpiryDate("2026-01-01", 1, "day"), "2026-01-02");
  assert.equal(calculateExpiryDate("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(calculateExpiryDate("2024-01-31", 1, "month"), "2024-02-29");
  assert.equal(calculateExpiryDate("2024-02-29", 1, "year"), "2025-02-28");
});

test("uses custom reminder days before global reminder days", () => {
  assert.equal(getEffectiveReminderDays(item({ customReminderDays: 7 }), { defaultReminderDays: 30 }), 7);
  assert.equal(getEffectiveReminderDays(item({ customReminderDays: undefined }), { defaultReminderDays: 30 }), 30);
});

test("derives normal, warning, today due, and expired status from local dates", () => {
  const settings = { defaultReminderDays: 30 };

  assert.equal(
    createDerivedItem(item({ shelfLifeValue: 60 }), [baseCategory], [baseLocation], settings, "2026-01-01")
      .systemStatus,
    "normal",
  );

  const warning = createDerivedItem(item(), [baseCategory], [baseLocation], settings, "2026-01-20");
  assert.equal(warning.systemStatus, "warning");
  assert.equal(warning.daysUntilExpiry, 11);

  const dueToday = createDerivedItem(item(), [baseCategory], [baseLocation], settings, "2026-01-31");
  assert.equal(dueToday.systemStatus, "warning");
  assert.equal(dueToday.relativeLabel, "今日到期");

  const expired = createDerivedItem(item(), [baseCategory], [baseLocation], settings, "2026-02-01");
  assert.equal(expired.systemStatus, "expired");
  assert.equal(expired.relativeLabel, "已过期 1 天");
});

test("sorts default list by expired and warning priority then nearest expiry", () => {
  const settings = { defaultReminderDays: 10 };
  const rows = [
    item({ id: "normal", name: "normal", productionDate: "2026-01-01", shelfLifeValue: 80 }),
    item({ id: "warning-later", name: "warning later", productionDate: "2026-01-01", shelfLifeValue: 45 }),
    item({ id: "expired", name: "expired", productionDate: "2026-01-01", shelfLifeValue: 10 }),
    item({ id: "warning-sooner", name: "warning sooner", productionDate: "2026-01-01", shelfLifeValue: 40 }),
  ].map((row) => createDerivedItem(row, [baseCategory], [baseLocation], settings, "2026-02-10"));

  assert.deepEqual(sortItemsForDefaultList(rows).map((row) => row.id), [
    "expired",
    "warning-sooner",
    "warning-later",
    "normal",
  ]);
});

test("excludes deleted and inactive records from active reminder eligibility", () => {
  const settings = { defaultReminderDays: 30 };
  const rows = [
    item({ id: "active", productionDate: "2026-01-01", shelfLifeValue: 20 }),
    item({ id: "used", productionDate: "2026-01-01", shelfLifeValue: 20, userStatus: "used_up" }),
    item({ id: "deleted", productionDate: "2026-01-01", shelfLifeValue: 20, deletedAt: "2026-01-05T00:00:00.000Z" }),
  ].map((row) => createDerivedItem(row, [baseCategory], [baseLocation], settings, "2026-01-20"));

  assert.deepEqual(rows.filter((row) => row.isActiveReminderCandidate).map((row) => row.id), ["active"]);
});

test("filters by query, category, location, unset location, and user status without mutating records", () => {
  const categories = [
    baseCategory,
    { id: "cat-medicine", name: "药品", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ];
  const locations = [
    baseLocation,
    { id: "loc-box", name: "药箱", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ];
  const settings = { defaultReminderDays: 30 };
  const rows = [
    item({ id: "milk", name: "牛奶", categoryId: "cat-food", storageLocationId: "loc-fridge" }),
    item({ id: "pill", name: "感冒药", categoryId: "cat-medicine", storageLocationId: "loc-box" }),
    item({ id: "unset", name: "饼干", categoryId: "cat-food", storageLocationId: undefined }),
    item({ id: "archived", name: "旧牛奶", categoryId: "cat-food", storageLocationId: "loc-fridge", userStatus: "archived" }),
  ].map((row) => createDerivedItem(row, categories, locations, settings, "2026-01-20"));

  assert.deepEqual(filterItems(rows, { query: "牛奶" }).map((row) => row.id), ["milk"]);
  assert.deepEqual(filterItems(rows, { categoryId: "cat-medicine" }).map((row) => row.id), ["pill"]);
  assert.deepEqual(filterItems(rows, { storageLocationId: "loc-box" }).map((row) => row.id), ["pill"]);
  assert.deepEqual(filterItems(rows, { storageLocationId: "__unset__" }).map((row) => row.id), ["unset"]);
  assert.deepEqual(filterItems(rows, { userStatus: "archived" }).map((row) => row.id), ["archived"]);
  assert.equal(rows[0].userStatus, "active");
});
