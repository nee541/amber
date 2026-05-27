mod product_store;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            product_store::load_product_state,
            product_store::reset_product_state,
            product_store::create_product_item,
            product_store::update_product_item,
            product_store::set_product_item_user_status,
            product_store::move_product_item_to_trash,
            product_store::restore_product_item_from_trash,
            product_store::permanently_delete_product_item,
            product_store::create_product_category,
            product_store::rename_product_category,
            product_store::delete_product_category,
            product_store::migrate_and_delete_product_category,
            product_store::create_product_storage_location,
            product_store::rename_product_storage_location,
            product_store::delete_product_storage_location,
            product_store::migrate_and_delete_product_storage_location,
            product_store::update_product_default_reminder_days
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
