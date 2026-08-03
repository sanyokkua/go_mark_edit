import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../i18n';
import {
  createShellActionCatalogue,
  dispatchShellAction,
  type ShellAction,
} from '../../logic/actions/shellActions';
import { useShellShortcuts } from '../../logic/actions/useShellShortcuts';
import { windowAdapter } from '../../logic/adapter';
import ViewMenu, { type ViewMenuProps } from '../primitives/ViewMenu';
import SettingsMenu, { type SettingsMenuProps } from './SettingsMenu';
import styles from './ShellMenuRow.module.css';

interface ShellMenuRowProps {
  modalOpen: boolean;
  onAbout: () => void;
  settingsMenuProps: SettingsMenuProps;
  toggleFullscreen?: () => Promise<boolean>;
  viewMenuProps?: ViewMenuProps;
}

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 376;
}

const ShellMenuRow: React.FC<ShellMenuRowProps> = ({
  modalOpen,
  onAbout,
  settingsMenuProps,
  toggleFullscreen = windowAdapter.toggleFullscreen,
  viewMenuProps,
}: ShellMenuRowProps): React.JSX.Element => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const pendingViewOpen = useRef<boolean | null>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect((): (() => void) => {
    const onResize = (): void => setNarrow(isNarrowViewport());
    window.addEventListener('resize', onResize);
    return (): void => window.removeEventListener('resize', onResize);
  }, []);

  useEffect((): void => {
    pendingViewOpen.current = null;
  }, [viewOpen]);

  const actions = useMemo(
    () =>
      createShellActionCatalogue({
        modalOpen,
        viewAvailable: viewMenuProps !== undefined,
        openSettings: (): void => {
          setViewOpen(false);
          setSettingsOpen((open) => !open);
        },
        openView: (): void => {
          setSettingsOpen(false);
          setViewOpen((open) => !open);
        },
        openAbout: (): void => {
          setSettingsOpen(false);
          setViewOpen(false);
          setOverflowOpen(false);
          onAbout();
        },
        toggleFullscreen,
      }),
    [modalOpen, onAbout, toggleFullscreen, viewMenuProps],
  );
  useShellShortcuts(actions);

  const menuActions = actions.filter(
    (action): boolean =>
      action.id !== 'fullscreen' &&
      (action.id !== 'view' || viewMenuProps !== undefined),
  );
  const action = (id: ShellAction['id']): ShellAction => {
    const found = actions.find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error(`Missing shell action: ${id}`);
    }
    return found;
  };
  const dispatch = (selected: ShellAction): void => {
    void dispatchShellAction(selected);
  };
  const requestViewOpen = (open: boolean): void => {
    if (open === viewOpen || pendingViewOpen.current === open) {
      return;
    }
    pendingViewOpen.current = open;
    dispatch(action('view'));
  };

  return (
    <nav aria-label={t('shell.menuLabel')} className={styles.row}>
      {narrow ? (
        <DropdownMenu.Root
          open={!modalOpen && overflowOpen}
          onOpenChange={setOverflowOpen}
        >
          <DropdownMenu.Trigger asChild>
            <button
              ref={overflowTriggerRef}
              aria-label={t('shell.overflow')}
              className={styles.trigger}
              data-settings-overflow
              type="button"
            >
              <span aria-hidden="true">•••</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              aria-label={t('shell.menuLabel')}
              className={styles.overflow}
            >
              {menuActions.map((item) => (
                <DropdownMenu.Item
                  className={styles.item}
                  disabled={!item.isAvailable()}
                  key={item.id}
                  onSelect={(): void => dispatch(item)}
                >
                  {t(item.labelKey)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <>
          <SettingsMenu
            {...settingsMenuProps}
            open={!modalOpen && settingsOpen}
            onOpenChange={setSettingsOpen}
            onTrigger={(): void => dispatch(action('settings'))}
            onOpenAppearance={(opener): void => {
              setSettingsOpen(false);
              settingsMenuProps.onOpenAppearance(opener);
            }}
            triggerLabel={t(action('settings').labelKey)}
          />
          {viewMenuProps === undefined ? null : (
            <ViewMenu
              {...viewMenuProps}
              open={!modalOpen && viewOpen}
              onOpenChange={requestViewOpen}
              triggerLabel={t(action('view').labelKey)}
            />
          )}
          <button
            className={styles.trigger}
            type="button"
            onClick={(): void => dispatch(action('about'))}
          >
            {t(action('about').labelKey)}
          </button>
        </>
      )}

      {narrow ? (
        <>
          <SettingsMenu
            {...settingsMenuProps}
            open={!modalOpen && settingsOpen}
            onOpenChange={setSettingsOpen}
            onOpenAppearance={(): void => {
              setSettingsOpen(false);
              settingsMenuProps.onOpenAppearance(overflowTriggerRef.current);
            }}
            anchorRef={overflowTriggerRef}
            showTrigger={false}
          />
          {viewMenuProps === undefined ? null : (
            <ViewMenu
              {...viewMenuProps}
              open={!modalOpen && viewOpen}
              onOpenChange={requestViewOpen}
              showTrigger={false}
            />
          )}
        </>
      ) : null}
    </nav>
  );
};

export default ShellMenuRow;
