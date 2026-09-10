package appmodel

// These constructors keep the white-box appmodel tests focused on state shape
// without restoring test-only constructors to the production package API.
func NewAppModelService(options ...AppModelOption) *AppModelService {
	return newAppModelService(options...)
}

func NewEmptyAppModelService(options ...AppModelOption) *AppModelService {
	service := newAppModelService(options...)
	service.mu.Lock()
	service.state.documents = map[string]*openDocument{}
	service.state.orderedDocumentIDs = nil
	service.state.activeDocumentID = ""
	service.mu.Unlock()
	return service
}
