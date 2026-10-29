package cli

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// FixAppImageEnvironment removes library paths pointing into the AppImage mount
// from LD_LIBRARY_PATH. The AppImage bundles its own libraries (e.g. OpenSSL),
// which are incompatible with system binaries spawned as child processes. This
// causes git clone to fail with errors such as:
//
//	git-remote-https: version `OPENSSL_3.2.0' not found
func FixAppImageEnvironment() {
	if runtime.GOOS != "linux" {
		return
	}

	ldLibraryPath, ok := os.LookupEnv("LD_LIBRARY_PATH")
	if !ok || ldLibraryPath == "" {
		return
	}

	appImagePaths := []string{}
	if appDir := os.Getenv("APPDIR"); appDir != "" {
		appImagePaths = append(appImagePaths, filepath.Clean(appDir))
	}
	if execPath, err := os.Executable(); err == nil {
		if idx := strings.Index(execPath, string(filepath.Separator)+".mount_"); idx >= 0 {
			appImagePaths = append(appImagePaths, execPath[:idx])
		}
	}
	if len(appImagePaths) == 0 {
		return
	}

	paths := strings.Split(ldLibraryPath, string(os.PathListSeparator))
	filtered := make([]string, 0, len(paths))
	for _, path := range paths {
		if path == "" {
			continue
		}

		cleaned := filepath.Clean(path)
		inAppImage := false
		for _, appImagePath := range appImagePaths {
			if cleaned == appImagePath || strings.HasPrefix(cleaned, appImagePath+string(filepath.Separator)) {
				inAppImage = true
				break
			}
		}
		if !inAppImage {
			filtered = append(filtered, path)
		}
	}

	if len(filtered) == len(paths) {
		return
	}
	if len(filtered) == 0 {
		_ = os.Unsetenv("LD_LIBRARY_PATH")
		return
	}

	_ = os.Setenv("LD_LIBRARY_PATH", strings.Join(filtered, string(os.PathListSeparator)))
}
