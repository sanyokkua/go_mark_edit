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
 * FR-FT-034 requires a completed move to be announced, and the announcement is
 * built from the *disambiguated* tab label and the length of the ordered strip
 * — `tabLabelsFor` plus `orderedDocuments`, both of which live in DocumentTabs.
 * `onRemediate` lives in App and has neither. A Retry that moved the tab and
 * said nothing would satisfy the remediation contract and break FR-FT-034,
 * which is why T156 declined to add the intent at all.
 *
 * The alternative was to give App enough of the strip's state to announce for
 * itself. `tabLabelsFor` is exported and App already selects `documents.byId`
 * and `orderedIds`, so it was available — and rejected: it puts the strip's
 * labelling rules in a second place, to be kept in step by hand. That is the
 * defect class T176 removed from the i18n copy map and T188's notes describe
 * again for adapter doubles. Keeping the command and its announcement together
 * is the point.
 *
 * A ref rather than a callback prop because the direction is upward. App renders
 * the toast and receives the click; DocumentTabs is three levels below it
 * through AppShell and EditorChrome. Threading a registration callback down that
 * chain would touch both intermediaries for something neither participates in.
 *
 * Null when no strip is mounted — the launcher's zero-document state, where no
 * reorder remediation can exist because no tab does.
 */
export const TabRemediationContext = createContext<MutableRefObject<
  TabRemediationExecutor | undefined
> | null>(null);
