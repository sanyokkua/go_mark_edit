// Package appmodel owns GoMarkEdit's backend-authoritative live application state.
package appmodel

import "github.com/sanyokkua/go_mark_edit/internal/apperr"

const (
	// ArrangementEditor shows only the editor pane.
	ArrangementEditor = "editor"
	// ArrangementSplit shows both document panes.
	ArrangementSplit = "split"
	// ArrangementPreview shows only the preview pane.
	ArrangementPreview = "preview"
)

type openDocument struct {
	metadata     apperr.DocumentMetadata
	content      string
	baseline     string
	hasSavedView bool
}

type applicationState struct {
	revision         uint64
	documents        map[string]*openDocument
	activeDocumentID string
	ui               apperr.UILayout
}
