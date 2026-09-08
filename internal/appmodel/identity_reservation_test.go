package appmodel

import "testing"

func TestCountNovelReservationsExcludesFocusedDocuments(t *testing.T) {
	reservations := map[string]*openReservation{
		"new":   {existingDocumentID: ""},
		"focus": {existingDocumentID: "doc-1"},
		"new-2": {existingDocumentID: ""},
	}
	if got := countNovelReservations(reservations); got != 2 {
		t.Fatalf("novel reservation count = %d, want 2", got)
	}
}
