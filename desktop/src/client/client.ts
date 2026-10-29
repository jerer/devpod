import { UseToastOptions } from "@chakra-ui/react"
import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { appDataDir } from "@tauri-apps/api/path"
import { getCurrentWindow, type Theme as TauriTheme } from "@tauri-apps/api/window"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { open } from "@tauri-apps/plugin-dialog"
import { copyFile } from "@tauri-apps/plugin-fs"
import { arch, platform, type Arch, type Platform } from "@tauri-apps/plugin-os"
import { openPath, openUrl } from "@tauri-apps/plugin-opener"
import { exit } from "@tauri-apps/plugin-process"
import { TSettings } from "../contexts"
import { Result, Return, isError, noop } from "../lib"
import { TCommunityContributions, TUnsubscribeFn } from "../types"
import { ContextClient } from "./context"
import { IDEsClient } from "./ides"
import { ProvidersClient } from "./providers"
import { WorkspacesClient } from "./workspaces"
import { Command as DevPodCommand } from "./command"

// These types have to match the rust types! Make sure to update them as well!
type TChannels = {
  event:
    | Readonly<{
        type: "ShowToast"
        message: string
        title: string
        status: NonNullable<UseToastOptions["status"]>
      }>
    | Readonly<{ type: "ShowDashboard" }>
    | Readonly<{ type: "CommandFailed" }>
    | Readonly<{
        type: "OpenWorkspace"
        workspace_id: string | null
        provider_id: string | null
        ide: string | null
        source: string
      }>
}
type TChannelName = keyof TChannels
type TClientEventListener<TChannel extends TChannelName> = (payload: TChannels[TChannel]) => void
type TClientSettings = Pick<
  TSettings,
  | "debugFlag"
  | "additionalCliFlags"
  | "dotfilesUrl"
  | "additionalEnvVars"
  | "sshKeyPath"
  | "httpProxyUrl"
  | "httpsProxyUrl"
  | "noProxy"
>
export type TPlatform = Platform
export type TArch = Arch

class Client {
  public readonly workspaces = new WorkspacesClient()
  public readonly providers = new ProvidersClient()
  public readonly ides = new IDEsClient()
  public readonly context = new ContextClient()

  public setSetting<TSettingName extends keyof TClientSettings>(
    name: TSettingName,
    value: TSettings[TSettingName]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (name === "debugFlag") {
      const debug: boolean = value as boolean
      this.workspaces.setDebug(debug)
      this.providers.setDebug(debug)
      this.ides.setDebug(debug)
    }
    if (name === "additionalCliFlags") {
      this.workspaces.setAdditionalFlags(value as string)
    }
    if (name === "dotfilesUrl") {
      this.workspaces.setDotfilesFlag(value as string)
    }
    if (name === "sshKeyPath") {
      this.workspaces.setSSHKeyPath(value as string)
    }
    if (name === "additionalEnvVars") {
      DevPodCommand.ADDITIONAL_ENV_VARS = value as string
    }
    if (name === "httpProxyUrl") {
      DevPodCommand.HTTP_PROXY = value as string
    }
    if (name === "httpsProxyUrl") {
      DevPodCommand.HTTPS_PROXY = value as string
    }
    if (name === "noProxy") {
      DevPodCommand.NO_PROXY = value as string
    }
  }
  public ready(): Promise<void> {
    return invoke("ui_ready")
  }

  public async subscribe<T extends TChannelName>(
    channel: T,
    listener: TClientEventListener<T>
  ): Promise<TUnsubscribeFn> {
    // `TClient` is strictly typed so we're fine casting the response as `any`.
    try {
      const unsubscribe = await listen<any>(channel, (event) => {
        listener(event.payload)
      })

      return unsubscribe
    } catch {
      return noop
    }
  }

  public async fetchPlatform(): Promise<TPlatform> {
    return platform()
  }

  public async fetchArch(): Promise<TArch> {
    return arch()
  }

  public fetchVersion(): Promise<string> {
    return getVersion()
  }

  public async fetchCommunityContributions(): Promise<Result<TCommunityContributions>> {
    try {
      const contributions = await invoke<TCommunityContributions>("get_contributions")

      return Return.Value(contributions)
    } catch (e) {
      if (isError(e)) {
        return Return.Failed(e.message)
      }

      const errMsg = "Unable to fetch community contributions"
      if (typeof e === "string") {
        return Return.Failed(`${errMsg}: ${e}`)
      }

      return Return.Failed(errMsg)
    }
  }

  public async openDir(_dir: "AppData" = "AppData"): Promise<void> {
    try {
      const p = await appDataDir()
      await openPath(p)
    } catch (e) {
      // noop for now
    }
  }

  public async selectFromDir(): Promise<string | string[] | null> {
    return open({ directory: true, multiple: false })
  }

  public async selectFromFileYaml(): Promise<string | string[] | null> {
    return open({
      filters: [{ name: "yaml", extensions: ["yml", "yaml"] }],
      directory: false,
      multiple: false,
    })
  }

  public async selectFromFile(): Promise<string | string[] | null> {
    return open({ directory: false, multiple: false })
  }

  public async copyFile(src: string, dest: string): Promise<void> {
    return copyFile(src, dest)
  }

  public async getEnv(name: string): Promise<string> {
    return invoke<string>("get_env", { name })
  }

  public open(link: string): void {
    if (/^(https?|mailto|tel):/i.test(link)) {
      void openUrl(link)
    } else {
      void openPath(link)
    }
  }

  public async quit(): Promise<Result<void>> {
    try {
      await exit(0)

      return Return.Ok()
    } catch {
      return Return.Failed("Unable to quit")
    }
  }

  public async writeToClipboard(data: string): Promise<Result<void>> {
    try {
      await writeText(data)

      return Return.Ok()
    } catch (e) {
      return Return.Failed(`Unable to write to clipboard: ${e}`)
    }
  }

  public async getSystemTheme(): Promise<TauriTheme | null> {
    return getCurrentWindow().theme()
  }
}

// Singleton client
export const client = new Client()
