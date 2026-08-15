package file

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

const (
	MaxWritableDocumentBytes  int64 = 10_485_760
	MaxSupportedDocumentBytes int64 = 52_428_800
	MaxClassifiedReadBytes    int64 = 52_428_801
)

type ReadCapability string

const (
	CapabilityWritable       ReadCapability = "writable"
	CapabilityUnsafeReadOnly ReadCapability = "unsafe-read-only"
	CapabilityLargeReadOnly  ReadCapability = "large-read-only"
	CapabilityRefused        ReadCapability = "refused"
)

type ReadOutcome string

const (
	ReadOutcomeOpened  ReadOutcome = "opened"
	ReadOutcomeRefused ReadOutcome = "refused"
)

type LineEnding string

const (
	LineEndingLF    LineEnding = "lf"
	LineEndingCRLF  LineEnding = "crlf"
	LineEndingMixed LineEnding = "mixed"
	LineEndingNone  LineEnding = "none"
)

type Encoding string

const (
	EncodingUTF8       Encoding = "utf-8"
	EncodingUnsafeUTF8 Encoding = "unsafe-utf8"
)

type BOM string

const (
	BOMPresent BOM = "present"
	BOMAbsent  BOM = "absent"
)

const (
	WarningLargeFile   = "large-file"
	WarningInvalidUTF8 = "invalid-utf8"
	WarningNULByte     = "nul-byte"
	WarningLoneCR      = "lone-cr"
)

// ErrUnstableRead means the file changed while its classification and raw-byte
// hash were being captured. Callers must perform a fresh foreground check; they
// must not retry the write against either half of this read.
var ErrUnstableRead = errors.New("document changed while being read")

// stableReadBeforeHashHook is nil in production. Tests use it to make a
// growth race deterministic between classification and the bounded hash read.
var stableReadBeforeHashHook func(string)

// StableClassifiedRead is the complete, version-bound source snapshot used by
// Open, Reload, and external-change decisions.
type StableClassifiedRead struct {
	Read    ClassifiedRead
	Version DiskVersion
	RawHash string
	Stable  bool
}

// FileCharacteristics describes raw bytes before any document enters the appmodel.
type FileCharacteristics struct {
	Encoding     Encoding
	BOM          BOM
	LineEnding   LineEnding
	LFCount      int
	CRLFCount    int
	FirstEnding  LineEnding
	RawSizeBytes int64
	Capability   ReadCapability
	Warning      string
	Mode         os.FileMode
}

// ClassifiedRead is the complete bounded outcome of reading one local document.
type ClassifiedRead struct {
	CanonicalPath   CanonicalDocumentPath
	Content         string
	Characteristics FileCharacteristics
	Capability      ReadCapability
	Outcome         ReadOutcome
	Warning         string
	BytesRead       int64
	Error           *apperr.ClassifiedError
}

// DocumentFileService provides the filesystem capabilities used by later lifecycle slices.
type DocumentFileService struct{}

func NewDocumentFileService() *DocumentFileService {
	return &DocumentFileService{}
}

func (service *DocumentFileService) CanonicalizeExisting(path string) (CanonicalDocumentPath, error) {
	return CanonicalizeDocumentPath(path)
}

func (service *DocumentFileService) CanonicalizeCandidate(path string) (CanonicalDocumentPath, error) {
	return CanonicalizeCandidateDocumentPath(path)
}

func (service *DocumentFileService) ReadClassified(path string, maxBytes int64) (ClassifiedRead, error) {
	return ReadClassified(path, maxBytes)
}

// ReadClassifiedStable captures a disk version before classification and after
// the raw-byte hash. A result is usable only when both versions are equal.
// The read itself remains bounded by ReadClassified's configured limit.
func (service *DocumentFileService) ReadClassifiedStable(path string, maxBytes int64) (StableClassifiedRead, error) {
	return ReadClassifiedStable(path, maxBytes)
}

func ReadClassifiedStable(path string, maxBytes int64) (StableClassifiedRead, error) {
	maxBytes = normalizedReadLimit(maxBytes)
	before, err := CurrentDiskVersion(path)
	if err != nil {
		return StableClassifiedRead{}, err
	}
	if !before.Exists {
		return StableClassifiedRead{Version: before}, nil
	}
	read, err := ReadClassified(path, maxBytes)
	if err != nil {
		return StableClassifiedRead{Read: read, Version: before}, err
	}
	if read.Error != nil {
		after, err := CurrentDiskVersion(path)
		if err != nil {
			return StableClassifiedRead{Read: read, Version: before}, err
		}
		result := StableClassifiedRead{
			Read:    read,
			Version: after,
			Stable:  before.Equal(after),
		}
		if !result.Stable {
			return result, ErrUnstableRead
		}
		return result, nil
	}
	if stableReadBeforeHashHook != nil {
		stableReadBeforeHashHook(path)
	}
	raw, err := readRawBytesBounded(path, maxBytes)
	if err != nil {
		return StableClassifiedRead{Read: read, Version: before}, err
	}
	digest := sha256.Sum256(raw)
	after, err := CurrentDiskVersion(path)
	if err != nil {
		return StableClassifiedRead{Read: read, Version: before, RawHash: hex.EncodeToString(digest[:])}, err
	}
	result := StableClassifiedRead{Read: read, Version: after, RawHash: hex.EncodeToString(digest[:]), Stable: before.Equal(after)}
	if !result.Stable {
		return result, ErrUnstableRead
	}
	return result, nil
}

// ReadClassified reads no more than the configured cap and refuses an over-limit file before
// allocating or inserting any document state.
func ReadClassified(path string, maxBytes int64) (ClassifiedRead, error) {
	maxBytes = normalizedReadLimit(maxBytes)
	canonical, err := CanonicalizeDocumentPath(path)
	if err != nil {
		return ClassifiedRead{Outcome: ReadOutcomeRefused, Capability: CapabilityRefused, Error: classifiedReadError(path, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)}, nil
	}
	if !IsSupportedDocumentSuffix(canonical.Path) {
		return ClassifiedRead{
			CanonicalPath: canonical,
			Outcome:       ReadOutcomeRefused,
			Capability:    CapabilityRefused,
			Error:         classifiedReadError(canonical.DisplayName, apperr.ClassifiedUnsupportedInput, "The selected file type is not supported.", apperr.RemediationNone),
		}, nil
	}
	info, err := os.Stat(canonical.Path)
	if err != nil {
		return ClassifiedRead{CanonicalPath: canonical, Outcome: ReadOutcomeRefused, Capability: CapabilityRefused, Error: classifiedReadError(canonical.DisplayName, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)}, nil
	}
	if info.Size() > maxBytes || info.Size() > MaxSupportedDocumentBytes {
		return ClassifiedRead{
			CanonicalPath:   canonical,
			Characteristics: FileCharacteristics{RawSizeBytes: info.Size(), Capability: CapabilityRefused, Mode: info.Mode()},
			Outcome:         ReadOutcomeRefused,
			Capability:      CapabilityRefused,
			Error:           classifiedReadError(canonical.DisplayName, apperr.ClassifiedCapacityLimit, "The document exceeds the 50 MiB limit.", apperr.RemediationNone),
		}, nil
	}

	file, err := os.Open(canonical.Path)
	if err != nil {
		return ClassifiedRead{CanonicalPath: canonical, Outcome: ReadOutcomeRefused, Capability: CapabilityRefused, Error: classifiedReadError(canonical.DisplayName, apperr.ClassifiedIOFailure, "The document could not be read.", apperr.RemediationRetry)}, err
	}
	defer func() { _ = file.Close() }()
	data, err := readBounded(file, maxBytes)
	if err != nil {
		return ClassifiedRead{CanonicalPath: canonical, Outcome: ReadOutcomeRefused, Capability: CapabilityRefused, BytesRead: int64(len(data)), Error: classifiedReadError(canonical.DisplayName, apperr.ClassifiedIOFailure, "The document could not be read.", apperr.RemediationRetry)}, err
	}
	classified := classifyDocumentBytes(canonical, info, data)
	classified.BytesRead = int64(len(data))
	return classified, nil
}

func normalizedReadLimit(maxBytes int64) int64 {
	if maxBytes <= 0 || maxBytes > MaxClassifiedReadBytes {
		return MaxClassifiedReadBytes
	}
	return maxBytes
}

func readRawBytesBounded(path string, maxBytes int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	return readBounded(file, maxBytes)
}

func readBounded(reader io.Reader, maxBytes int64) ([]byte, error) {
	return io.ReadAll(io.LimitReader(reader, normalizedReadLimit(maxBytes)))
}

func ReadClassifiedDocument(path string) (ClassifiedRead, error) {
	return ReadClassified(path, MaxClassifiedReadBytes)
}

func classifyDocumentBytes(canonical CanonicalDocumentPath, info os.FileInfo, raw []byte) ClassifiedRead {
	payload := raw
	bom := BOMAbsent
	if bytes.HasPrefix(payload, []byte{0xef, 0xbb, 0xbf}) {
		bom = BOMPresent
		payload = payload[3:]
	}
	lineEnding, lfCount, crlfCount, firstEnding, loneCR := classifyLineEndings(payload)
	validUTF8 := utf8.Valid(payload)
	nul := bytes.IndexByte(payload, 0) >= 0
	capability := CapabilityWritable
	warning := ""
	encoding := EncodingUTF8
	if !validUTF8 {
		encoding = EncodingUnsafeUTF8
		capability = CapabilityUnsafeReadOnly
		warning = WarningInvalidUTF8
	} else if nul {
		capability = CapabilityUnsafeReadOnly
		warning = WarningNULByte
	} else if loneCR {
		capability = CapabilityUnsafeReadOnly
		warning = WarningLoneCR
	} else if info.Size() > MaxWritableDocumentBytes {
		capability = CapabilityLargeReadOnly
		warning = WarningLargeFile
	}

	content := tolerantDisplay(payload)
	if capability == CapabilityWritable || capability == CapabilityLargeReadOnly {
		content = normalizeCRLF(content)
	}
	return ClassifiedRead{
		CanonicalPath: canonical,
		Content:       content,
		Characteristics: FileCharacteristics{
			Encoding: encoding, BOM: bom, LineEnding: lineEnding,
			LFCount: lfCount, CRLFCount: crlfCount, FirstEnding: firstEnding,
			RawSizeBytes: info.Size(), Capability: capability, Warning: warning, Mode: info.Mode(),
		},
		Capability: capability,
		Outcome:    ReadOutcomeOpened,
		Warning:    warning,
	}
}

func classifyLineEndings(data []byte) (LineEnding, int, int, LineEnding, bool) {
	lfCount, crlfCount := 0, 0
	var first LineEnding
	loneCR := false
	for index := 0; index < len(data); index++ {
		switch data[index] {
		case '\r':
			if index+1 < len(data) && data[index+1] == '\n' {
				crlfCount++
				if first == "" {
					first = LineEndingCRLF
				}
				index++
				continue
			}
			loneCR = true
		case '\n':
			lfCount++
			if first == "" {
				first = LineEndingLF
			}
		}
	}
	lineEnding := LineEndingNone
	switch {
	case lfCount > 0 && crlfCount == 0:
		lineEnding = LineEndingLF
	case crlfCount > 0 && lfCount == 0:
		lineEnding = LineEndingCRLF
	case lfCount > 0 && crlfCount > 0:
		lineEnding = LineEndingMixed
	}
	return lineEnding, lfCount, crlfCount, first, loneCR
}

func normalizeCRLF(content string) string {
	return strings.ReplaceAll(content, "\r\n", "\n")
}

func tolerantDisplay(data []byte) string {
	return strings.ToValidUTF8(string(data), "\ufffd")
}

func classifiedReadError(subject string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) *apperr.ClassifiedError {
	classified := apperr.NewClassifiedError(category, subject, message, remediation, "")
	return &classified
}
