use serde::{Deserialize, Serialize};
use std::{
    ffi::{CStr, CString},
    fs,
    os::raw::{c_char, c_double, c_int, c_uchar, c_void},
    path::{Path, PathBuf},
    ptr,
};
use tauri::Manager;

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;
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

enum Sqlite3 {}
enum Sqlite3Stmt {}

type SqliteCallback = Option<
    unsafe extern "C" fn(
        data: *mut c_void,
        column_count: c_int,
        column_values: *mut *mut c_char,
        column_names: *mut *mut c_char,
    ) -> c_int,
>;
type SqliteDestructor = Option<unsafe extern "C" fn(*mut c_void)>;

#[link(name = "sqlite3")]
extern "C" {
    fn sqlite3_open(filename: *const c_char, database: *mut *mut Sqlite3) -> c_int;
    fn sqlite3_close(database: *mut Sqlite3) -> c_int;
    fn sqlite3_errmsg(database: *mut Sqlite3) -> *const c_char;
    fn sqlite3_exec(
        database: *mut Sqlite3,
        sql: *const c_char,
        callback: SqliteCallback,
        data: *mut c_void,
        error_message: *mut *mut c_char,
    ) -> c_int;
    fn sqlite3_free(value: *mut c_void);
    fn sqlite3_prepare_v2(
        database: *mut Sqlite3,
        sql: *const c_char,
        byte_count: c_int,
        statement: *mut *mut Sqlite3Stmt,
        tail: *mut *const c_char,
    ) -> c_int;
    fn sqlite3_finalize(statement: *mut Sqlite3Stmt) -> c_int;
    fn sqlite3_step(statement: *mut Sqlite3Stmt) -> c_int;
    fn sqlite3_bind_text(
        statement: *mut Sqlite3Stmt,
        index: c_int,
        value: *const c_char,
        byte_count: c_int,
        destructor: SqliteDestructor,
    ) -> c_int;
    fn sqlite3_bind_int64(statement: *mut Sqlite3Stmt, index: c_int, value: i64) -> c_int;
    fn sqlite3_bind_double(statement: *mut Sqlite3Stmt, index: c_int, value: c_double) -> c_int;
    fn sqlite3_bind_null(statement: *mut Sqlite3Stmt, index: c_int) -> c_int;
    fn sqlite3_column_text(statement: *mut Sqlite3Stmt, index: c_int) -> *const c_uchar;
    fn sqlite3_column_int64(statement: *mut Sqlite3Stmt, index: c_int) -> i64;
    fn sqlite3_column_double(statement: *mut Sqlite3Stmt, index: c_int) -> c_double;
    fn sqlite3_column_type(statement: *mut Sqlite3Stmt, index: c_int) -> c_int;
}

#[tauri::command]
pub fn load_product_state(app: tauri::AppHandle) -> Result<AmberProductState, String> {
    load_state_from_path(&product_db_path(&app)?)
}

#[tauri::command]
pub fn save_product_state(app: tauri::AppHandle, state: AmberProductState) -> Result<(), String> {
    save_state_to_path(&product_db_path(&app)?, &state)
}

#[tauri::command]
pub fn reset_product_state(app: tauri::AppHandle) -> Result<AmberProductState, String> {
    let state = initial_state();
    save_state_to_path(&product_db_path(&app)?, &state)?;
    Ok(state)
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

fn product_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
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

    replace_state(database, &initial_state())
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
        let mut statement = database.prepare(
            "INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )?;
        statement.bind_text(1, &category.id)?;
        statement.bind_text(2, &category.name)?;
        statement.bind_text(3, &category.created_at)?;
        statement.bind_text(4, &category.updated_at)?;
        statement.step_done()?;
    }

    for location in &state.storage_locations {
        let mut statement = database.prepare(
            "INSERT INTO storage_locations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )?;
        statement.bind_text(1, &location.id)?;
        statement.bind_text(2, &location.name)?;
        statement.bind_text(3, &location.created_at)?;
        statement.bind_text(4, &location.updated_at)?;
        statement.step_done()?;
    }

    for item in &state.items {
        let mut statement = database.prepare(
            "
            INSERT INTO items (
                id, name, category_id, production_date, shelf_life_value, shelf_life_unit,
                quantity, storage_location_id, note, custom_reminder_days, user_status,
                deleted_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ",
        )?;
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
        statement.bind_text(14, &item.updated_at)?;
        statement.step_done()?;
    }

    Ok(())
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
    let mut statement =
        database.prepare("SELECT id, name, created_at, updated_at FROM categories ORDER BY rowid")?;
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
    let mut statement =
        database.prepare("SELECT id, name, created_at, updated_at FROM storage_locations ORDER BY rowid")?;
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

struct Database {
    raw: *mut Sqlite3,
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
        let code = unsafe {
            sqlite3_prepare_v2(self.raw, sql.as_ptr(), -1, &mut raw, ptr::null_mut())
        };

        if code != SQLITE_OK {
            return Err(sqlite_error(self.raw));
        }

        Ok(Statement { database: self.raw, raw })
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
    database: *mut Sqlite3,
    raw: *mut Sqlite3Stmt,
}

impl Statement {
    fn bind_text(&mut self, index: c_int, value: &str) -> Result<(), String> {
        let value = CString::new(value).map_err(|error| error.to_string())?;
        let code = unsafe { sqlite3_bind_text(self.raw, index, value.as_ptr(), -1, sqlite_transient()) };
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
        unsafe { sqlite3_column_type(self.raw, index) == 5 }
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

fn sqlite_error(database: *mut Sqlite3) -> String {
    let message = unsafe { sqlite3_errmsg(database) };
    if message.is_null() {
        return "SQLite 操作失败".to_string();
    }

    unsafe { CStr::from_ptr(message) }
        .to_string_lossy()
        .into_owned()
}

fn sqlite_transient() -> SqliteDestructor {
    unsafe { std::mem::transmute::<isize, SqliteDestructor>(-1) }
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

    fn test_db_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-dbs")
            .join(format!("{}-{}.sqlite3", name, std::process::id()))
    }
}
