// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Show window after devtools setup to avoid black screen
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // Show main window
            if let Some(window) = app.get_webview_window("main") {
                window.show().unwrap();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_data_dir,
            commands::read_file,
            commands::write_file,
            commands::show_save_dialog,
            commands::show_open_dialog,
            commands::is_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
