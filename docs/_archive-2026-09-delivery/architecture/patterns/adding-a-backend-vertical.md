# Adding a backend vertical

A "vertical" is one new capability the frontend can call: a handler, a service, and — if it stores
anything — a repository. This is the shape every existing backend package has. Follow it exactly; the
uniformity is what makes the panic recovery and the error envelope reliable rather than remembered.

Worked example: adding a `recent` package that returns the recently opened files.

## 1 — The envelope types go in `internal/apperr/results.go`

Every struct that crosses the bridge lives here, not in the feature package, because `apperr` is the
only package the generated bindings need to know about.

```go
// RecentEntry is one row of the recent-files list.
type RecentEntry struct {
	Path     string `json:"path"`
	OpenedAt string `json:"openedAt"` // RFC 3339
}

// RecentResult is the envelope for the recent-files query.
type RecentResult struct {
	Data  []RecentEntry `json:"data,omitempty"`
	Error *WireError    `json:"error,omitempty"`
}
```

`Error` is always `*WireError` with `omitempty`, so a success serialises without an `error` key at all.

## 2 — The repository interface goes in the feature package

```go
// internal/recent/repository.go
package recent

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// RecentRepositoryAPI is the persistence contract used by RecentService.
type RecentRepositoryAPI interface {
	List(ctx context.Context, limit int) ([]apperr.RecentEntry, error)
	Record(ctx context.Context, path string) error
}
```

It lives here, beside the service that consumes it — not in a shared interfaces file.

## 3 — The service keeps `(T, error)` and takes `ctx` first

```go
// internal/recent/service.go
package recent

type RecentService struct {
	repository RecentRepositoryAPI
}

func NewRecentService(repository RecentRepositoryAPI) *RecentService {
	return &RecentService{repository: repository}
}

// SetRepository injects the concrete repository during phase-two wiring.
func (service *RecentService) SetRepository(repository RecentRepositoryAPI) {
	service.repository = repository
}

func (service *RecentService) List(ctx context.Context) ([]apperr.RecentEntry, error) {
	if service.repository == nil {
		return nil, apperr.Internal(errors.New("recent repository is not configured"))
	}
	entries, err := service.repository.List(ctx, 20)
	if err != nil {
		return nil, apperr.IO("list recent files", err)
	}
	return entries, nil
}
```

Note the classification: the repository's raw error is wrapped in a typed `apperr` constructor *here*,
in the service, so the handler has nothing to decide.

## 4 — The handler is boilerplate, and copying it exactly is the point

```go
// internal/recent/handler.go
package recent

const panicFormat = "panic: %v"

// RecentHandler is the Wails-bound recent-files surface.
type RecentHandler struct {
	service         *RecentService
	logger          *logging.Logger
	contextProvider func() context.Context
}

func NewRecentHandler(service *RecentService, logger *logging.Logger, contextProvider func() context.Context) *RecentHandler {
	return &RecentHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// ListRecent returns the most recently opened files, newest first.
func (handler *RecentHandler) ListRecent() (res apperr.RecentResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(panicFormat, recovered)))
			res = apperr.RecentResult{Error: &wire}
		}
	}()

	entries, err := handler.service.List(handler.context())
	if err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.RecentResult{Error: &wire}
	}
	return apperr.RecentResult{Data: entries}
}
```

Three things are load-bearing and all three are easy to drop:

- the return is **named** (`res apperr.RecentResult`), or the assignment inside the deferred function
  has no effect and the panic still escapes;
- there is **no** `context.Context` parameter — the handler asks `contextProvider` for it;
- the error is logged exactly once, inside `apperr.ToWire`.

## 5 — Wire it in the one composition root

```go
// internal/application/application_context_holder.go — the constructor, nil repository
recentService := recent.NewRecentService(nil)
holder.RecentService = recentService
holder.RecentHandler = recent.NewRecentHandler(recentService, appLogger, holder.Context)

// Init(ctx) — after db.Open, inject the real one
holder.RecentService.SetRepository(recent.NewSqliteRecentRepository(database))
```

```go
// main.go
Bind: []interface{}{
	applicationContext.AppModelHandler,
	applicationContext.SettingsHandler,
	applicationContext.RecentHandler, // ← added
},
```

## 6 — Regenerate the bindings and add the adapter method

```bash
just gen          # wails generate module — writes frontend/wailsjs/
just gen-check    # fails if anything is uncommitted
```

```ts
// frontend/src/logic/adapter/services.ts
import { ListRecent } from '../../wailsjs/go/recent/RecentHandler';

const listRecent = guardArity('ListRecent', ListRecent);

export const recentAdapter = {
  list: async (): Promise<RecentEntry[]> => unwrap(await listRecent()),
};
```

This file is the only place in `frontend/src/` allowed to import from `wailsjs/`.

## Checklist

- [ ] Envelope struct in `internal/apperr/results.go`, `Error *WireError` with `omitempty`
- [ ] Repository interface in the feature package
- [ ] Service on `(T, error)`, `ctx` first, classifies errors with `apperr.*` constructors
- [ ] Handler: named return, `defer/recover`, no `context.Context`, one `ToWire` per path
- [ ] Constructed with a nil repository in `NewApplicationContextHolder`, injected in `Init`
- [ ] Added to `Bind` in `main.go`
- [ ] `just gen` run, `frontend/wailsjs/` committed, `just gen-check` clean
- [ ] Adapter method wrapped in `guardArity`, exported as a singleton
