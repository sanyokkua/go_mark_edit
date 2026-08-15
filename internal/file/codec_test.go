package file

import (
	"bytes"
	"errors"
	"testing"
)

// Proves: FR-FT-010
func TestDocumentCodecRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		raw  []byte
		want []byte
	}{
		{name: "new", raw: []byte("one\ntwo"), want: []byte("one\ntwo")},
		{name: "lf", raw: []byte("one\ntwo\n"), want: []byte("one\ntwo\n")},
		{name: "crlf", raw: []byte("one\r\ntwo\r\n"), want: []byte("one\r\ntwo\r\n")},
		{name: "bom-lf", raw: []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\n'}, want: []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\n'}},
		{name: "bom-crlf", raw: []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\r', '\n'}, want: []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\r', '\n'}},
		{name: "none", raw: []byte("one line"), want: []byte("one line")},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			snapshot, err := DecodeDocument(testCase.raw)
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			encoded, err := EncodeDocument(snapshot)
			if err != nil {
				t.Fatalf("encode: %v", err)
			}
			if !bytes.Equal(encoded, testCase.want) {
				t.Fatalf("encoded bytes = %q, want %q", encoded, testCase.want)
			}
		})
	}
}

func TestNoneEndingPreservedUntilBreakInserted(t *testing.T) {
	snapshot, err := DecodeDocument([]byte("one line without a terminator"))
	if err != nil {
		t.Fatalf("decode none: %v", err)
	}
	if snapshot.LineEnding != LineEndingNone {
		t.Fatalf("line ending = %q, want none", snapshot.LineEnding)
	}
	encoded, err := snapshot.Encode()
	if err != nil {
		t.Fatalf("encode unchanged none: %v", err)
	}
	if !bytes.Equal(encoded, []byte("one line without a terminator")) {
		t.Fatalf("unchanged none bytes = %q", encoded)
	}

	snapshot.Content += "\ninserted break"
	encoded, err = snapshot.Encode()
	if err != nil {
		t.Fatalf("encode inserted break: %v", err)
	}
	if !bytes.Equal(encoded, []byte("one line without a terminator\ninserted break")) {
		t.Fatalf("inserted-break bytes = %q", encoded)
	}
}

func TestDocumentCodecRefusesMixedAndUnsafeInputs(t *testing.T) {
	mixed, err := DecodeDocument([]byte("one\ntwo\r\n"))
	if err != nil {
		t.Fatalf("decode mixed: %v", err)
	}
	if _, err := mixed.Encode(); !errors.Is(err, ErrCodecMixedLineEndings) {
		t.Fatalf("mixed encode error = %v, want %v", err, ErrCodecMixedLineEndings)
	}
	if _, err := DecodeDocument([]byte{'a', 0xff}); !errors.Is(err, ErrCodecInvalidUTF8) {
		t.Fatalf("invalid UTF-8 error = %v", err)
	}
	if _, err := DecodeDocument([]byte{'a', 0, 'b'}); !errors.Is(err, ErrCodecNULByte) {
		t.Fatalf("NUL error = %v", err)
	}
	if _, err := DecodeDocument([]byte("one\rtwo")); !errors.Is(err, ErrCodecLoneCR) {
		t.Fatalf("lone CR error = %v", err)
	}
}

func TestNewDocumentCodecUsesLFWithoutAddingTrailingNewline(t *testing.T) {
	withoutNewline, err := NewDocumentSnapshot("new document").Encode()
	if err != nil {
		t.Fatalf("encode new document: %v", err)
	}
	if !bytes.Equal(withoutNewline, []byte("new document")) {
		t.Fatalf("new document bytes = %q", withoutNewline)
	}
	withNewline, err := NewDocumentSnapshot("new document\n").Encode()
	if err != nil {
		t.Fatalf("encode new document with newline: %v", err)
	}
	if !bytes.Equal(withNewline, []byte("new document\n")) {
		t.Fatalf("new document newline bytes = %q", withNewline)
	}
}
