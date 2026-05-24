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

test("persists and reloads product state through memory repository", async () => {
  const repository = createMemoryProductRepository("2026-01-01T00:00:00.000Z");
  const state = await repository.load();
  const nextState = {
    ...state,
    settings: { defaultReminderDays: 7 },
    storageLocations: [
      { id: "loc-1", name: "冰箱", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
  };

  await repository.save(nextState);

  assert.deepEqual(await repository.load(), nextState);
});

test("remote repository loads, saves, and resets through Tauri commands", async () => {
  const calls = [];
  const initial = createInitialProductState("2026-01-01T00:00:00.000Z");
  const repository = createRemoteProductRepository(async (command, payload) => {
    calls.push({ command, payload });
    if (command === "load_product_state" || command === "reset_product_state") {
      return initial;
    }
    return undefined;
  });

  assert.deepEqual(await repository.load(), initial);
  await repository.save(initial);
  assert.deepEqual(await repository.reset(), initial);
  assert.deepEqual(calls.map((call) => call.command), ["load_product_state", "save_product_state", "reset_product_state"]);
  assert.deepEqual(calls[1].payload, { state: initial });
});

test("memory storage helper remains available for focused adapter tests", () => {
  const storage = createMemoryStorage({ sample: '{"ok":true}' });

  assert.deepEqual(typeSafeJsonParse(storage.getItem("sample")), { ok: true });
  assert.equal(typeSafeJsonParse("not-json"), undefined);
});
