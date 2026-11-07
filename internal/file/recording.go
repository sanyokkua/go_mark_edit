package file

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
)

type recordingPort struct {
	mu   sync.Mutex
	path string
}

// NewRecordingRevealPort records each reveal as a JSON string on its own line.
func NewRecordingRevealPort(recordPath string) RevealPort { return &recordingPort{path: recordPath} }

// NewRecordingClipboardWriter records each clipboard write as a JSON string on its own line.
func NewRecordingClipboardWriter(recordPath string) ClipboardWriter {
	return &recordingPort{path: recordPath}
}

func (port *recordingPort) Reveal(path string) error    { return port.append(path) }
func (port *recordingPort) WriteText(text string) error { return port.append(text) }

func (port *recordingPort) append(value string) error {
	port.mu.Lock()
	defer port.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(port.path), 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(port.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err == nil {
		data = append(data, '\n')
		var n int
		n, err = f.Write(data)
		if err == nil && n != len(data) {
			err = io.ErrShortWrite
		}
	}
	return errors.Join(err, f.Close())
}
