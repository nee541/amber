import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  DEFAULT_CATEGORY_NAMES,
  type Category,
  type Item,
  type ItemUserStatus,
  type Settings,
  type StorageLocation,
} from "../domain/expiry.js";

export type AmberProductState = {
  version: 1;
  items: Item[];
  categories: Category[];
  storageLocations: StorageLocation[];
  settings: Settings;
};

export type ProductRepository = {
  load(): Promise<AmberProductState>;
  reset(): Promise<AmberProductState>;
  createItem(item: Item, references?: ProductItemReferences): Promise<AmberProductState>;
  updateItem(item: Item, references?: ProductItemReferences): Promise<AmberProductState>;
  setItemUserStatus(itemId: string, userStatus: ItemUserStatus, updatedAt: string): Promise<AmberProductState>;
  moveItemToTrash(itemId: string, deletedAt: string, updatedAt: string): Promise<AmberProductState>;
  restoreItemFromTrash(itemId: string, updatedAt: string): Promise<AmberProductState>;
  permanentlyDeleteItem(itemId: string): Promise<AmberProductState>;
  createCategory(category: Category): Promise<AmberProductState>;
  renameCategory(categoryId: string, name: string, updatedAt: string): Promise<AmberProductState>;
  deleteCategory(categoryId: string): Promise<AmberProductState>;
  migrateAndDeleteCategory(
    sourceCategoryId: string,
    targetCategoryId: string,
    updatedAt: string,
  ): Promise<AmberProductState>;
  createStorageLocation(storageLocation: StorageLocation): Promise<AmberProductState>;
  renameStorageLocation(storageLocationId: string, name: string, updatedAt: string): Promise<AmberProductState>;
  deleteStorageLocation(storageLocationId: string): Promise<AmberProductState>;
  migrateAndDeleteStorageLocation(
    sourceStorageLocationId: string,
    targetStorageLocationId: string,
    updatedAt: string,
  ): Promise<AmberProductState>;
  updateDefaultReminderDays(defaultReminderDays: number): Promise<AmberProductState>;
};

export type ProductItemReferences = {
  category?: Category;
  storageLocation?: StorageLocation;
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
    reset() {
      return invokeCommand<AmberProductState>("reset_product_state");
    },
    createItem(item, references = {}) {
      return invokeCommand<AmberProductState>("create_product_item", {
        item,
        category: references.category ?? null,
        storageLocation: references.storageLocation ?? null,
      });
    },
    updateItem(item, references = {}) {
      return invokeCommand<AmberProductState>("update_product_item", {
        item,
        category: references.category ?? null,
        storageLocation: references.storageLocation ?? null,
      });
    },
    setItemUserStatus(itemId, userStatus, updatedAt) {
      return invokeCommand<AmberProductState>("set_product_item_user_status", { itemId, userStatus, updatedAt });
    },
    moveItemToTrash(itemId, deletedAt, updatedAt) {
      return invokeCommand<AmberProductState>("move_product_item_to_trash", { itemId, deletedAt, updatedAt });
    },
    restoreItemFromTrash(itemId, updatedAt) {
      return invokeCommand<AmberProductState>("restore_product_item_from_trash", { itemId, updatedAt });
    },
    permanentlyDeleteItem(itemId) {
      return invokeCommand<AmberProductState>("permanently_delete_product_item", { itemId });
    },
    createCategory(category) {
      return invokeCommand<AmberProductState>("create_product_category", { category });
    },
    renameCategory(categoryId, name, updatedAt) {
      return invokeCommand<AmberProductState>("rename_product_category", { categoryId, name, updatedAt });
    },
    deleteCategory(categoryId) {
      return invokeCommand<AmberProductState>("delete_product_category", { categoryId });
    },
    migrateAndDeleteCategory(sourceCategoryId, targetCategoryId, updatedAt) {
      return invokeCommand<AmberProductState>("migrate_and_delete_product_category", {
        sourceCategoryId,
        targetCategoryId,
        updatedAt,
      });
    },
    createStorageLocation(storageLocation) {
      return invokeCommand<AmberProductState>("create_product_storage_location", { storageLocation });
    },
    renameStorageLocation(storageLocationId, name, updatedAt) {
      return invokeCommand<AmberProductState>("rename_product_storage_location", {
        storageLocationId,
        name,
        updatedAt,
      });
    },
    deleteStorageLocation(storageLocationId) {
      return invokeCommand<AmberProductState>("delete_product_storage_location", { storageLocationId });
    },
    migrateAndDeleteStorageLocation(sourceStorageLocationId, targetStorageLocationId, updatedAt) {
      return invokeCommand<AmberProductState>("migrate_and_delete_product_storage_location", {
        sourceStorageLocationId,
        targetStorageLocationId,
        updatedAt,
      });
    },
    updateDefaultReminderDays(defaultReminderDays) {
      return invokeCommand<AmberProductState>("update_product_default_reminder_days", { defaultReminderDays });
    },
  };
}

export function createMemoryProductRepository(seedTimestamp = new Date().toISOString()): ProductRepository {
  let state = createInitialProductState(seedTimestamp);

  return {
    async load() {
      return cloneState(state);
    },
    async reset() {
      state = createInitialProductState(seedTimestamp);
      return cloneState(state);
    },
    async createItem(item, references = {}) {
      state = {
        ...state,
        items: [...state.items, cloneValue(item)],
        categories: appendOptional(state.categories, references.category),
        storageLocations: appendOptional(state.storageLocations, references.storageLocation),
      };
      return cloneState(state);
    },
    async updateItem(item, references = {}) {
      state = {
        ...state,
        items: state.items.map((entry) => (entry.id === item.id ? cloneValue(item) : entry)),
        categories: appendOptional(state.categories, references.category),
        storageLocations: appendOptional(state.storageLocations, references.storageLocation),
      };
      return cloneState(state);
    },
    async setItemUserStatus(itemId, userStatus, updatedAt) {
      state = {
        ...state,
        items: state.items.map((item) => (item.id === itemId ? { ...item, userStatus, updatedAt } : item)),
      };
      return cloneState(state);
    },
    async moveItemToTrash(itemId, deletedAt, updatedAt) {
      state = {
        ...state,
        items: state.items.map((item) => (item.id === itemId ? { ...item, deletedAt, updatedAt } : item)),
      };
      return cloneState(state);
    },
    async restoreItemFromTrash(itemId, updatedAt) {
      state = {
        ...state,
        items: state.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          const { deletedAt: _deletedAt, ...rest } = item;
          return { ...rest, updatedAt };
        }),
      };
      return cloneState(state);
    },
    async permanentlyDeleteItem(itemId) {
      state = {
        ...state,
        items: state.items.filter((item) => item.id !== itemId),
      };
      return cloneState(state);
    },
    async createCategory(category) {
      state = {
        ...state,
        categories: [...state.categories, cloneValue(category)],
      };
      return cloneState(state);
    },
    async renameCategory(categoryId, name, updatedAt) {
      state = {
        ...state,
        categories: state.categories.map((category) =>
          category.id === categoryId ? { ...category, name, updatedAt } : category,
        ),
      };
      return cloneState(state);
    },
    async deleteCategory(categoryId) {
      state = {
        ...state,
        categories: state.categories.filter((category) => category.id !== categoryId),
      };
      return cloneState(state);
    },
    async migrateAndDeleteCategory(sourceCategoryId, targetCategoryId, updatedAt) {
      state = {
        ...state,
        items: state.items.map((item) =>
          item.categoryId === sourceCategoryId ? { ...item, categoryId: targetCategoryId, updatedAt } : item,
        ),
        categories: state.categories.filter((category) => category.id !== sourceCategoryId),
      };
      return cloneState(state);
    },
    async createStorageLocation(storageLocation) {
      state = {
        ...state,
        storageLocations: [...state.storageLocations, cloneValue(storageLocation)],
      };
      return cloneState(state);
    },
    async renameStorageLocation(storageLocationId, name, updatedAt) {
      state = {
        ...state,
        storageLocations: state.storageLocations.map((location) =>
          location.id === storageLocationId ? { ...location, name, updatedAt } : location,
        ),
      };
      return cloneState(state);
    },
    async deleteStorageLocation(storageLocationId) {
      state = {
        ...state,
        storageLocations: state.storageLocations.filter((location) => location.id !== storageLocationId),
      };
      return cloneState(state);
    },
    async migrateAndDeleteStorageLocation(sourceStorageLocationId, targetStorageLocationId, updatedAt) {
      state = {
        ...state,
        items: state.items.map((item) =>
          item.storageLocationId === sourceStorageLocationId
            ? { ...item, storageLocationId: targetStorageLocationId, updatedAt }
            : item,
        ),
        storageLocations: state.storageLocations.filter((location) => location.id !== sourceStorageLocationId),
      };
      return cloneState(state);
    },
    async updateDefaultReminderDays(defaultReminderDays) {
      state = {
        ...state,
        settings: { ...state.settings, defaultReminderDays },
      };
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

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendOptional<T extends { id: string }>(items: T[], item: T | undefined): T[] {
  if (!item || items.some((entry) => entry.id === item.id)) {
    return items;
  }

  return [...items, cloneValue(item)];
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
