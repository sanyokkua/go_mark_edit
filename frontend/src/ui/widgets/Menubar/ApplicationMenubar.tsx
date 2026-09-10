import { useMemo } from 'react';

import { t } from '../../../i18n';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
  setViewArrangement,
} from '../../../logic/store/docViewCommands';
import { useAppDispatch, useAppSelector } from '../../../logic/store';
import { notifyError } from '../../../logic/store/notificationsSlice';
import { reportClassifiedError } from '../../../logic/store/classifiedNotification';
import { setWorkspaceVisible } from '../../../logic/store/uiLayoutCommands';
import type { ViewArrangement } from '../../../logic/store/appModelTypes';
import { parseError } from '../../../logic/utils/parseError';
import { useEditorSettings } from '../../../logic/settings/editorSettings';
import { useAppearanceSettings } from '../appearanceSettingsContext';
import type { ApplicationMenuTarget } from '../applicationMenuRequest';
import Menubar from './Menubar';
import type { SettingsMenuProps } from './SettingsMenu';
import type { ActionResult } from '../../../logic/actions/actionDispatcher';

export interface ApplicationMenuState {
  modalOpen: boolean;
  onAbout: () => void;
  onNewDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenRecentFile: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
  onReopenLastFile: (expectedTabSetRevision: number) => Promise<unknown>;
  onSave: () => Promise<unknown>;
  onSaveAs: () => Promise<unknown>;
  onCloseDocument: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
  onQuit: () => void;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  onShortcuts: () => void;
  requestedMenu: ApplicationMenuTarget | null;
  onRequestedMenuHandled: () => void;
}

export interface ApplicationMenubarProps {
  menuState: ApplicationMenuState;
}

const selfReportingActionIds: ReadonlySet<string> = new Set([
  'save',
  'save-as',
]);

export default function ApplicationMenubar({
  menuState,
}: ApplicationMenubarProps): React.JSX.Element {
  const dispatch = useAppDispatch();
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const recentFiles = useAppSelector(
    (state) => state.documents.recentFiles ?? [],
  );
  const canReopenLastFile = useAppSelector(
    (state) => state.documents.canReopenLastFile ?? false,
  );
  const appearanceSettings = useAppearanceSettings();
  const editorSettings = useEditorSettings();
  const settingsMenuProps: SettingsMenuProps = useMemo(
    () => ({
      defaultOpenMode: appearanceSettings.appearance.defaultOpenMode as
        'reading' | 'editor',
      editorSettings: editorSettings.settings,
      fileSettings: editorSettings.fileSettings,
      markdownSettings: editorSettings.markdownSettings,
      mode: appearanceSettings.appearance.mode,
      onEditorSettingsChange: (patch): void => {
        void editorSettings.update(patch).catch((): void => undefined);
      },
      onFileSettingsChange: (patch): void => {
        void editorSettings.updateFile(patch).catch((): void => undefined);
      },
      onMarkdownSettingsChange: (patch): void => {
        void editorSettings.updateMarkdown(patch).catch((): void => undefined);
      },
      onModeChange: appearanceSettings.onModeChange,
      onOpenAppearance: appearanceSettings.onOpenAppearance,
      onThemeChange: appearanceSettings.onThemeChange,
      theme: appearanceSettings.appearance.theme,
    }),
    [appearanceSettings, editorSettings],
  );

  return (
    <Menubar
      activeDocument={activeDocument}
      canReopenLastFile={canReopenLastFile}
      documentId={menuState.documentId}
      modalOpen={menuState.modalOpen}
      onAbout={menuState.onAbout}
      onActionResult={(result: ActionResult): void => {
        if (
          result.status === 'refused' &&
          !selfReportingActionIds.has(result.actionId)
        ) {
          reportClassifiedError(
            dispatch,
            result.error,
            t('notification.error.io.title'),
          );
        }
      }}
      onCloseDocument={
        activeDocument === undefined
          ? undefined
          : (): Promise<unknown> =>
              menuState.onCloseDocument(
                activeDocument.documentId,
                tabSetRevision,
              )
      }
      onNewDocument={(): Promise<unknown> =>
        menuState.onNewDocument(tabSetRevision)
      }
      onOpenDocument={(): Promise<unknown> =>
        menuState.onOpenDocument(tabSetRevision)
      }
      onOpenRecentFile={(path): Promise<unknown> =>
        menuState.onOpenRecentFile(path, tabSetRevision)
      }
      onQuit={menuState.onQuit}
      onReopenLastFile={(): Promise<unknown> =>
        menuState.onReopenLastFile(tabSetRevision)
      }
      onRequestedMenuHandled={menuState.onRequestedMenuHandled}
      onSave={menuState.onSave}
      onSaveAs={menuState.onSaveAs}
      onShortcuts={menuState.onShortcuts}
      recentFiles={recentFiles}
      requestedMenu={menuState.requestedMenu}
      sessionDocumentId={menuState.sessionDocumentId}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={{
        documentOpen: activeDocument !== undefined,
        arrangement: (activeDocument?.view.arrangement ??
          'split') as ViewArrangement,
        editorVisible: activeDocument?.view.editorVisible ?? true,
        lineNumbers: editorSettings.settings.lineNumbers,
        onArrangementChange: (arrangement): void => {
          void dispatch(setViewArrangement(arrangement));
        },
        onEditorVisibilityChange: (visible): void => {
          void dispatch(setEditorPaneVisible(visible));
        },
        onFullscreen: (): void => {
          void import('../../../logic/adapter').then(({ windowAdapter }) => {
            void windowAdapter.toggleFullscreen();
          });
        },
        onLineNumbersChange: (enabled): void => {
          void editorSettings.update({ lineNumbers: enabled });
        },
        onPreviewVisibilityChange: (visible): void => {
          void dispatch(setPreviewPaneVisible(visible));
        },
        onWordWrapChange: (enabled): void => {
          void editorSettings.update({ wordWrap: enabled });
        },
        previewVisible: activeDocument?.view.previewVisible ?? true,
        wordWrap: editorSettings.settings.wordWrap,
        workspaceVisible,
        onWorkspaceVisibilityChange: (visible): void => {
          void dispatch(setWorkspaceVisible(visible))
            .unwrap()
            .catch((error: unknown): void => {
              dispatch(notifyError(parseError(error)));
            });
        },
      }}
      writable={menuState.writable}
    />
  );
}
