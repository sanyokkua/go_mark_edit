package file

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadClassifiedStableBoundsRawHashAndDetectsGrowth(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "stable.md")
	if err := os.WriteFile(path, []byte("abc"), 0o644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	stable, err := ReadClassifiedStable(path, 4)
	if err != nil {
		t.Fatalf("stable read: %v", err)
	}
	if !stable.Stable || stable.RawHash == "" {
		t.Fatalf("stable read = %+v, want stable bounded hash", stable)
	}

	before, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("version before direct stable verification: %v", err)
	}
	classified, err := readClassified(path, 4)
	if err != nil {
		t.Fatalf("classified read before direct stable verification: %v", err)
	}
	if err := os.WriteFile(path, []byte("abcde"), 0o644); err != nil {
		t.Fatalf("grow file between stable-read steps: %v", err)
	}
	unstable, err := verifyStableClassifiedRead(path, before, classified, 4)
	if !errors.Is(err, ErrUnstableRead) || unstable.Stable {
		t.Fatalf("growth race = result=%+v err=%v, want ErrUnstableRead and unstable", unstable, err)
	}
}

// Proves: FR-FT-023
func TestReadClassifiedStableReportsAbsenceWithoutAnError(t *testing.T) {
	/*
	 * Absence is deliberately not an error here, and this pins that contract so a
	 * later caller does not "fix" it. The conflict path relies on it to mark an
	 * open document detached while keeping its buffer (`appmodel/conflict.go:121,297`,
	 * FR-FT-023), which an error return would break.
	 *
	 * The consequence is that callers MUST read `Version.Exists` themselves: the
	 * returned `Read` is zero-valued, so `Read.Error` is nil and
	 * `Read.CanonicalPath.Identity` is "". `appmodel.PrepareOpen` failing to check it
	 * is the FR-FT-040 defect this test's sibling covers.
	 */
	missing := filepath.Join(t.TempDir(), "never-written.md")

	absent, err := ReadClassifiedStable(missing, MaxClassifiedReadBytes)
	if err != nil {
		t.Fatalf("stable read of a missing path = %v, want no error", err)
	}
	if absent.Version.Exists {
		t.Fatalf("stable read of a missing path reports Exists = true: %+v", absent.Version)
	}
	if absent.Read.Error != nil || !absent.Read.CanonicalPath.Identity.IsZero() {
		t.Fatalf("stable read of a missing path = %+v, want a zero-valued read that carries no classification", absent.Read)
	}
}

func TestReadBoundedDoesNotConsumeBeyondLimit(t *testing.T) {
	const limit int64 = 4
	input := bytes.NewReader([]byte("0123456789"))
	raw, err := readBounded(input, limit)
	if err != nil {
		t.Fatalf("bounded read: %v", err)
	}
	if string(raw) != "0123" {
		t.Fatalf("bounded bytes = %q, want first %d bytes", raw, limit)
	}
}

// readClassifiedAtDefaultLimit is what file.ReadClassifiedDocument used to be:
// readClassified at the configured maximum. T137 deleted the exported alias —
// nothing in production called it, and production calls readClassified with the
// limit directly — but the classification behaviour these cases prove is real
// and reachable, so they now drive the same function production does.
func readClassifiedAtDefaultLimit(path string) (ClassifiedRead, error) {
	return readClassified(path, MaxClassifiedReadBytes)
}

// Proves: FR-FT-005 (partial — the size thresholds and refusal; the preview pause is proven by PreviewPane.test.tsx)
func TestReadClassifiedDocument(t *testing.T) {
	root := t.TempDir()
	write := func(name string, content []byte) string {
		t.Helper()
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, content, 0o640); err != nil {
			t.Fatalf("write %q: %v", name, err)
		}
		return path
	}

	valid := write("valid.MD", []byte("first\r\nsecond\r\n"))
	read, err := readClassifiedAtDefaultLimit(valid)
	if err != nil {
		t.Fatalf("read valid document: %v", err)
	}
	if read.Capability != CapabilityWritable || read.Characteristics.LineEnding != LineEndingCRLF {
		t.Fatalf("valid classification = %+v, want writable CRLF", read)
	}
	if read.Content != "first\nsecond\n" {
		t.Fatalf("canonical content = %q, want LF-normalized content", read.Content)
	}
	if read.Characteristics.Encoding != EncodingUTF8 || read.Characteristics.BOM != BOMAbsent {
		t.Fatalf("valid encoding characteristics = %+v", read.Characteristics)
	}
	if read.Characteristics.Mode.Perm() != 0o640 {
		t.Fatalf("mode = %o, want 640", read.Characteristics.Mode.Perm())
	}

	bom := write("bom.md", append([]byte{0xef, 0xbb, 0xbf}, []byte("bom\n")...))
	bomRead, err := readClassifiedAtDefaultLimit(bom)
	if err != nil {
		t.Fatalf("read BOM document: %v", err)
	}
	if bomRead.Characteristics.BOM != BOMPresent || bomRead.Content != "bom\n" {
		t.Fatalf("BOM classification = %+v, content %q", bomRead.Characteristics, bomRead.Content)
	}

	invalid := write("invalid.md", []byte{'a', 0xff, 0xfe, 'b'})
	invalidRead, err := readClassifiedAtDefaultLimit(invalid)
	if err != nil {
		t.Fatalf("read invalid UTF-8 document: %v", err)
	}
	if invalidRead.Capability != CapabilityUnsafeReadOnly || invalidRead.Warning != WarningInvalidUTF8 {
		t.Fatalf("invalid UTF-8 classification = %+v", invalidRead)
	}
	if !strings.Contains(invalidRead.Content, "\ufffd") {
		t.Fatalf("invalid UTF-8 display content should be tolerant: %q", invalidRead.Content)
	}

	nul := write("nul.txt", []byte{'a', 0, 'b'})
	nulRead, err := readClassifiedAtDefaultLimit(nul)
	if err != nil {
		t.Fatalf("read NUL document: %v", err)
	}
	if nulRead.Capability != CapabilityUnsafeReadOnly || nulRead.Warning != WarningNULByte {
		t.Fatalf("NUL classification = %+v", nulRead)
	}

	unsupported := write("unsupported.pdf", []byte("not markdown"))
	unsupportedRead, err := readClassifiedAtDefaultLimit(unsupported)
	if err != nil {
		t.Fatalf("unsupported suffix should return a classified result: %v", err)
	}
	if unsupportedRead.Outcome != readOutcomeRefused || unsupportedRead.Error == nil || unsupportedRead.Error.Category != "unsupported-input" {
		t.Fatalf("unsupported suffix result = %+v", unsupportedRead)
	}
	if strings.Contains(unsupportedRead.Error.Message, root) {
		t.Fatalf("unsupported suffix error leaked a private path: %q", unsupportedRead.Error.Message)
	}

	for _, row := range []struct {
		name       string
		size       int64
		capability ReadCapability
		outcome    readOutcome
	}{
		{name: "2MiB", size: fixtureSize2MiB, capability: CapabilityWritable, outcome: readOutcomeOpened},
		{name: "2MiB+1", size: fixtureSize2MiBPlus1, capability: CapabilityWritable, outcome: readOutcomeOpened},
		{name: "10MiB", size: fixtureSize10MiB, capability: CapabilityWritable, outcome: readOutcomeOpened},
		{name: "10MiB+1", size: fixtureSize10MiBPlus1, capability: CapabilityLargeReadOnly, outcome: readOutcomeOpened},
		{name: "50MiB", size: fixtureSize50MiB, capability: CapabilityLargeReadOnly, outcome: readOutcomeOpened},
		{name: "50MiB+1", size: fixtureSize50MiBPlus1, capability: CapabilityRefused, outcome: readOutcomeRefused},
	} {
		t.Run(row.name, func(t *testing.T) {
			path := filepath.Join(root, row.name+".md")
			writeRepeatedBytes(t, path, row.size, 'a')
			classified, err := readClassifiedAtDefaultLimit(path)
			if err != nil {
				t.Fatalf("read exact size: %v", err)
			}
			if classified.Outcome != row.outcome || classified.Capability != row.capability {
				t.Fatalf("classification = %+v, want outcome=%q capability=%q", classified, row.outcome, row.capability)
			}
			if classified.BytesRead > MaxClassifiedReadBytes {
				t.Fatalf("bytes read = %d, exceeds cap %d", classified.BytesRead, MaxClassifiedReadBytes)
			}
			if classified.Characteristics.RawSizeBytes != row.size {
				t.Fatalf("raw size = %d, want %d", classified.Characteristics.RawSizeBytes, row.size)
			}
			if row.outcome == readOutcomeRefused {
				if classified.Error == nil || !strings.Contains(classified.Error.Message, "50 MiB") {
					t.Fatalf("large refusal error = %+v", classified.Error)
				}
				if classified.BytesRead != 0 {
					t.Fatalf("refused file should not be read, got %d bytes", classified.BytesRead)
				}
			}
		})
	}
}

// Proves: FR-FT-007
func TestLineEndingClassification(t *testing.T) {
	root := t.TempDir()
	cases := []struct {
		name       string
		content    []byte
		lineEnding LineEnding
		lfCount    int
		crlfCount  int
		first      LineEnding
		capability ReadCapability
		warning    string
	}{
		{name: "lf", content: []byte("one\ntwo\n"), lineEnding: LineEndingLF, lfCount: 2, capability: CapabilityWritable},
		{name: "crlf", content: []byte("one\r\ntwo\r\n"), lineEnding: LineEndingCRLF, crlfCount: 2, capability: CapabilityWritable},
		{name: "mixed", content: []byte("one\ntwo\r\nthree\n"), lineEnding: LineEndingMixed, lfCount: 2, crlfCount: 1, first: LineEndingLF, capability: CapabilityWritable},
		{name: "tie-first-crlf", content: []byte("one\r\ntwo\n"), lineEnding: LineEndingMixed, lfCount: 1, crlfCount: 1, first: LineEndingCRLF, capability: CapabilityWritable},
		{name: "none", content: []byte("one line\u0085two\u2028three\u2029"), lineEnding: LineEndingNone, capability: CapabilityWritable},
		{name: "lone-cr", content: []byte("one\rtwo"), lineEnding: LineEndingNone, capability: CapabilityUnsafeReadOnly, warning: WarningLoneCR},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(root, testCase.name+".md")
			if err := os.WriteFile(path, testCase.content, 0o644); err != nil {
				t.Fatalf("write line-ending fixture: %v", err)
			}
			classified, err := readClassifiedAtDefaultLimit(path)
			if err != nil {
				t.Fatalf("read line-ending fixture: %v", err)
			}
			characteristics := classified.Characteristics
			if characteristics.LineEnding != testCase.lineEnding || characteristics.LFCount != testCase.lfCount || characteristics.CRLFCount != testCase.crlfCount {
				t.Fatalf("characteristics = %+v", characteristics)
			}
			if testCase.first != "" && characteristics.FirstEnding != testCase.first {
				t.Fatalf("first ending = %q, want %q", characteristics.FirstEnding, testCase.first)
			}
			if classified.Capability != testCase.capability || classified.Warning != testCase.warning {
				t.Fatalf("outcome = %+v", classified)
			}
			if testCase.name == "none" && classified.Content != string(testCase.content) {
				t.Fatalf("ordinary Unicode separators changed content: %q", classified.Content)
			}
		})
	}
}

func writeRepeatedBytes(t *testing.T, path string, size int64, value byte) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("create %q: %v", path, err)
	}
	defer func() { _ = file.Close() }()
	chunk := bytes.Repeat([]byte{value}, 64*1024)
	for written := int64(0); written < size; {
		want := int64(len(chunk))
		if remaining := size - written; remaining < want {
			want = remaining
		}
		n, writeErr := file.Write(chunk[:want])
		if writeErr != nil {
			t.Fatalf("write %q: %v", path, writeErr)
		}
		if n == 0 {
			t.Fatal("zero-byte write while building exact-size fixture")
		}
		written += int64(n)
	}
}
