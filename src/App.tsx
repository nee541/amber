import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createInitialProductState,
  createRemoteProductRepository,
  type AmberProductState,
} from "./adapters/productRepository.js";
import {
  addProduct,
  createActionContext,
  createCategory,
  createStorageLocation,
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
  type ActionResult,
  type ProductFormInput,
} from "./app/productApp.js";
import {
  calculateExpiryDate,
  createDerivedItem,
  deriveItems,
  filterItems,
  formatQuantity,
  getReminderItems,
  sortItemsForDefaultList,
  type Category,
  type DerivedItem,
  type StorageLocation,
  type ItemUserStatus,
  type ShelfLifeUnit,
  type SystemStatus,
} from "./domain/expiry.js";
import "./App.css";

type AppView = "items" | "reminders" | "settings" | "trash";
type UserStatusFilter = ItemUserStatus | "all_active" | "all_history";
type SystemStatusFilter = SystemStatus | "all";
type Banner = { tone: "success" | "error"; text: string } | undefined;

type ItemFormState = {
  name: string;
  categoryName: string;
  productionDate: string;
  shelfLifeValue: string;
  shelfLifeUnit: ShelfLifeUnit;
  quantity: string;
  storageLocationName: string;
  note: string;
  customReminderEnabled: boolean;
  customReminderDays: string;
};

const userStatusLabels: Record<ItemUserStatus, string> = {
  active: "在用/持有",
  used_up: "已用完",
  discarded: "已丢弃",
  archived: "已归档",
};

const systemStatusLabels: Record<SystemStatus, string> = {
  normal: "正常",
  warning: "临期",
  expired: "已过期",
};

const shelfLifeUnitLabels: Record<ShelfLifeUnit, string> = {
  day: "天",
  month: "月",
  year: "年",
};

const viewMeta: Record<AppView, { title: string; description: string }> = {
  items: {
    title: "商品保质期",
    description: "记录生产日期和保质期，优先处理临期与已过期商品。",
  },
  reminders: {
    title: "提醒",
    description: "集中查看需要处理的临期和已过期商品。",
  },
  settings: {
    title: "设置",
    description: "管理提醒规则、分类、存放位置和回收站。",
  },
  trash: {
    title: "回收站",
    description: "恢复误删商品，或在确认后永久删除。",
  },
};

function App() {
  const repository = useMemo(() => createRemoteProductRepository(), []);
  const [state, setState] = useState<AmberProductState>(() => createInitialProductState());
  const [view, setView] = useState<AppView>("items");
  const [banner, setBanner] = useState<Banner>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [editingItemId, setEditingItemId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmPermanentDeleteItemId, setConfirmPermanentDeleteItemId] = useState<string>();
  const [form, setForm] = useState<ItemFormState>(() => createEmptyForm(getTodayString(), "食品"));
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all_active");
  const [systemStatusFilter, setSystemStatusFilter] = useState<SystemStatusFilter>("all");
  const [globalReminderDraft, setGlobalReminderDraft] = useState(String(state.settings.defaultReminderDays));
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const today = getTodayString();
  const currentViewMeta = viewMeta[view];

  useEffect(() => {
    let active = true;

    repository
      .load()
      .then((loadedState) => {
        if (active) {
          setState(loadedState);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setBanner({ tone: "error", text: `读取本地数据库失败：${getErrorMessage(error)}` });
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    setGlobalReminderDraft(String(state.settings.defaultReminderDays));
  }, [state.settings.defaultReminderDays]);

  const derivedItems = useMemo(
    () => deriveItems(state.items, state.categories, state.storageLocations, state.settings, today),
    [state, today],
  );

  const visibleItems = useMemo(() => {
    const filtered = filterItems(derivedItems, {
      query,
      categoryId: categoryFilter || undefined,
      storageLocationId: locationFilter || undefined,
      userStatus: userStatusFilter,
      includeDeleted: false,
    }).filter((item) => systemStatusFilter === "all" || item.systemStatus === systemStatusFilter);

    return sortItemsForDefaultList(filtered);
  }, [categoryFilter, derivedItems, locationFilter, query, systemStatusFilter, userStatusFilter]);

  const reminderItems = useMemo(() => getReminderItems(derivedItems), [derivedItems]);
  const expiredReminderItems = reminderItems.filter((item) => item.systemStatus === "expired");
  const warningReminderItems = reminderItems.filter((item) => item.systemStatus === "warning");
  const activeItemCount = derivedItems.filter((item) => item.deletedAt === undefined && item.userStatus === "active").length;
  const visibleItemCount = visibleItems.length;
  const trashItems = useMemo(
    () => sortItemsForDefaultList(filterItems(derivedItems, { includeDeleted: true, userStatus: "all_history" })),
    [derivedItems],
  );
  const selectedItem = derivedItems.find((item) => item.id === selectedItemId);
  const permanentDeleteItem = trashItems.find((item) => item.id === confirmPermanentDeleteItemId);
  const previewItem = useMemo(() => createFormPreview(form, state.settings.defaultReminderDays, today), [form, state, today]);

  useEffect(() => {
    if (!formOpen && !confirmPermanentDeleteItemId) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (confirmPermanentDeleteItemId) {
        setConfirmPermanentDeleteItemId(undefined);
        return;
      }

      closeProductForm();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmPermanentDeleteItemId, formOpen]);

  async function commit(
    result: ActionResult,
    persist: (nextState: AmberProductState) => Promise<AmberProductState>,
    successText?: string,
  ) {
    if (result.errors.length > 0) {
      setBanner({ tone: "error", text: result.errors.join("；") });
      return false;
    }

    try {
      const savedState = await persist(result.state);
      setState(savedState);
      setBanner(successText ? { tone: "success", text: successText } : undefined);
      return true;
    } catch (error: unknown) {
      setBanner({ tone: "error", text: `保存本地数据库失败：${getErrorMessage(error)}` });
      return false;
    }
  }

  function openCreateForm() {
    setEditingItemId(undefined);
    setForm(createEmptyForm(today, state.categories[0]?.name ?? "食品"));
    setFormOpen(true);
    setView("items");
  }

  function openEditForm(item: DerivedItem) {
    setEditingItemId(item.id);
    setSelectedItemId(item.id);
    setForm(createFormFromItem(item));
    setFormOpen(true);
    setView("items");
  }

  function closeProductForm() {
    setEditingItemId(undefined);
    setFormOpen(false);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = formToInput(form);
    const context = createActionContext();
    const previousState = state;
    const result = editingItemId
      ? editProduct(state, editingItemId, input, context)
      : addProduct(state, input, context);
    const saved = await commit(
      result,
      (nextState) => {
        if (!result.item) {
          return Promise.resolve(nextState);
        }

        const references = findCreatedItemReferences(previousState, nextState, result.item.categoryId, result.item.storageLocationId);
        return editingItemId
          ? repository.updateItem(result.item, references)
          : repository.createItem(result.item, references);
      },
      editingItemId ? "商品已更新" : "商品已新增",
    );

    if (saved) {
      const itemId = result.item?.id ?? editingItemId;
      setSelectedItemId(itemId);
      setEditingItemId(undefined);
      setFormOpen(false);
      setView("items");
    }
  }

  function updateForm<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function markStatus(itemId: string, status: ItemUserStatus) {
    const context = createActionContext();
    void commit(
      setProductUserStatus(state, itemId, status, context),
      () => repository.setItemUserStatus(itemId, status, context.now),
      "商品状态已更新",
    );
  }

  function moveToTrash(itemId: string) {
    const context = createActionContext();
    void commit(
      moveProductToTrash(state, itemId, context),
      () => repository.moveItemToTrash(itemId, context.now, context.now),
      "商品已移入回收站",
    ).then((saved) => {
      if (saved) {
        setSelectedItemId(undefined);
      }
    });
  }

  function restoreFromTrash(itemId: string) {
    const context = createActionContext();
    void commit(
      restoreProductFromTrash(state, itemId, context),
      () => repository.restoreItemFromTrash(itemId, context.now),
      "商品已恢复",
    ).then((saved) => {
      if (saved) {
        setSelectedItemId(itemId);
        setView("items");
      }
    });
  }

  function permanentlyDelete(itemId?: string) {
    if (!itemId) {
      return;
    }

    void commit(
      permanentlyDeleteProduct(state, itemId),
      () => repository.permanentlyDeleteItem(itemId),
      "商品已永久删除",
    ).then((saved) => {
      if (saved) {
        setSelectedItemId(undefined);
        setConfirmPermanentDeleteItemId(undefined);
      }
    });
  }

  function applyGlobalReminder(days: number) {
    void commit(
      updateDefaultReminderDays(state, days),
      () => repository.updateDefaultReminderDays(days),
      "全局提醒规则已更新",
    );
  }

  async function createNamedCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createCategory(state, newCategoryName, createActionContext());
    if (
      await commit(
        result,
        (nextState) => repository.createCategory(requireCreatedCategory(state, nextState)),
        "分类已创建",
      )
    ) {
      setNewCategoryName("");
    }
  }

  async function createNamedLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createStorageLocation(state, newLocationName, createActionContext());
    if (
      await commit(
        result,
        (nextState) => repository.createStorageLocation(requireCreatedStorageLocation(state, nextState)),
        "存放位置已创建",
      )
    ) {
      setNewLocationName("");
    }
  }

  function openDetailFromReminder(itemId: string) {
    setSelectedItemId(itemId);
    setFormOpen(false);
    setEditingItemId(undefined);
    setView("items");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="应用导航">
        <div className="brand-card">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <p className="eyebrow">Amber</p>
            <h1>物品档案</h1>
          </div>
        </div>

        <nav className="tabs" aria-label="主导航">
          <button
            type="button"
            className={view === "items" ? "active" : ""}
            aria-current={view === "items" ? "page" : undefined}
            onClick={() => setView("items")}
          >
            商品
          </button>
          <button
            type="button"
            className={view === "reminders" ? "active" : ""}
            aria-current={view === "reminders" ? "page" : undefined}
            onClick={() => setView("reminders")}
          >
            提醒
            <span>{reminderItems.length}</span>
          </button>
          <button
            type="button"
            className={view === "settings" ? "active" : ""}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => setView("settings")}
          >
            设置
          </button>
          <button
            type="button"
            className={view === "trash" ? "active" : ""}
            aria-current={view === "trash" ? "page" : undefined}
            onClick={() => setView("trash")}
          >
            回收站
            <span>{trashItems.length}</span>
          </button>
        </nav>

        <div className="sidebar-note">
          <strong>本地优先</strong>
          <span>结构化信息存入 SQLite，原始文件留在本机。</span>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div className="app-title">
            <p className="eyebrow">Personal inventory</p>
            <h2>{currentViewMeta.title}</h2>
            <p>{currentViewMeta.description}</p>
          </div>
          {view === "items" ? (
            <div className="topbar-actions">
              <label className="top-search">
                <span className="visually-hidden">搜索商品</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="搜索商品、分类或位置"
                />
              </label>
              <button type="button" className="primary-action" onClick={openCreateForm}>
                + 新增商品
              </button>
            </div>
          ) : null}
        </header>

        {view === "items" ? (
          <section className="header-summary" aria-label="保质期概览">
            <SummaryPill label="活跃商品" value={activeItemCount} />
            <SummaryPill label="已过期" value={expiredReminderItems.length} tone="expired" />
            <SummaryPill label="临期" value={warningReminderItems.length} tone="warning" />
          </section>
        ) : null}

        {banner ? <p className={`banner ${banner.tone}`}>{banner.text}</p> : null}

      {view === "items" ? (
        <section className="workspace">
          <section className="list-pane" aria-label="商品列表">
            <div className="pane-heading">
              <div>
                <h2>商品列表</h2>
                <p>默认优先显示已过期和临期商品。</p>
              </div>
              <span className="count-chip">{visibleItemCount} 件</span>
            </div>
            <div className="toolbar">
              <label>
                <span>分类</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.currentTarget.value)}>
                  <option value="">全部分类</option>
                  {state.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>位置</span>
                <select value={locationFilter} onChange={(event) => setLocationFilter(event.currentTarget.value)}>
                  <option value="">全部位置</option>
                  <option value="__unset__">未设置位置</option>
                  {state.storageLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>记录状态</span>
                <select
                  value={userStatusFilter}
                  onChange={(event) => setUserStatusFilter(event.currentTarget.value as UserStatusFilter)}
                >
                  <option value="all_active">在用/持有（默认）</option>
                  <option value="all_history">全部非删除记录</option>
                  <option value="used_up">已用完</option>
                  <option value="discarded">已丢弃</option>
                  <option value="archived">已归档</option>
                </select>
              </label>
              <label>
                <span>到期状态</span>
                <select
                  value={systemStatusFilter}
                  onChange={(event) => setSystemStatusFilter(event.currentTarget.value as SystemStatusFilter)}
                >
                  <option value="all">全部</option>
                  <option value="normal">正常</option>
                  <option value="warning">临期</option>
                  <option value="expired">已过期</option>
                </select>
              </label>
            </div>

            <ItemTable
              items={visibleItems}
              selectedItemId={selectedItemId}
              onSelect={setSelectedItemId}
              onEdit={openEditForm}
              onTrash={moveToTrash}
            />
          </section>

          <aside className={`detail-pane ${selectedItem ? "" : "is-empty"}`} aria-label="商品详情">
            {selectedItem ? (
              <ProductDetail
                item={selectedItem}
                onEdit={() => openEditForm(selectedItem)}
                onTrash={() => moveToTrash(selectedItem.id)}
                onStatus={(status) => markStatus(selectedItem.id, status)}
              />
            ) : (
              <div className="empty-state">
                <h2>选择商品</h2>
                <p>从列表打开详情，或新增一条商品记录。</p>
              </div>
            )}
          </aside>
        </section>
      ) : null}

      {view === "reminders" ? (
        <section className="reminder-layout">
          <ReminderGroup title="已过期" items={expiredReminderItems} onSelect={openDetailFromReminder} onStatus={markStatus} />
          <ReminderGroup title="即将过期" items={warningReminderItems} onSelect={openDetailFromReminder} onStatus={markStatus} />
        </section>
      ) : null}

      {view === "settings" ? (
        <section className="settings-layout">
          <div className="settings-column category-column">
            <ManagementSection
              title="分类"
              emptyText="暂无分类"
              items={state.categories.map((category) => ({
                ...category,
                usageCount: countItemsByReference(state.items, "categoryId", category.id),
              }))}
              drafts={categoryDrafts}
              newName={newCategoryName}
              onNewNameChange={setNewCategoryName}
              onCreate={createNamedCategory}
              onDraftChange={(id, value) => setCategoryDrafts((current) => ({ ...current, [id]: value }))}
              onRename={async (id, value) => {
                const context = createActionContext();
                const result = renameCategory(state, id, value, context);
                if (
                  await commit(
                    result,
                    (nextState) => {
                      const category = requireCategory(nextState, id);
                      return repository.renameCategory(id, category.name, category.updatedAt);
                    },
                    "分类已重命名",
                  )
                ) {
                  setCategoryDrafts((current) => removeDraft(current, id));
                }
              }}
              onDelete={(id) => {
                void commit(deleteCategory(state, id), () => repository.deleteCategory(id), "分类已删除");
              }}
              migrationOptions={state.categories}
              onMigrateDelete={async (id, targetId) => {
                const context = createActionContext();
                await commit(
                  migrateAndDeleteCategory(state, id, targetId, context),
                  () => repository.migrateAndDeleteCategory(id, targetId, context.now),
                  "分类已迁移并删除",
                );
              }}
            />
          </div>

          <div className="settings-column secondary-settings-column">
            <section className="settings-section">
              <div className="section-heading">
                <h2>全局提醒</h2>
                <p>商品自定义提醒优先于全局规则。</p>
              </div>
              <div className="quick-values">
                {[0, 7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={state.settings.defaultReminderDays === days ? "active" : ""}
                    onClick={() => applyGlobalReminder(days)}
                  >
                    {days === 0 ? "当天" : `${days} 天`}
                  </button>
                ))}
              </div>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyGlobalReminder(Number(globalReminderDraft));
                }}
              >
                <input
                  aria-label="全局默认提醒提前天数"
                  type="number"
                  min="0"
                  step="1"
                  value={globalReminderDraft}
                  onChange={(event) => setGlobalReminderDraft(event.currentTarget.value)}
                />
                <button type="submit">保存</button>
              </form>
            </section>

            <ManagementSection
              title="存放位置"
              emptyText="暂无存放位置"
              items={state.storageLocations.map((location) => ({
                ...location,
                usageCount: countItemsByReference(state.items, "storageLocationId", location.id),
              }))}
              drafts={locationDrafts}
              newName={newLocationName}
              onNewNameChange={setNewLocationName}
              onCreate={createNamedLocation}
              onDraftChange={(id, value) => setLocationDrafts((current) => ({ ...current, [id]: value }))}
              onRename={async (id, value) => {
                const context = createActionContext();
                const result = renameStorageLocation(state, id, value, context);
                if (
                  await commit(
                    result,
                    (nextState) => {
                      const location = requireStorageLocation(nextState, id);
                      return repository.renameStorageLocation(id, location.name, location.updatedAt);
                    },
                    "存放位置已重命名",
                  )
                ) {
                  setLocationDrafts((current) => removeDraft(current, id));
                }
              }}
              onDelete={(id) => {
                void commit(
                  deleteStorageLocation(state, id),
                  () => repository.deleteStorageLocation(id),
                  "存放位置已删除",
                );
              }}
              migrationOptions={state.storageLocations}
              onMigrateDelete={async (id, targetId) => {
                const context = createActionContext();
                await commit(
                  migrateAndDeleteStorageLocation(state, id, targetId, context),
                  () => repository.migrateAndDeleteStorageLocation(id, targetId, context.now),
                  "存放位置已迁移并删除",
                );
              }}
            />

            <section className="settings-section">
              <div className="section-heading">
                <h2>回收站</h2>
                <p>{trashItems.length} 件已删除商品</p>
              </div>
              <button type="button" onClick={() => setView("trash")}>
                进入回收站
              </button>
            </section>
          </div>
        </section>
      ) : null}

      {view === "trash" ? (
        <section className="trash-layout">
          {trashItems.length === 0 ? (
            <div className="empty-state">
              <h2>回收站为空</h2>
              <p>删除的商品会在这里恢复或永久删除。</p>
            </div>
          ) : (
            trashItems.map((item) => (
              <article key={item.id} className="trash-row">
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {item.categoryName} / {item.storageLocationName} / {item.expiryDate}
                  </p>
                  <span className="muted">删除时间：{item.deletedAt}</span>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => restoreFromTrash(item.id)}>
                    恢复
                  </button>
                  <button type="button" className="danger" onClick={() => setConfirmPermanentDeleteItemId(item.id)}>
                    永久删除
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}

      {formOpen ? (
        <div className="modal-backdrop" onMouseDown={closeProductForm}>
          <section
            className="modal-card product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingItemId ? "编辑商品" : "新增商品"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ProductForm
              form={form}
              previewItem={previewItem}
              categories={state.categories.map((category) => category.name)}
              locations={state.storageLocations.map((location) => location.name)}
              isEditing={Boolean(editingItemId)}
              globalReminderDays={state.settings.defaultReminderDays}
              onSubmit={submitForm}
              onCancel={closeProductForm}
              onChange={updateForm}
            />
          </section>
        </div>
      ) : null}

      {permanentDeleteItem ? (
        <div className="modal-backdrop" onMouseDown={() => setConfirmPermanentDeleteItemId(undefined)}>
          <section
            className="modal-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="确认永久删除"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="confirm-content">
              <p className="eyebrow">Permanent delete</p>
              <h2>确认永久删除</h2>
              <p>
                「{permanentDeleteItem.name}」将从本地记录中永久删除。此操作无法撤销。
              </p>
            </div>
            <div className="detail-actions">
              <button type="button" onClick={() => setConfirmPermanentDeleteItemId(undefined)}>
                取消
              </button>
              <button type="button" className="danger" onClick={() => permanentlyDelete(permanentDeleteItem.id)}>
                永久删除
              </button>
            </div>
          </section>
        </div>
      ) : null}
      </section>
    </main>
  );

}

type ItemTableProps = {
  items: DerivedItem[];
  selectedItemId?: string;
  onSelect(itemId: string): void;
  onEdit(item: DerivedItem): void;
  onTrash(itemId: string): void;
};

function ItemTable({ items, selectedItemId, onSelect, onEdit, onTrash }: ItemTableProps) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <h2>暂无商品</h2>
        <p>新增商品后会出现在这里。</p>
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>分类</th>
              <th>到期日期</th>
              <th>状态</th>
              <th>数量</th>
              <th>位置</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`item-row ${item.systemStatus} ${selectedItemId === item.id ? "selected" : ""}`}
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item.id);
                  }
                }}
              >
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(item.id);
                    }}
                  >
                    {item.name}
                  </button>
                </td>
                <td>{item.categoryName}</td>
                <td>
                  <strong>{item.expiryDate}</strong>
                  <span className="subtext">{item.relativeLabel}</span>
                </td>
                <td>
                  <StatusBadge status={item.systemStatus} />
                  <span className="subtext">{userStatusLabels[item.userStatus]}</span>
                </td>
                <td>{formatQuantity(item.quantity)}</td>
                <td>{item.storageLocationName}</td>
                <td>
                  <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => onEdit(item)}>
                      编辑
                    </button>
                    <button type="button" className="danger" onClick={() => onTrash(item.id)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-item-list" aria-label="移动端商品列表">
        {items.map((item) => (
          <article
            key={item.id}
            className={`mobile-item-card ${item.systemStatus} ${selectedItemId === item.id ? "selected" : ""}`}
            tabIndex={0}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item.id);
              }
            }}
          >
            <div className="mobile-item-main">
              <button
                type="button"
                className="link-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {item.name}
              </button>
              <StatusBadge status={item.systemStatus} />
            </div>
            <div className="mobile-item-date">
              <strong>{item.expiryDate}</strong>
              <span>{item.relativeLabel}</span>
            </div>
            <div className="item-meta-grid">
              <span>{item.categoryName}</span>
              <span>{item.storageLocationName}</span>
              <span>{formatQuantity(item.quantity)}</span>
              <span>{userStatusLabels[item.userStatus]}</span>
            </div>
            <div className="row-actions" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => onEdit(item)}>
                编辑
              </button>
              <button type="button" className="danger" onClick={() => onTrash(item.id)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

type ProductDetailProps = {
  item: DerivedItem;
  onEdit(): void;
  onTrash(): void;
  onStatus(status: ItemUserStatus): void;
};

function ProductDetail({ item, onEdit, onTrash, onStatus }: ProductDetailProps) {
  return (
    <section className="detail-content">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{item.categoryName}</p>
          <h2>{item.name}</h2>
        </div>
        <StatusBadge status={item.systemStatus} />
      </div>

      <dl className="detail-grid">
        <div>
          <dt>生产日期</dt>
          <dd>{item.productionDate}</dd>
        </div>
        <div>
          <dt>保质期</dt>
          <dd>
            {item.shelfLifeValue} {shelfLifeUnitLabels[item.shelfLifeUnit]}
          </dd>
        </div>
        <div>
          <dt>到期日期</dt>
          <dd>{item.expiryDate}</dd>
        </div>
        <div>
          <dt>剩余/过期</dt>
          <dd>{item.relativeLabel}</dd>
        </div>
        <div>
          <dt>数量</dt>
          <dd>{formatQuantity(item.quantity)}</dd>
        </div>
        <div>
          <dt>存放位置</dt>
          <dd>{item.storageLocationName}</dd>
        </div>
        <div>
          <dt>提醒设置</dt>
          <dd>
            {item.reminderSource === "custom" ? "商品自定义" : "全局默认"} / {item.reminderDays} 天
          </dd>
        </div>
        <div>
          <dt>用户状态</dt>
          <dd>{userStatusLabels[item.userStatus]}</dd>
        </div>
      </dl>

      {item.note ? <p className="note">{item.note}</p> : null}

      <div className="status-controls">
        {(Object.keys(userStatusLabels) as ItemUserStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            className={item.userStatus === status ? "active" : ""}
            onClick={() => onStatus(status)}
          >
            {userStatusLabels[status]}
          </button>
        ))}
      </div>

      <div className="detail-actions">
        <button type="button" onClick={onEdit}>
          编辑
        </button>
        <button type="button" className="danger" onClick={onTrash}>
          删除到回收站
        </button>
      </div>
    </section>
  );
}

type ProductFormProps = {
  form: ItemFormState;
  previewItem?: DerivedItem;
  categories: string[];
  locations: string[];
  isEditing: boolean;
  globalReminderDays: number;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
  onChange<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]): void;
};

function ProductForm({
  form,
  previewItem,
  categories,
  locations,
  isEditing,
  globalReminderDays,
  onSubmit,
  onCancel,
  onChange,
}: ProductFormProps) {
  return (
    <form className="product-form" onSubmit={onSubmit}>
      <div className="section-heading">
        <div>
          <h2>{isEditing ? "编辑商品" : "新增商品"}</h2>
          <p>分类和位置可输入新名称，保存后会自动创建。</p>
        </div>
      </div>

      <ExpiryPreview item={previewItem} globalReminderDays={globalReminderDays} />

      <label>
        <span>名称</span>
        <input value={form.name} onChange={(event) => onChange("name", event.currentTarget.value)} required />
      </label>

      <label>
        <span>分类</span>
        <input
          value={form.categoryName}
          list="category-options"
          onChange={(event) => onChange("categoryName", event.currentTarget.value)}
          required
        />
        <datalist id="category-options">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>

      <div className="field-row">
        <label>
          <span>生产日期</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4}-\d{2}-\d{2}"
            placeholder="YYYY-MM-DD"
            value={form.productionDate}
            onChange={(event) => onChange("productionDate", event.currentTarget.value)}
            required
          />
        </label>
        <label>
          <span>保质期</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.shelfLifeValue}
            onChange={(event) => onChange("shelfLifeValue", event.currentTarget.value)}
            required
          />
        </label>
        <label>
          <span>单位</span>
          <select
            value={form.shelfLifeUnit}
            onChange={(event) => onChange("shelfLifeUnit", event.currentTarget.value as ShelfLifeUnit)}
          >
            <option value="day">天</option>
            <option value="month">月</option>
            <option value="year">年</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <label>
          <span>数量</span>
          <input
            type="number"
            min="0"
            step="any"
            value={form.quantity}
            placeholder="未记录数量"
            onChange={(event) => onChange("quantity", event.currentTarget.value)}
          />
        </label>
        <label>
          <span>存放位置</span>
          <input
            value={form.storageLocationName}
            list="location-options"
            placeholder="未设置位置"
            onChange={(event) => onChange("storageLocationName", event.currentTarget.value)}
          />
          <datalist id="location-options">
            {locations.map((location) => (
              <option key={location} value={location} />
            ))}
          </datalist>
        </label>
      </div>

      <label>
        <span>备注</span>
        <textarea value={form.note} rows={3} onChange={(event) => onChange("note", event.currentTarget.value)} />
      </label>

      <section className="reminder-control" aria-label="商品提醒设置">
        <div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.customReminderEnabled}
              onChange={(event) => onChange("customReminderEnabled", event.currentTarget.checked)}
            />
            <span>覆盖全局提醒</span>
          </label>
          <p className="subtext">
            {form.customReminderEnabled
              ? "仅当前商品使用自定义提前天数。"
              : `使用全局默认：到期前 ${globalReminderDays} 天提醒。`}
          </p>
        </div>
        <label>
          <span>提前天数</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={!form.customReminderEnabled}
            value={form.customReminderEnabled ? form.customReminderDays : String(globalReminderDays)}
            onChange={(event) => onChange("customReminderDays", event.currentTarget.value)}
          />
        </label>
      </section>

      <div className="detail-actions">
        <button type="submit" className="primary-action">
          保存
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

type ReminderGroupProps = {
  title: string;
  items: DerivedItem[];
  onSelect(itemId: string): void;
  onStatus(itemId: string, status: ItemUserStatus): void;
};

function ReminderGroup({ title, items, onSelect, onStatus }: ReminderGroupProps) {
  return (
    <section className="reminder-group">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{items.length} 件商品</p>
      </div>
      {items.length === 0 ? (
        <div className="empty-state compact">
          <p>暂无记录</p>
        </div>
      ) : (
        <div className="reminder-list">
          {items.map((item) => (
            <article key={item.id} className={`reminder-row ${item.systemStatus}`}>
              <div className="reminder-main">
                <button type="button" className="link-button" onClick={() => onSelect(item.id)}>
                  {item.name}
                </button>
                <span className="subtext">
                  {item.categoryName} / {item.storageLocationName}
                </span>
              </div>
              <div className="reminder-date">
                <strong>{item.expiryDate}</strong>
                <span>{item.relativeLabel}</span>
              </div>
              <StatusBadge status={item.systemStatus} />
              <div className="row-actions">
                <button type="button" onClick={() => onStatus(item.id, "used_up")}>
                  已用完
                </button>
                <button type="button" onClick={() => onStatus(item.id, "discarded")}>
                  已丢弃
                </button>
                <button type="button" onClick={() => onStatus(item.id, "archived")}>
                  已归档
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type ManagementItem = {
  id: string;
  name: string;
  usageCount?: number;
};

type ManagementSectionProps = {
  title: string;
  emptyText: string;
  items: ManagementItem[];
  drafts: Record<string, string>;
  newName: string;
  migrationOptions: ManagementItem[];
  onNewNameChange(value: string): void;
  onCreate(event: FormEvent<HTMLFormElement>): void;
  onDraftChange(id: string, value: string): void;
  onRename(id: string, value: string): void;
  onDelete(id: string): void | Promise<void>;
  onMigrateDelete(id: string, targetId: string): void | Promise<void>;
};

function ManagementSection({
  title,
  emptyText,
  items,
  drafts,
  newName,
  migrationOptions,
  onNewNameChange,
  onCreate,
  onDraftChange,
  onRename,
  onDelete,
  onMigrateDelete,
}: ManagementSectionProps) {
  const [deleteCandidateId, setDeleteCandidateId] = useState<string>();
  const [modalMigrationTarget, setModalMigrationTarget] = useState("");
  const deleteCandidate = items.find((item) => item.id === deleteCandidateId);
  const usageCount = deleteCandidate?.usageCount ?? 0;
  const isReferenced = usageCount > 0;
  const migrationChoices = deleteCandidate
    ? migrationOptions.filter((option) => option.id !== deleteCandidate.id)
    : [];

  useEffect(() => {
    if (deleteCandidateId && !deleteCandidate) {
      closeDeleteModal();
    }
  }, [deleteCandidate, deleteCandidateId]);

  useEffect(() => {
    if (!deleteCandidate) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDeleteModal();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteCandidate]);

  function openDeleteModal(itemId: string) {
    setDeleteCandidateId(itemId);
    setModalMigrationTarget("");
  }

  function closeDeleteModal() {
    setDeleteCandidateId(undefined);
    setModalMigrationTarget("");
  }

  function submitDirectDelete() {
    if (!deleteCandidate || isReferenced) {
      return;
    }

    void onDelete(deleteCandidate.id);
    closeDeleteModal();
  }

  function submitMigrateDelete() {
    if (!deleteCandidate || !modalMigrationTarget) {
      return;
    }

    void onMigrateDelete(deleteCandidate.id, modalMigrationTarget);
    closeDeleteModal();
  }

  return (
    <>
    <section className="settings-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{items.length} 项</p>
      </div>
      <form className="inline-form" onSubmit={onCreate}>
        <input
          value={newName}
          aria-label={`新增${title}名称`}
          onChange={(event) => onNewNameChange(event.currentTarget.value)}
        />
        <button type="submit">新增</button>
      </form>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="management-list">
          {items.map((item) => {
            const itemUsageCount = item.usageCount ?? 0;
            const draftName = drafts[item.id] ?? item.name;

            return (
              <article key={item.id} className="management-row">
                <div className="management-name-row">
                  <label className="management-name-field">
                    <span>名称</span>
                    <input
                      value={draftName}
                      aria-label={`${item.name} 名称`}
                      onChange={(event) => onDraftChange(item.id, event.currentTarget.value)}
                    />
                  </label>
                  <button type="button" onClick={() => onRename(item.id, draftName)}>
                    保存名称
                  </button>
                </div>
                <div className="management-row-footer">
                  <span className="muted">
                    {itemUsageCount > 0 ? `被 ${itemUsageCount} 件商品使用` : "未被商品使用"}
                  </span>
                  <button
                    type="button"
                    className="management-delete-trigger danger"
                    onClick={() => openDeleteModal(item.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
    {deleteCandidate ? (
      <div className="modal-backdrop" onMouseDown={closeDeleteModal}>
        <section
          className="modal-card management-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${title}删除确认`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="confirm-content">
            <p className="eyebrow">Delete {title}</p>
            <h2>删除{title}</h2>
            <p>
              「{deleteCandidate.name}」
              {isReferenced ? `被 ${usageCount} 件商品使用。` : "未被商品使用。"}
            </p>
          </div>
          <div className="management-delete-summary">
            <span>当前使用</span>
            <strong>{usageCount}</strong>
            <span>{isReferenced ? "需要迁移后删除" : "可直接删除"}</span>
          </div>
          {isReferenced ? (
            <label className="management-migration-field">
              <span>迁移到</span>
              <select
                value={modalMigrationTarget}
                onChange={(event) => setModalMigrationTarget(event.currentTarget.value)}
                aria-label={`${deleteCandidate.name} 迁移目标`}
              >
                <option value="">选择迁移目标</option>
                {migrationChoices.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="detail-actions management-modal-actions">
            <button type="button" onClick={closeDeleteModal}>
              取消
            </button>
            {isReferenced ? (
              <button type="button" className="danger" disabled={!modalMigrationTarget} onClick={submitMigrateDelete}>
                迁移并删除
              </button>
            ) : (
              <button type="button" className="danger" onClick={submitDirectDelete}>
                直接删除
              </button>
            )}
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}

function StatusBadge({ status }: { status: SystemStatus }) {
  return <span className={`status-badge ${status}`}>{systemStatusLabels[status]}</span>;
}

function SummaryPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "expired";
}) {
  return (
    <span className={`summary-pill ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function ExpiryPreview({ item, globalReminderDays }: { item?: DerivedItem; globalReminderDays: number }) {
  if (!item) {
    return (
      <section className="preview-panel">
        <div>
          <h3>到期预览</h3>
          <p>填写生产日期和保质期后，会立即计算到期日期。</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`preview-panel ${item.systemStatus}`}>
      <div>
        <h3>到期预览</h3>
        <p>
          {item.expiryDate} / {item.relativeLabel}
        </p>
      </div>
      <StatusBadge status={item.systemStatus} />
      <span className="preview-rule">
        {item.reminderSource === "custom" ? "商品自定义" : "全局默认"}：提前 {item.reminderDays} 天提醒
      </span>
      <span className="subtext">全局默认当前为 {globalReminderDays} 天</span>
    </section>
  );
}

function createEmptyForm(today: string, categoryName: string): ItemFormState {
  return {
    name: "",
    categoryName,
    productionDate: today,
    shelfLifeValue: "30",
    shelfLifeUnit: "day",
    quantity: "",
    storageLocationName: "",
    note: "",
    customReminderEnabled: false,
    customReminderDays: "30",
  };
}

function createFormFromItem(item: DerivedItem): ItemFormState {
  return {
    name: item.name,
    categoryName: item.categoryName,
    productionDate: item.productionDate,
    shelfLifeValue: String(item.shelfLifeValue),
    shelfLifeUnit: item.shelfLifeUnit,
    quantity: item.quantity === undefined ? "" : String(item.quantity),
    storageLocationName: item.storageLocationId ? item.storageLocationName : "",
    note: item.note ?? "",
    customReminderEnabled: item.customReminderDays !== undefined,
    customReminderDays: String(item.customReminderDays ?? item.reminderDays),
  };
}

function formToInput(form: ItemFormState): ProductFormInput {
  return {
    name: form.name,
    categoryName: form.categoryName,
    productionDate: form.productionDate,
    shelfLifeValue: parseRequiredNumber(form.shelfLifeValue),
    shelfLifeUnit: form.shelfLifeUnit,
    quantity: parseOptionalNumber(form.quantity),
    storageLocationName: form.storageLocationName,
    note: form.note,
    customReminderDays: form.customReminderEnabled ? parseRequiredNumber(form.customReminderDays) : undefined,
  };
}

function createFormPreview(form: ItemFormState, globalReminderDays: number, today: string): DerivedItem | undefined {
  const shelfLifeValue = parseRequiredNumber(form.shelfLifeValue);
  const customReminderDays = form.customReminderEnabled ? parseRequiredNumber(form.customReminderDays) : undefined;
  if (!form.productionDate || !Number.isInteger(shelfLifeValue)) {
    return undefined;
  }

  if (
    customReminderDays !== undefined &&
    (!Number.isInteger(customReminderDays) || customReminderDays < 0)
  ) {
    return undefined;
  }

  try {
    calculateExpiryDate(form.productionDate, shelfLifeValue, form.shelfLifeUnit);
    return createDerivedItem(
      {
        id: "preview",
        name: form.name.trim() || "商品预览",
        categoryId: "preview-category",
        productionDate: form.productionDate,
        shelfLifeValue,
        shelfLifeUnit: form.shelfLifeUnit,
        quantity: parseOptionalNumber(form.quantity),
        storageLocationId: undefined,
        note: form.note.trim() || undefined,
        customReminderDays,
        userStatus: "active",
        createdAt: "",
        updatedAt: "",
      },
      [{ id: "preview-category", name: form.categoryName.trim() || "预览分类", createdAt: "", updatedAt: "" }],
      [],
      { defaultReminderDays: globalReminderDays },
      today,
    );
  } catch {
    return undefined;
  }
}

function countItemsByReference(
  items: Array<{ categoryId: string; storageLocationId?: string }>,
  key: "categoryId" | "storageLocationId",
  id: string,
): number {
  return items.filter((item) => item[key] === id).length;
}

function findCreatedItemReferences(
  previousState: AmberProductState,
  nextState: AmberProductState,
  categoryId: string,
  storageLocationId: string | undefined,
): { category?: Category; storageLocation?: StorageLocation } {
  return {
    category: previousState.categories.some((category) => category.id === categoryId)
      ? undefined
      : nextState.categories.find((category) => category.id === categoryId),
    storageLocation:
      storageLocationId === undefined ||
      previousState.storageLocations.some((location) => location.id === storageLocationId)
        ? undefined
        : nextState.storageLocations.find((location) => location.id === storageLocationId),
  };
}

function requireCreatedCategory(previousState: AmberProductState, nextState: AmberProductState): Category {
  const category = nextState.categories.find(
    (entry) => !previousState.categories.some((previous) => previous.id === entry.id),
  );
  if (!category) {
    throw new Error("未找到新建分类");
  }

  return category;
}

function requireCreatedStorageLocation(previousState: AmberProductState, nextState: AmberProductState): StorageLocation {
  const location = nextState.storageLocations.find(
    (entry) => !previousState.storageLocations.some((previous) => previous.id === entry.id),
  );
  if (!location) {
    throw new Error("未找到新建存放位置");
  }

  return location;
}

function requireCategory(state: AmberProductState, categoryId: string): Category {
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error("分类不存在");
  }

  return category;
}

function requireStorageLocation(state: AmberProductState, storageLocationId: string): StorageLocation {
  const location = state.storageLocations.find((entry) => entry.id === storageLocationId);
  if (!location) {
    throw new Error("存放位置不存在");
  }

  return location;
}

function parseOptionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

function parseRequiredNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function removeDraft(drafts: Record<string, string>, id: string): Record<string, string> {
  const next = { ...drafts };
  delete next[id];
  return next;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getTodayString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default App;
