use libsqlite3_sys::{
    sqlite3, sqlite3_bind_double, sqlite3_bind_int64, sqlite3_bind_null, sqlite3_bind_text,
    sqlite3_close, sqlite3_column_double, sqlite3_column_int64, sqlite3_column_text,
    sqlite3_column_type, sqlite3_errmsg, sqlite3_exec, sqlite3_finalize, sqlite3_free,
    sqlite3_open, sqlite3_prepare_v2, sqlite3_step, sqlite3_stmt, SQLITE_DONE, SQLITE_NULL,
    SQLITE_OK, SQLITE_ROW, SQLITE_TRANSIENT,
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::{CStr, CString},
    fs,
    os::raw::c_int,
    path::{Path, PathBuf},
    ptr,
};
use tauri::Manager;

const SEED_TIMESTAMP: &str = "1970-01-01T00:00:00.000Z";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmberProductState {
    pub version: i64,
    pub items: Vec<Item>,
    pub categories: Vec<Category>,
    pub storage_locations: Vec<StorageLocation>,
    pub settings: Settings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub production_date: String,
    pub shelf_life_value: i64,
    pub shelf_life_unit: String,
    pub quantity: Option<f64>,
    pub storage_location_id: Option<String>,
    pub note: Option<String>,
    pub custom_reminder_days: Option<i64>,
    pub user_status: String,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocation {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub default_reminder_days: i64,
}

#[tauri::command]
pub fn load_product_state(app: tauri::AppHandle) -> Result<AmberProductState, String> {
    load_state_from_path(&product_db_path(&app)?)
}

#[tauri::command]
pub fn reset_product_state(app: tauri::AppHandle) -> Result<AmberProductState, String> {
    let state = initial_state();
    save_state_to_path(&product_db_path(&app)?, &state)?;
    Ok(state)
}

#[tauri::command]
pub fn create_product_item(
    app: tauri::AppHandle,
    item: Item,
    category: Option<Category>,
    storage_location: Option<StorageLocation>,
) -> Result<AmberProductState, String> {
    create_product_item_at_path(&product_db_path(&app)?, item, category, storage_location)
}

#[tauri::command]
pub fn update_product_item(
    app: tauri::AppHandle,
    item: Item,
    category: Option<Category>,
    storage_location: Option<StorageLocation>,
) -> Result<AmberProductState, String> {
    update_product_item_at_path(&product_db_path(&app)?, item, category, storage_location)
}

#[tauri::command]
pub fn set_product_item_user_status(
    app: tauri::AppHandle,
    item_id: String,
    user_status: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    set_product_item_user_status_at_path(
        &product_db_path(&app)?,
        &item_id,
        &user_status,
        &updated_at,
    )
}

#[tauri::command]
pub fn move_product_item_to_trash(
    app: tauri::AppHandle,
    item_id: String,
    deleted_at: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    move_product_item_to_trash_at_path(&product_db_path(&app)?, &item_id, &deleted_at, &updated_at)
}

#[tauri::command]
pub fn restore_product_item_from_trash(
    app: tauri::AppHandle,
    item_id: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    restore_product_item_from_trash_at_path(&product_db_path(&app)?, &item_id, &updated_at)
}

#[tauri::command]
pub fn permanently_delete_product_item(
    app: tauri::AppHandle,
    item_id: String,
) -> Result<AmberProductState, String> {
    permanently_delete_product_item_at_path(&product_db_path(&app)?, &item_id)
}

#[tauri::command]
pub fn create_product_category(
    app: tauri::AppHandle,
    category: Category,
) -> Result<AmberProductState, String> {
    create_product_category_at_path(&product_db_path(&app)?, category)
}

#[tauri::command]
pub fn rename_product_category(
    app: tauri::AppHandle,
    category_id: String,
    name: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    rename_product_category_at_path(&product_db_path(&app)?, &category_id, &name, &updated_at)
}

#[tauri::command]
pub fn delete_product_category(
    app: tauri::AppHandle,
    category_id: String,
) -> Result<AmberProductState, String> {
    delete_product_category_at_path(&product_db_path(&app)?, &category_id)
}

#[tauri::command]
pub fn migrate_and_delete_product_category(
    app: tauri::AppHandle,
    source_category_id: String,
    target_category_id: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    migrate_and_delete_product_category_at_path(
        &product_db_path(&app)?,
        &source_category_id,
        &target_category_id,
        &updated_at,
    )
}

#[tauri::command]
pub fn create_product_storage_location(
    app: tauri::AppHandle,
    storage_location: StorageLocation,
) -> Result<AmberProductState, String> {
    create_product_storage_location_at_path(&product_db_path(&app)?, storage_location)
}

#[tauri::command]
pub fn rename_product_storage_location(
    app: tauri::AppHandle,
    storage_location_id: String,
    name: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    rename_product_storage_location_at_path(
        &product_db_path(&app)?,
        &storage_location_id,
        &name,
        &updated_at,
    )
}

#[tauri::command]
pub fn delete_product_storage_location(
    app: tauri::AppHandle,
    storage_location_id: String,
) -> Result<AmberProductState, String> {
    delete_product_storage_location_at_path(&product_db_path(&app)?, &storage_location_id)
}

#[tauri::command]
pub fn migrate_and_delete_product_storage_location(
    app: tauri::AppHandle,
    source_storage_location_id: String,
    target_storage_location_id: String,
    updated_at: String,
) -> Result<AmberProductState, String> {
    migrate_and_delete_product_storage_location_at_path(
        &product_db_path(&app)?,
        &source_storage_location_id,
        &target_storage_location_id,
        &updated_at,
    )
}

#[tauri::command]
pub fn update_product_default_reminder_days(
    app: tauri::AppHandle,
    default_reminder_days: i64,
) -> Result<AmberProductState, String> {
    update_product_default_reminder_days_at_path(&product_db_path(&app)?, default_reminder_days)
}

fn load_state_from_path(path: &Path) -> Result<AmberProductState, String> {
    ensure_parent_dir(path)?;
    let database = Database::open(path)?;
    initialize_schema(&database)?;
    seed_database_if_needed(&database)?;
    read_state(&database)
}

fn save_state_to_path(path: &Path, state: &AmberProductState) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let database = Database::open(path)?;
    initialize_schema(&database)?;
    database.exec("BEGIN IMMEDIATE")?;

    let result = replace_state(&database, state);
    match result {
        Ok(()) => database.exec("COMMIT"),
        Err(error) => {
            let _ = database.exec("ROLLBACK");
            Err(error)
        }
    }
}

fn create_product_item_at_path(
    path: &Path,
    item: Item,
    category: Option<Category>,
    storage_location: Option<StorageLocation>,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        if let Some(category) = category {
            insert_category(database, &category)?;
        }
        if let Some(storage_location) = storage_location {
            insert_storage_location(database, &storage_location)?;
        }
        insert_item(database, &item)
    })
}

fn update_product_item_at_path(
    path: &Path,
    item: Item,
    category: Option<Category>,
    storage_location: Option<StorageLocation>,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_item_exists(database, &item.id)?;
        if let Some(category) = category {
            insert_category(database, &category)?;
        }
        if let Some(storage_location) = storage_location {
            insert_storage_location(database, &storage_location)?;
        }
        update_item(database, &item)
    })
}

fn set_product_item_user_status_at_path(
    path: &Path,
    item_id: &str,
    user_status: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_item_exists(database, item_id)?;
        let mut statement =
            database.prepare("UPDATE items SET user_status = ?, updated_at = ? WHERE id = ?")?;
        statement.bind_text(1, user_status)?;
        statement.bind_text(2, updated_at)?;
        statement.bind_text(3, item_id)?;
        statement.step_done()
    })
}

fn move_product_item_to_trash_at_path(
    path: &Path,
    item_id: &str,
    deleted_at: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_item_exists(database, item_id)?;
        let mut statement =
            database.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?")?;
        statement.bind_text(1, deleted_at)?;
        statement.bind_text(2, updated_at)?;
        statement.bind_text(3, item_id)?;
        statement.step_done()
    })
}

fn restore_product_item_from_trash_at_path(
    path: &Path,
    item_id: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_item_exists(database, item_id)?;
        let mut statement =
            database.prepare("UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?")?;
        statement.bind_text(1, updated_at)?;
        statement.bind_text(2, item_id)?;
        statement.step_done()
    })
}

fn permanently_delete_product_item_at_path(
    path: &Path,
    item_id: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_deleted_item_exists(database, item_id)?;
        let mut statement = database.prepare("DELETE FROM items WHERE id = ?")?;
        statement.bind_text(1, item_id)?;
        statement.step_done()
    })
}

fn create_product_category_at_path(
    path: &Path,
    category: Category,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| insert_category(database, &category))
}

fn rename_product_category_at_path(
    path: &Path,
    category_id: &str,
    name: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_category_exists(database, category_id)?;
        let mut statement =
            database.prepare("UPDATE categories SET name = ?, updated_at = ? WHERE id = ?")?;
        statement.bind_text(1, name)?;
        statement.bind_text(2, updated_at)?;
        statement.bind_text(3, category_id)?;
        statement.step_done()
    })
}

fn delete_product_category_at_path(
    path: &Path,
    category_id: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_category_exists(database, category_id)?;
        if count_category_references(database, category_id)? > 0 {
            return Err("分类正在被商品使用，请先迁移关联商品".to_string());
        }
        let mut statement = database.prepare("DELETE FROM categories WHERE id = ?")?;
        statement.bind_text(1, category_id)?;
        statement.step_done()
    })
}

fn migrate_and_delete_product_category_at_path(
    path: &Path,
    source_category_id: &str,
    target_category_id: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    if source_category_id == target_category_id {
        return Err("迁移目标不能是当前分类".to_string());
    }

    mutate_state_at_path(path, |database| {
        ensure_category_exists(database, source_category_id)?;
        ensure_category_exists(database, target_category_id)?;
        let mut update_statement = database
            .prepare("UPDATE items SET category_id = ?, updated_at = ? WHERE category_id = ?")?;
        update_statement.bind_text(1, target_category_id)?;
        update_statement.bind_text(2, updated_at)?;
        update_statement.bind_text(3, source_category_id)?;
        update_statement.step_done()?;

        let mut delete_statement = database.prepare("DELETE FROM categories WHERE id = ?")?;
        delete_statement.bind_text(1, source_category_id)?;
        delete_statement.step_done()
    })
}

fn create_product_storage_location_at_path(
    path: &Path,
    storage_location: StorageLocation,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        insert_storage_location(database, &storage_location)
    })
}

fn rename_product_storage_location_at_path(
    path: &Path,
    storage_location_id: &str,
    name: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_storage_location_exists(database, storage_location_id)?;
        let mut statement = database
            .prepare("UPDATE storage_locations SET name = ?, updated_at = ? WHERE id = ?")?;
        statement.bind_text(1, name)?;
        statement.bind_text(2, updated_at)?;
        statement.bind_text(3, storage_location_id)?;
        statement.step_done()
    })
}

fn delete_product_storage_location_at_path(
    path: &Path,
    storage_location_id: &str,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        ensure_storage_location_exists(database, storage_location_id)?;
        if count_storage_location_references(database, storage_location_id)? > 0 {
            return Err("存放位置正在被商品使用，请先迁移关联商品".to_string());
        }
        let mut statement = database.prepare("DELETE FROM storage_locations WHERE id = ?")?;
        statement.bind_text(1, storage_location_id)?;
        statement.step_done()
    })
}

fn migrate_and_delete_product_storage_location_at_path(
    path: &Path,
    source_storage_location_id: &str,
    target_storage_location_id: &str,
    updated_at: &str,
) -> Result<AmberProductState, String> {
    if source_storage_location_id == target_storage_location_id {
        return Err("迁移目标不能是当前存放位置".to_string());
    }

    mutate_state_at_path(path, |database| {
        ensure_storage_location_exists(database, source_storage_location_id)?;
        ensure_storage_location_exists(database, target_storage_location_id)?;
        let mut update_statement =
            database.prepare("UPDATE items SET storage_location_id = ?, updated_at = ? WHERE storage_location_id = ?")?;
        update_statement.bind_text(1, target_storage_location_id)?;
        update_statement.bind_text(2, updated_at)?;
        update_statement.bind_text(3, source_storage_location_id)?;
        update_statement.step_done()?;

        let mut delete_statement =
            database.prepare("DELETE FROM storage_locations WHERE id = ?")?;
        delete_statement.bind_text(1, source_storage_location_id)?;
        delete_statement.step_done()
    })
}

fn update_product_default_reminder_days_at_path(
    path: &Path,
    default_reminder_days: i64,
) -> Result<AmberProductState, String> {
    mutate_state_at_path(path, |database| {
        let mut statement =
            database.prepare("UPDATE settings SET default_reminder_days = ? WHERE id = 1")?;
        statement.bind_i64(1, default_reminder_days)?;
        statement.step_done()
    })
}

fn mutate_state_at_path<F>(path: &Path, mutation: F) -> Result<AmberProductState, String>
where
    F: FnOnce(&Database) -> Result<(), String>,
{
    ensure_parent_dir(path)?;
    let database = Database::open(path)?;
    initialize_schema(&database)?;
    seed_database_if_needed(&database)?;
    database.exec("BEGIN IMMEDIATE")?;

    let result = (|| {
        mutation(&database)?;
        let state = read_state(&database)?;
        database.exec("COMMIT")?;
        Ok(state)
    })();

    if result.is_err() {
        let _ = database.exec("ROLLBACK");
    }

    result
}

fn product_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    Ok(data_dir.join("amber.sqlite3"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn initialize_schema(database: &Database) -> Result<(), String> {
    database.exec(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            default_reminder_days INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS storage_locations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category_id TEXT NOT NULL,
            production_date TEXT NOT NULL,
            shelf_life_value INTEGER NOT NULL,
            shelf_life_unit TEXT NOT NULL,
            quantity REAL,
            storage_location_id TEXT,
            note TEXT,
            custom_reminder_days INTEGER,
            user_status TEXT NOT NULL,
            deleted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(category_id) REFERENCES categories(id),
            FOREIGN KEY(storage_location_id) REFERENCES storage_locations(id)
        );
        ",
    )
}

fn seed_database_if_needed(database: &Database) -> Result<(), String> {
    if query_count(database, "SELECT COUNT(*) FROM settings")? > 0 {
        return Ok(());
    }

    database.exec("BEGIN IMMEDIATE")?;
    let result = replace_state(database, &initial_state());
    match result {
        Ok(()) => database.exec("COMMIT"),
        Err(error) => {
            let _ = database.exec("ROLLBACK");
            Err(error)
        }
    }
}

fn replace_state(database: &Database, state: &AmberProductState) -> Result<(), String> {
    database.exec(
        "
        DELETE FROM items;
        DELETE FROM categories;
        DELETE FROM storage_locations;
        DELETE FROM settings;
        ",
    )?;

    let mut settings_statement =
        database.prepare("INSERT INTO settings (id, default_reminder_days) VALUES (1, ?)")?;
    settings_statement.bind_i64(1, state.settings.default_reminder_days)?;
    settings_statement.step_done()?;

    for category in &state.categories {
        insert_category(database, category)?;
    }

    for location in &state.storage_locations {
        insert_storage_location(database, location)?;
    }

    for item in &state.items {
        insert_item(database, item)?;
    }

    Ok(())
}

fn insert_category(database: &Database, category: &Category) -> Result<(), String> {
    let mut statement = database
        .prepare("INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")?;
    statement.bind_text(1, &category.id)?;
    statement.bind_text(2, &category.name)?;
    statement.bind_text(3, &category.created_at)?;
    statement.bind_text(4, &category.updated_at)?;
    statement.step_done()
}

fn insert_storage_location(database: &Database, location: &StorageLocation) -> Result<(), String> {
    let mut statement = database.prepare(
        "INSERT INTO storage_locations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )?;
    statement.bind_text(1, &location.id)?;
    statement.bind_text(2, &location.name)?;
    statement.bind_text(3, &location.created_at)?;
    statement.bind_text(4, &location.updated_at)?;
    statement.step_done()
}

fn insert_item(database: &Database, item: &Item) -> Result<(), String> {
    let mut statement = database.prepare(
        "
        INSERT INTO items (
            id, name, category_id, production_date, shelf_life_value, shelf_life_unit,
            quantity, storage_location_id, note, custom_reminder_days, user_status,
            deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ",
    )?;
    bind_item_fields(&mut statement, item)?;
    statement.step_done()
}

fn update_item(database: &Database, item: &Item) -> Result<(), String> {
    let mut statement = database.prepare(
        "
        UPDATE items SET
            name = ?,
            category_id = ?,
            production_date = ?,
            shelf_life_value = ?,
            shelf_life_unit = ?,
            quantity = ?,
            storage_location_id = ?,
            note = ?,
            custom_reminder_days = ?,
            user_status = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?
        WHERE id = ?
        ",
    )?;
    statement.bind_text(1, &item.name)?;
    statement.bind_text(2, &item.category_id)?;
    statement.bind_text(3, &item.production_date)?;
    statement.bind_i64(4, item.shelf_life_value)?;
    statement.bind_text(5, &item.shelf_life_unit)?;
    statement.bind_optional_f64(6, item.quantity)?;
    statement.bind_optional_text(7, item.storage_location_id.as_deref())?;
    statement.bind_optional_text(8, item.note.as_deref())?;
    statement.bind_optional_i64(9, item.custom_reminder_days)?;
    statement.bind_text(10, &item.user_status)?;
    statement.bind_optional_text(11, item.deleted_at.as_deref())?;
    statement.bind_text(12, &item.created_at)?;
    statement.bind_text(13, &item.updated_at)?;
    statement.bind_text(14, &item.id)?;
    statement.step_done()
}

fn bind_item_fields(statement: &mut Statement, item: &Item) -> Result<(), String> {
    statement.bind_text(1, &item.id)?;
    statement.bind_text(2, &item.name)?;
    statement.bind_text(3, &item.category_id)?;
    statement.bind_text(4, &item.production_date)?;
    statement.bind_i64(5, item.shelf_life_value)?;
    statement.bind_text(6, &item.shelf_life_unit)?;
    statement.bind_optional_f64(7, item.quantity)?;
    statement.bind_optional_text(8, item.storage_location_id.as_deref())?;
    statement.bind_optional_text(9, item.note.as_deref())?;
    statement.bind_optional_i64(10, item.custom_reminder_days)?;
    statement.bind_text(11, &item.user_status)?;
    statement.bind_optional_text(12, item.deleted_at.as_deref())?;
    statement.bind_text(13, &item.created_at)?;
    statement.bind_text(14, &item.updated_at)
}

fn read_state(database: &Database) -> Result<AmberProductState, String> {
    Ok(AmberProductState {
        version: 1,
        items: read_items(database)?,
        categories: read_categories(database)?,
        storage_locations: read_storage_locations(database)?,
        settings: read_settings(database)?,
    })
}

fn read_settings(database: &Database) -> Result<Settings, String> {
    let mut statement =
        database.prepare("SELECT default_reminder_days FROM settings WHERE id = 1 LIMIT 1")?;

    match statement.step()? {
        SqlStep::Row => Ok(Settings {
            default_reminder_days: statement.column_i64(0),
        }),
        SqlStep::Done => Ok(Settings {
            default_reminder_days: 30,
        }),
    }
}

fn read_categories(database: &Database) -> Result<Vec<Category>, String> {
    let mut statement = database
        .prepare("SELECT id, name, created_at, updated_at FROM categories ORDER BY rowid")?;
    let mut categories = Vec::new();

    while let SqlStep::Row = statement.step()? {
        categories.push(Category {
            id: statement.column_text(0),
            name: statement.column_text(1),
            created_at: statement.column_text(2),
            updated_at: statement.column_text(3),
        });
    }

    Ok(categories)
}

fn read_storage_locations(database: &Database) -> Result<Vec<StorageLocation>, String> {
    let mut statement = database
        .prepare("SELECT id, name, created_at, updated_at FROM storage_locations ORDER BY rowid")?;
    let mut storage_locations = Vec::new();

    while let SqlStep::Row = statement.step()? {
        storage_locations.push(StorageLocation {
            id: statement.column_text(0),
            name: statement.column_text(1),
            created_at: statement.column_text(2),
            updated_at: statement.column_text(3),
        });
    }

    Ok(storage_locations)
}

fn read_items(database: &Database) -> Result<Vec<Item>, String> {
    let mut statement = database.prepare(
        "
        SELECT
            id, name, category_id, production_date, shelf_life_value, shelf_life_unit,
            quantity, storage_location_id, note, custom_reminder_days, user_status,
            deleted_at, created_at, updated_at
        FROM items
        ORDER BY created_at, id
        ",
    )?;
    let mut items = Vec::new();

    while let SqlStep::Row = statement.step()? {
        items.push(Item {
            id: statement.column_text(0),
            name: statement.column_text(1),
            category_id: statement.column_text(2),
            production_date: statement.column_text(3),
            shelf_life_value: statement.column_i64(4),
            shelf_life_unit: statement.column_text(5),
            quantity: statement.column_optional_f64(6),
            storage_location_id: statement.column_optional_text(7),
            note: statement.column_optional_text(8),
            custom_reminder_days: statement.column_optional_i64(9),
            user_status: statement.column_text(10),
            deleted_at: statement.column_optional_text(11),
            created_at: statement.column_text(12),
            updated_at: statement.column_text(13),
        });
    }

    Ok(items)
}

fn initial_state() -> AmberProductState {
    AmberProductState {
        version: 1,
        items: Vec::new(),
        categories: vec![
            preset_category("category-food", "食品"),
            preset_category("category-medicine", "药品"),
            preset_category("category-cosmetics", "化妆品"),
            preset_category("category-household", "家用品"),
            preset_category("category-collection", "收藏品"),
            preset_category("category-other", "其他"),
        ],
        storage_locations: Vec::new(),
        settings: Settings {
            default_reminder_days: 30,
        },
    }
}

fn preset_category(id: &str, name: &str) -> Category {
    Category {
        id: id.to_string(),
        name: name.to_string(),
        created_at: SEED_TIMESTAMP.to_string(),
        updated_at: SEED_TIMESTAMP.to_string(),
    }
}

fn query_count(database: &Database, sql: &str) -> Result<i64, String> {
    let mut statement = database.prepare(sql)?;
    match statement.step()? {
        SqlStep::Row => Ok(statement.column_i64(0)),
        SqlStep::Done => Ok(0),
    }
}

fn query_count_by_text(database: &Database, sql: &str, value: &str) -> Result<i64, String> {
    let mut statement = database.prepare(sql)?;
    statement.bind_text(1, value)?;
    match statement.step()? {
        SqlStep::Row => Ok(statement.column_i64(0)),
        SqlStep::Done => Ok(0),
    }
}

fn count_category_references(database: &Database, category_id: &str) -> Result<i64, String> {
    query_count_by_text(
        database,
        "SELECT COUNT(*) FROM items WHERE category_id = ?",
        category_id,
    )
}

fn count_storage_location_references(
    database: &Database,
    storage_location_id: &str,
) -> Result<i64, String> {
    query_count_by_text(
        database,
        "SELECT COUNT(*) FROM items WHERE storage_location_id = ?",
        storage_location_id,
    )
}

fn ensure_item_exists(database: &Database, item_id: &str) -> Result<(), String> {
    if query_count_by_text(database, "SELECT COUNT(*) FROM items WHERE id = ?", item_id)? == 0 {
        return Err("商品不存在".to_string());
    }

    Ok(())
}

fn ensure_deleted_item_exists(database: &Database, item_id: &str) -> Result<(), String> {
    if query_count_by_text(
        database,
        "SELECT COUNT(*) FROM items WHERE id = ? AND deleted_at IS NOT NULL",
        item_id,
    )? == 0
    {
        return Err("商品需要先进入回收站才能永久删除".to_string());
    }

    Ok(())
}

fn ensure_category_exists(database: &Database, category_id: &str) -> Result<(), String> {
    if query_count_by_text(
        database,
        "SELECT COUNT(*) FROM categories WHERE id = ?",
        category_id,
    )? == 0
    {
        return Err("分类不存在".to_string());
    }

    Ok(())
}

fn ensure_storage_location_exists(
    database: &Database,
    storage_location_id: &str,
) -> Result<(), String> {
    if query_count_by_text(
        database,
        "SELECT COUNT(*) FROM storage_locations WHERE id = ?",
        storage_location_id,
    )? == 0
    {
        return Err("存放位置不存在".to_string());
    }

    Ok(())
}

struct Database {
    raw: *mut sqlite3,
}

impl Database {
    fn open(path: &Path) -> Result<Self, String> {
        let path_string = path
            .to_str()
            .ok_or_else(|| "SQLite 数据库路径不是有效 UTF-8".to_string())?;
        let filename = CString::new(path_string).map_err(|error| error.to_string())?;
        let mut raw = ptr::null_mut();
        let code = unsafe { sqlite3_open(filename.as_ptr(), &mut raw) };

        if code != SQLITE_OK {
            let message = if raw.is_null() {
                "无法打开 SQLite 数据库".to_string()
            } else {
                sqlite_error(raw)
            };

            if !raw.is_null() {
                let _ = unsafe { sqlite3_close(raw) };
            }

            return Err(message);
        }

        Ok(Self { raw })
    }

    fn exec(&self, sql: &str) -> Result<(), String> {
        let statement = CString::new(sql).map_err(|error| error.to_string())?;
        let mut error_message = ptr::null_mut();
        let code = unsafe {
            sqlite3_exec(
                self.raw,
                statement.as_ptr(),
                None,
                ptr::null_mut(),
                &mut error_message,
            )
        };

        if code == SQLITE_OK {
            return Ok(());
        }

        if error_message.is_null() {
            return Err(sqlite_error(self.raw));
        }

        let message = unsafe { CStr::from_ptr(error_message) }
            .to_string_lossy()
            .into_owned();
        unsafe { sqlite3_free(error_message.cast()) };
        Err(message)
    }

    fn prepare(&self, sql: &str) -> Result<Statement, String> {
        let sql = CString::new(sql).map_err(|error| error.to_string())?;
        let mut raw = ptr::null_mut();
        let code =
            unsafe { sqlite3_prepare_v2(self.raw, sql.as_ptr(), -1, &mut raw, ptr::null_mut()) };

        if code != SQLITE_OK {
            return Err(sqlite_error(self.raw));
        }

        Ok(Statement {
            database: self.raw,
            raw,
        })
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            let _ = unsafe { sqlite3_close(self.raw) };
        }
    }
}

enum SqlStep {
    Row,
    Done,
}

struct Statement {
    database: *mut sqlite3,
    raw: *mut sqlite3_stmt,
}

impl Statement {
    fn bind_text(&mut self, index: c_int, value: &str) -> Result<(), String> {
        let value = CString::new(value).map_err(|error| error.to_string())?;
        let code =
            unsafe { sqlite3_bind_text(self.raw, index, value.as_ptr(), -1, SQLITE_TRANSIENT()) };
        self.check_bind(code)
    }

    fn bind_optional_text(&mut self, index: c_int, value: Option<&str>) -> Result<(), String> {
        match value {
            Some(value) => self.bind_text(index, value),
            None => self.bind_null(index),
        }
    }

    fn bind_i64(&mut self, index: c_int, value: i64) -> Result<(), String> {
        let code = unsafe { sqlite3_bind_int64(self.raw, index, value) };
        self.check_bind(code)
    }

    fn bind_optional_i64(&mut self, index: c_int, value: Option<i64>) -> Result<(), String> {
        match value {
            Some(value) => self.bind_i64(index, value),
            None => self.bind_null(index),
        }
    }

    fn bind_optional_f64(&mut self, index: c_int, value: Option<f64>) -> Result<(), String> {
        match value {
            Some(value) => {
                let code = unsafe { sqlite3_bind_double(self.raw, index, value) };
                self.check_bind(code)
            }
            None => self.bind_null(index),
        }
    }

    fn bind_null(&mut self, index: c_int) -> Result<(), String> {
        let code = unsafe { sqlite3_bind_null(self.raw, index) };
        self.check_bind(code)
    }

    fn step(&mut self) -> Result<SqlStep, String> {
        match unsafe { sqlite3_step(self.raw) } {
            SQLITE_ROW => Ok(SqlStep::Row),
            SQLITE_DONE => Ok(SqlStep::Done),
            _ => Err(sqlite_error(self.database)),
        }
    }

    fn step_done(&mut self) -> Result<(), String> {
        match self.step()? {
            SqlStep::Done => Ok(()),
            SqlStep::Row => Err("SQLite 语句返回了意外数据行".to_string()),
        }
    }

    fn column_text(&self, index: c_int) -> String {
        self.column_optional_text(index).unwrap_or_default()
    }

    fn column_optional_text(&self, index: c_int) -> Option<String> {
        if self.is_null(index) {
            return None;
        }

        let value = unsafe { sqlite3_column_text(self.raw, index) };
        if value.is_null() {
            return None;
        }

        Some(
            unsafe { CStr::from_ptr(value.cast()) }
                .to_string_lossy()
                .into_owned(),
        )
    }

    fn column_i64(&self, index: c_int) -> i64 {
        unsafe { sqlite3_column_int64(self.raw, index) }
    }

    fn column_optional_i64(&self, index: c_int) -> Option<i64> {
        (!self.is_null(index)).then(|| self.column_i64(index))
    }

    fn column_optional_f64(&self, index: c_int) -> Option<f64> {
        (!self.is_null(index)).then(|| unsafe { sqlite3_column_double(self.raw, index) })
    }

    fn is_null(&self, index: c_int) -> bool {
        unsafe { sqlite3_column_type(self.raw, index) == SQLITE_NULL }
    }

    fn check_bind(&self, code: c_int) -> Result<(), String> {
        if code == SQLITE_OK {
            Ok(())
        } else {
            Err(sqlite_error(self.database))
        }
    }
}

impl Drop for Statement {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            let _ = unsafe { sqlite3_finalize(self.raw) };
        }
    }
}

fn sqlite_error(database: *mut sqlite3) -> String {
    let message = unsafe { sqlite3_errmsg(database) };
    if message.is_null() {
        return "SQLite 操作失败".to_string();
    }

    unsafe { CStr::from_ptr(message) }
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs, path::PathBuf};

    #[test]
    fn initializes_sqlite_database_with_seed_state() {
        let path = test_db_path("initializes_sqlite_database_with_seed_state");
        let _ = fs::remove_file(&path);

        let state = load_state_from_path(&path).expect("state loads");

        assert_eq!(state.version, 1);
        assert_eq!(
            state
                .categories
                .iter()
                .map(|category| category.name.as_str())
                .collect::<Vec<_>>(),
            vec!["食品", "药品", "化妆品", "家用品", "收藏品", "其他"]
        );
        assert_eq!(state.settings.default_reminder_days, 30);
        assert!(state.items.is_empty());
        assert!(path.exists());
    }

    #[test]
    fn saves_and_loads_structured_product_state() {
        let path = test_db_path("saves_and_loads_structured_product_state");
        let _ = fs::remove_file(&path);

        let state = AmberProductState {
            version: 1,
            categories: vec![Category {
                id: "category-food".to_string(),
                name: "食品".to_string(),
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            }],
            storage_locations: vec![StorageLocation {
                id: "location-fridge".to_string(),
                name: "冰箱".to_string(),
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            }],
            settings: Settings {
                default_reminder_days: 7,
            },
            items: vec![Item {
                id: "item-1".to_string(),
                name: "牛奶".to_string(),
                category_id: "category-food".to_string(),
                production_date: "2026-01-01".to_string(),
                shelf_life_value: 30,
                shelf_life_unit: "day".to_string(),
                quantity: Some(2.0),
                storage_location_id: Some("location-fridge".to_string()),
                note: Some("低温保存".to_string()),
                custom_reminder_days: Some(3),
                user_status: "active".to_string(),
                deleted_at: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: "2026-01-02T00:00:00.000Z".to_string(),
            }],
        };

        save_state_to_path(&path, &state).expect("state saves");

        assert_eq!(load_state_from_path(&path).expect("state reloads"), state);
    }

    #[test]
    fn creates_product_item_incrementally_without_replacing_existing_rows() {
        let path =
            test_db_path("creates_product_item_incrementally_without_replacing_existing_rows");
        let _ = fs::remove_file(&path);
        let existing_category = test_category("category-food", "食品");
        let existing_item = test_item("item-1", "牛奶", "category-food", None);
        let initial = test_state(
            vec![existing_category.clone()],
            Vec::new(),
            vec![existing_item.clone()],
            30,
        );
        save_state_to_path(&path, &initial).expect("initial state saves");

        let new_category = test_category("category-snacks", "零食");
        let new_location = test_location("location-pantry", "储物柜");
        let new_item = test_item(
            "item-2",
            "饼干",
            &new_category.id,
            Some(new_location.id.as_str()),
        );

        let state = create_product_item_at_path(
            &path,
            new_item.clone(),
            Some(new_category.clone()),
            Some(new_location.clone()),
        )
        .expect("item is created");

        assert_eq!(
            state
                .items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["item-1", "item-2"]
        );
        assert!(state
            .categories
            .iter()
            .any(|category| category == &existing_category));
        assert!(state
            .categories
            .iter()
            .any(|category| category == &new_category));
        assert_eq!(state.storage_locations, vec![new_location]);
        assert_eq!(state.settings.default_reminder_days, 30);
    }

    #[test]
    fn updates_product_item_incrementally_without_removing_other_rows() {
        let path = test_db_path("updates_product_item_incrementally_without_removing_other_rows");
        let _ = fs::remove_file(&path);
        let category = test_category("category-food", "食品");
        let item_one = test_item("item-1", "牛奶", &category.id, None);
        let item_two = test_item("item-2", "酸奶", &category.id, None);
        save_state_to_path(
            &path,
            &test_state(
                vec![category],
                Vec::new(),
                vec![item_one.clone(), item_two.clone()],
                30,
            ),
        )
        .expect("initial state saves");

        let mut updated = item_one.clone();
        updated.name = "低温牛奶".to_string();
        updated.updated_at = "2026-01-03T00:00:00.000Z".to_string();

        let state =
            update_product_item_at_path(&path, updated.clone(), None, None).expect("item updates");

        assert!(state.items.iter().any(|item| item == &updated));
        assert!(state.items.iter().any(|item| item == &item_two));
    }

    #[test]
    fn migrates_and_deletes_product_category_without_rewriting_all_state() {
        let path =
            test_db_path("migrates_and_deletes_product_category_without_rewriting_all_state");
        let _ = fs::remove_file(&path);
        let source = test_category("category-source", "旧分类");
        let target = test_category("category-target", "新分类");
        let item = test_item("item-1", "罐头", &source.id, None);
        save_state_to_path(
            &path,
            &test_state(
                vec![source.clone(), target.clone()],
                Vec::new(),
                vec![item],
                30,
            ),
        )
        .expect("initial state saves");

        let state = migrate_and_delete_product_category_at_path(
            &path,
            &source.id,
            &target.id,
            "2026-01-04T00:00:00.000Z",
        )
        .expect("category migrates");

        assert!(!state
            .categories
            .iter()
            .any(|category| category.id == source.id));
        assert!(state.categories.iter().any(|category| category == &target));
        assert_eq!(state.items[0].category_id, target.id);
        assert_eq!(state.items[0].updated_at, "2026-01-04T00:00:00.000Z");
    }

    #[test]
    fn updates_default_reminder_days_without_replacing_items() {
        let path = test_db_path("updates_default_reminder_days_without_replacing_items");
        let _ = fs::remove_file(&path);
        let category = test_category("category-food", "食品");
        let item = test_item("item-1", "牛奶", &category.id, None);
        save_state_to_path(
            &path,
            &test_state(vec![category.clone()], Vec::new(), vec![item.clone()], 30),
        )
        .expect("initial state saves");

        let state =
            update_product_default_reminder_days_at_path(&path, 14).expect("settings update");

        assert_eq!(state.settings.default_reminder_days, 14);
        assert_eq!(state.items, vec![item]);
        assert_eq!(state.categories, vec![category]);
    }

    #[test]
    fn rolls_back_created_references_when_incremental_item_write_fails() {
        let path = test_db_path("rolls_back_created_references_when_incremental_item_write_fails");
        let _ = fs::remove_file(&path);
        let existing_category = test_category("category-food", "食品");
        let existing_item = test_item("item-1", "牛奶", &existing_category.id, None);
        let initial = test_state(
            vec![existing_category.clone()],
            Vec::new(),
            vec![existing_item.clone()],
            30,
        );
        save_state_to_path(&path, &initial).expect("initial state saves");

        let attempted_category = test_category("category-snacks", "零食");
        let attempted_location = test_location("location-pantry", "储物柜");
        let duplicate_item = test_item(
            &existing_item.id,
            "重复牛奶",
            &attempted_category.id,
            Some(attempted_location.id.as_str()),
        );

        let error = create_product_item_at_path(
            &path,
            duplicate_item,
            Some(attempted_category.clone()),
            Some(attempted_location.clone()),
        )
        .expect_err("duplicate item fails");

        assert!(error.contains("UNIQUE") || error.contains("constraint"));
        let state = load_state_from_path(&path).expect("state reloads");
        assert_eq!(state.items, vec![existing_item]);
        assert_eq!(state.categories, vec![existing_category]);
        assert!(state.storage_locations.is_empty());
    }

    fn test_db_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-dbs")
            .join(format!("{}-{}.sqlite3", name, std::process::id()))
    }

    fn test_state(
        categories: Vec<Category>,
        storage_locations: Vec<StorageLocation>,
        items: Vec<Item>,
        default_reminder_days: i64,
    ) -> AmberProductState {
        AmberProductState {
            version: 1,
            categories,
            storage_locations,
            settings: Settings {
                default_reminder_days,
            },
            items,
        }
    }

    fn test_category(id: &str, name: &str) -> Category {
        Category {
            id: id.to_string(),
            name: name.to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn test_location(id: &str, name: &str) -> StorageLocation {
        StorageLocation {
            id: id.to_string(),
            name: name.to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn test_item(
        id: &str,
        name: &str,
        category_id: &str,
        storage_location_id: Option<&str>,
    ) -> Item {
        Item {
            id: id.to_string(),
            name: name.to_string(),
            category_id: category_id.to_string(),
            production_date: "2026-01-01".to_string(),
            shelf_life_value: 30,
            shelf_life_unit: "day".to_string(),
            quantity: Some(1.0),
            storage_location_id: storage_location_id.map(ToString::to_string),
            note: None,
            custom_reminder_days: None,
            user_status: "active".to_string(),
            deleted_at: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }
}
