package main

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/application"
)

// Proves: STORY-001-AC-1
// The application serves the built React root through Wails without bindings or an instance lock.
func TestWailsAppEmbedsFrontendAndBootsBlankView(t *testing.T) {
	holder := application.NewApplicationContextHolder()
	appOptions := newAppOptions(holder)

	if appOptions.AssetServer == nil || appOptions.AssetServer.Assets == nil {
		t.Fatal("expected the Wails asset server to receive embedded frontend assets")
	}

	indexHTML, err := fs.ReadFile(appOptions.AssetServer.Assets, "frontend/dist/index.html")
	if err != nil {
		t.Fatalf("read embedded frontend/dist/index.html: %v", err)
	}
	if !strings.Contains(string(indexHTML), `<div id="root"></div>`) {
		t.Fatal("expected the embedded frontend build to contain the React root")
	}
	if strings.Contains(string(indexHTML), "./src/main.tsx") {
		t.Fatal("expected embedded index.html to be the built frontend, not Vite source")
	}

	if appOptions.OnStartup == nil {
		t.Fatal("expected an OnStartup lifecycle callback")
	}
	startupContext := context.WithValue(context.Background(), startupContextKey{}, "startup")
	appOptions.OnStartup(startupContext)
	if holder.Context() != startupContext {
		t.Fatal("expected OnStartup to pass the Wails context to the application holder")
	}
	if appOptions.SingleInstanceLock != nil {
		t.Fatal("expected multiple Wails instances to be allowed")
	}
	if len(appOptions.Bind) != 0 || len(appOptions.EnumBind) != 0 {
		t.Fatal("expected the blank shell to expose no Wails bindings")
	}
}

type startupContextKey struct{}

// Proves: STORY-001-AC-3
// The application module stays Go 1.25, Wails v2, pure-Go, and does not opt a build into CGO.
func TestBuildConfigurationRemainsCGOFree(t *testing.T) {
	goModule, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	goModuleText := string(goModule)

	forbiddenModules := []string{
		"github.com/mattn/go-sqlite3",
		"github.com/gofrs/flock",
	}
	for _, forbiddenModule := range forbiddenModules {
		if strings.Contains(goModuleText, forbiddenModule) {
			t.Fatalf("go.mod must not include forbidden module %q", forbiddenModule)
		}
	}
	if !strings.Contains(goModuleText, "go 1.25") {
		t.Fatal("expected go.mod to require Go 1.25")
	}
	if !strings.Contains(goModuleText, "github.com/wailsapp/wails/v2 v2.") {
		t.Fatal("expected go.mod to use Wails v2")
	}

	for _, path := range []string{"main.go", "justfile", "wails.json"} {
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			t.Fatalf("read build configuration %s: %v", path, readErr)
		}
		if strings.Contains(string(contents), "CGO_ENABLED=1") {
			t.Fatalf("build configuration %s must not enable CGO", path)
		}
		if path == "main.go" && strings.Contains(string(contents), `import "C"`) {
			t.Fatal("application source imports C: main.go")
		}
	}

	if err := filepath.WalkDir("internal", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if strings.Contains(string(contents), `import "C"`) {
			return &cgoImportError{path: path}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

type cgoImportError struct {
	path string
}

func (err *cgoImportError) Error() string {
	return "application source imports C: " + err.path
}
