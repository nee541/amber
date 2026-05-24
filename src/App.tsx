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
  type DerivedItem,
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

function App() {
  const repository = useMemo(() => createRemoteProductRepository(), []);
  const [state, setState] = useState<AmberProductState>(() => createInitialProductState());
  const [view, setView] = useState<AppView>("items");
  const [banner, setBanner] = useState<Banner>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [editingItemId, setEditingItemId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
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
  const [categoryMigrationTargets, setCategoryMigrationTargets] = useState<Record<string, string>>({});
  const [locationMigrationTargets, setLocationMigrationTargets] = useState<Record<string, string>>({});
  const today = getTodayString();

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
  const trashItems = useMemo(
    () => sortItemsForDefaultList(filterItems(derivedItems, { includeDeleted: true, userStatus: "all_history" })),
    [derivedItems],
  );
  const selectedItem = derivedItems.find((item) => item.id === selectedItemId);
  const previewItem = useMemo(() => createFormPreview(form, state.settings.defaultReminderDays, today), [form, state, today]);

  function commit(result: ActionResult, successText?: string) {
    if (result.errors.length > 0) {
      setBanner({ tone: "error", text: result.errors.join("；") });
      return false;
    }

    setState(result.state);
    void repository.save(result.state).catch((error: unknown) => {
      setBanner({ tone: "error", text: `保存本地数据库失败：${getErrorMessage(error)}` });
    });
    setBanner(successText ? { tone: "success", text: successText } : undefined);
    return true;
  }

  function openCreateForm() {
    setEditingItemId(undefined);
    setForm(createEmptyForm(today, state.categories[0]?.name ?? "食品"));
    setFormOpen(true);
    setView("items");
  }

  function openEditForm(item: DerivedItem) {
    setEditingItemId(item.id);
    setForm(createFormFromItem(item));
    setFormOpen(true);
    setView("items");
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = formToInput(form);
    const context = createActionContext();
    const result = editingItemId
      ? editProduct(state, editingItemId, input, context)
      : addProduct(state, input, context);
    const saved = commit(result, editingItemId ? "商品已更新" : "商品已新增");

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
    commit(setProductUserStatus(state, itemId, status, createActionContext()), "商品状态已更新");
  }

  function moveToTrash(itemId: string) {
    commit(moveProductToTrash(state, itemId, createActionContext()), "商品已移入回收站");
    setSelectedItemId(undefined);
  }

  function restoreFromTrash(itemId: string) {
    commit(restoreProductFromTrash(state, itemId, createActionContext()), "商品已恢复");
    setSelectedItemId(itemId);
    setView("items");
  }

  function permanentlyDelete(itemId: string) {
    if (!window.confirm("确认永久删除该商品？此操作无法撤销。")) {
      return;
    }

    commit(permanentlyDeleteProduct(state, itemId), "商品已永久删除");
    setSelectedItemId(undefined);
  }

  function applyGlobalReminder(days: number) {
    commit(updateDefaultReminderDays(state, days), "全局提醒规则已更新");
  }

  function createNamedCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commit(createCategory(state, newCategoryName, createActionContext()), "分类已创建")) {
      setNewCategoryName("");
    }
  }

  function createNamedLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commit(createStorageLocation(state, newLocationName, createActionContext()), "存放位置已创建")) {
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
      <header className="app-header">
        <div>
          <p className="eyebrow">Amber</p>
          <h1>商品保质期</h1>
        </div>
        <button type="button" className="primary-action" onClick={openCreateForm}>
          + 新增商品
        </button>
      </header>

      <nav className="tabs" aria-label="主导航">
        <button type="button" className={view === "items" ? "active" : ""} onClick={() => setView("items")}>
          商品
        </button>
        <button type="button" className={view === "reminders" ? "active" : ""} onClick={() => setView("reminders")}>
          提醒
          <span>{reminderItems.length}</span>
        </button>
        <button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
          设置
        </button>
        <button type="button" className={view === "trash" ? "active" : ""} onClick={() => setView("trash")}>
          回收站
          <span>{trashItems.length}</span>
        </button>
      </nav>

      {banner ? <p className={`banner ${banner.tone}`}>{banner.text}</p> : null}

      {view === "items" ? (
        <section className="workspace">
          <section className="list-pane" aria-label="商品列表">
            <div className="toolbar">
              <label>
                <span>搜索</span>
                <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="商品名称" />
              </label>
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
                <span>商品状态</span>
                <select
                  value={userStatusFilter}
                  onChange={(event) => setUserStatusFilter(event.currentTarget.value as UserStatusFilter)}
                >
                  <option value="all_active">默认活跃</option>
                  <option value="all_history">全部历史</option>
                  <option value="used_up">已用完</option>
                  <option value="discarded">已丢弃</option>
                  <option value="archived">已归档</option>
                </select>
              </label>
              <label>
                <span>保质状态</span>
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

          <aside className="detail-pane" aria-label="商品详情">
            {formOpen ? (
              <ProductForm
                form={form}
                previewItem={previewItem}
                categories={state.categories.map((category) => category.name)}
                locations={state.storageLocations.map((location) => location.name)}
                isEditing={Boolean(editingItemId)}
                globalReminderDays={state.settings.defaultReminderDays}
                onSubmit={submitForm}
                onCancel={() => {
                  setEditingItemId(undefined);
                  setFormOpen(false);
                }}
                onChange={updateForm}
              />
            ) : selectedItem ? (
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
          <section className="settings-section">
            <div className="section-heading">
              <h2>全局提醒</h2>
              <p>商品自定义提醒优先于全局规则。</p>
            </div>
            <div className="quick-values">
              {[0, 7, 30, 90].map((days) => (
                <button key={days} type="button" onClick={() => applyGlobalReminder(days)}>
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
            title="分类"
            emptyText="暂无分类"
            items={state.categories}
            drafts={categoryDrafts}
            newName={newCategoryName}
            onNewNameChange={setNewCategoryName}
            onCreate={createNamedCategory}
            onDraftChange={(id, value) => setCategoryDrafts((current) => ({ ...current, [id]: value }))}
            onRename={(id, value) => {
              if (commit(renameCategory(state, id, value, createActionContext()), "分类已重命名")) {
                setCategoryDrafts((current) => removeDraft(current, id));
              }
            }}
            onDelete={(id) => commit(deleteCategory(state, id), "分类已删除")}
            migrationTargets={categoryMigrationTargets}
            migrationOptions={state.categories}
            onMigrationTargetChange={(id, value) =>
              setCategoryMigrationTargets((current) => ({ ...current, [id]: value }))
            }
            onMigrateDelete={(id, targetId) => {
              if (commit(migrateAndDeleteCategory(state, id, targetId, createActionContext()), "分类已迁移并删除")) {
                setCategoryMigrationTargets((current) => removeDraft(current, id));
              }
            }}
          />

          <ManagementSection
            title="存放位置"
            emptyText="暂无存放位置"
            items={state.storageLocations}
            drafts={locationDrafts}
            newName={newLocationName}
            onNewNameChange={setNewLocationName}
            onCreate={createNamedLocation}
            onDraftChange={(id, value) => setLocationDrafts((current) => ({ ...current, [id]: value }))}
            onRename={(id, value) => {
              if (commit(renameStorageLocation(state, id, value, createActionContext()), "存放位置已重命名")) {
                setLocationDrafts((current) => removeDraft(current, id));
              }
            }}
            onDelete={(id) => commit(deleteStorageLocation(state, id), "存放位置已删除")}
            migrationTargets={locationMigrationTargets}
            migrationOptions={state.storageLocations}
            onMigrationTargetChange={(id, value) =>
              setLocationMigrationTargets((current) => ({ ...current, [id]: value }))
            }
            onMigrateDelete={(id, targetId) => {
              if (
                commit(
                  migrateAndDeleteStorageLocation(state, id, targetId, createActionContext()),
                  "存放位置已迁移并删除",
                )
              ) {
                setLocationMigrationTargets((current) => removeDraft(current, id));
              }
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
                  <button type="button" className="danger" onClick={() => permanentlyDelete(item.id)}>
                    永久删除
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}
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
            <tr key={item.id} className={selectedItemId === item.id ? "selected" : ""}>
              <td>
                <button type="button" className="link-button" onClick={() => onSelect(item.id)}>
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
                <div className="row-actions">
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
        <h2>{isEditing ? "编辑商品" : "新增商品"}</h2>
        <p>{previewItem ? `${previewItem.expiryDate} / ${previewItem.relativeLabel}` : "填写必填字段后预览到期状态"}</p>
      </div>

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
            type="date"
            value={form.productionDate}
            max={getTodayString()}
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

      <div className="reminder-control">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.customReminderEnabled}
            onChange={(event) => onChange("customReminderEnabled", event.currentTarget.checked)}
          />
          <span>商品自定义提醒</span>
        </label>
        <input
          type="number"
          min="0"
          step="1"
          disabled={!form.customReminderEnabled}
          value={form.customReminderEnabled ? form.customReminderDays : String(globalReminderDays)}
          onChange={(event) => onChange("customReminderDays", event.currentTarget.value)}
        />
      </div>

      {previewItem ? (
        <div className="preview-strip">
          <StatusBadge status={previewItem.systemStatus} />
          <span>到期日期 {previewItem.expiryDate}</span>
          <span>{previewItem.reminderDays} 天前进入提醒</span>
        </div>
      ) : null}

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
        items.map((item) => (
          <article key={item.id} className="reminder-row">
            <button type="button" className="link-button" onClick={() => onSelect(item.id)}>
              {item.name}
            </button>
            <span>{item.categoryName}</span>
            <strong>{item.expiryDate}</strong>
            <StatusBadge status={item.systemStatus} />
            <span>{item.relativeLabel}</span>
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
        ))
      )}
    </section>
  );
}

type ManagementItem = {
  id: string;
  name: string;
};

type ManagementSectionProps = {
  title: string;
  emptyText: string;
  items: ManagementItem[];
  drafts: Record<string, string>;
  newName: string;
  migrationTargets: Record<string, string>;
  migrationOptions: ManagementItem[];
  onNewNameChange(value: string): void;
  onCreate(event: FormEvent<HTMLFormElement>): void;
  onDraftChange(id: string, value: string): void;
  onMigrationTargetChange(id: string, value: string): void;
  onRename(id: string, value: string): void;
  onDelete(id: string): void;
  onMigrateDelete(id: string, targetId: string): void;
};

function ManagementSection({
  title,
  emptyText,
  items,
  drafts,
  newName,
  migrationTargets,
  migrationOptions,
  onNewNameChange,
  onCreate,
  onDraftChange,
  onMigrationTargetChange,
  onRename,
  onDelete,
  onMigrateDelete,
}: ManagementSectionProps) {
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{items.length} 项</p>
      </div>
      <form className="inline-form" onSubmit={onCreate}>
        <input value={newName} onChange={(event) => onNewNameChange(event.currentTarget.value)} />
        <button type="submit">新增</button>
      </form>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="management-list">
          {items.map((item) => (
            <div key={item.id} className="management-row">
              <input value={drafts[item.id] ?? item.name} onChange={(event) => onDraftChange(item.id, event.currentTarget.value)} />
              <button type="button" onClick={() => onRename(item.id, drafts[item.id] ?? item.name)}>
                重命名
              </button>
              <select
                value={migrationTargets[item.id] ?? ""}
                onChange={(event) => onMigrationTargetChange(item.id, event.currentTarget.value)}
                aria-label={`${item.name} 迁移目标`}
              >
                <option value="">迁移到...</option>
                {migrationOptions
                  .filter((option) => option.id !== item.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!migrationTargets[item.id]}
                onClick={() => onMigrateDelete(item.id, migrationTargets[item.id])}
              >
                迁移并删除
              </button>
              <button type="button" className="danger" onClick={() => onDelete(item.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: SystemStatus }) {
  return <span className={`status-badge ${status}`}>{systemStatusLabels[status]}</span>;
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
  if (!form.name.trim() || !form.categoryName.trim() || !form.productionDate || !Number.isInteger(shelfLifeValue)) {
    return undefined;
  }

  try {
    calculateExpiryDate(form.productionDate, shelfLifeValue, form.shelfLifeUnit);
    return createDerivedItem(
      {
        id: "preview",
        name: form.name.trim(),
        categoryId: "preview-category",
        productionDate: form.productionDate,
        shelfLifeValue,
        shelfLifeUnit: form.shelfLifeUnit,
        quantity: parseOptionalNumber(form.quantity),
        storageLocationId: undefined,
        note: form.note.trim() || undefined,
        customReminderDays: form.customReminderEnabled ? parseRequiredNumber(form.customReminderDays) : undefined,
        userStatus: "active",
        createdAt: "",
        updatedAt: "",
      },
      [{ id: "preview-category", name: form.categoryName.trim(), createdAt: "", updatedAt: "" }],
      [],
      { defaultReminderDays: globalReminderDays },
      today,
    );
  } catch {
    return undefined;
  }
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
