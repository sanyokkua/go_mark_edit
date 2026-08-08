package file

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

var (
	ErrCodecInvalidUTF8         = errors.New("document is not valid UTF-8")
	ErrCodecNULByte             = errors.New("document contains a NUL byte")
	ErrCodecLoneCR              = errors.New("document contains a lone carriage return")
	ErrCodecMixedLineEndings    = errors.New("document contains mixed line endings")
	ErrCodecUnsupportedEncoding = errors.New("document encoding is not supported")
)

// DocumentSnapshot is the immutable, canonical text plus the byte-preservation
// characteristics needed by a later write. Content uses LF internally.
// Callers should treat the value as immutable after construction or decoding.
type DocumentSnapshot struct {
	Content    string
	Encoding   Encoding
	BOM        BOM
	LineEnding LineEnding
}

// NewDocumentSnapshot creates the canonical representation for a new file.
// New files use UTF-8, LF, and no BOM. A physical trailing newline is emitted
// only when Content contains one.
func NewDocumentSnapshot(content string) DocumentSnapshot {
	return DocumentSnapshot{
		Content:    strings.ReplaceAll(content, "\r\n", "\n"),
		Encoding:   EncodingUTF8,
		BOM:        BOMAbsent,
		LineEnding: LineEndingLF,
	}
}

// DecodeDocument converts raw UTF-8 file bytes to the canonical internal form.
// Mixed endings remain represented so the editor can display them, but the
// encoder refuses them until a later authorization chooses a target ending.
func DecodeDocument(raw []byte) (DocumentSnapshot, error) {
	payload := raw
	bom := BOMAbsent
	if bytes.HasPrefix(payload, []byte{0xef, 0xbb, 0xbf}) {
		bom = BOMPresent
		payload = payload[3:]
	}
	if !utf8.Valid(payload) {
		return DocumentSnapshot{}, ErrCodecInvalidUTF8
	}
	if bytes.IndexByte(payload, 0) >= 0 {
		return DocumentSnapshot{}, ErrCodecNULByte
	}
	lineEnding, _, _, _, loneCR := classifyLineEndings(payload)
	if loneCR {
		return DocumentSnapshot{}, ErrCodecLoneCR
	}
	return DocumentSnapshot{
		Content:    strings.ReplaceAll(string(payload), "\r\n", "\n"),
		Encoding:   EncodingUTF8,
		BOM:        bom,
		LineEnding: lineEnding,
	}, nil
}

// EncodeDocument produces the exact bytes for one canonical snapshot. A none
// snapshot stays physically unterminated until Content contains a line break;
// once a break exists, the newly introduced ending is LF.
func EncodeDocument(snapshot DocumentSnapshot) ([]byte, error) {
	if snapshot.Encoding != "" && snapshot.Encoding != EncodingUTF8 {
		return nil, fmt.Errorf("%w: %q", ErrCodecUnsupportedEncoding, snapshot.Encoding)
	}
	if !utf8.ValidString(snapshot.Content) {
		return nil, ErrCodecInvalidUTF8
	}
	if strings.IndexByte(snapshot.Content, 0) >= 0 {
		return nil, ErrCodecNULByte
	}
	if strings.Contains(snapshot.Content, "\r") {
		return nil, ErrCodecLoneCR
	}
	if snapshot.LineEnding == LineEndingMixed {
		return nil, ErrCodecMixedLineEndings
	}

	ending := snapshot.LineEnding
	if ending == "" {
		ending = LineEndingLF
	}
	if ending == LineEndingNone && strings.Contains(snapshot.Content, "\n") {
		ending = LineEndingLF
	}
	if ending != LineEndingLF && ending != LineEndingCRLF && ending != LineEndingNone {
		return nil, fmt.Errorf("unsupported line ending %q", ending)
	}

	content := snapshot.Content
	if ending == LineEndingCRLF {
		content = strings.ReplaceAll(content, "\n", "\r\n")
	}
	encoded := []byte(content)
	if snapshot.BOM == BOMPresent {
		encoded = append([]byte{0xef, 0xbb, 0xbf}, encoded...)
	} else if snapshot.BOM != "" && snapshot.BOM != BOMAbsent {
		return nil, fmt.Errorf("unsupported BOM %q", snapshot.BOM)
	}
	return encoded, nil
}

// Encode is the method form used by write coordinators.
func (snapshot DocumentSnapshot) Encode() ([]byte, error) {
	return EncodeDocument(snapshot)
}
