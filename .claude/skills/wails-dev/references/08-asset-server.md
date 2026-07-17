# Asset Server & Embedding

## Embedding Frontend Assets

```go
import (
    "embed"
    "github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS
```

The `all:` prefix is required to include files with leading dots (e.g., `.nojekyll`, `.gitkeep`). Without it, `go:embed` skips dot files silently.

Wire into `options.App`:

```go
AssetServer: &assetserver.Options{
    Assets: assets,
},
```

---

## AssetServer Options

```go
type Options struct {
    // Embedded static files. GET requests are served from here first.
    // If the file returns os.ErrNotExist, falls through to Handler.
    Assets fs.FS

    // Fallback HTTP handler for unmatched GET requests and ALL non-GET requests.
    // If nil: unmatched GETs → 404, non-GETs → 405.
    Handler http.Handler

    // HTTP middleware wrapping the entire asset server.
    // Use to add auth, routing, headers, etc.
    Middleware Middleware
}
```

### Middleware type

```go
type Middleware func(handler http.Handler) http.Handler
```

Chain multiple middlewares:
```go
assetserver.ChainMiddleware(middleware1, middleware2, middleware3)
```

---

## Custom Handler (API Proxy Pattern)

Useful for proxying API requests in production without a separate server:

```go
type APIHandler struct{}

func (h *APIHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    if strings.HasPrefix(r.URL.Path, "/api/") {
        // proxy or handle API calls
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
        return
    }
    http.NotFound(w, r)
}

AssetServer: &assetserver.Options{
    Assets:  assets,
    Handler: &APIHandler{},
},
```

---

## Dev Mode

In development, Wails proxies frontend requests to the dev server (Vite, webpack-dev-server, etc.) instead of serving from embedded assets.

Configure in `wails.json`:

```json
{
  "frontend:dev:serverUrl": "auto"
}
```

- `"auto"` — Wails waits for the frontend dev server to start, then auto-detects the port.
- Explicit URL — `"http://localhost:5173"` — use when auto-detection fails or you need a fixed port.

---

## wails.json Key Fields

```json
{
  "name": "My App",
  "outputfilename": "myapp",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "frontend:dev:args": ""
}
```

| Field | Purpose |
|---|---|
| `frontend:install` | Command to install deps (`npm install`) |
| `frontend:build` | Command to build assets for production |
| `frontend:dev:watcher` | Command that runs the dev server with hot reload |
| `frontend:dev:serverUrl` | `"auto"` or explicit URL of the dev server |
| `outputfilename` | Final binary name in `build/bin/` |

---

## Build Output

```
wails build   →   build/bin/<outputfilename>
```

The binary includes embedded frontend assets. No separate web server is needed.

For platform packages (`.app`, `.exe`, installer):
```bash
wails build -platform darwin/universal   # universal macOS binary
wails build -platform windows/amd64
wails build -nsis                         # Windows installer
```
