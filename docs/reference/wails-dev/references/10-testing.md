# Testing Patterns

---

## Go: Unit Tests

Test service and repository layers directly, bypassing Wails entirely. Define interfaces for all dependencies and inject mock implementations in tests.

```go
// Define an interface for your service
type LLMServiceAPI interface {
    Complete(ctx context.Context, req Request) (string, error)
}

// In tests, provide a mock
type mockLLMService struct {
    response string
    err      error
}
func (m *mockLLMService) Complete(_ context.Context, _ Request) (string, error) {
    return m.response, m.err
}

func TestActionService_ProcessPrompt(t *testing.T) {
    svc := NewActionService(
        testLogger,
        &mockPromptService{result: "system prompt"},
        &mockLLMService{response: "result"},
        &mockSettingsService{},
    )
    got, err := svc.ProcessPrompt(context.Background(), req)
    if err != nil || got != "result" {
        t.Fatalf("got %q, %v", got, err)
    }
}
```

No Wails context needed — pass `context.Background()` for service-layer tests.

---

## Go: Integration Tests (HTTP Mock)

Use `net/http/httptest` to spin up a fake LLM provider endpoint. Tests run without a real LLM.

```go
func TestLLMService_CallProvider(t *testing.T) {
    // Start a test server that returns a fixture response
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprint(w, `{"choices":[{"message":{"content":"test response"}}]}`)
    }))
    defer server.Close()

    // Point the service at the test server
    settings := &mockSettings{BaseURL: server.URL}
    svc := llms.NewLLMApiService(testLogger, restyClient, settings)

    resp, err := svc.Complete(context.Background(), completionRequest)
    if err != nil {
        t.Fatal(err)
    }
    if resp != "test response" {
        t.Errorf("got %q", resp)
    }
}
```

See the canonical example: `internal/llms/service_integration_test.go`.

---

## Frontend: Jest Configuration

Wails auto-generated files in `wailsjs/` are not valid in the Jest environment. Mock them out entirely.

### jest.config.js fragment

```js
module.exports = {
  moduleNameMapper: {
    // Mock all wailsjs bindings
    '^../../../wailsjs/go/(.*)$': '<rootDir>/src/__mocks__/wailsjs-go.js',
    '^@wailsapp/runtime$': '<rootDir>/src/__mocks__/wails-runtime.js',
  },
  transformIgnorePatterns: ['/node_modules/', '/wailsjs/'],
};
```

### Mock files

`src/__mocks__/wailsjs-go.js` — mock all bound methods:

```js
module.exports = {
  ProcessPrompt: jest.fn().mockResolvedValue('mocked response'),
  GetSettings: jest.fn().mockResolvedValue({ provider: 'ollama' }),
  SaveSettings: jest.fn().mockResolvedValue(undefined),
  // add more as needed
};
```

`src/__mocks__/wails-runtime.js` — mock the Wails runtime:

```js
module.exports = {
  EventsOn: jest.fn().mockReturnValue(() => {}), // returns cancel fn
  EventsOff: jest.fn(),
  EventsEmit: jest.fn(),
  EventsOnce: jest.fn().mockReturnValue(() => {}),
  LogDebug: jest.fn(),
  LogInfo: jest.fn(),
  LogError: jest.fn(),
  ClipboardGetText: jest.fn().mockResolvedValue(''),
  ClipboardSetText: jest.fn().mockResolvedValue(true),
  WindowSetTitle: jest.fn(),
  Quit: jest.fn(),
  Environment: jest
    .fn()
    .mockResolvedValue({ buildType: 'dev', platform: 'darwin', arch: 'amd64' }),
};
```

---

## Frontend: Redux Thunk Tests

Redux async thunks can be tested without a real Wails backend by injecting a mock adapter:

```typescript
import { configureStore } from '@reduxjs/toolkit';
import { processPrompt } from './actionsSlice';

// Replace the adapter with a mock
const mockAdapter = {
  processPrompt: jest.fn().mockResolvedValue('mocked result'),
};

test('processPrompt dispatches fulfilled', async () => {
  const store = configureStore({
    reducer: { actions: actionsReducer },
    middleware: (getDefault) =>
      getDefault({ thunk: { extraArgument: { adapter: mockAdapter } } }),
  });

  await store.dispatch(processPrompt({ text: 'hello', promptId: 'p1' }));
  expect(store.getState().actions.result).toBe('mocked result');
});
```

**GoMarkEdit note:** this thunk-result-in-a-slice pattern applies only to ephemeral frontend state
(e.g. the assistant `run` slice). Application-model data (documents/tabs/workspace/UI) is a
**projection** (DD-62/DD-63): command thunks return no model data — the store updates when the
backend's `state:patch` event is applied, so tests assert the reconciled projection after dispatching
`applyStatePatch`, never a thunk's fulfilled payload.

---

## Running Tests

```bash
# Go tests
go test ./...
go test ./internal/...
go test -run TestSpecificName ./internal/actions/

# Frontend tests
cd frontend && npm run test
cd frontend && npm run test:coverage
```
