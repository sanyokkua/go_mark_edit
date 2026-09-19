// Package previewimage serves bounded local image assets to the in-app preview.
package previewimage

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

const (
	previewImageRoute       = "/preview-image"
	maxPreviewImageBytes    = int64(20 * 1024 * 1024)
	previewImageDocumentKey = "doc"
	previewImageSourceKey   = "src"
)

// StateReader is the narrow application-state port required by Handler.
type StateReader interface {
	GetState(context.Context) (apperr.AppState, error)
}

// Handler serves bounded local image bytes to the in-app preview. Every
// refusal is deliberately indistinguishable from a missing asset.
type Handler struct {
	state StateReader
}

// NewHandler constructs an asset-server fallback for local preview images.
func NewHandler(state StateReader) *Handler {
	return &Handler{state: state}
}

// ServeHTTP serves only GET requests for the exact preview-image route.
func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if handler == nil || handler.state == nil || request.Method != http.MethodGet || request.URL.Path != previewImageRoute {
		http.NotFound(response, request)
		return
	}

	asset, root, info, ok := handler.openAsset(request.Context(), request.URL.Query().Get(previewImageDocumentKey), request.URL.Query().Get(previewImageSourceKey))
	if !ok {
		http.NotFound(response, request)
		return
	}
	defer func() {
		_ = asset.Close()
		_ = root.Close()
	}()

	content, err := io.ReadAll(io.LimitReader(asset, maxPreviewImageBytes+1))
	if err != nil || int64(len(content)) > maxPreviewImageBytes {
		http.NotFound(response, request)
		return
	}

	http.ServeContent(response, request, info.Name(), info.ModTime(), bytes.NewReader(content))
}

func (handler *Handler) openAsset(ctx context.Context, documentID, source string) (*os.File, *os.Root, os.FileInfo, bool) {
	if strings.TrimSpace(documentID) == "" {
		return nil, nil, nil, false
	}

	state, err := handler.state.GetState(ctx)
	if err != nil {
		return nil, nil, nil, false
	}
	metadata, ok := state.Snapshot.Documents[documentID]
	if !ok || strings.TrimSpace(metadata.Path) == "" {
		return nil, nil, nil, false
	}

	relativeSource, ok := relativePreviewImageSource(source)
	if !ok {
		return nil, nil, nil, false
	}

	document, err := file.CanonicalizeDocumentPath(metadata.Path)
	if err != nil {
		return nil, nil, nil, false
	}
	directory := filepath.Dir(document.Path)
	expectedDirectory, err := os.Stat(directory)
	if err != nil || !expectedDirectory.IsDir() {
		return nil, nil, nil, false
	}

	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, nil, nil, false
	}

	// The directory identity check closes the race between canonicalising the
	// document and opening its parent if that pathname is replaced meanwhile.
	probe, err := root.Open(".")
	if err != nil {
		_ = root.Close()
		return nil, nil, nil, false
	}
	actualDirectory, statErr := probe.Stat()
	_ = probe.Close()
	if statErr != nil || !os.SameFile(expectedDirectory, actualDirectory) {
		_ = root.Close()
		return nil, nil, nil, false
	}

	asset, err := root.Open(filepath.FromSlash(relativeSource))
	if err != nil {
		_ = root.Close()
		return nil, nil, nil, false
	}
	info, err := asset.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxPreviewImageBytes {
		_ = asset.Close()
		_ = root.Close()
		return nil, nil, nil, false
	}

	return asset, root, info, true
}

func relativePreviewImageSource(source string) (string, bool) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return "", false
	}
	if separator := strings.IndexAny(trimmed, "?#"); separator >= 0 {
		trimmed = trimmed[:separator]
	}
	if trimmed == "" {
		return "", false
	}

	decoded, err := url.PathUnescape(trimmed)
	if err != nil || decoded == "" || hasPreviewImageScheme(decoded) {
		return "", false
	}
	if strings.HasPrefix(decoded, "/") || strings.HasPrefix(decoded, `\`) || strings.HasPrefix(decoded, "//") {
		return "", false
	}
	if filepath.IsAbs(filepath.FromSlash(decoded)) || filepath.VolumeName(filepath.FromSlash(decoded)) != "" {
		return "", false
	}

	return decoded, true
}

func hasPreviewImageScheme(value string) bool {
	colon := strings.IndexByte(value, ':')
	if colon <= 0 || !isASCIILetter(value[0]) {
		return false
	}
	for _, character := range value[1:colon] {
		if !isASCIILetter(byte(character)) && (character < '0' || character > '9') && character != '+' && character != '-' && character != '.' {
			return false
		}
	}
	return true
}

func isASCIILetter(value byte) bool {
	return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z')
}
