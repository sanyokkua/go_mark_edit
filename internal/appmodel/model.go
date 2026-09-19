// Package appmodel owns GoMarkEdit's backend-authoritative live application state.
package appmodel

import (
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

const (
	// ArrangementEditor shows only the editor pane.
	ArrangementEditor = "editor"
	// ArrangementSplit shows both document panes.
	ArrangementSplit = "split"
	// ArrangementPreview shows only the preview pane.
	ArrangementPreview = "preview"
)

type recentlyClosedDocument struct {
	path     string
	identity file.Identity
	view     apperr.DocView
}

type applicationState struct {
	revision           uint64
	tabSetRevision     uint64
	orderedDocumentIDs []string
	documents          map[string]*openDocument
	activeDocumentID   string
	ui                 apperr.UILayout
	recentFiles        []string
	canReopenLastFile  bool
	recentlyClosed     []recentlyClosedDocument
}
