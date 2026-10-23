package cmd

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/extract"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/workspace"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
)

// ImportCmd holds the export cmd flags
type ImportCmd struct {
	*flags.GlobalFlags

	WorkspaceID string

	MachineID    string
	MachineReuse bool

	ProviderID    string
	ProviderReuse bool

	Data     string
	DataFile string
}

// NewImportCmd creates a new command
func NewImportCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &ImportCmd{
		GlobalFlags: flags,
	}
	importCmd := &cobra.Command{
		Use:   "import",
		Short: "Imports a workspace configuration",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, args []string) error {
			ctx := context.Background()
			devPodConfig, err := config.LoadConfig(cmd.Context, cmd.Provider)
			if err != nil {
				return err
			}

			return cmd.Run(ctx, devPodConfig, log.Default)
		},
	}

	importCmd.Flags().StringVar(&cmd.WorkspaceID, "workspace-id", "", "To workspace id to use")
	importCmd.Flags().StringVar(&cmd.MachineID, "machine-id", "", "The machine id to use")
	importCmd.Flags().BoolVar(&cmd.MachineReuse, "machine-reuse", false, "If machine already exists, reuse existing machine")
	importCmd.Flags().StringVar(&cmd.ProviderID, "provider-id", "", "The provider id to use")
	importCmd.Flags().BoolVar(&cmd.ProviderReuse, "provider-reuse", false, "If provider already exists, reuse existing provider")
	importCmd.Flags().StringVar(&cmd.Data, "data", "", "The data to import as raw json")
	importCmd.Flags().StringVar(&cmd.DataFile, "data-file", "", "The file to read the workspace configuration from")
	return importCmd
}

// Run runs the command logic
func (cmd *ImportCmd) Run(ctx context.Context, devPodConfig *config.Config, log log.Logger) error {
	data, err := cmd.readData()
	if err != nil {
		return err
	}

	exportConfig := &provider.ExportConfig{}
	err = json.Unmarshal(data, exportConfig)
	if err != nil {
		return fmt.Errorf("decode workspace data: %w", err)
	} else if exportConfig.Workspace == nil {
		return fmt.Errorf("workspace is missing in imported data")
	}

	// set ids correctly
	if cmd.MachineID == "" && exportConfig.Machine != nil {
		cmd.MachineID = exportConfig.Machine.ID
	}
	if cmd.WorkspaceID == "" {
		cmd.WorkspaceID = exportConfig.Workspace.ID
	}
	if cmd.ProviderID == "" {
		if exportConfig.Provider != nil {
			cmd.ProviderID = exportConfig.Provider.ID
		} else {
			cmd.ProviderID = exportConfig.Workspace.Provider
		}
	}
	if cmd.ProviderID == "" {
		return fmt.Errorf("provider is missing in imported data")
	}

	// check if conflicting ids
	err = cmd.checkForConflictingIDs(exportConfig, devPodConfig, log)
	if err != nil {
		return err
	}

	// import provider
	err = cmd.importProvider(devPodConfig, exportConfig, log)
	if err != nil {
		return err
	}

	// import machine
	err = cmd.importMachine(devPodConfig, exportConfig, log)
	if err != nil {
		return err
	}

	// import workspace
	err = cmd.importWorkspace(devPodConfig, exportConfig, log)
	if err != nil {
		return err
	}

	return nil
}

func (cmd *ImportCmd) readData() ([]byte, error) {
	if cmd.Data != "" && cmd.DataFile != "" {
		return nil, fmt.Errorf("--data and --data-file cannot be used together")
	} else if cmd.DataFile != "" {
		data, err := os.ReadFile(cmd.DataFile)
		if err != nil {
			return nil, fmt.Errorf("read workspace data file: %w", err)
		}

		return data, nil
	} else if cmd.Data == "" {
		return nil, fmt.Errorf("either --data or --data-file is required")
	}

	return []byte(cmd.Data), nil
}

func (cmd *ImportCmd) importWorkspace(devPodConfig *config.Config, exportConfig *provider.ExportConfig, log log.Logger) error {
	workspaceDir, err := provider.GetWorkspaceDir(devPodConfig.DefaultContext, cmd.WorkspaceID)
	if err != nil {
		return fmt.Errorf("get workspace dir: %w", err)
	}

	err = os.MkdirAll(workspaceDir, 0755)
	if err != nil {
		return fmt.Errorf("create workspace dir: %w", err)
	}

	decoded, err := base64.RawStdEncoding.DecodeString(exportConfig.Workspace.Data)
	if err != nil {
		return fmt.Errorf("decode workspace data: %w", err)
	}

	err = extract.Extract(bytes.NewReader(decoded), workspaceDir)
	if err != nil {
		return fmt.Errorf("extract workspace data: %w", err)
	}

	// exchange config
	workspaceConfig, err := provider.LoadWorkspaceConfig(devPodConfig.DefaultContext, cmd.WorkspaceID)
	if err != nil {
		return fmt.Errorf("load machine config: %w", err)
	}
	workspaceConfig.ID = cmd.WorkspaceID
	workspaceConfig.Context = devPodConfig.DefaultContext
	workspaceConfig.Machine.ID = cmd.MachineID
	workspaceConfig.Provider.Name = cmd.ProviderID
	workspaceConfig.Provider.Options = nil
	workspaceConfig.SSHConfigPath = ""

	// save machine config
	err = provider.SaveWorkspaceConfig(workspaceConfig)
	if err != nil {
		return fmt.Errorf("save workspace config: %w", err)
	}

	log.Donef("Successfully imported workspace %s", cmd.WorkspaceID)
	return nil
}

func (cmd *ImportCmd) importMachine(devPodConfig *config.Config, exportConfig *provider.ExportConfig, log log.Logger) error {
	if exportConfig.Machine == nil {
		return nil
	}

	// if machine already exists we skip
	if cmd.MachineReuse && provider.MachineExists(devPodConfig.DefaultContext, cmd.MachineID) {
		log.Infof("Reusing existing machine %s", cmd.MachineID)
		return nil
	}

	machineDir, err := provider.GetMachineDir(devPodConfig.DefaultContext, cmd.MachineID)
	if err != nil {
		return fmt.Errorf("get machine dir: %w", err)
	}

	err = os.MkdirAll(machineDir, 0755)
	if err != nil {
		return fmt.Errorf("create machine dir: %w", err)
	}

	decoded, err := base64.RawStdEncoding.DecodeString(exportConfig.Machine.Data)
	if err != nil {
		return fmt.Errorf("decode machine data: %w", err)
	}

	err = extract.Extract(bytes.NewReader(decoded), machineDir)
	if err != nil {
		return fmt.Errorf("extract machine data: %w", err)
	}

	// exchange config
	machineConfig, err := provider.LoadMachineConfig(devPodConfig.DefaultContext, cmd.MachineID)
	if err != nil {
		return fmt.Errorf("load machine config: %w", err)
	}
	machineConfig.ID = cmd.MachineID
	machineConfig.Context = devPodConfig.DefaultContext
	machineConfig.Provider.Name = cmd.ProviderID
	machineConfig.Provider.Options = nil

	// save machine config
	err = provider.SaveMachineConfig(machineConfig)
	if err != nil {
		return fmt.Errorf("save machine config: %w", err)
	}

	log.Donef("Successfully imported machine %s", cmd.MachineID)
	return nil
}

func (cmd *ImportCmd) importProvider(devPodConfig *config.Config, exportConfig *provider.ExportConfig, log log.Logger) error {
	// never overwrite an existing provider, as its configuration is machine specific
	if provider.ProviderExists(devPodConfig.DefaultContext, cmd.ProviderID) {
		log.Infof("Reusing existing provider %s", cmd.ProviderID)
		return nil
	} else if exportConfig.Provider == nil {
		return fmt.Errorf("provider %s doesn't exist locally and the imported workspace doesn't contain a provider configuration", cmd.ProviderID)
	}

	providerDir, err := provider.GetProviderDir(devPodConfig.DefaultContext, cmd.ProviderID)
	if err != nil {
		return fmt.Errorf("get provider dir: %w", err)
	}

	err = os.MkdirAll(providerDir, 0755)
	if err != nil {
		return fmt.Errorf("create provider dir: %w", err)
	}

	decoded, err := base64.RawStdEncoding.DecodeString(exportConfig.Provider.Data)
	if err != nil {
		return fmt.Errorf("decode provider data: %w", err)
	}

	err = extract.Extract(bytes.NewReader(decoded), providerDir)
	if err != nil {
		return fmt.Errorf("extract provider data: %w", err)
	}

	// exchange config
	providerConfig, err := provider.LoadProviderConfig(devPodConfig.DefaultContext, cmd.ProviderID)
	if err != nil {
		return fmt.Errorf("load provider config: %w", err)
	}
	providerConfig.Name = cmd.ProviderID

	// save provider config
	err = provider.SaveProviderConfig(devPodConfig.DefaultContext, providerConfig)
	if err != nil {
		return fmt.Errorf("save provider config: %w", err)
	}

	// add provider options
	if exportConfig.Provider.Config != nil {
		if devPodConfig.Current().Providers == nil {
			devPodConfig.Current().Providers = map[string]*config.ProviderConfig{}
		}

		devPodConfig.Current().Providers[cmd.ProviderID] = exportConfig.Provider.Config
		err = config.SaveConfig(devPodConfig)
		if err != nil {
			return fmt.Errorf("save devpod config: %w", err)
		}
	}

	log.Donef("Successfully imported provider %s", cmd.ProviderID)
	return nil
}

func (cmd *ImportCmd) checkForConflictingIDs(exportConfig *provider.ExportConfig, devPodConfig *config.Config, log log.Logger) error {
	workspaces, err := workspace.ListWorkspaces(devPodConfig, log)
	if err != nil {
		return fmt.Errorf("error listing workspaces: %w", err)
	}

	// check for workspace duplicate
	if exportConfig.Workspace != nil {
		for _, workspace := range workspaces {
			if workspace.ID == cmd.WorkspaceID {
				return fmt.Errorf("existing workspace with id %s found, please use --workspace-id to override the workspace id", cmd.WorkspaceID)
			} else if workspace.UID == exportConfig.Workspace.UID {
				return fmt.Errorf("existing workspace %s with uid %s found, please use --workspace-id to override the workspace id", workspace.ID, workspace.UID)
			}
		}
	}

	// check if machine already exists
	if !cmd.MachineReuse && exportConfig.Machine != nil {
		if provider.MachineExists(devPodConfig.DefaultContext, cmd.MachineID) {
			return fmt.Errorf("existing machine with id %s found, please use --machine-reuse to skip importing the machine or --machine-id to override the machine id", cmd.MachineID)
		}
	}

	return nil
}
