package agent

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/loft-sh/devpod/pkg/inject"
	"github.com/loft-sh/devpod/pkg/shell"
	"github.com/loft-sh/devpod/pkg/version"
	"github.com/loft-sh/log"
	"github.com/pkg/errors"
)

var waitForInstanceConnectionTimeout = time.Minute * 5

func InjectAgent(
	ctx context.Context,
	exec inject.ExecFunc,
	local bool,
	remoteAgentPath,
	downloadURL string,
	preferDownload bool,
	log log.Logger,
	timeout time.Duration,
) error {
	return InjectAgentAndExecute(
		ctx,
		exec,
		local,
		remoteAgentPath,
		downloadURL,
		preferDownload,
		"",
		nil,
		nil,
		nil,
		log,
		timeout,
	)
}

func InjectAgentAndExecute(
	ctx context.Context,
	exec inject.ExecFunc,
	local bool,
	remoteAgentPath,
	downloadURL string,
	preferDownload bool,
	command string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	log log.Logger,
	timeout time.Duration,
) error {
	// should execute locally?
	if local {
		if command == "" {
			return nil
		}

		log.Debugf("Execute command locally")
		return shell.ExecuteCommandWithShell(ctx, command, stdin, stdout, stderr, nil)
	}

	defer log.Debugf("Done InjectAgentAndExecute")
	if remoteAgentPath == "" {
		remoteAgentPath = RemoteDevPodHelperLocation
	}
	if downloadURL == "" {
		downloadURL = DefaultAgentDownloadURL()
	}

	// For dev builds there's no matching release to download, so only install if binary is absent.
	// For release builds, check the version so outdated binaries are replaced.
	var versionCheck string
	if version.GetVersion() == version.DevVersion {
		versionCheck = fmt.Sprintf(`[ ! -f %s ]`, remoteAgentPath)
	} else {
		versionCheck = fmt.Sprintf(`[ "$(%s version 2>/dev/null || echo 'false')" != "%s" ]`, remoteAgentPath, version.GetVersion())
	}

	// install devpod into the target
	// do a simple hello world to check if we can get something
	now := time.Now()
	lastMessage := time.Now()
	for {
		buf := &bytes.Buffer{}
		if stderr != nil {
			stderr = io.MultiWriter(stderr, buf)
		} else {
			stderr = buf
		}

		scriptParams := &inject.Params{
			Command:             command,
			AgentRemotePath:     remoteAgentPath,
			DownloadURLs:        inject.NewDownloadURLs(downloadURL),
			ExistsCheck:         versionCheck,
			PreferAgentDownload: true,
			ShouldChmodPath:     true,
		}

		wasExecuted, err := inject.InjectAndExecute(
			ctx,
			exec,
			nil,
			scriptParams,
			stdin,
			stdout,
			stderr,
			timeout,
			log,
		)
		if err != nil {
			if time.Since(now) > waitForInstanceConnectionTimeout {
				return errors.Wrap(err, "timeout waiting for instance connection")
			} else if wasExecuted {
				return errors.Wrapf(err, "agent error: %s", buf.String())
			}

			if time.Since(lastMessage) > time.Second*5 {
				log.Infof("Waiting for devpod agent to come up...")
				lastMessage = time.Now()
			}

			log.Debugf("Inject Error: %s%v", buf.String(), err)
			time.Sleep(time.Second * 3)
			continue
		}

		break
	}

	return nil
}
