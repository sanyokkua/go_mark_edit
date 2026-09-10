package application_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

// Proves: FR-049
func TestPreviewImageHandlerServesOnlyBoundedInFolderImages(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	source := filepath.Join(root, "doc.md")
	inside := filepath.Join(root, "inside.png")
	atLimit := filepath.Join(root, "at-limit.png")
	huge := filepath.Join(root, "huge.png")
	outsideImage := filepath.Join(outside, "outside.png")
	escaping := filepath.Join(root, "escaping.png")
	insideBytes := []byte("not-a-png-but-bounded-image-bytes")

	if err := os.WriteFile(source, []byte("# images\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(inside, insideBytes, 0o644); err != nil {
		t.Fatalf("write inside image: %v", err)
	}
	file, err := os.Create(atLimit)
	if err != nil {
		t.Fatalf("create at-limit image: %v", err)
	}
	if err := file.Truncate(20 * 1024 * 1024); err != nil {
		_ = file.Close()
		t.Fatalf("size at-limit image: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close at-limit image: %v", err)
	}
	if err := os.WriteFile(outsideImage, []byte("outside"), 0o644); err != nil {
		t.Fatalf("write outside image: %v", err)
	}
	file, err = os.Create(huge)
	if err != nil {
		t.Fatalf("create huge image: %v", err)
	}
	if err := file.Truncate(21 * 1024 * 1024); err != nil {
		_ = file.Close()
		t.Fatalf("size huge image: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close huge image: %v", err)
	}
	if err := os.Symlink(outsideImage, escaping); err != nil {
		t.Fatalf("create escaping symlink: %v", err)
	}

	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(previewImageEmitter{}),
	)
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	opened := service.OpenPath(
		context.Background(),
		source,
		initial.Snapshot.TabSetRevision,
	)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open source = %+v, want opened", opened)
	}

	handler := application.NewPreviewImageHandler(service)
	documentID := opened.DocumentID
	cases := []struct {
		name       string
		source     string
		statusCode int
		body       []byte
		bodyLength int
	}{
		{
			name:       "inside",
			source:     "./inside.png",
			statusCode: http.StatusOK,
			body:       insideBytes,
		},
		{
			name:       "exactly maximum size",
			source:     "./at-limit.png",
			statusCode: http.StatusOK,
			bodyLength: 20 * 1024 * 1024,
		},
		{
			name:       "outside",
			source:     relativeImagePath(source, outsideImage),
			statusCode: http.StatusNotFound,
		},
		{
			name:       "symlink escape",
			source:     "./escaping.png",
			statusCode: http.StatusNotFound,
		},
		{
			name:       "too large",
			source:     "./huge.png",
			statusCode: http.StatusNotFound,
		},
		{
			name:       "web source",
			source:     "https://example.test/image.png",
			statusCode: http.StatusNotFound,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			response := servePreviewImage(handler, documentID, testCase.source)
			if response.Code != testCase.statusCode {
				t.Fatalf("status = %d, want %d", response.Code, testCase.statusCode)
			}
			if testCase.body != nil && !bytes.Equal(response.Body.Bytes(), testCase.body) {
				t.Fatalf("body = %q, want %q", response.Body.Bytes(), testCase.body)
			}
			if testCase.bodyLength != 0 && response.Body.Len() != testCase.bodyLength {
				t.Fatalf("body length = %d, want %d", response.Body.Len(), testCase.bodyLength)
			}
		})
	}

	untitledID := initial.Snapshot.ActiveDocumentID
	untitled := servePreviewImage(handler, untitledID, "./inside.png")
	if untitled.Code != http.StatusNotFound {
		t.Fatalf("untitled status = %d, want %d", untitled.Code, http.StatusNotFound)
	}
}

func servePreviewImage(handler http.Handler, documentID, source string) *httptest.ResponseRecorder {
	query := url.Values{}
	query.Set("doc", documentID)
	query.Set("src", source)
	request := httptest.NewRequest(http.MethodGet, "/preview-image?"+query.Encode(), nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func relativeImagePath(fromPath, toPath string) string {
	path, err := filepath.Rel(filepath.Dir(fromPath), toPath)
	if err != nil {
		return toPath
	}
	return filepath.ToSlash(path)
}

type previewImageEmitter struct{}

func (previewImageEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}
