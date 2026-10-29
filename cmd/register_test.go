package cmd

import (
	"encoding/json"
	"testing"

	"github.com/loft-sh/devpod/pkg/config"
	devcontainerconfig "github.com/loft-sh/devpod/pkg/devcontainer/config"
	"github.com/loft-sh/devpod/pkg/devcontainer/metadata"
	"github.com/loft-sh/devpod/pkg/driver"
	provider2 "github.com/loft-sh/devpod/pkg/provider"
	"github.com/loft-sh/devpod/pkg/types"
	workspace2 "github.com/loft-sh/devpod/pkg/workspace"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestChangedProviderOptions(t *testing.T) {
	providerWithOptions := &workspace2.ProviderWithOptions{
		Config: &provider2.ProviderConfig{
			Name: "kubernetes",
			Options: map[string]*types.Option{
				"CREATE_NAMESPACE": {Default: "true"},
				"DISK_SIZE":        {Default: "10Gi"},
				"RESOURCES":        {},
			},
		},
	}
	devPodConfig := &config.Config{
		DefaultContext: "default",
		Contexts: map[string]*config.ContextConfig{
			"default": {},
		},
	}
	stored := &kubernetesProviderOptions{
		DevContainerID:  "workspace-uid",
		CreateNamespace: "true",
		DiskSize:        "10Gi",
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
		Annotations: map[string]string{devPodLastAppliedAnnotation: string(raw)},
	}}

	if changes := changedProviderOptions(pod, providerWithOptions, devPodConfig, "workspace-uid"); len(changes) != 0 {
		t.Fatalf("expected no changes, got %v", changes)
	}

	stored.Resources = "limits.memory=8Gi"
	raw, err = json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	pod.Annotations[devPodLastAppliedAnnotation] = string(raw)

	changes := changedProviderOptions(pod, providerWithOptions, devPodConfig, "workspace-uid")
	if len(changes) != 1 || changes[0] != "RESOURCES" {
		t.Fatalf("expected RESOURCES change, got %v", changes)
	}
}

func TestDevContainerConfigDiffers(t *testing.T) {
	devContainerConfig := &devcontainerconfig.DevContainerConfig{
		DevContainerConfigBase: devcontainerconfig.DevContainerConfigBase{
			RemoteUser:      "root",
			WorkspaceFolder: "/workspace",
		},
		NonComposeBase: devcontainerconfig.NonComposeBase{
			ContainerUser: "root",
			ContainerEnv:  map[string]string{"FOO": "bar"},
		},
		ImageContainer: devcontainerconfig.ImageContainer{Image: "example/image:latest"},
	}
	podMetadata := metadata.DevContainerConfigToImageMetadata(devContainerConfig)
	rawMetadata, err := json.Marshal([]*devcontainerconfig.ImageMetadata{podMetadata})
	if err != nil {
		t.Fatal(err)
	}
	options := &driver.RunOptions{
		Image:          "example/image:latest",
		WorkspaceMount: &devcontainerconfig.Mount{Source: "/local/workspace", Target: "/workspace"},
		Labels:         []string{metadata.ImageMetadataLabel + "=" + string(rawMetadata)},
	}

	if devContainerConfigDiffers(devContainerConfig, options, "workspace-uid") {
		t.Fatal("expected identical configs")
	}

	changed := *devContainerConfig
	changed.ContainerEnv = map[string]string{"FOO": "baz"}
	if !devContainerConfigDiffers(&changed, options, "workspace-uid") {
		t.Fatal("expected container env change")
	}

	changed = *devContainerConfig
	changed.Image = "example/image:next"
	if !devContainerConfigDiffers(&changed, options, "workspace-uid") {
		t.Fatal("expected image change")
	}
}
