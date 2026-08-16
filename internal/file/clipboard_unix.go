//go:build darwin || linux

package file

import (
	"os/exec"
	"strings"
)

type platformClipboardWriter struct{}

// unixClipboardCommands is tried in order, first present tool wins. Probing the
// host mirrors platformRevealPort rather than branching on GOOS, so one linux
// build serves both a Wayland and an X11 session. pbcopy leads because it is the
// only one of the four that exists on darwin.
var unixClipboardCommands = [][]string{
	{"pbcopy"},
	{"wl-copy"},
	{"xclip", "-selection", "clipboard"},
	{"xsel", "--clipboard", "--input"},
}

func (platformClipboardWriter) WriteText(text string) error {
	for _, candidate := range unixClipboardCommands {
		if _, err := exec.LookPath(candidate[0]); err != nil {
			continue
		}
		command := exec.Command(candidate[0], candidate[1:]...)
		command.Stdin = strings.NewReader(text)
		return command.Run()
	}
	return ErrClipboardUnavailable
}
