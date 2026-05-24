import test from "node:test";
import assert from "node:assert/strict";

import { createInitialProductState } from "../.test-dist/adapters/productRepository.js";
import {
  addProduct,
  deleteCategory,
  deleteStorageLocation,
  editProduct,
  migrateAndDeleteCategory,
  migrateAndDeleteStorageLocation,
  moveProductToTrash,
  permanentlyDeleteProduct,
  renameCategory,
  renameStorageLocation,
  restoreProductFromTrash,
  setProductUserStatus,
  updateDefaultReminderDays,
} from "../.test-dist/app/productApp.js";
import { createDerivedItem } from "../.test-dist/domain/expiry.js";

function context() {
  let index = 0;
  return {
    currentDate: "2026-01-15",
    now: "2026-01-15T08:00:00.000Z",
    createId(prefix) {
      index += 1;
      return `${prefix}-${index}`;
    },
  };
}

function validInput(overrides = {}) {
  return {
    name: "牛奶",
    categoryName: "食品",
    productionDate: "2026-01-01",
    shelfLifeValue: 30,
    shelfLifeUnit: "day",
    quantity: undefined,
    storageLocationName: "冰箱",
    note: "",
    customReminderDays: undefined,
    ...overrides,
  };
}

test("adds products, auto-creates missing categories and locations, and allows duplicate names", () => {
  const actionContext = context();
  let state = createInitialProductState("2026-01-01T00:00:00.000Z");

  const first = addProduct(state, validInput({ categoryName: "零食", storageLocationName: "客厅柜" }), actionContext);
  assert.deepEqual(first.errors, []);
  state = first.state;

  const second = addProduct(state, validInput({ categoryName: "零食", storageLocationName: "客厅柜" }), actionContext);
  state = second.state;

  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].name, state.items[1].name);
  assert.equal(state.categories.some((category) => category.name === "零食"), true);
  assert.equal(state.storageLocations.some((location) => location.name === "客厅柜"), true);
});

test("rejects future production dates and non-positive shelf-life values", () => {
  const result = addProduct(
    createInitialProductState("2026-01-01T00:00:00.000Z"),
    validInput({ productionDate: "2026-01-16", shelfLifeValue: 0 }),
    context(),
  );

  assert.equal(result.state.items.length, 0);
  assert.deepEqual(result.errors, ["生产日期不能晚于当前日期", "保质期数值必须为正整数"]);
});

test("edits product data and keeps createdAt while updating derived expiry immediately", () => {
  const actionContext = context();
  let state = addProduct(createInitialProductState(), validInput(), actionContext).state;
  const original = state.items[0];

  state = editProduct(
    state,
    original.id,
    validInput({ productionDate: "2026-01-10", shelfLifeValue: 10, customReminderDays: 3 }),
    { ...actionContext, now: "2026-01-16T09:00:00.000Z" },
  ).state;

  const updated = state.items[0];
  const derived = createDerivedItem(updated, state.categories, state.storageLocations, state.settings, "2026-01-18");
  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.updatedAt, "2026-01-16T09:00:00.000Z");
  assert.equal(derived.expiryDate, "2026-01-20");
  assert.equal(derived.reminderDays, 3);
  assert.equal(derived.systemStatus, "warning");
});

test("updates user status, moves product to trash, restores it, and permanently deletes it", () => {
  const actionContext = context();
  let state = addProduct(createInitialProductState(), validInput(), actionContext).state;
  const productId = state.items[0].id;

  state = setProductUserStatus(state, productId, "used_up", actionContext).state;
  assert.equal(state.items[0].userStatus, "used_up");

  state = moveProductToTrash(state, productId, { ...actionContext, now: "2026-01-17T00:00:00.000Z" }).state;
  assert.equal(state.items[0].deletedAt, "2026-01-17T00:00:00.000Z");
  assert.equal(state.items[0].userStatus, "used_up");

  state = restoreProductFromTrash(state, productId, actionContext).state;
  assert.equal(state.items[0].deletedAt, undefined);
  assert.equal(state.items[0].userStatus, "used_up");

  const blockedDelete = permanentlyDeleteProduct(state, productId);
  assert.deepEqual(blockedDelete.errors, ["商品需要先进入回收站才能永久删除"]);

  state = moveProductToTrash(state, productId, actionContext).state;
  state = permanentlyDeleteProduct(state, productId).state;
  assert.equal(state.items.length, 0);
});

test("prevents deleting referenced categories and locations but allows rename and unreferenced deletion", () => {
  const actionContext = context();
  let state = addProduct(createInitialProductState(), validInput({ storageLocationName: "冰箱" }), actionContext).state;
  const categoryId = state.items[0].categoryId;
  const locationId = state.items[0].storageLocationId;

  const blockedCategoryDelete = deleteCategory(state, categoryId);
  assert.deepEqual(blockedCategoryDelete.errors, ["分类正在被商品使用，请先迁移关联商品"]);

  const blockedLocationDelete = deleteStorageLocation(state, locationId);
  assert.deepEqual(blockedLocationDelete.errors, ["存放位置正在被商品使用，请先迁移关联商品"]);

  state = renameCategory(state, categoryId, "冷藏食品", actionContext).state;
  assert.equal(state.categories.find((category) => category.id === categoryId).name, "冷藏食品");

  state = renameStorageLocation(state, locationId, "主冰箱", actionContext).state;
  assert.equal(state.storageLocations.find((location) => location.id === locationId).name, "主冰箱");

  state = moveProductToTrash(state, state.items[0].id, actionContext).state;
  state = permanentlyDeleteProduct(state, state.items[0].id).state;
  assert.deepEqual(deleteCategory(state, categoryId).errors, []);
  assert.deepEqual(deleteStorageLocation(state, locationId).errors, []);
});

test("migrates referenced categories and locations before deleting them", () => {
  const actionContext = context();
  let state = addProduct(createInitialProductState(), validInput({ categoryName: "零食", storageLocationName: "厨房柜" }), actionContext).state;
  state = addProduct(state, validInput({ name: "饼干", categoryName: "食品", storageLocationName: "冰箱" }), actionContext).state;

  const sourceCategoryId = state.categories.find((category) => category.name === "零食").id;
  const targetCategoryId = state.categories.find((category) => category.name === "食品").id;
  const sourceLocationId = state.storageLocations.find((location) => location.name === "厨房柜").id;
  const targetLocationId = state.storageLocations.find((location) => location.name === "冰箱").id;

  state = migrateAndDeleteCategory(state, sourceCategoryId, targetCategoryId, actionContext).state;
  assert.equal(state.categories.some((category) => category.id === sourceCategoryId), false);
  assert.equal(state.items.every((product) => product.categoryId !== sourceCategoryId), true);

  state = migrateAndDeleteStorageLocation(state, sourceLocationId, targetLocationId, actionContext).state;
  assert.equal(state.storageLocations.some((location) => location.id === sourceLocationId), false);
  assert.equal(state.items.every((product) => product.storageLocationId !== sourceLocationId), true);
});

test("updates global reminder days without touching product custom reminder days", () => {
  const actionContext = context();
  let state = addProduct(createInitialProductState(), validInput({ customReminderDays: 7 }), actionContext).state;
  state = addProduct(state, validInput({ name: "酸奶", customReminderDays: undefined }), actionContext).state;

  state = updateDefaultReminderDays(state, 90).state;

  const [customProduct, globalProduct] = state.items.map((product) =>
    createDerivedItem(product, state.categories, state.storageLocations, state.settings, "2026-01-15"),
  );
  assert.equal(customProduct.reminderDays, 7);
  assert.equal(globalProduct.reminderDays, 90);
});
