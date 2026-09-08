// Package file resolves the local application paths used by infrastructure services.
package file

import (
	"os"
	"path/filepath"
)

const (
	productionAppName  = "GoMarkEdit"
	developmentAppName = "GoMarkEdit-Dev"
	settingsDatabase   = "settings.db"
)

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
