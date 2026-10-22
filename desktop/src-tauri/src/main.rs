#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod action_logs;
mod commands;
mod community_contributions;
mod custom_protocol;
mod file_exists;
mod fix_env;
mod get_env;
mod install_cli;
mod log_message;
mod logging;
mod providers;
mod server;
mod settings;
mod system_tray;
mod ui_messages;
mod ui_ready;
mod util;
mod window;
mod workspaces;

use community_contributions::CommunityContributions;
use custom_protocol::CustomProtocol;
use log::{error, info};
use std::sync::{Arc, Mutex};
use system_tray::SystemTray;
use tauri::Manager;
use tokio::sync::mpsc::{self, Sender};
use ui_messages::UiMessage;
use workspaces::WorkspacesState;

pub type AppHandle = tauri::AppHandle;

#[derive(Debug)]
pub struct AppState {
    workspaces: Arc<Mutex<WorkspacesState>>,
    community_contributions: Arc<Mutex<CommunityContributions>>,
    ui_messages: Sender<UiMessage>,
}
// TODO: build localhost http server
// should have a /pro/setup endpoint and send the same UI message as the custom protocol

fn main() -> anyhow::Result<()> {
    // https://unix.stackexchange.com/questions/82620/gui-apps-dont-inherit-path-from-parent-console-apps
    fix_env::fix_env("PATH")?;

    let ctx = tauri::generate_context!();
    let app_name = ctx.package_info().name.to_string();

    let custom_protocol = CustomProtocol::init();
    let contributions = community_contributions::init()?;

    let (tx, rx) = mpsc::channel::<UiMessage>(10);

    let app_builder = tauri::Builder::default()
        .plugin(logging::build_plugin())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(AppState {
            workspaces: Arc::new(Mutex::new(WorkspacesState::default())),
            community_contributions: Arc::new(Mutex::new(contributions)),
            ui_messages: tx.clone(),
        })
        .menu(|app| {
            if cfg!(target_os = "macos") {
                tauri::menu::Menu::default(app)
            } else {
                tauri::menu::Menu::new(app)
            }
        });

    let mut app_builder = app_builder.setup(move |app| {
        info!("Setup application");

        let system_tray = SystemTray::new();
        let tray =
            system_tray.build_tray(app.handle(), vec![Box::new(&WorkspacesState::default())])?;
        let handler = system_tray.get_event_handler();
        tray.on_menu_event(move |app, event| handler(app, event));

        providers::check_dangling_provider(app.handle());
        let window_helper = window::WindowHelper::new(app.handle().clone());

        let window = app.get_webview_window("main").unwrap();
        window_helper.setup(&window);

        workspaces::setup(app.handle(), app.state());
        community_contributions::setup(app.state());
        action_logs::setup(app.handle())?;
        custom_protocol.setup(app.handle().clone());

        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = server::setup(&app_handle).await {
                error!("Failed to start server: {}", err);
            }
        });

        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            ui_messages::UiMessageHelper::new(app_handle, app_name, window_helper)
                .listen(rx)
                .await;
        });

        info!("Setup done");
        Ok(())
    });

    app_builder = app_builder.invoke_handler(tauri::generate_handler![
        ui_ready::ui_ready,
        action_logs::write_action_log,
        action_logs::get_action_logs,
        action_logs::get_action_log_file,
        action_logs::sync_action_logs,
        install_cli::install_cli,
        get_env::get_env,
        file_exists::file_exists,
        log_message::log_message,
        community_contributions::get_contributions,
    ]);

    let app = app_builder
        .build(ctx)
        .expect("error while building tauri application");

    info!("Run");

    app.run(move |app_handle, event| {
        let exit_requested_tx = tx.clone();

        match event {
            // Prevents app from exiting when last window is closed, leaving the system tray active.
            // An explicit exit (tray "Quit" / `app.exit`) arrives with a code and must not be prevented.
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                if let Some(code) = code {
                    info!("Explicit exit requested with code {}; allowing exit", code);
                    return;
                }

                info!("Exit requested by user interaction; preventing exit to keep tray active");
                tauri::async_runtime::block_on(async move {
                    if let Err(err) = exit_requested_tx.send(UiMessage::ExitRequested).await {
                        error!("Failed to broadcast UI ready message: {:?}", err);
                    }
                });
                api.prevent_exit();
            }
            #[allow(unused_variables)]
            tauri::RunEvent::WindowEvent { event, label, .. } => {
                if let tauri::WindowEvent::Destroyed = event {
                    providers::check_dangling_provider(app_handle);
                    #[cfg(target_os = "macos")]
                    {
                        let window_helper = window::WindowHelper::new(app_handle.clone());
                        let window_count = app_handle.webview_windows().len();
                        info!("Window \"{}\" destroyed, {} remaining", label, window_count);
                        if window_count == 0 {
                            window_helper.set_dock_icon_visibility(false);
                        }
                    }
                }
            }
            tauri::RunEvent::Exit => {
                providers::check_dangling_provider(app_handle);
            }
            _ => {}
        }
    });

    Ok(())
}
