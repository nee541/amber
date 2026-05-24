import type { AmberProductState } from "../adapters/productRepository.js";
import {
  type Category,
  type Item,
  type ItemUserStatus,
  type ShelfLifeUnit,
  type StorageLocation,
  validateItemCore,
} from "../domain/expiry.js";

export type ProductFormInput = {
  name: string;
  categoryName: string;
  productionDate: string;
  shelfLifeValue: number;
  shelfLifeUnit: ShelfLifeUnit;
  quantity?: number;
  storageLocationName?: string;
  note?: string;
  customReminderDays?: number;
};

export type ActionContext = {
  currentDate: string;
  now: string;
  createId(prefix: string): string;
};

export type ActionResult = {
  state: AmberProductState;
  errors: string[];
};

export type ProductActionResult = ActionResult & {
  item?: Item;
};

export function createActionContext(): ActionContext {
  const now = new Date();

  return {
    currentDate: formatDateForInput(now),
    now: now.toISOString(),
    createId(prefix) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    },
  };
}

export function addProduct(
  state: AmberProductState,
  input: ProductFormInput,
  context: ActionContext = createActionContext(),
): ProductActionResult {
  const normalized = normalizeProductInput(input);
  const errors = validateProductInput(normalized, context.currentDate);
  if (errors.length > 0) {
    return { state, errors };
  }

  const categoryResult = findOrCreateCategory(state.categories, normalized.categoryName, context);
  const locationResult = findOrCreateStorageLocation(state.storageLocations, normalized.storageLocationName, context);
  const item: Item = {
    id: context.createId("item"),
    name: normalized.name,
    categoryId: categoryResult.id,
    productionDate: normalized.productionDate,
    shelfLifeValue: normalized.shelfLifeValue,
    shelfLifeUnit: normalized.shelfLifeUnit,
    quantity: normalized.quantity,
    storageLocationId: locationResult.id,
    note: normalized.note,
    customReminderDays: normalized.customReminderDays,
    userStatus: "active",
    createdAt: context.now,
    updatedAt: context.now,
  };

  return {
    state: {
      ...state,
      items: [...state.items, item],
      categories: categoryResult.categories,
      storageLocations: locationResult.storageLocations,
    },
    errors: [],
    item,
  };
}

export function editProduct(
  state: AmberProductState,
  itemId: string,
  input: ProductFormInput,
  context: ActionContext = createActionContext(),
): ProductActionResult {
  const existing = state.items.find((item) => item.id === itemId);
  if (!existing) {
    return { state, errors: ["商品不存在"] };
  }

  const normalized = normalizeProductInput(input);
  const errors = validateProductInput(normalized, context.currentDate);
  if (errors.length > 0) {
    return { state, errors };
  }

  const categoryResult = findOrCreateCategory(state.categories, normalized.categoryName, context);
  const locationResult = findOrCreateStorageLocation(state.storageLocations, normalized.storageLocationName, context);
  const updated: Item = {
    ...existing,
    name: normalized.name,
    categoryId: categoryResult.id,
    productionDate: normalized.productionDate,
    shelfLifeValue: normalized.shelfLifeValue,
    shelfLifeUnit: normalized.shelfLifeUnit,
    quantity: normalized.quantity,
    storageLocationId: locationResult.id,
    note: normalized.note,
    customReminderDays: normalized.customReminderDays,
    updatedAt: context.now,
  };

  return {
    state: {
      ...state,
      items: state.items.map((item) => (item.id === itemId ? updated : item)),
      categories: categoryResult.categories,
      storageLocations: locationResult.storageLocations,
    },
    errors: [],
    item: updated,
  };
}

export function setProductUserStatus(
  state: AmberProductState,
  itemId: string,
  userStatus: ItemUserStatus,
  context: ActionContext = createActionContext(),
): ProductActionResult {
  return updateItem(state, itemId, (item) => ({
    ...item,
    userStatus,
    updatedAt: context.now,
  }));
}

export function moveProductToTrash(
  state: AmberProductState,
  itemId: string,
  context: ActionContext = createActionContext(),
): ProductActionResult {
  return updateItem(state, itemId, (item) => ({
    ...item,
    deletedAt: context.now,
    updatedAt: context.now,
  }));
}

export function restoreProductFromTrash(
  state: AmberProductState,
  itemId: string,
  context: ActionContext = createActionContext(),
): ProductActionResult {
  return updateItem(state, itemId, (item) => ({
    ...item,
    deletedAt: undefined,
    updatedAt: context.now,
  }));
}

export function permanentlyDeleteProduct(state: AmberProductState, itemId: string): ActionResult {
  const existing = state.items.find((item) => item.id === itemId);
  if (!existing) {
    return { state, errors: ["商品不存在"] };
  }

  if (existing.deletedAt === undefined) {
    return { state, errors: ["商品需要先进入回收站才能永久删除"] };
  }

  return {
    state: {
      ...state,
      items: state.items.filter((item) => item.id !== itemId),
    },
    errors: [],
  };
}

export function createCategory(
  state: AmberProductState,
  name: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  const normalized = name.trim();
  if (!normalized) {
    return { state, errors: ["分类名称不能为空"] };
  }

  if (state.categories.some((category) => category.name === normalized)) {
    return { state, errors: ["分类已存在"] };
  }

  return {
    state: {
      ...state,
      categories: [
        ...state.categories,
        { id: context.createId("category"), name: normalized, createdAt: context.now, updatedAt: context.now },
      ],
    },
    errors: [],
  };
}

export function renameCategory(
  state: AmberProductState,
  categoryId: string,
  name: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  const normalized = name.trim();
  if (!normalized) {
    return { state, errors: ["分类名称不能为空"] };
  }

  if (state.categories.some((category) => category.id !== categoryId && category.name === normalized)) {
    return { state, errors: ["分类已存在"] };
  }

  return updateCategory(state, categoryId, (category) => ({ ...category, name: normalized, updatedAt: context.now }));
}

export function deleteCategory(state: AmberProductState, categoryId: string): ActionResult {
  if (state.items.some((item) => item.categoryId === categoryId)) {
    return { state, errors: ["分类正在被商品使用，请先迁移关联商品"] };
  }

  if (!state.categories.some((category) => category.id === categoryId)) {
    return { state, errors: ["分类不存在"] };
  }

  return {
    state: {
      ...state,
      categories: state.categories.filter((category) => category.id !== categoryId),
    },
    errors: [],
  };
}

export function migrateAndDeleteCategory(
  state: AmberProductState,
  sourceCategoryId: string,
  targetCategoryId: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  if (sourceCategoryId === targetCategoryId) {
    return { state, errors: ["迁移目标不能是当前分类"] };
  }

  if (!state.categories.some((category) => category.id === sourceCategoryId)) {
    return { state, errors: ["分类不存在"] };
  }

  if (!state.categories.some((category) => category.id === targetCategoryId)) {
    return { state, errors: ["迁移目标分类不存在"] };
  }

  return {
    state: {
      ...state,
      items: state.items.map((item) =>
        item.categoryId === sourceCategoryId ? { ...item, categoryId: targetCategoryId, updatedAt: context.now } : item,
      ),
      categories: state.categories.filter((category) => category.id !== sourceCategoryId),
    },
    errors: [],
  };
}

export function createStorageLocation(
  state: AmberProductState,
  name: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  const normalized = name.trim();
  if (!normalized) {
    return { state, errors: ["存放位置名称不能为空"] };
  }

  if (state.storageLocations.some((location) => location.name === normalized)) {
    return { state, errors: ["存放位置已存在"] };
  }

  return {
    state: {
      ...state,
      storageLocations: [
        ...state.storageLocations,
        { id: context.createId("location"), name: normalized, createdAt: context.now, updatedAt: context.now },
      ],
    },
    errors: [],
  };
}

export function renameStorageLocation(
  state: AmberProductState,
  locationId: string,
  name: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  const normalized = name.trim();
  if (!normalized) {
    return { state, errors: ["存放位置名称不能为空"] };
  }

  if (state.storageLocations.some((location) => location.id !== locationId && location.name === normalized)) {
    return { state, errors: ["存放位置已存在"] };
  }

  return updateStorageLocation(state, locationId, (location) => ({
    ...location,
    name: normalized,
    updatedAt: context.now,
  }));
}

export function deleteStorageLocation(state: AmberProductState, locationId: string | undefined): ActionResult {
  if (!locationId) {
    return { state, errors: ["存放位置不存在"] };
  }

  if (state.items.some((item) => item.storageLocationId === locationId)) {
    return { state, errors: ["存放位置正在被商品使用，请先迁移关联商品"] };
  }

  if (!state.storageLocations.some((location) => location.id === locationId)) {
    return { state, errors: ["存放位置不存在"] };
  }

  return {
    state: {
      ...state,
      storageLocations: state.storageLocations.filter((location) => location.id !== locationId),
    },
    errors: [],
  };
}

export function migrateAndDeleteStorageLocation(
  state: AmberProductState,
  sourceLocationId: string,
  targetLocationId: string,
  context: ActionContext = createActionContext(),
): ActionResult {
  if (sourceLocationId === targetLocationId) {
    return { state, errors: ["迁移目标不能是当前存放位置"] };
  }

  if (!state.storageLocations.some((location) => location.id === sourceLocationId)) {
    return { state, errors: ["存放位置不存在"] };
  }

  if (!state.storageLocations.some((location) => location.id === targetLocationId)) {
    return { state, errors: ["迁移目标存放位置不存在"] };
  }

  return {
    state: {
      ...state,
      items: state.items.map((item) =>
        item.storageLocationId === sourceLocationId
          ? { ...item, storageLocationId: targetLocationId, updatedAt: context.now }
          : item,
      ),
      storageLocations: state.storageLocations.filter((location) => location.id !== sourceLocationId),
    },
    errors: [],
  };
}

export function updateDefaultReminderDays(state: AmberProductState, defaultReminderDays: number): ActionResult {
  if (!Number.isInteger(defaultReminderDays) || defaultReminderDays < 0) {
    return { state, errors: ["提醒提前天数必须是非负整数"] };
  }

  return {
    state: {
      ...state,
      settings: { ...state.settings, defaultReminderDays },
    },
    errors: [],
  };
}

function updateItem(state: AmberProductState, itemId: string, updater: (item: Item) => Item): ProductActionResult {
  const existing = state.items.find((item) => item.id === itemId);
  if (!existing) {
    return { state, errors: ["商品不存在"] };
  }

  const item = updater(existing);
  return {
    state: {
      ...state,
      items: state.items.map((entry) => (entry.id === itemId ? item : entry)),
    },
    errors: [],
    item,
  };
}

function updateCategory(
  state: AmberProductState,
  categoryId: string,
  updater: (category: Category) => Category,
): ActionResult {
  if (!state.categories.some((category) => category.id === categoryId)) {
    return { state, errors: ["分类不存在"] };
  }

  return {
    state: {
      ...state,
      categories: state.categories.map((category) => (category.id === categoryId ? updater(category) : category)),
    },
    errors: [],
  };
}

function updateStorageLocation(
  state: AmberProductState,
  locationId: string,
  updater: (location: StorageLocation) => StorageLocation,
): ActionResult {
  if (!state.storageLocations.some((location) => location.id === locationId)) {
    return { state, errors: ["存放位置不存在"] };
  }

  return {
    state: {
      ...state,
      storageLocations: state.storageLocations.map((location) =>
        location.id === locationId ? updater(location) : location,
      ),
    },
    errors: [],
  };
}

function findOrCreateCategory(
  categories: Category[],
  categoryName: string,
  context: ActionContext,
): { id: string; categories: Category[] } {
  const existing = categories.find((category) => category.name === categoryName);
  if (existing) {
    return { id: existing.id, categories };
  }

  const category: Category = {
    id: context.createId("category"),
    name: categoryName,
    createdAt: context.now,
    updatedAt: context.now,
  };

  return { id: category.id, categories: [...categories, category] };
}

function findOrCreateStorageLocation(
  storageLocations: StorageLocation[],
  storageLocationName: string | undefined,
  context: ActionContext,
): { id?: string; storageLocations: StorageLocation[] } {
  if (!storageLocationName) {
    return { storageLocations };
  }

  const existing = storageLocations.find((location) => location.name === storageLocationName);
  if (existing) {
    return { id: existing.id, storageLocations };
  }

  const location: StorageLocation = {
    id: context.createId("location"),
    name: storageLocationName,
    createdAt: context.now,
    updatedAt: context.now,
  };

  return { id: location.id, storageLocations: [...storageLocations, location] };
}

function normalizeProductInput(input: ProductFormInput): ProductFormInput {
  return {
    ...input,
    name: input.name.trim(),
    categoryName: input.categoryName.trim(),
    storageLocationName: emptyToUndefined(input.storageLocationName?.trim()),
    note: emptyToUndefined(input.note?.trim()),
    quantity: input.quantity,
    customReminderDays: input.customReminderDays,
  };
}

function validateProductInput(input: ProductFormInput, currentDate: string): string[] {
  const errors = validateItemCore({
    name: input.name,
    categoryName: input.categoryName,
    productionDate: input.productionDate,
    shelfLifeValue: input.shelfLifeValue,
    currentDate,
  });

  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
    errors.push("数量必须是正数");
  }

  if (
    input.customReminderDays !== undefined &&
    (!Number.isInteger(input.customReminderDays) || input.customReminderDays < 0)
  ) {
    errors.push("自定义提醒提前天数必须是非负整数");
  }

  return errors;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
