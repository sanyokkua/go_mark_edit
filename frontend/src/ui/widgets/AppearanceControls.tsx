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
import SettingsDialog from './SettingsDialog';
import {
  AppearanceSettingsContext,
  type AppearanceSettingsController,
  type AppearanceState,
} from './appearanceSettingsContext';

interface AppearanceControlsProps {
  children?: React.ReactNode;
  onSettingsOpenChange?: (open: boolean) => void;
  settingsOpen?: boolean;
  visible?: boolean;
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

const AppearanceControls: React.FC<AppearanceControlsProps> = ({
  children,
  onSettingsOpenChange,
  settingsOpen,
  visible = true,
}: AppearanceControlsProps): React.JSX.Element | null => {
  const [appearance, setAppearance] = useState<AppearanceState>({
    ...defaultAppearanceSettings,
  });
  const [internalOpen, setInternalOpen] = useState(false);
  const open = settingsOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onSettingsOpenChange?.(next);
  };
  const desiredAppearance = useRef(appearance);
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
        const next = {
          defaultOpenMode: settings.appearance.defaultOpenMode,
          mode: normalizeAppearance(settings.appearance.mode),
          theme: normalizeTheme(settings.appearance.theme),
        };
        desiredAppearance.current = next;
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
      const next = { ...desiredAppearance.current, ...patch };
      desiredAppearance.current = next;
      void settingsCommands
        .updateAppearance(next, {}, (acknowledged): void => {
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
    void settingsCommands
      .resetAppearance((acknowledged): void => {
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
  if (!visible) {
    return null;
  }
  const onOpenAppearance = (opener?: HTMLElement | null): void => {
    setSettingsReturnFocus(
      opener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null),
    );
    setOpen(true);
  };
  const controller: AppearanceSettingsController = {
    appearance,
    onModeChange: (mode): void => persist({ mode }),
    onOpenAppearance,
    onReset: reset,
    onThemeChange: (theme): void => persist({ theme }),
  };

  return (
    <AppearanceSettingsContext.Provider value={controller}>
      {children}
      <SettingsDialog
        mode={appearance.mode}
        open={open}
        returnFocusTo={settingsReturnFocus}
        theme={appearance.theme}
        onModeChange={controller.onModeChange}
        onReset={reset}
        onOpenChange={setOpen}
        onThemeChange={controller.onThemeChange}
      />
    </AppearanceSettingsContext.Provider>
  );
};

export default AppearanceControls;
