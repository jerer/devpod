use crate::AppHandle;
use anyhow::{Context, Result};
#[cfg(target_os = "macos")]
use log::error;
use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Debug)]
pub struct WindowHelper {
    app_handle: AppHandle,
}

impl WindowHelper {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub fn setup(&self, window: &WebviewWindow) {
        // open browser devtools automatically during development
        #[cfg(debug_assertions)]
        {
            window.open_devtools();
        }

        // Window vibrancy
        #[cfg(target_os = "macos")]
        {
            window_vibrancy::apply_vibrancy(
                window,
                window_vibrancy::NSVisualEffectMaterial::Sidebar,
                None,
                None,
            )
            .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
        }
    }

    pub fn new_main(&self, app_name: String) -> Result<()> {
        let handle = self.app_handle.clone();
        let self_ = self.clone();

        #[cfg(target_os = "macos")]
        self.set_dock_icon_visibility(true);

        self.app_handle
            .run_on_main_thread(move || {
                // Config should match the config in `src-tauri/tauri.conf.json` for a consistent window appearance
                let window_builder = WebviewWindowBuilder::new(
                    &handle,
                    "main",
                    WebviewUrl::App("index.html".into()),
                )
                .title(app_name)
                .fullscreen(false)
                .resizable(true)
                .transparent(true)
                .min_inner_size(1000.0, 700.0)
                .inner_size(1200.0, 800.0)
                .visible(false);

                #[cfg(target_os = "macos")]
                let window_builder = window_builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);

                let window = window_builder.build();

                if let Ok(window) = window {
                    self_.setup(&window);
                }
            })
            .context("Failed to create main window")
    }
}

#[cfg(target_os = "macos")]
impl WindowHelper {
    pub fn set_dock_icon_visibility(&self, visible: bool) {
        if let Err(err) = self.app_handle.set_dock_visibility(visible) {
            error!("Failed to set dock icon visibility: {}", err);
        }
    }
}
