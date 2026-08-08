package application

import "context"

// OpenFileDialogOptions is the composition-root-neutral native picker contract.
type OpenFileDialogOptions struct {
	Title   string
	Filters []FileFilter
}

type FileFilter struct {
	DisplayName string
	Pattern     string
}

type OpenFilePicker func(context.Context) (string, error)

// DocumentDialogs adapts one injected native picker. It owns no application model state.
type DocumentDialogs struct {
	openFile OpenFilePicker
}

func NewDocumentDialogs(openFile OpenFilePicker) *DocumentDialogs {
	return &DocumentDialogs{openFile: openFile}
}

func (dialogs *DocumentDialogs) ChooseOpenFile(ctx context.Context) (string, error) {
	if dialogs == nil || dialogs.openFile == nil {
		return "", nil
	}
	return dialogs.openFile(ctx)
}

var _ interface {
	ChooseOpenFile(context.Context) (string, error)
} = (*DocumentDialogs)(nil)
