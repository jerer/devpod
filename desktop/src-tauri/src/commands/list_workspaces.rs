use crate::AppHandle;

use super::{
    config::{CommandConfig, DevpodCommandConfig, DevpodCommandError},
    constants::{DEVPOD_BINARY_NAME, DEVPOD_COMMAND_LIST, FLAG_OUTPUT_JSON},
};
use crate::workspaces::WorkspacesState;

pub struct ListWorkspacesCommand {}
impl ListWorkspacesCommand {
    pub fn new() -> Self {
        ListWorkspacesCommand {}
    }

    fn deserialize(&self, str: &str) -> Result<WorkspacesState, DevpodCommandError> {
        serde_json::from_str(str).map_err(DevpodCommandError::Parse)
    }
}
impl DevpodCommandConfig<WorkspacesState> for ListWorkspacesCommand {
    fn config(&self) -> CommandConfig<'_> {
        CommandConfig {
            binary_name: DEVPOD_BINARY_NAME,
            args: vec![DEVPOD_COMMAND_LIST, FLAG_OUTPUT_JSON],
        }
    }

    fn exec(self, app_handle: &AppHandle) -> Result<WorkspacesState, DevpodCommandError> {
        let cmd = self.new_command(app_handle)?;
        let output =
            tauri::async_runtime::block_on(cmd.output()).map_err(|_| DevpodCommandError::Output)?;

        self.deserialize(&String::from_utf8_lossy(&output.stdout))
    }
}
