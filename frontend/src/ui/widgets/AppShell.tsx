import styles from './AppShell.module.css';

import EditorView from './EditorView';

interface AppShellProps {
  assistantVisible: boolean;
}

const AppShell: React.FC<AppShellProps> = ({
  assistantVisible,
}: AppShellProps): React.JSX.Element => {
  const shellClassName = assistantVisible
    ? `${styles.shell} ${styles.shellAssistantVisible}`
    : styles.shell;

  return (
    <div className={shellClassName}>
      <aside aria-label="File explorer" className={styles.left} />
      <main aria-label="Document area" className={styles.center}>
        <EditorView />
      </main>
      <aside
        aria-label="Assistant"
        className={styles.assistant}
        hidden={!assistantVisible}
      />
    </div>
  );
};

export default AppShell;
