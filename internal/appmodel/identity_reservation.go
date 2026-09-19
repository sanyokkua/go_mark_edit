package appmodel

import "github.com/sanyokkua/go_mark_edit/internal/file"

// OpenPreparation is an opaque process-local reservation token. The canonical path and source
// classification remain backend-owned until the token is committed or cancelled.
type OpenPreparation struct {
	ReservationID string
}

type openReservation struct {
	id                  string
	identity            file.Identity
	expectedTabRevision uint64
	canonical           file.CanonicalDocumentPath
	read                file.ClassifiedRead
	version             file.DiskVersion
	rawHash             string
	existingDocumentID  string
	arrangement         string
}

func countNovelReservations(reservations map[string]*openReservation) int {
	count := 0
	for _, reservation := range reservations {
		if reservation.existingDocumentID == "" {
			count++
		}
	}
	return count
}
