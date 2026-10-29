package binaries

import (
	"path/filepath"
	"testing"

	"github.com/loft-sh/devpod/pkg/config"
	"github.com/loft-sh/log/hash"
	"gotest.tools/assert"
)

func TestGetCachedBinaryPathUsesDevPodHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.DEVPOD_HOME, home)

	url := "https://example.com/devpod-provider"
	path := getCachedBinaryPath("kubernetes", url)

	assert.Equal(t, filepath.Dir(path), filepath.Join(home, "providers", "kubernetes"))
	assert.Equal(t, filepath.Base(path), hash.String(url)[:16])
}
