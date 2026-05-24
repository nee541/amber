export type ShelfLifeUnit = "day" | "month" | "year";

export type ItemUserStatus = "active" | "used_up" | "discarded" | "archived";

export type SystemStatus = "normal" | "warning" | "expired";

export type ExpiryDateSource = "production_date_and_shelf_life" | "direct_expiry_date";

export type DatePrecision = "day" | "month" | "year";

export type Category = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageLocation = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Item = {
  id: string;
  name: string;
  categoryId: string;
  productionDate: string;
  shelfLifeValue: number;
  shelfLifeUnit: ShelfLifeUnit;
  quantity?: number;
  storageLocationId?: string;
  note?: string;
  customReminderDays?: number;
  userStatus: ItemUserStatus;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  defaultReminderDays: number;
};

export type DerivedItem = Item & {
  categoryName: string;
  storageLocationName: string;
  expiryDate: string;
  reminderDays: number;
  reminderSource: "global" | "custom";
  daysUntilExpiry: number;
  systemStatus: SystemStatus;
  relativeLabel: string;
  isActiveReminderCandidate: boolean;
};

export type ItemFilters = {
  query?: string;
  categoryId?: string;
  storageLocationId?: string;
  userStatus?: ItemUserStatus | "all_active" | "all_history";
  includeDeleted?: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_CATEGORY_NAMES = ["食品", "药品", "化妆品", "家用品", "收藏品", "其他"] as const;

export const DEFAULT_LOCATION_NAMES = ["冰箱", "冷冻室", "厨房柜", "药箱", "卧室抽屉"] as const;

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseDateString(value);
  return formatDateParts(parsed.year, parsed.month, parsed.day) === value;
}

export function compareDateStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

export function calculateExpiryDate(
  productionDate: string,
  shelfLifeValue: number,
  shelfLifeUnit: ShelfLifeUnit,
): string {
  assertValidDateString(productionDate, "生产日期");
  assertPositiveInteger(shelfLifeValue, "保质期");

  if (shelfLifeUnit === "day") {
    return formatDate(addDays(toUtcDate(productionDate), shelfLifeValue));
  }

  const parts = parseDateString(productionDate);
  if (shelfLifeUnit === "month") {
    return addCalendarMonths(parts.year, parts.month, parts.day, shelfLifeValue);
  }

  return addCalendarMonths(parts.year, parts.month, parts.day, shelfLifeValue * 12);
}

export function getEffectiveReminderDays(item: Pick<Item, "customReminderDays">, settings: Settings): number {
  if (item.customReminderDays !== undefined) {
    return item.customReminderDays;
  }

  return settings.defaultReminderDays;
}

export function createDerivedItem(
  item: Item,
  categories: Category[],
  locations: StorageLocation[],
  settings: Settings,
  currentDate: string,
): DerivedItem {
  assertValidDateString(currentDate, "当前日期");

  const expiryDate = calculateExpiryDate(item.productionDate, item.shelfLifeValue, item.shelfLifeUnit);
  const reminderDays = getEffectiveReminderDays(item, settings);
  const daysUntilExpiry = differenceInCalendarDays(currentDate, expiryDate);
  const systemStatus = deriveSystemStatus(daysUntilExpiry, reminderDays);
  const category = categories.find((entry) => entry.id === item.categoryId);
  const location = item.storageLocationId
    ? locations.find((entry) => entry.id === item.storageLocationId)
    : undefined;

  return {
    ...item,
    categoryName: category?.name ?? "未分类",
    storageLocationName: location?.name ?? "未设置位置",
    expiryDate,
    reminderDays,
    reminderSource: item.customReminderDays === undefined ? "global" : "custom",
    daysUntilExpiry,
    systemStatus,
    relativeLabel: createRelativeLabel(daysUntilExpiry),
    isActiveReminderCandidate: item.userStatus === "active" && item.deletedAt === undefined,
  };
}

export function deriveItems(
  items: Item[],
  categories: Category[],
  locations: StorageLocation[],
  settings: Settings,
  currentDate: string,
): DerivedItem[] {
  return items.map((item) => createDerivedItem(item, categories, locations, settings, currentDate));
}

export function filterItems(items: DerivedItem[], filters: ItemFilters): DerivedItem[] {
  const query = filters.query?.trim().toLowerCase();

  return items.filter((item) => {
    if (!filters.includeDeleted && item.deletedAt !== undefined) {
      return false;
    }

    if (filters.includeDeleted && item.deletedAt === undefined) {
      return false;
    }

    if (filters.userStatus === undefined || filters.userStatus === "all_active") {
      if (item.userStatus !== "active") {
        return false;
      }
    } else if (filters.userStatus !== "all_history" && item.userStatus !== filters.userStatus) {
      return false;
    }

    if (query && !item.name.toLowerCase().includes(query)) {
      return false;
    }

    if (filters.categoryId && item.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.storageLocationId === "__unset__" && item.storageLocationId !== undefined) {
      return false;
    }

    if (
      filters.storageLocationId &&
      filters.storageLocationId !== "__unset__" &&
      item.storageLocationId !== filters.storageLocationId
    ) {
      return false;
    }

    return true;
  });
}

export function getReminderItems(items: DerivedItem[]): DerivedItem[] {
  return sortItemsForDefaultList(
    items.filter(
      (item) =>
        item.isActiveReminderCandidate && (item.systemStatus === "warning" || item.systemStatus === "expired"),
    ),
  );
}

export function sortItemsForDefaultList(items: DerivedItem[]): DerivedItem[] {
  return [...items].sort((left, right) => {
    const priorityDelta = getSortPriority(left.systemStatus) - getSortPriority(right.systemStatus);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const expiryDelta = compareDateStrings(left.expiryDate, right.expiryDate);
    if (expiryDelta !== 0) {
      return expiryDelta;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function validateItemCore(input: {
  name: string;
  categoryName: string;
  productionDate: string;
  shelfLifeValue: number;
  currentDate: string;
}): string[] {
  const errors: string[] = [];

  if (!input.name.trim()) {
    errors.push("名称不能为空");
  }

  if (!input.categoryName.trim()) {
    errors.push("分类不能为空");
  }

  if (!isValidDateString(input.productionDate)) {
    errors.push("生产日期必须是 YYYY-MM-DD");
  } else if (compareDateStrings(input.productionDate, input.currentDate) > 0) {
    errors.push("生产日期不能晚于当前日期");
  }

  if (!Number.isInteger(input.shelfLifeValue) || input.shelfLifeValue <= 0) {
    errors.push("保质期数值必须为正整数");
  }

  return errors;
}

export function isReferencedByItems(id: string, key: "categoryId" | "storageLocationId", items: Item[]): boolean {
  return items.some((item) => item.deletedAt === undefined && item[key] === id);
}

export function formatQuantity(quantity: number | undefined): string {
  return quantity === undefined ? "未记录数量" : String(quantity);
}

function deriveSystemStatus(daysUntilExpiry: number, reminderDays: number): SystemStatus {
  if (daysUntilExpiry < 0) {
    return "expired";
  }

  if (daysUntilExpiry <= reminderDays) {
    return "warning";
  }

  return "normal";
}

function createRelativeLabel(daysUntilExpiry: number): string {
  if (daysUntilExpiry === 0) {
    return "今日到期";
  }

  if (daysUntilExpiry > 0) {
    return `剩余 ${daysUntilExpiry} 天`;
  }

  return `已过期 ${Math.abs(daysUntilExpiry)} 天`;
}

function getSortPriority(status: SystemStatus): number {
  if (status === "expired") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function differenceInCalendarDays(currentDate: string, expiryDate: string): number {
  const current = toUtcDate(currentDate).getTime();
  const expiry = toUtcDate(expiryDate).getTime();
  return Math.round((expiry - current) / MS_PER_DAY);
}

function addCalendarMonths(year: number, month: number, day: number, monthsToAdd: number): string {
  const monthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = modulo(monthIndex, 12);
  const targetMonth = targetMonthIndex + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return formatDateParts(targetYear, targetMonth, targetDay);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUtcDate(value: string): Date {
  const { year, month, day } = parseDateString(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateString(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function assertValidDateString(value: string, label: string): void {
  if (!isValidDateString(value)) {
    throw new Error(`${label}必须是有效的 YYYY-MM-DD 日期`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}必须为正整数`);
  }
}
