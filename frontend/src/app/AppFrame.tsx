import type { ComponentProps, PropsWithChildren } from 'react';

import { t } from '../i18n';
import type { RecoverySurface } from '../logic/store/appModelTypes';
import Notifications, { type NotificationNotice } from '../ui/components/Notifications';
import Button from '../ui/primitives/Button';
import AppShell from '../ui/widgets/AppShell';
import { AppearanceControlsContent, AppearanceSettingsProvider } from '../ui/widgets/AppearanceControls';
import ApplicationMenubar, { type ApplicationMenuState } from '../ui/widgets/Menubar/ApplicationMenubar';
import StartupFailure from '../ui/widgets/StartupFailure/StartupFailure';
import type { BootstrapController } from './useBootstrap';

export interface AppFrameProps extends PropsWithChildren {
    bootstrap: BootstrapController;
    menuState: ApplicationMenuState;
    settingsOpen: boolean;
    onSettingsOpenChange: (open: boolean) => void;
    onQuit: () => void;
    onRetry: () => void;
    notices: readonly NotificationNotice[];
    banners: readonly NotificationNotice[];
    onDismiss: (id: number) => void;
    recovery: RecoverySurface | null;
    shell: ComponentProps<typeof AppShell>;
}

/** Keeps the frame and portal root mounted across startup attempts. */
export function AppFrame({
    bootstrap,
    menuState,
    settingsOpen,
    onSettingsOpenChange,
    onQuit,
    onRetry,
    notices,
    banners,
    onDismiss,
    recovery,
    shell,
    children,
}: AppFrameProps): React.JSX.Element {
    const ready = bootstrap.status === 'ready';
    return (
        <div className="application-frame">
            <AppearanceSettingsProvider settingsOpen={settingsOpen} onSettingsOpenChange={onSettingsOpenChange}>
                <div className="application-menu">{ready ? <ApplicationMenubar menuState={menuState} /> : null}</div>
                <AppearanceControlsContent visible={ready} />
            </AppearanceSettingsProvider>
            <div className="application-content">
                <Notifications banners={ready ? banners : []} notices={ready ? notices : []} onDismiss={onDismiss} />
                {bootstrap.status === 'failed' ? (
                    <StartupFailure
                        failure={bootstrap.failure}
                        isRetrying={bootstrap.isRetrying}
                        onQuit={onQuit}
                        onRetry={onRetry}
                    />
                ) : ready ? (
                    <>
                        {recovery !== null ? (
                            <section aria-label={t('recovery.title')} role="alert">
                                <p>{recovery.message}</p>
                                <Button variant="secondary" onClick={onQuit}>
                                    {t('recovery.quit.action')}
                                </Button>
                            </section>
                        ) : null}
                        <AppShell {...shell} />
                    </>
                ) : null}
            </div>
            {children}
        </div>
    );
}
