use std::time::{Duration, Instant};

use tauri_plugin_store::{Store, StoreExt};

use crate::AppHandle;

/// `measure`  the duration it took a function to execute.
#[allow(dead_code)]
pub fn measure<F>(f: F) -> Duration
where
    F: Fn(),
{
    let start = Instant::now();
    f();

    start.elapsed()
}

pub fn with_data_store<T, F>(app_handle: &AppHandle, filename: &str, f: F) -> anyhow::Result<T>
where
    F: FnOnce(&Store<tauri::Wry>) -> anyhow::Result<T>,
{
    let store = app_handle.store(filename)?;
    f(&store)
}
