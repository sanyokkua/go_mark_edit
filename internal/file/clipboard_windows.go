//go:build windows

package file

import (
	"os/exec"
	"strings"
)

type platformClipboardWriter struct{}

// WriteText goes through Set-Clipboard rather than clip.exe on purpose: clip.exe
// decodes its stdin with the console code page, which corrupts every non-ASCII
// character in a path — and a path is the only thing CopyPath ever writes.
// Set-Clipboard is told the encoding explicitly, so a path with an accent or a
// CJK folder name round-trips.
func (platformClipboardWriter) WriteText(text string) error {
	command := exec.Command(
		"powershell", "-NoProfile", "-NonInteractive", "-Command",
		"[Console]::InputEncoding=[System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
	)
	command.Stdin = strings.NewReader(text)
	return command.Run()
}
