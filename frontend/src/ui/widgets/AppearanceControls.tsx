import { useCallback, useEffect, useRef, useState } from 'react';

import { settingsAdapter } from '../../logic/adapter';
import {
  applyThemeToRoot,
  normalizeAppearance,
  normalizeTheme,
  resolveAppearance,
  type AppearanceChoice,
  type Theme,
} from '../../logic/theme/theme';
import AppearanceDialog from './AppearanceDialog';
import SettingsMenu from './SettingsMenu';
import styles from './AppearanceControls.module.css';

interface AppearanceState {
  defaultOpenMode: string;
  mode: AppearanceChoice;
  theme: Theme;
}

interface AppearanceControlsProps {
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
  visible = true,
}: AppearanceControlsProps): React.JSX.Element | null => {
  const [appearance, setAppearance] = useState<AppearanceState>({
    defaultOpenMode: 'editor',
    mode: 'auto',
    theme: 'material',
  });
  const [open, setOpen] = useState(false);
  const desiredAppearance = useRef(appearance);
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
      })
      .catch((): void => {
        apply(desiredAppearance.current);
      });
  }, []);

  const persist = useCallback(
    (patch: Partial<Pick<AppearanceState, 'mode' | 'theme'>>): void => {
      const next = { ...desiredAppearance.current, ...patch };
      desiredAppearance.current = next;
      writeChain.current = writeChain.current
        .then(async (): Promise<void> => settingsAdapter.updateAppearance(next))
        .then((): void => {
          setAppearance(next);
          apply(next);
        })
        .catch((): void => undefined);
    },
    [],
  );

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.controls}>
      <SettingsMenu
        mode={appearance.mode}
        theme={appearance.theme}
        onModeChange={(mode): void => {
          persist({ mode });
        }}
        onOpenAppearance={(): void => {
          setOpen(true);
        }}
        onThemeChange={(theme): void => {
          persist({ theme });
        }}
      />
      <AppearanceDialog
        mode={appearance.mode}
        open={open}
        theme={appearance.theme}
        onModeChange={(mode): void => {
          persist({ mode });
        }}
        onOpenChange={setOpen}
        onThemeChange={(theme): void => {
          persist({ theme });
        }}
      />
    </div>
  );
};

export default AppearanceControls;
