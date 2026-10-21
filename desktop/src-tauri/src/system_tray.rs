use crate::{workspaces::WorkspacesState, AppHandle, AppState, UiMessage};
use log::{error, info, warn};
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{TrayIcon, TrayIconBuilder},
    Manager, State,
};

pub trait SystemTrayIdentifier {}
pub type SystemTrayClickHandler = Box<dyn Fn(&AppHandle, State<AppState>)>;
pub trait ToSystemTraySubmenu {
    fn to_submenu(&self, app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>>;
    fn on_tray_item_clicked(&self, tray_item_id: &str) -> Option<SystemTrayClickHandler>;
}

pub struct SystemTray {}

impl SystemTray {
    pub fn new() -> Self {
        SystemTray {}
    }
}

impl SystemTray {
    const QUIT_ID: &str = "quit";
    const SHOW_DASHBOARD_ID: &str = "show_dashboard";
}

impl SystemTray {
    pub fn build_menu(
        &self,
        app: &AppHandle,
        submenu_builders: Vec<Box<&dyn ToSystemTraySubmenu>>,
    ) -> tauri::Result<Menu<tauri::Wry>> {
        let show_dashboard = MenuItem::with_id(
            app,
            Self::SHOW_DASHBOARD_ID,
            "Show Dashboard",
            true,
            None::<&str>,
        )?;
        let separator = PredefinedMenuItem::separator(app)?;
        let quit = MenuItem::with_id(app, Self::QUIT_ID, "Quit", true, None::<&str>)?;

        let mut items: Vec<Box<dyn IsMenuItem<tauri::Wry>>> =
            vec![Box::new(show_dashboard), Box::new(separator)];

        for builder in submenu_builders {
            let submenu = builder.to_submenu(app)?;
            items.push(Box::new(submenu));
        }

        items.push(Box::new(quit));

        let item_refs: Vec<&dyn IsMenuItem<tauri::Wry>> =
            items.iter().map(|item| &**item).collect();

        Menu::with_items(app, &item_refs)
    }

    pub fn build_tray(
        &self,
        app: &AppHandle,
        submenu_builders: Vec<Box<&dyn ToSystemTraySubmenu>>,
    ) -> tauri::Result<TrayIcon> {
        let menu = self.build_menu(app, submenu_builders)?;

        TrayIconBuilder::with_id("main")
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/icon.png"
            ))?)
            .icon_as_template(true)
            .tooltip("DevPod")
            .menu(&menu)
            .build(app)
    }

    pub fn get_event_handler(
        &self,
    ) -> impl Fn(&AppHandle, tauri::menu::MenuEvent) + Send + Sync + 'static {
        |app, event| match event.id().as_ref() {
            Self::QUIT_ID => {
                info!("Quit requested from system tray");
                app.exit(0);
            }
            Self::SHOW_DASHBOARD_ID => {
                let app_state = app.state::<AppState>();

                tauri::async_runtime::block_on(async move {
                    if let Err(err) = app_state.ui_messages.send(UiMessage::ShowDashboard).await {
                        error!("Failed to broadcast show dashboard message: {}", err);
                    };
                });
            }
            id => {
                let app_state = app.state::<AppState>();
                let mut maybe_handler: Option<_> = None;

                if id.starts_with(WorkspacesState::IDENTIFIER_PREFIX) {
                    let workspaces_state = &*app_state.workspaces.lock().unwrap();
                    maybe_handler = workspaces_state.on_tray_item_clicked(id);
                } else {
                    warn!("Received unhandled click for ID: {}", id);
                }

                if let Some(handler) = maybe_handler {
                    handler(app, app_state);
                }
            }
        }
    }
}
