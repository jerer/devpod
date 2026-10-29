package git

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/loft-sh/log"
	"gotest.tools/assert"
)

func TestRunIncludesOutputInError(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a shell script")
	}

	dir := t.TempDir()
	gitBinary := filepath.Join(dir, "git")
	err := os.WriteFile(gitBinary, []byte(`#!/bin/sh
echo "Cloning into '/tmp/workspace'..."
echo "fatal: repository not found" >&2
exit 128
`), 0o755)
	assert.NilError(t, err)

	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	err = run(context.Background(), []string{"clone", "example.com/repo", "/tmp/workspace"}, nil, log.Discard)
	assert.Assert(t, err != nil)
	assert.Assert(t, strings.Contains(err.Error(), "Cloning into '/tmp/workspace'..."))
	assert.Assert(t, strings.Contains(err.Error(), "fatal: repository not found"))
}

func TestRunReturnsNilOnSuccess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires a shell script")
	}

	dir := t.TempDir()
	gitBinary := filepath.Join(dir, "git")
	err := os.WriteFile(gitBinary, []byte(`#!/bin/sh
echo "Cloning into '/tmp/workspace'..."
exit 0
`), 0o755)
	assert.NilError(t, err)

	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	err = run(context.Background(), []string{"clone", "example.com/repo", "/tmp/workspace"}, nil, log.Discard)
	assert.NilError(t, err)
}
