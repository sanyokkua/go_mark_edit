/**
 * Identity shared by the tab strip and the editor panes it controls.
 *
 * Tabs expose correct roles, and a `tab` that controls nothing is only
 * half a role: assistive technology needs the panel the tab governs. The two
 * ends of that association live in different components — `DocumentTabs`
 * renders the tabs, `EditorView` renders the panes — so the identity lives
 * here rather than as a literal repeated in both. It is a plain module and not
 * an export from either component file, because a non-component export from a
 * component module costs a `react-refresh/only-export-components` warning.
 */
export const EDITOR_TABPANEL_ID = 'editor-tabpanel';

export function tabElementId(documentId: string): string {
  return `tab-${documentId}`;
}
