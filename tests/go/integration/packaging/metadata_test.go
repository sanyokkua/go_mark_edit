package packaging_test

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"text/template"
)

type packageProject struct {
	Name           string `json:"name"`
	OutputFilename string `json:"outputfilename"`
	Info           struct {
		CompanyName      string     `json:"companyName"`
		ProductName      string     `json:"productName"`
		ProductVersion   string     `json:"productVersion"`
		Copyright        string     `json:"copyright"`
		Comments         string     `json:"comments"`
		FileAssociations []struct{} `json:"fileAssociations"`
		Protocols        []struct{} `json:"protocols"`
	} `json:"info"`
}

func renderPackageTemplate(t *testing.T, path string, project packageProject) []byte {
	t.Helper()
	tmpl, err := template.ParseFiles(path)
	if err != nil {
		t.Fatal(err)
	}
	var result bytes.Buffer
	if err := tmpl.Execute(&result, project); err != nil {
		t.Fatal(err)
	}
	return result.Bytes()
}

func TestRenderedBundlesCarryProductMetadata(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..")
	raw, err := os.ReadFile(filepath.Join(root, "wails.json"))
	if err != nil {
		t.Fatal(err)
	}
	var project packageProject
	if err := json.Unmarshal(raw, &project); err != nil {
		t.Fatal(err)
	}
	for _, path := range plists() {
		t.Run(filepath.Base(path), func(t *testing.T) {
			rendered := renderPackageTemplate(t, path, project)
			target := filepath.Join(t.TempDir(), "Info.plist")
			if err := os.WriteFile(target, rendered, 0600); err != nil {
				t.Fatal(err)
			}
			dict := rootDict(t, target)
			for key, want := range map[string]string{
				"CFBundleName":               "GoMarkEdit",
				"CFBundleIdentifier":         "io.github.sanyokkua.gomarkedit",
				"CFBundleVersion":            "1.0.0",
				"CFBundleShortVersionString": "1.0.0",
				"NSHumanReadableCopyright":   "Copyright (c) 2026 Oleksandr Kostenko",
			} {
				got := dictValue(dict, key)
				if got == nil || got.Text != want {
					t.Errorf("%s = %v, want %q", key, got, want)
				}
			}
		})
	}
	t.Run("Windows", func(t *testing.T) {
		info := renderPackageTemplate(t, filepath.Join(root, "build", "windows", "info.json"), project)
		var resource struct {
			Info map[string]map[string]string `json:"info"`
		}
		if err := json.Unmarshal(info, &resource); err != nil {
			t.Fatal(err)
		}
		for key, want := range map[string]string{"CompanyName": "Oleksandr Kostenko", "ProductName": "GoMarkEdit", "LegalCopyright": "Copyright (c) 2026 Oleksandr Kostenko"} {
			if got := resource.Info["0000"][key]; got != want {
				t.Errorf("%s = %q, want %q", key, got, want)
			}
		}
		rendered := renderPackageTemplate(t, filepath.Join(root, "build", "windows", "wails.exe.manifest"), project)
		var manifest struct {
			Identity struct {
				Name    string `xml:"name,attr"`
				Version string `xml:"version,attr"`
			} `xml:"assemblyIdentity"`
		}
		if err := xml.Unmarshal(rendered, &manifest); err != nil {
			t.Fatal(err)
		}
		if manifest.Identity.Name != "io.github.sanyokkua.gomarkedit" {
			t.Errorf("identity = %q", manifest.Identity.Name)
		}
		if !regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$`).MatchString(manifest.Identity.Version) {
			t.Errorf("Windows version = %q, want four numeric parts", manifest.Identity.Version)
		}
	})
}
