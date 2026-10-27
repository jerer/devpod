import { TProviderID, TWorkspaceID } from "./types"

export const QueryKeys = {
  PLATFORM: ["platform"],
  ARCHITECTURE: ["architecture"],
  SYSTEM_THEME: ["systemTheme"],
  WORKSPACES: ["workspaces"],
  PROVIDERS: ["providers"],
  PROVIDERS_CHECK_UPDATE_ALL: ["providers", "update", "all"],
  IDES: ["ides"],
  COMMUNITY_CONTRIBUTIONS: ["communityContributions"],
  CONTEXT_OPTIONS: ["contextOptions"],
  APP_VERSION: ["appVersion"],
  PRO_INSTANCES: ["proInstances"],
  workspace(id: TWorkspaceID): string[] {
    return [...QueryKeys.WORKSPACES, id]
  },
  workspaceStatus(id: TWorkspaceID): string[] {
    return [...QueryKeys.WORKSPACES, id, "status"]
  },
  provider(id: TProviderID): string[] {
    return [...QueryKeys.PROVIDERS, id]
  },
  providerOptions(id: TProviderID): string[] {
    return [...QueryKeys.provider(id), "options"]
  },
  providerSetOptions(id: TProviderID): string[] {
    return [...QueryKeys.provider(id), "set-options"]
  },
  providerUpdate(id: TProviderID): string[] {
    return [...QueryKeys.provider(id), "update"]
  },
}

export const MutationKeys = {
  CREATE_WORKSPACE: ["createWorkspace"],
  START_WORKSPACE: ["startWorkspace"],
  STOP_WORKSPACE: ["stopWorkspace"],
  REBUILD_WORKSPACE: ["rebuildWorkspace"],
  REMOVE_WORKSPACE: ["removeWorkspace"],
} as const
