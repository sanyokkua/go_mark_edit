package application

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

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
type SaveFilePicker func(context.Context, appmodel.SaveDialogRequest) (string, error)
type OverwriteConfirmer func(context.Context, string) (bool, error)

// DocumentDialogs adapts one injected native picker. It owns no application model state.
type DocumentDialogs struct {
	openFile         OpenFilePicker
	saveFile         SaveFilePicker
	confirmOverwrite OverwriteConfirmer
}

func NewDocumentDialogs(openFile OpenFilePicker) *DocumentDialogs {
	return &DocumentDialogs{openFile: openFile}
}

func NewDocumentDialogsWithSave(saveFile SaveFilePicker, confirmOverwrite OverwriteConfirmer) *DocumentDialogs {
	return &DocumentDialogs{saveFile: saveFile, confirmOverwrite: confirmOverwrite}
}

func (dialogs *DocumentDialogs) SetSaveFilePicker(saveFile SaveFilePicker) {
	if dialogs != nil {
		dialogs.saveFile = saveFile
	}
}

func (dialogs *DocumentDialogs) SetOverwriteConfirmer(confirmOverwrite OverwriteConfirmer) {
	if dialogs != nil {
		dialogs.confirmOverwrite = confirmOverwrite
	}
}

func (dialogs *DocumentDialogs) ChooseOpenFile(ctx context.Context) (string, error) {
	if dialogs == nil || dialogs.openFile == nil {
		return "", nil
	}
	return dialogs.openFile(ctx)
}

func (dialogs *DocumentDialogs) ChooseSaveFile(ctx context.Context, request appmodel.SaveDialogRequest) (string, error) {
	if dialogs == nil || dialogs.saveFile == nil {
		return "", nil
	}
	return dialogs.saveFile(ctx, request)
}

func (dialogs *DocumentDialogs) ConfirmOverwrite(ctx context.Context, subject string) (bool, error) {
	if dialogs == nil || dialogs.confirmOverwrite == nil {
		return false, nil
	}
	return dialogs.confirmOverwrite(ctx, subject)
}

var _ interface {
	ChooseOpenFile(context.Context) (string, error)
} = (*DocumentDialogs)(nil)

var _ interface {
	ChooseSaveFile(context.Context, appmodel.SaveDialogRequest) (string, error)
	ConfirmOverwrite(context.Context, string) (bool, error)
} = (*DocumentDialogs)(nil)
