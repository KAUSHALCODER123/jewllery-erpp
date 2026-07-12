//! Jewel-ERP desktop shell.
//!
//! The UI is the same React/Vite app that ships on the web; here it is hosted in
//! the system WebView (WebView2 on Windows). Persistence is provided by
//! `tauri-plugin-sql` (SQLite), exposed to the frontend through the JS
//! `@tauri-apps/plugin-sql` API (see `src/db/sqlite.ts`). The full schema is
//! applied as a migration the first time the default `jewel_erp.db` is opened.
//! Multi-firm uses one DB file per company (`jewel_erp_co<id>.db`); those files
//! are not registered here, so the frontend applies the same schema to them on
//! open (idempotent CREATE IF NOT EXISTS — see src/db/sqliteMigrate.ts).

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Stable per-machine hardware id used to lock a license to one computer.
/// On Windows this is the OS MachineGuid; the frontend hashes + formats it
/// (see src/lib/machineId.ts). Copying the install to another PC yields a
/// different id, so a license issued for one machine won't validate on another.
#[tauri::command]
fn get_machine_id() -> Result<String, String> {
    machine_uid::get().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial Jewel-ERP schema (business + system tables)",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:jewel_erp.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![get_machine_id])
        .run(tauri::generate_context!())
        .expect("error while running Jewel-ERP");
}
