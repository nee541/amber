import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialProductState,
  createMemoryProductRepository,
  createMemoryStorage,
  createRemoteProductRepository,
  typeSafeJsonParse,
} from "../.test-dist/adapters/productRepository.js";

test("creates initial state with preset categories and default reminder settings", () => {
  const state = createInitialProductState("2026-01-01T00:00:00.000Z");

  assert.deepEqual(
    state.categories.map((category) => category.name),
    ["食品", "药品", "化妆品", "家用品", "收藏品", "其他"],
  );
  assert.deepEqual(state.storageLocations, []);
  assert.equal(state.settings.defaultReminderDays, 30);
  assert.deepEqual(state.items, []);
});

test("persists command-oriented changes through memory repository", async () => {
  const repository = createMemoryProductRepository("2026-01-01T00:00:00.000Z");
  const state = await repository.load();
  const location = {
    id: "loc-1",
    name: "冰箱",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  await repository.createStorageLocation(location);
  await repository.updateDefaultReminderDays(7);

  assert.deepEqual(await repository.load(), {
    ...state,
    settings: { defaultReminderDays: 7 },
    storageLocations: [location],
  });
});

test("remote repository uses command-oriented Tauri persistence", async () => {
  const calls = [];
  const initial = createInitialProductState("2026-01-01T00:00:00.000Z");
  const category = {
    id: "category-food",
    name: "食品",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const storageLocation = {
    id: "location-fridge",
    name: "冰箱",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const item = {
    id: "item-1",
    name: "牛奶",
    categoryId: category.id,
    productionDate: "2026-01-01",
    shelfLifeValue: 30,
    shelfLifeUnit: "day",
    quantity: 2,
    storageLocationId: storageLocation.id,
    note: "低温保存",
    customReminderDays: 3,
    userStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const repository = createRemoteProductRepository(async (command, payload) => {
    calls.push({ command, payload });
    return initial;
  });

  assert.deepEqual(await repository.load(), initial);
  assert.deepEqual(await repository.createItem(item, { category, storageLocation }), initial);
  await repository.updateItem(item, { category: undefined, storageLocation: undefined });
  await repository.setItemUserStatus("item-1", "archived", "2026-01-02T00:00:00.000Z");
  await repository.moveItemToTrash("item-1", "2026-01-03T00:00:00.000Z", "2026-01-03T00:00:00.000Z");
  await repository.restoreItemFromTrash("item-1", "2026-01-04T00:00:00.000Z");
  await repository.permanentlyDeleteItem("item-1");
  await repository.createCategory(category);
  await repository.renameCategory("category-food", "冷藏食品", "2026-01-05T00:00:00.000Z");
  await repository.deleteCategory("category-food");
  await repository.migrateAndDeleteCategory("category-source", "category-target", "2026-01-06T00:00:00.000Z");
  await repository.createStorageLocation(storageLocation);
  await repository.renameStorageLocation("location-fridge", "冷藏室", "2026-01-07T00:00:00.000Z");
  await repository.deleteStorageLocation("location-fridge");
  await repository.migrateAndDeleteStorageLocation("location-a", "location-b", "2026-01-08T00:00:00.000Z");
  await repository.updateDefaultReminderDays(14);
  assert.deepEqual(await repository.reset(), initial);

  assert.deepEqual(calls.map((call) => call.command), [
    "load_product_state",
    "create_product_item",
    "update_product_item",
    "set_product_item_user_status",
    "move_product_item_to_trash",
    "restore_product_item_from_trash",
    "permanently_delete_product_item",
    "create_product_category",
    "rename_product_category",
    "delete_product_category",
    "migrate_and_delete_product_category",
    "create_product_storage_location",
    "rename_product_storage_location",
    "delete_product_storage_location",
    "migrate_and_delete_product_storage_location",
    "update_product_default_reminder_days",
    "reset_product_state",
  ]);
  assert.deepEqual(calls[1].payload, { item, category, storageLocation });
  assert.deepEqual(calls[2].payload, { item, category: null, storageLocation: null });
  assert.deepEqual(calls[3].payload, {
    itemId: "item-1",
    userStatus: "archived",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
  assert.deepEqual(calls[10].payload, {
    sourceCategoryId: "category-source",
    targetCategoryId: "category-target",
    updatedAt: "2026-01-06T00:00:00.000Z",
  });
  assert.deepEqual(calls[15].payload, { defaultReminderDays: 14 });
});

test("memory storage helper remains available for focused adapter tests", () => {
  const storage = createMemoryStorage({ sample: '{"ok":true}' });

  assert.deepEqual(typeSafeJsonParse(storage.getItem("sample")), { ok: true });
  assert.equal(typeSafeJsonParse("not-json"), undefined);
});
