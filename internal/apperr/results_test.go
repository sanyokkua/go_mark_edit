package apperr

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// Proves: STORY-002-AC-1
// Every current error code and result envelope has the JSON contract required by Wails.
func TestResultEnvelopesExposeOnlyContractFields(t *testing.T) {
	t.Parallel()

	wire := &WireError{
		Code:      CodeValidation,
		Title:     "Invalid input",
		Message:   "A value needs to be corrected.",
		Retryable: false,
	}
	cases := []struct {
		name      string
		value     any
		wantKeys  []string
		absentKey string
	}{
		{
			name:      "void result omits nil error",
			value:     VoidResult{},
			wantKeys:  []string{},
			absentKey: "error",
		},
		{
			name:     "void result exposes error",
			value:    VoidResult{Error: wire},
			wantKeys: []string{"error"},
		},
		{
			name:      "string result omits nil error",
			value:     StringResult{Data: "document title"},
			wantKeys:  []string{"data"},
			absentKey: "error",
		},
		{
			name:     "string result exposes data and error",
			value:    StringResult{Data: "document title", Error: wire},
			wantKeys: []string{"data", "error"},
		},
		{
			name: "state result exposes its hydration payload",
			value: StateResult{Data: &AppState{
				Snapshot: AppStateSnapshot{Documents: map[string]DocumentMetadata{}},
			}},
			wantKeys:  []string{"data"},
			absentKey: "error",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			encoded, err := json.Marshal(tt.value)
			if err != nil {
				t.Fatalf("marshal result: %v", err)
			}

			var got map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &got); err != nil {
				t.Fatalf("unmarshal result: %v", err)
			}
			if len(got) != len(tt.wantKeys) {
				t.Fatalf("JSON keys = %v, want exactly %v", mapKeys(got), tt.wantKeys)
			}
			for _, key := range tt.wantKeys {
				if _, ok := got[key]; !ok {
					t.Fatalf("missing JSON key %q in %s", key, encoded)
				}
			}
			if tt.absentKey != "" {
				if _, ok := got[tt.absentKey]; ok {
					t.Fatalf("unexpected JSON key %q in %s", tt.absentKey, encoded)
				}
			}
		})
	}

	wantCodes := map[ErrorCode]string{
		ErrorCode("validation"):  "Validation",
		ErrorCode("not_found"):   "NotFound",
		ErrorCode("io"):          "IO",
		ErrorCode("permission"):  "Permission",
		ErrorCode("busy"):        "Busy",
		ErrorCode("timeout"):     "Timeout",
		ErrorCode("cancelled"):   "Cancelled",
		ErrorCode("unsupported"): "Unsupported",
		ErrorCode("internal"):    "Internal",
	}
	if len(AllErrorCodes) != len(wantCodes) {
		t.Fatalf("AllErrorCodes has %d entries, want %d", len(AllErrorCodes), len(wantCodes))
	}
	seen := make(map[ErrorCode]bool, len(AllErrorCodes))
	for _, entry := range AllErrorCodes {
		if seen[entry.Value] {
			t.Fatalf("AllErrorCodes repeats %q", entry.Value)
		}
		seen[entry.Value] = true
		if got, ok := wantCodes[entry.Value]; !ok || got != entry.TSName {
			t.Fatalf("enum entry %+v is not a defined ErrorCode/TypeScript-name pair", entry)
		}
		if _, err := json.Marshal(entry.Value); err != nil {
			t.Fatalf("marshal ErrorCode %q: %v", entry.Value, err)
		}
	}
}

func TestDocumentTransitionWireShape(t *testing.T) {
	acknowledgement := ActiveBufferAcknowledgement{
		DocumentID:         "doc-1",
		DocumentRevision:   0,
		ProjectionRevision: 7,
		Content:            "",
	}
	success, err := json.Marshal(DocumentTransitionOutcome{Data: &acknowledgement})
	if err != nil {
		t.Fatalf("marshal successful transition: %v", err)
	}
	if string(success) != `{"data":{"documentId":"doc-1","documentRevision":0,"projectionRevision":7,"content":""}}` {
		t.Fatalf("successful transition JSON = %s", success)
	}
	failure, err := json.Marshal(DocumentTransitionOutcome{Error: func() *ClassifiedError {
		value := NewClassifiedError(ClassifiedCapacityLimit, "Untitled", "The window already contains 40 documents.", RemediationCancel, "")
		return &value
	}()})
	if err != nil {
		t.Fatalf("marshal refused transition: %v", err)
	}
	if !strings.Contains(string(failure), `"error"`) || !strings.Contains(string(failure), `"category":"capacity-limit"`) {
		t.Fatalf("refused transition JSON = %s", failure)
	}
}

func TestCommittedWriteResultWireShape(t *testing.T) {
	result := CommittedWriteResult{Data: &CommittedWriteOutcome{
		DocumentID:                  "doc-1",
		WrittenContentRevision:      4,
		CommittedProjectionRevision: 8,
		TargetPathAdopted:           true,
		LineEndingOutcome:           LineEndingPreservedCRLF,
		BOMOutcome:                  BOMOutcomePreserved,
		ResyncRequired:              true,
	}}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal committed write result: %v", err)
	}
	for _, field := range []string{
		`"documentId":"doc-1"`,
		`"writtenContentRevision":4`,
		`"committedProjectionRevision":8`,
		`"targetPathAdopted":true`,
		`"lineEndingOutcome":"preserved-crlf"`,
		`"bomOutcome":"preserved"`,
		`"resyncRequired":true`,
	} {
		if !strings.Contains(string(encoded), field) {
			t.Fatalf("committed write result JSON = %s, missing %s", encoded, field)
		}
	}
}

func mapKeys(values map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

// Proves: STORY-002-AC-1
// The Go result types expose no fields beyond the data-or-error bridge contract.
func TestResultEnvelopeFieldContracts(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		type_ reflect.Type
		want  []string
	}{
		{"void", reflect.TypeFor[VoidResult](), []string{"Error"}},
		{"string", reflect.TypeFor[StringResult](), []string{"Data", "Error"}},
		{"state", reflect.TypeFor[StateResult](), []string{"Data", "Error"}},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if tt.type_.NumField() != len(tt.want) {
				t.Fatalf("%s has %d fields, want %d", tt.type_, tt.type_.NumField(), len(tt.want))
			}
			for index, want := range tt.want {
				if got := tt.type_.Field(index).Name; got != want {
					t.Errorf("field %d = %q, want %q", index, got, want)
				}
			}
		})
	}
}
