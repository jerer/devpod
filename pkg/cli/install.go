package cli

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/devpod/pkg/version"
)

const binaryName = "devpod"

func Executable() (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", err
	}
	if !isAppImage(execPath) {
		return execPath, nil
	}

	return ensureStableExecutable(execPath)
}

func isAppImage(execPath string) bool {
	if runtime.GOOS != "linux" {
		return false
	}
	if os.Getenv("APPIMAGE") != "" || os.Getenv("APPDIR") != "" {
		return true
	}

	return strings.Contains(execPath, string(filepath.Separator)+".mount_")
}

func ensureStableExecutable(source string) (string, error) {
	target, err := stableExecutablePath()
	if err != nil {
		return "", err
	}
	if target == source {
		return target, nil
	}
	if matchesVersion(target) {
		return target, nil
	}

	err = os.MkdirAll(filepath.Dir(target), 0755)
	if err != nil {
		return "", fmt.Errorf("create cli dir: %w", err)
	}

	sourceFile, err := os.Open(source)
	if err != nil {
		return "", fmt.Errorf("open cli: %w", err)
	}
	defer sourceFile.Close()

	tmpFile, err := os.CreateTemp(filepath.Dir(target), ".devpod-*")
	if err != nil {
		return "", fmt.Errorf("create temp cli: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	_, err = io.Copy(tmpFile, sourceFile)
	if err != nil {
		_ = tmpFile.Close()
		return "", fmt.Errorf("copy cli: %w", err)
	}
	err = tmpFile.Close()
	if err != nil {
		return "", fmt.Errorf("close temp cli: %w", err)
	}
	err = os.Chmod(tmpPath, 0755)
	if err != nil {
		return "", fmt.Errorf("chmod cli: %w", err)
	}
	err = os.Rename(tmpPath, target)
	if err != nil {
		return "", fmt.Errorf("install cli: %w", err)
	}

	return target, nil
}

func stableExecutablePath() (string, error) {
	configDir, err := config.GetConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "bin", binaryName), nil
}

func matchesVersion(path string) bool {
	if version.GetVersion() == version.DevVersion {
		return false
	}

	out, err := exec.Command(path, "version").Output()
	if err != nil {
		return false
	}

	return strings.TrimSpace(string(out)) == version.GetVersion()
}
