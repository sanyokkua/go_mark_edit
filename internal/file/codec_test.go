package file

import (
	"bytes"
	"errors"
	"testing"
)

/*
 * T137 rewrote this file around EncodeDocument.
 *
 * Every case used to reach the encoder through DecodeDocument and the
 * DocumentSnapshot.Encode method, and both were deleted: nothing in production
 * called either, and DecodeDocument was a second, stricter decoder that
 * contradicted FR-FT-006 — it returned an error for invalid UTF-8, a NUL byte
 * and a lone CR, where the shipped reader must open those tolerantly as
 * read-only. Keeping a test that drove it would have gone on asserting the
 * behaviour the requirement forbids.
 *
 * The snapshots below are therefore written out rather than decoded, which is
 * also what production does: appmodel builds the snapshot from a ClassifiedRead
 * and calls EncodeDocument. Decode-side classification is proved against the
 * real reader in document_reader_test.go.
 */

// Proves: FR-FT-010 (partial — the encoder's half: an existing file's LF or
// CRLF convention and its BOM survive a write byte for byte. That the
// convention is *detected* correctly is proved by TestLineEndingClassification
// in document_reader_test.go.)
func TestDocumentCodecEncodesEachPreservedConvention(t *testing.T) {
	tests := []struct {
		name     string
		snapshot DocumentSnapshot
		want     []byte
	}{
		{
			name:     "lf",
			snapshot: DocumentSnapshot{Content: "one\ntwo\n", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingLF},
			want:     []byte("one\ntwo\n"),
		},
		{
			name:     "crlf",
			snapshot: DocumentSnapshot{Content: "one\ntwo\n", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingCRLF},
			want:     []byte("one\r\ntwo\r\n"),
		},
		{
			name:     "bom-lf",
			snapshot: DocumentSnapshot{Content: "one\n", Encoding: EncodingUTF8, BOM: BOMPresent, LineEnding: LineEndingLF},
			want:     []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\n'},
		},
		{
			name:     "bom-crlf",
			snapshot: DocumentSnapshot{Content: "one\n", Encoding: EncodingUTF8, BOM: BOMPresent, LineEnding: LineEndingCRLF},
			want:     []byte{0xef, 0xbb, 0xbf, 'o', 'n', 'e', '\r', '\n'},
		},
		{
			name:     "none",
			snapshot: DocumentSnapshot{Content: "one line", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingNone},
			want:     []byte("one line"),
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			encoded, err := EncodeDocument(testCase.snapshot)
			if err != nil {
				t.Fatalf("encode: %v", err)
			}
			if !bytes.Equal(encoded, testCase.want) {
				t.Fatalf("encoded bytes = %q, want %q", encoded, testCase.want)
			}
		})
	}
}

// Proves: FR-FT-010 — "Preserve `none` files without adding a terminator until
// the user inserts a break, then use LF."
func TestNoneEndingPreservedUntilBreakInserted(t *testing.T) {
	snapshot := DocumentSnapshot{
		Content:    "one line without a terminator",
		Encoding:   EncodingUTF8,
		BOM:        BOMAbsent,
		LineEnding: LineEndingNone,
	}
	encoded, err := EncodeDocument(snapshot)
	if err != nil {
		t.Fatalf("encode unchanged none: %v", err)
	}
	if !bytes.Equal(encoded, []byte("one line without a terminator")) {
		t.Fatalf("unchanged none bytes = %q", encoded)
	}

	snapshot.Content += "\ninserted break"
	encoded, err = EncodeDocument(snapshot)
	if err != nil {
		t.Fatalf("encode inserted break: %v", err)
	}
	if !bytes.Equal(encoded, []byte("one line without a terminator\ninserted break")) {
		t.Fatalf("inserted-break bytes = %q", encoded)
	}
}

// Proves: FR-FT-011 (partial — the encoder refuses a mixed-ending snapshot, so
// no write can commit without a normalization decision having already chosen an
// ending. That the *decision* is required before disk access is proved in
// internal/appmodel.)
func TestEncodeRefusesMixedAndUnsafeContent(t *testing.T) {
	mixed := DocumentSnapshot{Content: "one\ntwo\n", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingMixed}
	if _, err := EncodeDocument(mixed); !errors.Is(err, ErrCodecMixedLineEndings) {
		t.Fatalf("mixed encode error = %v, want %v", err, ErrCodecMixedLineEndings)
	}
	invalid := DocumentSnapshot{Content: "a\xff", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingLF}
	if _, err := EncodeDocument(invalid); !errors.Is(err, ErrCodecInvalidUTF8) {
		t.Fatalf("invalid UTF-8 encode error = %v, want %v", err, ErrCodecInvalidUTF8)
	}
	nul := DocumentSnapshot{Content: "a\x00b", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingLF}
	if _, err := EncodeDocument(nul); !errors.Is(err, ErrCodecNULByte) {
		t.Fatalf("NUL encode error = %v, want %v", err, ErrCodecNULByte)
	}
	loneCR := DocumentSnapshot{Content: "one\rtwo", Encoding: EncodingUTF8, BOM: BOMAbsent, LineEnding: LineEndingLF}
	if _, err := EncodeDocument(loneCR); !errors.Is(err, ErrCodecLoneCR) {
		t.Fatalf("lone CR encode error = %v, want %v", err, ErrCodecLoneCR)
	}
	unsupported := DocumentSnapshot{Content: "one\n", Encoding: "utf-16", BOM: BOMAbsent, LineEnding: LineEndingLF}
	if _, err := EncodeDocument(unsupported); !errors.Is(err, ErrCodecUnsupportedEncoding) {
		t.Fatalf("unsupported encoding error = %v, want %v", err, ErrCodecUnsupportedEncoding)
	}
}
