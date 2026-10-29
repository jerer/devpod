use crate::commands::{delete_provider::DeleteProviderCommand, DevpodCommandConfig};
use crate::util::with_data_store;
use crate::AppHandle;
use log::{debug, info};

pub fn check_dangling_provider(app_handle: &AppHandle) {
    let dangling_provider_key = "danglingProviders"; // WARN: needs to match the key defined in typescript
    let filename = ".providers.json"; // WARN: needs to match the file name defined in typescript

    debug!("Checking for dangling providers");
    let _ = with_data_store(app_handle, filename, |store| {
        let dangling_providers = store
            .get(dangling_provider_key)
            .and_then(|dangling_providers| {
                serde_json::from_value::<Vec<String>>(dangling_providers.clone()).ok()
            });

        if dangling_providers.is_none() {
            debug!("No dangling providers found");
            return Ok(());
        }
        let dangling_providers = dangling_providers.unwrap();

        if dangling_providers.is_empty() {
            debug!("No dangling providers found");
            return Ok(());
        }

        info!(
            "Found dangling providers: {}, attempting to delete",
            dangling_providers.join(", ")
        );

        for dangling_provider in dangling_providers.iter() {
            if DeleteProviderCommand::new(dangling_provider.clone())
                .exec(app_handle)
                .is_ok()
                && store.delete(dangling_provider_key)
            {
                info!(
                    "Successfully deleted dangling provider: {}",
                    dangling_provider
                );
                let _ = store.save();
            }
        }

        Ok(())
    });
}
