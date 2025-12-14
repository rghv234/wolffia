// Wolffia - Tauri Commands
// Rust commands for desktop functionality

use tauri::{Manager, AppHandle};
use std::fs;
use std::path::PathBuf;

/// Get the app data directory
#[tauri::command]
pub fn get_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Read a file from disk
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Write content to a file
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Show save dialog and return selected path
#[tauri::command]
pub async fn show_save_dialog(
    app: AppHandle,
    default_name: String,
    filters: Vec<(String, Vec<String>)>
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let mut dialog = app.dialog().file();
    
    for (name, extensions) in filters {
        dialog = dialog.add_filter(&name, &extensions.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }
    
    dialog = dialog.set_file_name(&default_name);
    
    let path = dialog.blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}

/// Show open dialog and return selected paths
#[tauri::command]
pub async fn show_open_dialog(
    app: AppHandle,
    multiple: bool,
    filters: Vec<(String, Vec<String>)>
) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let mut dialog = app.dialog().file();
    
    for (name, extensions) in filters {
        dialog = dialog.add_filter(&name, &extensions.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }
    
    if multiple {
        let paths = dialog.blocking_pick_files();
        Ok(paths.unwrap_or_default().into_iter().map(|p| p.to_string()).collect())
    } else {
        let path = dialog.blocking_pick_file();
        Ok(path.map(|p| vec![p.to_string()]).unwrap_or_default())
    }
}

/// Check if running in Tauri (desktop)
#[tauri::command]
pub fn is_desktop() -> bool {
    true
}
