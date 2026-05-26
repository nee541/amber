(() => {
  const timestamp = "2026-05-26T00:00:00.000Z";
  const initialState = {
    version: 1,
    settings: { defaultReminderDays: 30 },
    categories: [
      { id: "category-food", name: "食品", createdAt: timestamp, updatedAt: timestamp },
      { id: "category-medicine", name: "药品", createdAt: timestamp, updatedAt: timestamp },
      { id: "category-cosmetics", name: "化妆品", createdAt: timestamp, updatedAt: timestamp },
      { id: "category-household", name: "家用品", createdAt: timestamp, updatedAt: timestamp },
      { id: "category-collection", name: "收藏品", createdAt: timestamp, updatedAt: timestamp },
      { id: "category-other", name: "其他", createdAt: timestamp, updatedAt: timestamp },
    ],
    storageLocations: [
      { id: "location-fridge", name: "冰箱", createdAt: timestamp, updatedAt: timestamp },
      { id: "location-freezer", name: "冷冻室", createdAt: timestamp, updatedAt: timestamp },
      { id: "location-cabinet", name: "厨房柜", createdAt: timestamp, updatedAt: timestamp },
      { id: "location-medbox", name: "药箱", createdAt: timestamp, updatedAt: timestamp },
    ],
    items: [
      {
        id: "item-milk",
        name: "低温鲜牛奶 950ml",
        categoryId: "category-food",
        productionDate: "2026-05-01",
        shelfLifeValue: 20,
        shelfLifeUnit: "day",
        quantity: 2,
        storageLocationId: "location-fridge",
        note: "开封前冷藏保存，优先处理。",
        userStatus: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "item-bread",
        name: "全麦吐司",
        categoryId: "category-food",
        productionDate: "2026-05-20",
        shelfLifeValue: 7,
        shelfLifeUnit: "day",
        quantity: 1,
        storageLocationId: "location-cabinet",
        note: "",
        userStatus: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "item-vitamins",
        name: "复合维生素片",
        categoryId: "category-medicine",
        productionDate: "2025-08-15",
        shelfLifeValue: 1,
        shelfLifeUnit: "year",
        quantity: 1,
        storageLocationId: "location-medbox",
        customReminderDays: 90,
        note: "商品级提醒提前 90 天。",
        userStatus: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "item-sunscreen",
        name: "通勤防晒霜",
        categoryId: "category-cosmetics",
        productionDate: "2025-06-01",
        shelfLifeValue: 2,
        shelfLifeUnit: "year",
        note: "",
        userStatus: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "item-archived",
        name: "旧版感冒药",
        categoryId: "category-medicine",
        productionDate: "2024-01-01",
        shelfLifeValue: 2,
        shelfLifeUnit: "year",
        quantity: 1,
        storageLocationId: "location-medbox",
        note: "",
        userStatus: "archived",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "item-trash",
        name: "已删除测试商品",
        categoryId: "category-other",
        productionDate: "2025-12-01",
        shelfLifeValue: 1,
        shelfLifeUnit: "year",
        quantity: 1,
        note: "",
        userStatus: "discarded",
        deletedAt: "2026-05-25T10:00:00.000Z",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  let savedState = clone(initialState);

  window.__TAURI_INTERNALS__ = {
    transformCallback: () => `callback-${Math.random().toString(16).slice(2)}`,
    unregisterCallback: () => {},
    invoke: async (cmd, args) => {
      if (cmd === "load_product_state") return clone(savedState);
      if (cmd === "save_product_state") {
        savedState = clone(args.state);
        return null;
      }
      if (cmd === "reset_product_state") {
        savedState = clone(initialState);
        return clone(savedState);
      }
      throw new Error(`Unknown mock invoke command: ${cmd}`);
    },
  };
})();
