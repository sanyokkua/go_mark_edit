package appmodel

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/workspace"
)

const maxWorkspaceEntries = 20_000

// CreateWorkspaceFile writes exactly the supplied name and republishes the tree.
func (service *AppModelService) CreateWorkspaceFile(ctx context.Context, parentPath, name string) apperr.WorkspaceResult {
	return service.createWorkspaceEntry(ctx, parentPath, name, false)
}

// CreateWorkspaceFolder adds a directory and republishes the tree.
func (service *AppModelService) CreateWorkspaceFolder(ctx context.Context, parentPath, name string) apperr.WorkspaceResult {
	return service.createWorkspaceEntry(ctx, parentPath, name, true)
}

func (service *AppModelService) createWorkspaceEntry(ctx context.Context, parentPath, name string, directory bool) apperr.WorkspaceResult {
	service.workspaceMu.Lock()
	defer service.workspaceMu.Unlock()
	service.mu.RLock()
	current := cloneWorkspaceSnapshot(service.state.workspace)
	service.mu.RUnlock()
	if current == nil {
		return workspaceClassifiedRefusal(apperr.ClassifiedNotFound, "folder", "There is no open folder.", "")
	}
	if name == "" || name == "." || name == ".." || strings.HasPrefix(name, ".") || strings.ContainsAny(name, `/\`) {
		return workspaceClassifiedRefusal(apperr.ClassifiedUnsupportedInput, name, "The entry name is not valid.", "")
	}
	parent, err := file.CanonicalizeDirectoryPath(parentPath)
	if err != nil {
		return workspaceClassifiedRefusal(apperr.ClassifiedUnsupportedInput, parentPath, "The parent is not a folder in this workspace.", "")
	}
	relative, err := filepath.Rel(current.RootPath, parent)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return workspaceClassifiedRefusal(apperr.ClassifiedUnsupportedInput, parentPath, "The parent is outside this workspace.", "")
	}
	path := filepath.Join(parent, name)
	if _, err := os.Lstat(path); err == nil {
		return workspaceClassifiedRefusal(apperr.ClassifiedConflict, name, "An entry with this name already exists.", "")
	} else if !errors.Is(err, os.ErrNotExist) {
		return workspaceClassifiedRefusal(apperr.ClassifiedIOFailure, name, "The entry could not be inspected.", "")
	}
	if directory {
		err = os.Mkdir(path, 0o755)
	} else {
		var handle *os.File
		handle, err = os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err == nil {
			err = handle.Close()
		}
	}
	if errors.Is(err, os.ErrExist) {
		return workspaceClassifiedRefusal(apperr.ClassifiedConflict, name, "An entry with this name already exists.", "")
	}
	if err != nil {
		return workspaceClassifiedRefusal(apperr.ClassifiedIOFailure, name, "The entry could not be created.", "")
	}
	built, err := workspace.Build(current.RootPath, maxWorkspaceEntries, current.ShowHiddenFolders)
	if err != nil {
		return workspacePathRefusal(current.RootPath, err)
	}
	next := workspaceSnapshot(built, current.ShowHiddenFolders)
	service.mu.Lock()
	before := service.snapshotLocked()
	service.state.workspace = &next
	service.state.revision++
	patch := apperr.AppStatePatch{Revision: service.state.revision, Workspace: &apperr.WorkspacePatch{Snapshot: cloneWorkspaceSnapshot(service.state.workspace)}}
	publicationErr := service.publishCommittedLocked(ctx, before, patch)
	result := apperr.WorkspaceResult{Status: apperr.WorkspaceStatusOpened, Workspace: cloneWorkspaceSnapshot(service.state.workspace)}
	if publicationErr != nil {
		classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, path, "The entry was created, but the tree update could not be delivered. Refresh the workspace.", apperr.RemediationNone, "")
		result.Error = classified
		result.Failure = bridge.FailureFromClassified(classified)
	}
	service.mu.Unlock()
	return result
}

// ClassifyDroppedPaths inspects input paths without opening them or changing state.
func (service *AppModelService) ClassifyDroppedPaths(_ context.Context, paths []string) apperr.DropClassificationResult {
	result := apperr.DropClassificationResult{
		Files: []string{}, Folders: []string{}, Unsupported: []string{},
	}
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			result.Unsupported = append(result.Unsupported, path)
			continue
		}
		if info.IsDir() {
			canonical, err := file.CanonicalizeDirectoryPath(path)
			if err != nil {
				result.Unsupported = append(result.Unsupported, path)
			} else {
				result.Folders = append(result.Folders, canonical)
			}
			continue
		}
		if info.Mode().IsRegular() && file.IsSupportedDocumentSuffix(path) {
			result.Files = append(result.Files, path)
		} else {
			result.Unsupported = append(result.Unsupported, path)
		}
	}
	return result
}

// WorkspaceFolderDialog provides the native folder selection without opening it.
type WorkspaceFolderDialog interface {
	ChooseFolder(context.Context) (string, error)
}

// ChooseWorkspaceFolder returns a canonical choice while leaving session state untouched.
func (service *AppModelService) ChooseWorkspaceFolder(ctx context.Context) apperr.FolderChoiceOutcome {
	service.mu.RLock()
	dialog := service.folderDialog
	service.mu.RUnlock()
	if dialog == nil {
		return folderChoiceRefused(bridge.ClassifiedWithID(apperr.ClassifiedSystemCommandFailure, "folder", "The folder picker is unavailable.", apperr.RemediationRetry, ""))
	}
	path, err := dialog.ChooseFolder(ctx)
	if err != nil {
		return folderChoiceRefused(bridge.ClassifiedWithID(apperr.ClassifiedSystemCommandFailure, "folder", "The folder picker could not be opened.", apperr.RemediationRetry, ""))
	}
	if path == "" {
		return apperr.FolderChoiceResult{Status: apperr.FolderChoiceStatusCancelled}
	}
	canonical, err := file.CanonicalizeDirectoryPath(path)
	if err != nil {
		return folderChoiceRefused(classifyWorkspacePathError(path, err))
	}
	return apperr.FolderChoiceResult{Status: apperr.FolderChoiceStatusChosen, Path: canonical}
}

func folderChoiceRefused(classified *apperr.ClassifiedError) apperr.FolderChoiceResult {
	return apperr.FolderChoiceResult{Status: apperr.FolderChoiceStatusRefused, Error: classified, Failure: bridge.FailureFromClassified(classified)}
}

// SetWorkspaceHiddenFolders persists the app-wide setting and rebuilds only this window.
func (service *AppModelService) SetWorkspaceHiddenFolders(ctx context.Context, show bool) apperr.WorkspaceOutcome {
	service.workspaceMu.Lock()
	defer service.workspaceMu.Unlock()

	service.mu.Lock()
	current := cloneWorkspaceSnapshot(service.state.workspace)
	if current == nil {
		service.mu.Unlock()
		return workspaceClassifiedRefusal(apperr.ClassifiedNotFound, "folder", "There is no open folder to update.", "")
	}
	service.sequence++
	candidate := VersionedLayoutValue{Version: 1, Value: show, ChangedAtUnixNano: time.Now().UnixNano(), WriterID: service.writerID, Sequence: service.sequence}
	layoutRepository := service.layout
	service.mu.Unlock()
	if layoutRepository == nil {
		return workspacePersistenceRefusal("The folder visibility setting could not be saved.")
	}
	if _, err := layoutRepository.Write(ctx, LayoutWorkspaceHiddenFolders, candidate); err != nil {
		return workspacePersistenceRefusal("The folder visibility setting could not be saved.")
	}
	showHiddenFolders, err := readShowHiddenFolders(ctx, layoutRepository)
	if err != nil {
		return workspacePersistenceRefusal("The folder visibility setting could not be read.")
	}
	built, err := workspace.Build(current.RootPath, maxWorkspaceEntries, showHiddenFolders)
	if err != nil {
		classified := classifyWorkspacePathError(current.RootPath, err)
		if publishErr := service.markWorkspaceUnavailable(ctx); publishErr != nil {
			return workspacePublicationRefusal("The unavailable folder state could not be published.")
		}
		return workspaceRefused(classified)
	}
	next := workspaceSnapshot(built, showHiddenFolders)
	service.mu.Lock()
	before := service.snapshotLocked()
	service.state.workspace = &next
	service.state.revision++
	patch := apperr.AppStatePatch{Revision: service.state.revision, Workspace: &apperr.WorkspacePatch{Snapshot: cloneWorkspaceSnapshot(service.state.workspace)}}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return workspacePublicationRefusal("The updated folder state could not be published.")
	}
	result := apperr.WorkspaceResult{Status: apperr.WorkspaceStatusOpened, Workspace: cloneWorkspaceSnapshot(service.state.workspace)}
	service.mu.Unlock()
	return result
}

// OpenWorkspace canonicalizes and reads one folder into the session-only tree.
func (service *AppModelService) OpenWorkspace(ctx context.Context, path string) apperr.WorkspaceOutcome {
	service.workspaceMu.Lock()
	defer service.workspaceMu.Unlock()
	if strings.TrimSpace(path) == "" {
		return workspaceClassifiedRefusal(apperr.ClassifiedUnsupportedInput, "folder", "A folder path is required.", "")
	}

	canonicalRoot, err := file.CanonicalizeDirectoryPath(path)
	if err != nil {
		return workspacePathRefusal(path, err)
	}

	service.mu.RLock()
	if current := service.state.workspace; current != nil && current.RootPath == canonicalRoot {
		result := apperr.WorkspaceResult{Status: apperr.WorkspaceStatusUnchanged, Workspace: cloneWorkspaceSnapshot(current)}
		service.mu.RUnlock()
		return result
	}
	layoutRepository := service.layout
	recentItems := service.recentItems
	service.mu.RUnlock()

	showHiddenFolders, err := readShowHiddenFolders(ctx, layoutRepository)
	if err != nil {
		return workspacePersistenceRefusal("The folder could not be opened because its visibility setting could not be read.")
	}
	built, err := workspace.Build(canonicalRoot, maxWorkspaceEntries, showHiddenFolders)
	if err != nil {
		return workspacePathRefusal(canonicalRoot, err)
	}
	next := workspaceSnapshot(built, showHiddenFolders)

	var promoted []apperr.RecentItem
	var promotionWarning *apperr.ClassifiedError
	if recentItems != nil {
		promoted, err = recentItems.Promote(ctx, canonicalRoot, "folder")
		if err != nil {
			promotionWarning = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, canonicalRoot, "The folder opened successfully, but Recent Items could not be updated.", apperr.RemediationNone, "recent-items")
		}
	}

	service.mu.Lock()
	before := service.snapshotLocked()
	service.state.workspace = &next
	if recentItems == nil {
		service.state.recentItems = promoteRecentItem(service.state.recentItems, canonicalRoot, "folder")
	} else if promotionWarning == nil {
		service.state.recentItems = append([]apperr.RecentItem(nil), promoted...)
	}
	service.updateCanReopenLastFileLocked()
	service.state.revision++
	patch := apperr.AppStatePatch{
		Revision:          service.state.revision,
		Workspace:         &apperr.WorkspacePatch{Snapshot: cloneWorkspaceSnapshot(service.state.workspace)},
		RecentItems:       append([]apperr.RecentItem(nil), service.state.recentItems...),
		CanReopenLastFile: pointerTo(service.state.canReopenLastFile),
	}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return workspacePublicationRefusal("The folder opened, but its state could not be published.")
	}
	result := apperr.WorkspaceResult{
		Status:    apperr.WorkspaceStatusOpened,
		Workspace: cloneWorkspaceSnapshot(service.state.workspace),
		Error:     promotionWarning,
		Failure:   bridge.FailureFromClassified(promotionWarning),
	}
	service.mu.Unlock()
	return result
}

// RefreshWorkspace rebuilds the current tree. A failed build retains its last
// contents and publishes an unavailable marker so the UI can offer recovery.
func (service *AppModelService) RefreshWorkspace(ctx context.Context) apperr.WorkspaceOutcome {
	service.workspaceMu.Lock()
	defer service.workspaceMu.Unlock()

	service.mu.RLock()
	current := cloneWorkspaceSnapshot(service.state.workspace)
	layoutRepository := service.layout
	service.mu.RUnlock()
	if current == nil {
		return workspaceClassifiedRefusal(apperr.ClassifiedNotFound, "folder", "There is no open folder to refresh.", "")
	}

	showHiddenFolders, err := readShowHiddenFolders(ctx, layoutRepository)
	if err != nil {
		classified := workspacePersistenceError("The folder could not be refreshed because its visibility setting could not be read.")
		if publishErr := service.markWorkspaceUnavailable(ctx); publishErr != nil {
			return workspacePublicationRefusal("The unavailable folder state could not be published.")
		}
		return workspaceRefused(classified)
	}
	built, err := workspace.Build(current.RootPath, maxWorkspaceEntries, showHiddenFolders)
	if err != nil {
		classified := classifyWorkspacePathError(current.RootPath, err)
		if publishErr := service.markWorkspaceUnavailable(ctx); publishErr != nil {
			return workspacePublicationRefusal("The unavailable folder state could not be published.")
		}
		return workspaceRefused(classified)
	}
	next := workspaceSnapshot(built, showHiddenFolders)
	service.mu.Lock()
	before := service.snapshotLocked()
	service.state.workspace = &next
	service.state.revision++
	patch := apperr.AppStatePatch{
		Revision:  service.state.revision,
		Workspace: &apperr.WorkspacePatch{Snapshot: cloneWorkspaceSnapshot(service.state.workspace)},
	}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return workspacePublicationRefusal("The refreshed folder state could not be published.")
	}
	result := apperr.WorkspaceResult{Status: apperr.WorkspaceStatusOpened, Workspace: cloneWorkspaceSnapshot(service.state.workspace)}
	service.mu.Unlock()
	return result
}

// CloseWorkspace clears the session-only tree and sends an explicit null patch.
func (service *AppModelService) CloseWorkspace(ctx context.Context) apperr.ClassifiedVoidResult {
	service.workspaceMu.Lock()
	defer service.workspaceMu.Unlock()

	service.mu.Lock()
	if service.state.workspace == nil {
		service.mu.Unlock()
		return apperr.ClassifiedVoidResult{}
	}
	before := service.snapshotLocked()
	service.state.workspace = nil
	service.state.revision++
	patch := apperr.AppStatePatch{
		Revision:  service.state.revision,
		Workspace: &apperr.WorkspacePatch{Snapshot: nil},
	}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "folder", "The folder could not be closed in the current view.", apperr.RemediationRetry, "")
		return apperr.ClassifiedVoidResult{Failure: bridge.FailureFromClassified(classified), Error: classified}
	}
	service.mu.Unlock()
	return apperr.ClassifiedVoidResult{}
}

func (service *AppModelService) markWorkspaceUnavailable(ctx context.Context) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.state.workspace == nil || service.state.workspace.Unavailable {
		return nil
	}
	before := service.snapshotLocked()
	next := cloneWorkspaceSnapshot(service.state.workspace)
	next.Unavailable = true
	service.state.workspace = next
	service.state.revision++
	patch := apperr.AppStatePatch{
		Revision:  service.state.revision,
		Workspace: &apperr.WorkspacePatch{Snapshot: cloneWorkspaceSnapshot(service.state.workspace)},
	}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.logger.Error().Err(err).Msg("could not publish unavailable workspace state")
		return err
	}
	return nil
}

func readShowHiddenFolders(ctx context.Context, repository LayoutRepositoryAPI) (bool, error) {
	if repository == nil {
		return false, errors.New("workspace layout repository is not configured")
	}
	stored, found, err := repository.Read(ctx, LayoutWorkspaceHiddenFolders)
	if err != nil {
		return false, err
	}
	if !found {
		return false, nil
	}
	showHiddenFolders, ok := stored.Value.(bool)
	if !ok {
		return false, errors.New("workspace hidden-folders setting has an invalid type")
	}
	return showHiddenFolders, nil
}

func workspaceSnapshot(snapshot workspace.Snapshot, showHiddenFolders bool) apperr.WorkspaceSnapshot {
	return apperr.WorkspaceSnapshot{
		RootPath:          snapshot.RootPath,
		RootName:          snapshot.Root.Name,
		Root:              workspaceNode(snapshot.Root),
		TotalEntries:      snapshot.TotalEntries,
		Truncated:         snapshot.Truncated,
		FilterSuffixes:    file.SupportedDocumentSuffixes(),
		ShowHiddenFolders: showHiddenFolders,
	}
}

func workspaceNode(node workspace.Node) apperr.WorkspaceNode {
	result := apperr.WorkspaceNode{Path: node.Path, Name: node.Name, IsDir: node.IsDir, Unreadable: node.Unreadable}
	if len(node.Children) > 0 {
		result.Children = make([]apperr.WorkspaceNode, len(node.Children))
		for index, child := range node.Children {
			result.Children[index] = workspaceNode(child)
		}
	}
	return result
}

func cloneWorkspaceSnapshot(snapshot *apperr.WorkspaceSnapshot) *apperr.WorkspaceSnapshot {
	if snapshot == nil {
		return nil
	}
	copy := *snapshot
	copy.FilterSuffixes = append([]string(nil), snapshot.FilterSuffixes...)
	copy.Root = cloneWorkspaceNode(snapshot.Root)
	return &copy
}

func cloneWorkspaceNode(node apperr.WorkspaceNode) apperr.WorkspaceNode {
	copy := node
	if node.Children != nil {
		copy.Children = make([]apperr.WorkspaceNode, len(node.Children))
		for index, child := range node.Children {
			copy.Children[index] = cloneWorkspaceNode(child)
		}
	}
	return copy
}

func workspacePathRefusal(path string, err error) apperr.WorkspaceOutcome {
	return workspaceRefused(classifyWorkspacePathError(path, err))
}

func classifyWorkspacePathError(_ string, err error) *apperr.ClassifiedError {
	category := apperr.ClassifiedIOFailure
	message := "The folder could not be read."
	remediation := apperr.RemediationRetry
	switch {
	case errors.Is(err, os.ErrNotExist):
		category = apperr.ClassifiedNotFound
		message = "The folder could not be found."
		remediation = apperr.RemediationNone
	case errors.Is(err, os.ErrPermission):
		category = apperr.ClassifiedPermissionDenied
		message = "The folder cannot be accessed."
		remediation = apperr.RemediationNone
	case errors.Is(err, file.ErrNotDirectory):
		category = apperr.ClassifiedUnsupportedInput
		message = "The selected path is not a folder."
		remediation = apperr.RemediationNone
	}
	return bridge.ClassifiedWithID(category, "folder", message, remediation, "")
}

func workspacePersistenceError(message string) *apperr.ClassifiedError {
	return bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, "folder", message, apperr.RemediationNone, "")
}

func workspacePersistenceRefusal(message string) apperr.WorkspaceOutcome {
	return workspaceRefused(workspacePersistenceError(message))
}

func workspacePublicationRefusal(message string) apperr.WorkspaceOutcome {
	classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "folder", message, apperr.RemediationRetry, "")
	return workspaceRefused(classified)
}

func workspaceRefused(classified *apperr.ClassifiedError) apperr.WorkspaceOutcome {
	return apperr.WorkspaceResult{Status: apperr.WorkspaceStatusRefused, Error: classified, Failure: bridge.FailureFromClassified(classified)}
}

func workspaceClassifiedRefusal(category apperr.ClassifiedErrorCategory, subject, message, documentID string) apperr.WorkspaceOutcome {
	return workspaceRefused(bridge.ClassifiedWithID(category, subject, message, apperr.RemediationNone, documentID))
}
