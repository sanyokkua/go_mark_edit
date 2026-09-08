// Package file resolves the local application paths used by infrastructure services.
package file

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

const (
	productionAppName  = "GoMarkEdit"
	developmentAppName = "GoMarkEdit-Dev"
	settingsDatabase   = "settings.db"
)

// CanonicalDocumentPath is the identity-safe path metadata shared by file lifecycle commands.
// Path is absolute and symlink-resolved for existing files; Identity is filesystem-aware when the
// host exposes a stable device/inode pair and otherwise falls back to the canonical path.
type CanonicalDocumentPath struct {
	Path        string
	Identity    string
	DisplayName string
	ParentName  string
}

// CanonicalizeDocumentPath resolves an existing regular document without changing path case.
func CanonicalizeDocumentPath(path string) (CanonicalDocumentPath, error) {
	if strings.TrimSpace(path) == "" {
		return CanonicalDocumentPath{}, fmt.Errorf("document path is empty")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return CanonicalDocumentPath{}, fmt.Errorf("resolve document path: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(absolute))
	if err != nil {
		return CanonicalDocumentPath{}, classifyPathError(err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return CanonicalDocumentPath{}, classifyPathError(err)
	}
	if !info.Mode().IsRegular() {
		return CanonicalDocumentPath{}, fmt.Errorf("document path is not a regular file")
	}
	return newCanonicalDocumentPath(resolved, info), nil
}

// CanonicalizeCandidateDocumentPath resolves an existing candidate and otherwise resolves its
// parent, preserving the candidate's spelling and host filesystem case semantics.
func CanonicalizeCandidateDocumentPath(path string) (CanonicalDocumentPath, error) {
	if strings.TrimSpace(path) == "" {
		return CanonicalDocumentPath{}, fmt.Errorf("document path is empty")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return CanonicalDocumentPath{}, fmt.Errorf("resolve document path: %w", err)
	}
	absolute = filepath.Clean(absolute)
	if info, statErr := os.Stat(absolute); statErr == nil {
		if !info.Mode().IsRegular() {
			return CanonicalDocumentPath{}, fmt.Errorf("document path is not a regular file")
		}
		resolved, resolveErr := filepath.EvalSymlinks(absolute)
		if resolveErr != nil {
			return CanonicalDocumentPath{}, classifyPathError(resolveErr)
		}
		return newCanonicalDocumentPath(resolved, info), nil
	}
	parent, parentErr := filepath.EvalSymlinks(filepath.Dir(absolute))
	if parentErr != nil {
		parent = filepath.Dir(absolute)
	}
	resolved := filepath.Join(parent, filepath.Base(absolute))
	return CanonicalDocumentPath{
		Path:        resolved,
		Identity:    "path:" + resolved,
		DisplayName: safeDisplayName(filepath.Base(resolved)),
		ParentName:  safeDisplayName(filepath.Base(filepath.Dir(resolved))),
	}, nil
}

// IsSupportedDocumentSuffix accepts only the four direct-entry suffixes, case-insensitively.
func IsSupportedDocumentSuffix(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown", ".txt":
		return true
	default:
		return false
	}
}

func newCanonicalDocumentPath(path string, info os.FileInfo) CanonicalDocumentPath {
	return CanonicalDocumentPath{
		Path:        path,
		Identity:    filesystemIdentity(path, info),
		DisplayName: safeDisplayName(filepath.Base(path)),
		ParentName:  safeDisplayName(filepath.Base(filepath.Dir(path))),
	}
}

func filesystemIdentity(path string, info os.FileInfo) string {
	value := reflect.ValueOf(info.Sys())
	if value.IsValid() {
		if value.Kind() == reflect.Pointer {
			if value.IsNil() {
				value = reflect.Value{}
			} else {
				value = value.Elem()
			}
		}
		if value.IsValid() && value.Kind() == reflect.Struct {
			dev, hasDev := uintField(value, "Dev")
			ino, hasIno := uintField(value, "Ino")
			if hasDev && hasIno {
				return fmt.Sprintf("file:%d:%d", dev, ino)
			}
		}
	}
	return "path:" + path
}

func uintField(value reflect.Value, name string) (uint64, bool) {
	field := value.FieldByName(name)
	if !field.IsValid() || !field.CanUint() {
		return 0, false
	}
	return field.Uint(), true
}

func safeDisplayName(name string) string {
	var builder strings.Builder
	for _, character := range name {
		if isUnsafeDisplayRune(character) {
			fmt.Fprintf(&builder, `\u%04X`, character)
			continue
		}
		builder.WriteRune(character)
	}
	return builder.String()
}

func isUnsafeDisplayRune(character rune) bool {
	return character < 0x20 || character == 0x7f ||
		(character >= 0x202a && character <= 0x202e) ||
		(character >= 0x2066 && character <= 0x2069) ||
		character == 0x0085 || character == 0x2028 || character == 0x2029
}

func classifyPathError(err error) error {
	if os.IsNotExist(err) {
		return fmt.Errorf("document path was not found")
	}
	if os.IsPermission(err) {
		return fmt.Errorf("document path cannot be accessed")
	}
	return fmt.Errorf("document path cannot be resolved")
}

// FileUtilsServiceAPI is the path-resolution contract consumed by application infrastructure.
type FileUtilsServiceAPI interface {
	GetAppConfigDir() (string, error)
	GetAppLogsDir() (string, error)
	GetAppDatabaseFilePath() (string, error)
}

// FileUtilsService resolves local paths for one build flavour.
type FileUtilsService struct {
	isDev bool
}

// NewFileUtilsService creates a local path resolver for development or production.
func NewFileUtilsService(isDev bool) *FileUtilsService {
	return &FileUtilsService{isDev: isDev}
}

// GetAppConfigDir returns the per-build configuration root without creating it.
func (service *FileUtilsService) GetAppConfigDir() (string, error) {
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configRoot, service.applicationName()), nil
}

// GetAppLogsDir returns the local directory reserved for rotating diagnostic logs.
func (service *FileUtilsService) GetAppLogsDir() (string, error) {
	configDir, err := service.GetAppConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "logs"), nil
}

// GetAppDatabaseFilePath returns the future SQLite settings database path.
func (service *FileUtilsService) GetAppDatabaseFilePath() (string, error) {
	configDir, err := service.GetAppConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, settingsDatabase), nil
}

func (service *FileUtilsService) applicationName() string {
	if service.isDev {
		return developmentAppName
	}

	return productionAppName
}
