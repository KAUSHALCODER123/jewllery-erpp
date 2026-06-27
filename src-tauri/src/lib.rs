//! Jewel-ERP desktop shell.
//!
//! The UI is the same React/Vite app that ships on the web; here it is hosted in
//! the system WebView (WebView2 on Windows). Persistence is provided by
//! `tauri-plugin-sql` (SQLite), exposed to the frontend through the JS
//! `@tauri-apps/plugin-sql` API (see `src/db/sqlite.ts`). The full schema is
//! applied as a migration the first time the database is opened.

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial Jewel-ERP schema (business + system tables)",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:jewel_erp.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Jewel-ERP");
}
