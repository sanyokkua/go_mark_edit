export type NotificationKind = 'error' | 'warning' | 'stuck';

export type NotificationTone = 'error' | 'info' | 'success' | 'warning';

export interface NotificationAction {
  readonly id: string;
  readonly label: string;
  readonly onActivate: () => void;
}

export interface NotificationNotice {
  readonly id: number;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message: string;
  readonly actions: readonly NotificationAction[];
  readonly code?: string;
  readonly count?: number;
  readonly persistent?: boolean;
  /** The existing store tone is retained for success/info copy and styling. */
  readonly tone?: NotificationTone;
}

export type LegacyNotificationSeverity = NotificationTone;

export interface LegacyNotificationRemediation {
  readonly action: string;
  readonly labelKey: string;
  readonly [key: string]: unknown;
}

export interface LegacyNotification {
  readonly code: string;
  readonly count: number;
  readonly error?: unknown;
  readonly id: number;
  readonly message: string;
  readonly refreshGeneration?: number;
  readonly remediations: readonly LegacyNotificationRemediation[];
  readonly persistent?: boolean;
  readonly severity: LegacyNotificationSeverity;
  readonly subject?: string;
  readonly title: string;
}
