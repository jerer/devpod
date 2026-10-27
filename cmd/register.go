package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/loft-sh/devpod/cmd/flags"
	"github.com/loft-sh/devpod/pkg/cli"
	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/devcontainer"
	devcontainerconfig "github.com/loft-sh/devpod/pkg/devcontainer/config"
	"github.com/loft-sh/devpod/pkg/driver"
	"github.com/loft-sh/devpod/pkg/git"
	"github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/types"
	workspace2 "github.com/loft-sh/devpod/pkg/workspace"
	"github.com/loft-sh/log"
	"github.com/spf13/cobra"
	corev1 "k8s.io/api/core/v1"
)

const (
	devPodCreatedLabel      = "devpod.sh/created"
	devPodWorkspaceUIDLabel = "devpod.sh/workspace-uid"
	devPodInfoAnnotation    = "devpod.sh/info"
)

// RegisterCmd holds the configuration
type RegisterCmd struct {
	*flags.GlobalFlags

	Namespace   string
	WorkspaceID string
	GitURL      string
	GitBranch   string
}

// NewRegisterCmd creates a register command
func NewRegisterCmd(flags *flags.GlobalFlags) *cobra.Command {
	cmd := &RegisterCmd{
		GlobalFlags: flags,
	}
	registerCmd := &cobra.Command{
		Use:   "register [pod-name]",
		Short: "Registers an existing Kubernetes DevPod workspace",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			devPodConfig, err := config.LoadConfig(cmd.Context, cmd.Provider)
			if err != nil {
				return err
			}

			return cmd.Run(context.Background(), devPodConfig, args[0])
		},
	}

	registerCmd.Flags().StringVar(&cmd.Namespace, "namespace", "", "The Kubernetes namespace of the workspace pod. Defaults to the provider configuration")
	registerCmd.Flags().StringVar(&cmd.WorkspaceID, "workspace-id", "", "The workspace id to register. Defaults to the id stored in the pod")
	registerCmd.Flags().StringVar(&cmd.GitURL, "git-url", "", "The Git repository to load devcontainer settings from")
	registerCmd.Flags().StringVar(&cmd.GitBranch, "git-branch", "", "The Git branch to use for the repository")
	return registerCmd
}

// Run runs the command logic
func (cmd *RegisterCmd) Run(ctx context.Context, devPodConfig *config.Config, podName string) error {
	if _, err := cli.Executable(); err != nil {
		log.Default.Debugf("Install stable cli: %v", err)
	}

	providerID := cmd.Provider
	if providerID == "" {
		providerID = devPodConfig.Current().DefaultProvider
	}
	if providerID == "" {
		return fmt.Errorf("no provider found, please specify one with --provider")
	}

	providerWithOptions, err := workspace2.FindProvider(devPodConfig, providerID, log.Default.ErrorStreamOnly())
	if err != nil {
		return err
	}
	if providerWithOptions.Config.Options["KUBERNETES_NAMESPACE"] == nil &&
		!strings.Contains(strings.ToLower(providerWithOptions.Config.Name), "kubernetes") {
		return fmt.Errorf("provider %s is not a kubernetes provider", providerID)
	}

	namespace := cmd.Namespace
	if namespace == "" {
		namespace = providerOption(providerWithOptions, devPodConfig, "KUBERNETES_NAMESPACE")
	}

	kubectlPath := providerOption(providerWithOptions, devPodConfig, "KUBECTL_PATH")
	if kubectlPath == "" {
		kubectlPath = "kubectl"
	}
	kubeArgs := []string{}
	if namespace != "" {
		kubeArgs = append(kubeArgs, "--namespace", namespace)
	}
	if kubeConfig := providerOption(providerWithOptions, devPodConfig, "KUBERNETES_CONFIG"); kubeConfig != "" {
		kubeArgs = append(kubeArgs, "--kubeconfig", kubeConfig)
	}
	if kubeContext := providerOption(providerWithOptions, devPodConfig, "KUBERNETES_CONTEXT"); kubeContext != "" {
		kubeArgs = append(kubeArgs, "--context", kubeContext)
	}

	pod, err := getPod(ctx, kubectlPath, kubeArgs, podName)
	if err != nil {
		return err
	}
	if pod.Labels[devPodCreatedLabel] != "true" {
		return fmt.Errorf("pod %s was not created by DevPod", podName)
	}

	pvc, err := getPVC(ctx, kubectlPath, kubeArgs, podName)
	if err != nil {
		return err
	}
	containerInfo := &kubernetesDevContainerInfo{}
	if pvc != nil && pvc.Annotations[devPodInfoAnnotation] != "" {
		err = json.Unmarshal([]byte(pvc.Annotations[devPodInfoAnnotation]), containerInfo)
		if err != nil {
			return fmt.Errorf("decode pvc annotation %s: %w", devPodInfoAnnotation, err)
		}
	}

	uid := pod.Labels[devPodWorkspaceUIDLabel]
	if uid == "" && containerInfo.Options != nil {
		uid = containerInfo.Options.UID
	}
	if uid == "" {
		uid = strings.TrimPrefix(podName, "devpod-")
	}
	if uid == "" || podName != "devpod-"+uid {
		return fmt.Errorf("pod %s is not named after its workspace uid, expected devpod-%s", podName, uid)
	}

	workspaceID := cmd.WorkspaceID
	if workspaceID == "" {
		workspaceID = podEnv(pod, "DEVPOD_WORKSPACE_ID")
	}
	if workspaceID == "" && containerInfo.WorkspaceID != "" {
		workspaceID = strings.TrimPrefix(containerInfo.WorkspaceID, "devpod-")
	}
	if workspaceID == "" {
		return fmt.Errorf("couldn't determine workspace id for pod %s, please provide --workspace-id", podName)
	}
	if provider.WorkspaceExists(devPodConfig.DefaultContext, workspaceID) {
		return fmt.Errorf("workspace %s already exists locally", workspaceID)
	}

	workspaceFolder := "/"
	if containerInfo.Options != nil && containerInfo.Options.WorkspaceMount != nil &&
		containerInfo.Options.WorkspaceMount.Target != "" {
		workspaceFolder = containerInfo.Options.WorkspaceMount.Target
	}

	if cmd.GitBranch != "" && cmd.GitURL == "" {
		return fmt.Errorf("--git-branch requires --git-url")
	}

	devContainerConfig := &devcontainerconfig.DevContainerConfig{
		DevContainerConfigBase: devcontainerconfig.DevContainerConfigBase{
			WorkspaceFolder: workspaceFolder,
		},
	}
	devContainerPath := ""
	if cmd.GitURL != "" {
		devContainerConfig, devContainerPath, err = getDevContainerConfig(ctx, cmd.GitURL, cmd.GitBranch)
		if err != nil {
			return err
		}
	}

	now := types.Now()
	workspaceConfig := &provider.Workspace{
		ID:                 workspaceID,
		UID:                uid,
		Context:            devPodConfig.DefaultContext,
		Provider:           provider.WorkspaceProviderConfig{Name: providerID},
		Source:             provider.WorkspaceSource{Container: podName},
		DevContainerPath:   devContainerPath,
		DevContainerConfig: devContainerConfig,
		CreationTimestamp:  now,
		LastUsedTimestamp:  now,
		Imported:           true,
	}
	if namespace != "" {
		workspaceConfig.Provider.Options = map[string]config.OptionValue{
			"KUBERNETES_NAMESPACE": {
				Value:        namespace,
				UserProvided: true,
				Filled:       &now,
			},
		}
	}

	err = provider.SaveWorkspaceConfig(workspaceConfig)
	if err != nil {
		return fmt.Errorf("save workspace config: %w", err)
	}

	log.Default.Donef("Registered workspace %s from pod %s", workspaceID, podName)
	return nil
}

type kubernetesDevContainerInfo struct {
	WorkspaceID string
	Options     *driver.RunOptions
}

func getPod(ctx context.Context, kubectlPath string, kubeArgs []string, podName string) (*corev1.Pod, error) {
	args := append(append([]string{}, kubeArgs...), "get", "pod", podName, "-o", "json")
	out, err := exec.CommandContext(ctx, kubectlPath, args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("get pod %s: %w: %s", podName, err, strings.TrimSpace(string(out)))
	}

	pod := &corev1.Pod{}
	err = json.Unmarshal(out, pod)
	if err != nil {
		return nil, fmt.Errorf("decode pod %s: %w", podName, err)
	}

	return pod, nil
}

func getPVC(ctx context.Context, kubectlPath string, kubeArgs []string, pvcName string) (*corev1.PersistentVolumeClaim, error) {
	args := append(append([]string{}, kubeArgs...), "get", "pvc", pvcName, "-o", "json")
	out, err := exec.CommandContext(ctx, kubectlPath, args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("get pvc %s: %w: %s", pvcName, err, strings.TrimSpace(string(out)))
	}

	pvc := &corev1.PersistentVolumeClaim{}
	err = json.Unmarshal(out, pvc)
	if err != nil {
		return nil, fmt.Errorf("decode pvc %s: %w", pvcName, err)
	}

	return pvc, nil
}

func podEnv(pod *corev1.Pod, name string) string {
	for _, container := range pod.Spec.Containers {
		if container.Name != "devpod" {
			continue
		}

		for _, env := range container.Env {
			if env.Name == name {
				return env.Value
			}
		}
	}

	return ""
}

func getDevContainerConfig(ctx context.Context, gitURL, gitBranch string) (*devcontainerconfig.DevContainerConfig, string, error) {
	tmpDir, err := os.MkdirTemp("", "devpod-register-")
	if err != nil {
		return nil, "", fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	logger := log.Default.ErrorStreamOnly()
	gitInfo := git.NewGitInfo(gitURL, gitBranch, "", "", "")
	err = git.CloneRepository(ctx, gitInfo, tmpDir, "", git.NewCloner(git.FullCloneStrategy), logger)
	if err != nil {
		return nil, "", fmt.Errorf("clone repository: %w", err)
	}

	result, err := devcontainer.FindFilesInLocalDir(tmpDir, 3, logger)
	if err != nil {
		return nil, "", fmt.Errorf("find devcontainer config: %w", err)
	}
	configPath := selectDevContainerPath(result.ConfigPaths)
	if configPath == "" {
		return nil, "", fmt.Errorf("no devcontainer.json found in repository %s", gitURL)
	}

	devContainerConfig, err := devcontainerconfig.ParseDevContainerJSON(tmpDir, configPath)
	if err != nil {
		return nil, "", fmt.Errorf("parse devcontainer.json: %w", err)
	}

	return devContainerConfig, configPath, nil
}

func selectDevContainerPath(paths []string) string {
	first := ""
	for _, path := range paths {
		slashPath := filepath.ToSlash(path)
		if slashPath == ".devcontainer/devcontainer.json" {
			return path
		}
		if slashPath == ".devcontainer.json" || slashPath == "devcontainer.json" {
			first = path
		} else if first == "" {
			first = path
		}
	}

	return first
}

func providerOption(providerWithOptions *workspace2.ProviderWithOptions, devPodConfig *config.Config, name string) string {
	if providerWithOptions.State != nil && providerWithOptions.State.Options != nil {
		if value, ok := providerWithOptions.State.Options[name]; ok && value.Value != "" {
			return value.Value
		}
	}
	if options := devPodConfig.ProviderOptions(providerWithOptions.Config.Name); options != nil {
		if value, ok := options[name]; ok && value.Value != "" {
			return value.Value
		}
	}
	if option, ok := providerWithOptions.Config.Options[name]; ok && option != nil {
		return option.Default
	}

	return ""
}
