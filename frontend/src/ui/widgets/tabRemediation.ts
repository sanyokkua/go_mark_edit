import { createContext, type MutableRefObject } from 'react';

import type { NotificationRemediation } from '../../logic/store/notificationsSlice';

/**
 * Runs a remediation the tab strip owns. Resolves true when it handled the
 * remediation and the toast may be dismissed, false when it did not.
 *
 * The revision comes in rather than being read here. App already reads it from
 * the backend for every other retry arm, and the strip's injectable `adapter`
 * prop is a narrow `Pick` that deliberately excludes `getState` — widening it
 * would force every test double to grow a method it has no use for. So App owns
 * the backend read, the strip owns the command and its announcement.
 */
export type TabRemediationExecutor = (
  remediation: NotificationRemediation,
  freshTabSetRevision: number,
) => Promise<boolean>;

/**
 * A slot the tab strip fills with its own remediation executor, so a reorder
 * Retry runs where the strip's state is.
 *
 * A completed move is announced, and the announcement is
 * built from the *disambiguated* tab label and the length of the ordered strip
 * — `tabLabelsFor` plus `orderedDocuments`, both of which live in DocumentTabs.
 * `onRemediate` lives in App and has neither, so the command and announcement
 * stay together. A retry that moved the tab without announcing it would leave the remediation
 * incomplete. Keeping the command and announcement together prevents that split.
 *
 * App does not receive the strip's label map or ordered ids, so the strip owns
 * both the command and its announcement instead of duplicating labelling rules.
 *
 * A ref rather than a callback prop because the direction is upward. App renders
 * the toast and receives the click; DocumentTabs is three levels below it
 * through AppShell and FormattingToolbar. Threading a registration callback down that
 * chain would touch both intermediaries for something neither participates in.
 *
 * Null when no strip is mounted — the launcher's zero-document state, where no
 * reorder remediation can exist because no tab does.
 */
export const TabRemediationContext = createContext<MutableRefObject<
  TabRemediationExecutor | undefined
> | null>(null);
