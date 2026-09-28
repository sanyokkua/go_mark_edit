package apperr_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	. "github.com/sanyokkua/go_mark_edit/internal/apperr"
	"io"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

// ToWire retains a safe classification while JSON output never contains a wrapped cause.
func TestToWireSanitizesCauseAndPreservesClassification(t *testing.T) {
	t.Parallel()

	const sensitiveCause = "open /private/secret/credentials.txt: permission denied"
	cases := []struct {
		name            string
		err             error
		wantCode        ErrorCode
		wantTitle       string
		wantMessage     string
		wantLoggedChain string
	}{
		{
			name:        "wrapped classified error",
			err:         fmt.Errorf("save document: %w", IO("write", errors.New(sensitiveCause))),
			wantCode:    CodeIO,
			wantTitle:   "File operation failed",
			wantMessage: "The file operation could not be completed.",
			wantLoggedChain: "save document: The file operation could not be completed. -> " +
				"The file operation could not be completed. -> " + sensitiveCause,
		},
		{
			name:            "unclassified error becomes internal",
			err:             errors.New(sensitiveCause),
			wantCode:        CodeInternal,
			wantTitle:       "Something went wrong",
			wantMessage:     "An unexpected error occurred.",
			wantLoggedChain: sensitiveCause,
		},
		{
			name:        "nil becomes internal",
			err:         nil,
			wantCode:    CodeInternal,
			wantTitle:   "Something went wrong",
			wantMessage: "An unexpected error occurred.",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			var logOutput bytes.Buffer
			got := ToWire(zerolog.New(&logOutput), tt.err)
			if got.Code != tt.wantCode || got.Title != tt.wantTitle || got.Message != tt.wantMessage {
				t.Fatalf("ToWire() = %+v, want code=%q title=%q message=%q", got, tt.wantCode, tt.wantTitle, tt.wantMessage)
			}
			assertLocalLogEvent(t, &logOutput, tt.wantCode, tt.wantTitle, tt.wantLoggedChain)

			encoded, err := json.Marshal(got)
			if err != nil {
				t.Fatalf("marshal WireError: %v", err)
			}
			payload := string(encoded)
			for _, forbidden := range []string{sensitiveCause, "credentials.txt", "cause"} {
				if strings.Contains(payload, forbidden) {
					t.Fatalf("WireError JSON leaked %q: %s", forbidden, payload)
				}
			}
		})
	}
}

func assertLocalLogEvent(t *testing.T, output *bytes.Buffer, wantCode ErrorCode, wantMessage, wantChain string) {
	t.Helper()

	var event struct {
		Level      string `json:"level"`
		Code       string `json:"code"`
		Message    string `json:"message"`
		ErrorChain string `json:"error_chain"`
	}
	decoder := json.NewDecoder(output)
	if err := decoder.Decode(&event); err != nil {
		t.Fatalf("decode local error log: %v", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		t.Fatalf("ToWire logged more than one event: %v", err)
	}
	if event.Level != "error" || event.Code != string(wantCode) || event.Message != wantMessage {
		t.Fatalf("local log event = %+v, want error code=%q message=%q", event, wantCode, wantMessage)
	}
	if event.ErrorChain != wantChain {
		t.Fatalf("local error_chain = %q, want %q", event.ErrorChain, wantChain)
	}
}
