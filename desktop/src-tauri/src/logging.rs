use log::LevelFilter;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{Target, TargetKind};

#[allow(unused_variables)]
pub fn build_plugin() -> TauriPlugin<tauri::Wry> {
    let enable_debug_logging: Option<&'static str> = option_env!("DEBUG");
    let mut targets: Vec<Target> = vec![];

    #[cfg(debug_assertions)] // only enable during development
    if enable_debug_logging.is_some() {
        targets.push(Target::new(TargetKind::Stdout));
    }

    #[cfg(not(debug_assertions))] // only enable in release builds
    targets.push(Target::new(TargetKind::LogDir { file_name: None }));

    let builder = tauri_plugin_log::Builder::new().targets(targets);

    #[cfg(debug_assertions)] // only enable during development
    let builder = builder.level(LevelFilter::Debug);

    #[cfg(not(debug_assertions))] // only enable in release builds
    let builder = builder.level(LevelFilter::Info);

    builder.build()
}
