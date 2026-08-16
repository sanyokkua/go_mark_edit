package file

import (
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
