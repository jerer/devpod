package cli

import (
	"os"
	"runtime"
	"testing"

	"gotest.tools/assert"
)

func TestFixAppImageEnvironment(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("AppImage environment is linux only")
	}

	t.Run("removes AppImage library paths", func(t *testing.T) {
		t.Setenv("APPDIR", "/tmp/.mount_DevPod123")
		t.Setenv("LD_LIBRARY_PATH", "/tmp/.mount_DevPod123/usr/lib/:/usr/local/lib:/tmp/.mount_DevPod123/lib64")

		FixAppImageEnvironment()

		assert.Equal(t, os.Getenv("LD_LIBRARY_PATH"), "/usr/local/lib")
	})

	t.Run("unsets if only AppImage paths remain", func(t *testing.T) {
		t.Setenv("APPDIR", "/tmp/.mount_DevPod123")
		t.Setenv("LD_LIBRARY_PATH", "/tmp/.mount_DevPod123/usr/lib")

		FixAppImageEnvironment()

		_, ok := os.LookupEnv("LD_LIBRARY_PATH")
		assert.Assert(t, !ok)
	})

	t.Run("keeps paths when not running from AppImage", func(t *testing.T) {
		t.Setenv("APPDIR", "")
		t.Setenv("LD_LIBRARY_PATH", "/usr/local/lib:/usr/lib")

		FixAppImageEnvironment()

		assert.Equal(t, os.Getenv("LD_LIBRARY_PATH"), "/usr/local/lib:/usr/lib")
	})
}
