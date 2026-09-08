import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { settingsAdapter } from '../../logic/adapter';
import {
  applyThemeToRoot,
  normalizeAppearance,
  normalizeTheme,
  observeSystemAppearance,
  resolveAppearance,
  type AppearanceChoice,
  type Theme,
} from '../../logic/theme/theme';
import { writeStartupThemeMirror } from '../../logic/theme/startupThemeMirror';
import SettingsDialog from './SettingsDialog';
import SettingsMenu, { type SettingsMenuProps } from './SettingsMenu';
import styles from './AppearanceControls.module.css';

interface AppearanceState {
  defaultOpenMode: string;
  mode: AppearanceChoice;
  theme: Theme;
}

interface AppearanceControlsProps {
  onSettingsOpenChange?: (open: boolean) => void;
  settingsMenuRenderer?: React.ComponentType<SettingsMenuProps>;
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
  onSettingsOpenChange,
  settingsMenuRenderer: SettingsMenuRenderer,
  settingsOpen,
  visible = true,
}: AppearanceControlsProps): React.JSX.Element | null => {
  const [appearance, setAppearance] = useState<AppearanceState>({
    defaultOpenMode: 'editor',
    mode: 'auto',
    theme: 'material',
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
  const writeChain = useRef(Promise.resolve());

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
      writeChain.current = writeChain.current
        .then(async (): Promise<void> => settingsAdapter.updateAppearance(next))
        .then((): void => {
          setAppearance(next);
          apply(next);
          writeStartupThemeMirror(localStorage, {
            theme: next.theme,
            mode: next.mode,
          });
        })
        .catch((): void => undefined);
    },
    [],
  );
  const reset = useCallback((): void => {
    const next: AppearanceState = {
      defaultOpenMode: 'editor',
      mode: 'auto',
      theme: 'material',
    };
    void settingsAdapter
      .resetAppearance()
      .then((): void => {
        desiredAppearance.current = next;
        setAppearance(next);
        apply(next);
        writeStartupThemeMirror(localStorage, {
          theme: next.theme,
          mode: next.mode,
        });
      })
      .catch((): void => undefined);
  }, []);

  if (!visible) {
    return null;
  }

  const settingsMenuProps: SettingsMenuProps = {
    mode: appearance.mode,
    theme: appearance.theme,
    onModeChange: (mode): void => {
      persist({ mode });
    },
    onOpenAppearance: (opener): void => {
      setSettingsReturnFocus(
        opener ??
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null),
      );
      setOpen(true);
    },
    onThemeChange: (theme): void => {
      persist({ theme });
    },
  };
  const menu =
    SettingsMenuRenderer === undefined ? (
      <div className={styles.controls}>
        <SettingsMenu {...settingsMenuProps} />
      </div>
    ) : (
      <SettingsMenuRenderer {...settingsMenuProps} />
    );

  return (
    <Fragment>
      {menu}
      <SettingsDialog
        mode={appearance.mode}
        open={open}
        returnFocusTo={settingsReturnFocus}
        theme={appearance.theme}
        onModeChange={(mode): void => {
          persist({ mode });
        }}
        onReset={reset}
        onOpenChange={setOpen}
        onThemeChange={(theme): void => {
          persist({ theme });
        }}
      />
    </Fragment>
  );
};

export default AppearanceControls;
