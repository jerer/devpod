use log::info;

#[tauri::command]
pub fn log_message(message: String) {
    info!("logging message: {}", message);
}
