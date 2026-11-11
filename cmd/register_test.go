package cmd

import (
	"encoding/json"
	"testing"

	devcontainerconfig "github.com/loft-sh/devpod/pkg/devcontainer/config"
	"github.com/loft-sh/devpod/pkg/devcontainer/metadata"
	"github.com/loft-sh/devpod/pkg/driver"
	"github.com/loft-sh/devpod/pkg/types"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestProviderOptionsFromPod(t *testing.T) {
	stored := &kubernetesProviderOptions{
		DevContainerID:      "workspace-uid",
		CreateNamespace:     "true",
		DiskSize:            "10Gi",
		Resources:           "limits.memory=8Gi,requests.memory=8Gi",
		PodManifestTemplate: `{"kind":"Pod"}`,
		PvcAnnotations:      "foo=bar",
		StrictSecurity:      true,
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
		Namespace:   "pod-namespace",
		Annotations: map[string]string{devPodLastAppliedAnnotation: string(raw)},
	}}

	options := providerOptionsFromPod(pod, "", types.Now())
	expected := map[string]string{
		"CREATE_NAMESPACE":      "true",
		"DISK_SIZE":             "10Gi",
		"RESOURCES":             "limits.memory=8Gi,requests.memory=8Gi",
		"POD_MANIFEST_TEMPLATE": `{"kind":"Pod"}`,
		"PVC_ANNOTATIONS":       "foo=bar",
		"STRICT_SECURITY":       "true",
		"KUBERNETES_NAMESPACE":  "pod-namespace",
	}
	for name, value := range expected {
		option, ok := options[name]
		if !ok {
			t.Fatalf("expected option %s to be copied", name)
		}
		if option.Value != value {
			t.Fatalf("expected option %s to be %q, got %q", name, value, option.Value)
		}
		if !option.UserProvided {
			t.Fatalf("expected option %s to be user provided", name)
		}
	}

	options = providerOptionsFromPod(pod, "explicit-namespace", types.Now())
	if options["KUBERNETES_NAMESPACE"].Value != "explicit-namespace" {
		t.Fatalf("expected explicit namespace override, got %q", options["KUBERNETES_NAMESPACE"].Value)
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
