import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { DEFAULT_CATEGORY_NAMES, type Category, type Item, type Settings, type StorageLocation } from "../domain/expiry.js";

export type AmberProductState = {
  version: 1;
  items: Item[];
  categories: Category[];
  storageLocations: StorageLocation[];
  settings: Settings;
};

export type ProductRepository = {
  load(): Promise<AmberProductState>;
  save(state: AmberProductState): Promise<void>;
  reset(): Promise<AmberProductState>;
};

export type InvokeCommand = <T = unknown>(command: string, payload?: Record<string, unknown>) => Promise<T>;

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createRemoteProductRepository(invokeCommand: InvokeCommand = tauriInvoke): ProductRepository {
  return {
    load() {
      return invokeCommand<AmberProductState>("load_product_state");
    },
    async save(state) {
      await invokeCommand("save_product_state", { state });
    },
    reset() {
      return invokeCommand<AmberProductState>("reset_product_state");
    },
  };
}

export function createMemoryProductRepository(seedTimestamp = new Date().toISOString()): ProductRepository {
  let state = createInitialProductState(seedTimestamp);

  return {
    async load() {
      return cloneState(state);
    },
    async save(nextState) {
      state = cloneState(nextState);
    },
    async reset() {
      state = createInitialProductState(seedTimestamp);
      return cloneState(state);
    },
  };
}

export function createInitialProductState(seedTimestamp = new Date().toISOString()): AmberProductState {
  return {
    version: 1,
    items: [],
    categories: DEFAULT_CATEGORY_NAMES.map((name) => ({
      id: createPresetCategoryId(name),
      name,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    })),
    storageLocations: [],
    settings: {
      defaultReminderDays: 30,
    },
  };
}

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

export function typeSafeJsonParse(value: string | null): unknown {
  if (value === null) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function cloneState(state: AmberProductState): AmberProductState {
  return JSON.parse(JSON.stringify(state)) as AmberProductState;
}

function createPresetCategoryId(name: string): string {
  const slugByName: Record<string, string> = {
    食品: "food",
    药品: "medicine",
    化妆品: "cosmetics",
    家用品: "household",
    收藏品: "collection",
    其他: "other",
  };

  return `category-${slugByName[name] ?? name}`;
}
