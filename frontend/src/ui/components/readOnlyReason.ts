import { t } from '../../i18n';

/*
 * Documents between 10 MiB and 50 MiB open read-only
 * "with a visible reason". The reason cannot come from `status`:
 * `internal/appmodel/save_status.go:28-31` collapses every non-writable
 * capability onto the single `read-only` status, so by the time the status
 * exists the discriminator is gone. It has to come from `capability`, which
 * `internal/file/document_reader.go:264-278` sets to exactly one of:
 *
 *   large-read-only   — the file is over MaxWritableDocumentBytes (10 MiB)
 *   unsafe-read-only  — invalid UTF-8, a NUL byte, or a lone CR
 *
 * `sizeClass` carries the same large/small split (`file_lifecycle.go:344-348`)
 * but says nothing about the unsafe case, so `capability` is the finer signal
 * and the one read here.
 *
 * The three unsafe sub-reasons are NOT distinguishable in the frontend: Go
 * records them in `ClassifiedRead.Warning`, and `apperr.DocumentMetadata` has
 * no `Warning` field, so the distinction dies at the bridge. The copy is
 * therefore honest about the class rather than guessing which of the three.
 */
export function readOnlyReasonKey(
  capability: string | undefined,
): string | undefined {
  switch (capability) {
    case 'large-read-only':
      return 'status.readOnlyReason.large';
    case 'unsafe-read-only':
      return 'status.readOnlyReason.unsafe';
    default:
      return undefined;
  }
}

export function readOnlyReason(
  capability: string | undefined,
): string | undefined {
  const key = readOnlyReasonKey(capability);
  return key === undefined ? undefined : t(key);
}
