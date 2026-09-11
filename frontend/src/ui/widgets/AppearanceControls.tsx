import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { settingsAdapter } from '../../logic/adapter';
import {
  applyThemeToRoot,
  normalizeAppearance,
  normalizeTheme,
  observeSystemAppearance,
  resolveAppearance,
} from '../../logic/theme/theme';
import { writeStartupThemeMirror } from '../../logic/theme/startupThemeMirror';
import {
  createSettingsCommandOwner,
  defaultAppearanceSettings,
} from '../../logic/settings/settingsCommands';
import SettingsDialog from './dialogs/SettingsDialog';
import {
  AppearanceSettingsContext,
  useAppearanceSettings,
  type AppearanceSettingsController,
  type AppearanceState,
} from './appearanceSettingsContext';

export interface AppearanceSettingsProviderProps {
  children?: React.ReactNode;
  onSettingsOpenChange?: (open: boolean) => void;
  settingsOpen?: boolean;
}

function systemPrefersDark(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
}

function apply(state: AppearanceState): void {
  applyThemeToRoot(
    {
      mode: resolveAppearance(state.mode, systemPrefersDark),
      theme: state.theme,
    },
    document,
  );
}

export const AppearanceSettingsProvider: React.FC<
  AppearanceSettingsProviderProps
> = ({
  children,
  onSettingsOpenChange,
  settingsOpen,
}: AppearanceSettingsProviderProps): React.JSX.Element => {
  const [appearance, setAppearance] = useState<AppearanceState>({
    ...defaultAppearanceSettings,
  });
  const [internalOpen, setInternalOpen] = useState(false);
  const open = settingsOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean): void => {
      setInternalOpen(next);
      onSettingsOpenChange?.(next);
    },
    [onSettingsOpenChange],
  );
  const desiredAppearance = useRef(appearance);
  const appearanceWriteStarted = useRef(false);
  const appearanceWriteSucceeded = useRef(false);
  const [settingsReturnFocus, setSettingsReturnFocus] =
    useState<HTMLElement | null>(null);
  const settingsCommands = useMemo(
    () => createSettingsCommandOwner(settingsAdapter),
    [],
  );

  useEffect((): void => {
    void settingsAdapter
      .getSettings()
      .then((settings): void => {
        // GetSettings reads several persisted groups. A user write can finish
        // while that startup read is still assembling its older snapshot.
        if (appearanceWriteSucceeded.current) return;

        const next = {
          defaultOpenMode: settings.appearance.defaultOpenMode,
          mode: normalizeAppearance(settings.appearance.mode),
          theme: normalizeTheme(settings.appearance.theme),
        };
        if (!appearanceWriteStarted.current) {
          desiredAppearance.current = next;
        }
        setAppearance(next);
        apply(next);
        writeStartupThemeMirror(localStorage, {
          theme: next.theme,
          mode: next.mode,
        });
      })
      .catch((): void => {
        apply(desiredAppearance.current);
      });
  }, []);

  useEffect((): (() => void) => {
    if (typeof window.matchMedia !== 'function') {
      return (): void => undefined;
    }
    return observeSystemAppearance(
      appearance.mode,
      (query): MediaQueryList => window.matchMedia(query),
      (mode): void =>
        applyThemeToRoot({ mode, theme: appearance.theme }, document),
    );
  }, [appearance.mode, appearance.theme]);

  useEffect((): void => {
    if (!open && settingsReturnFocus?.isConnected === true) {
      settingsReturnFocus.focus();
    }
  }, [open, settingsReturnFocus]);

  const persist = useCallback(
    (patch: Partial<Pick<AppearanceState, 'mode' | 'theme'>>): void => {
      appearanceWriteStarted.current = true;
      const next = { ...desiredAppearance.current, ...patch };
      desiredAppearance.current = next;
      void settingsCommands
        .updateAppearance(next, {}, (acknowledged): void => {
          appearanceWriteSucceeded.current = true;
          const acknowledgedState: AppearanceState = {
            defaultOpenMode: acknowledged.defaultOpenMode,
            mode: normalizeAppearance(acknowledged.mode),
            theme: normalizeTheme(acknowledged.theme),
          };
          setAppearance(acknowledgedState);
          apply(acknowledgedState);
          writeStartupThemeMirror(localStorage, {
            theme: acknowledgedState.theme,
            mode: acknowledgedState.mode,
          });
        })
        .catch((): void => undefined);
    },
    [settingsCommands],
  );

  const reset = useCallback((): void => {
    appearanceWriteStarted.current = true;
    void settingsCommands
      .resetAppearance((acknowledged): void => {
        appearanceWriteSucceeded.current = true;
        const acknowledgedState: AppearanceState = {
          defaultOpenMode: acknowledged.defaultOpenMode,
          mode: normalizeAppearance(acknowledged.mode),
          theme: normalizeTheme(acknowledged.theme),
        };
        desiredAppearance.current = acknowledgedState;
        setAppearance(acknowledgedState);
        apply(acknowledgedState);
        writeStartupThemeMirror(localStorage, {
          theme: acknowledgedState.theme,
          mode: acknowledgedState.mode,
        });
      })
      .catch((): void => undefined);
  }, [settingsCommands]);

  const onOpenAppearance = useCallback(
    (opener?: HTMLElement | null): void => {
      setSettingsReturnFocus(
        opener ??
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null),
      );
      setOpen(true);
    },
    [setOpen],
  );

  const controller: AppearanceSettingsController = {
    appearance,
    onModeChange: (mode): void => persist({ mode }),
    onOpenAppearance,
    onOpenChange: setOpen,
    onReset: reset,
    open,
    returnFocusTo: settingsReturnFocus,
    onThemeChange: (theme): void => persist({ theme }),
  };

  return (
    <AppearanceSettingsContext.Provider value={controller}>
      {children}
    </AppearanceSettingsContext.Provider>
  );
};

export interface AppearanceControlsContentProps {
  children?: React.ReactNode;
  visible?: boolean;
}

export const AppearanceControlsContent: React.FC<
  AppearanceControlsContentProps
> = ({ children, visible = true }: AppearanceControlsContentProps) => {
  const controller = useAppearanceSettings();
  if (!visible) return null;
  return (
    <>
      {children}
      <SettingsDialog
        mode={controller.appearance.mode}
        open={controller.open}
        returnFocusTo={controller.returnFocusTo}
        theme={controller.appearance.theme}
        onModeChange={controller.onModeChange}
        onReset={controller.onReset}
        onOpenChange={controller.onOpenChange}
        onThemeChange={controller.onThemeChange}
      />
    </>
  );
};

interface AppearanceControlsProps extends AppearanceSettingsProviderProps {
  children?: React.ReactNode;
  visible?: boolean;
}

const AppearanceControls: React.FC<AppearanceControlsProps> = ({
  children,
  onSettingsOpenChange,
  settingsOpen,
  visible = true,
}: AppearanceControlsProps): React.JSX.Element => (
  <AppearanceSettingsProvider
    onSettingsOpenChange={onSettingsOpenChange}
    settingsOpen={settingsOpen}
  >
    <AppearanceControlsContent visible={visible}>
      {children}
    </AppearanceControlsContent>
  </AppearanceSettingsProvider>
);

export default AppearanceControls;
