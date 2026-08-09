import {
  adaptReferenceHtml,
  REFERENCE_ADAPTER_HASH,
  REFERENCE_ADAPTER_VERSION,
  referenceVariantRules,
  referenceVariants,
} from './reference-adapter';

const bindingHtml = '<html><body><main>binding</main></body></html>';

it('reference adapter hash is stable and bounded', () => {
  const first = adaptReferenceHtml(bindingHtml, 'file-only');
  const second = adaptReferenceHtml(bindingHtml, 'file-only');

  expect(first.adapterHash).toBe(REFERENCE_ADAPTER_HASH);
  expect(first.adapterHash).toBe(second.adapterHash);
  expect(first.sourceHash).toBe(second.sourceHash);
  expect(first.html).toContain(`data-reference-variant="file-only"`);
  expect(first.html).not.toContain('iframe');
  expect(first.rules.excludedRegions).toEqual([
    'workspace',
    'assistant',
    'rich-rendering',
  ]);
  expect(REFERENCE_ADAPTER_VERSION).toBe('feature-003-reference-adapter-v1');
});

it('reference adapter exposes only the reviewed variant boundary', () => {
  expect(referenceVariants).toEqual([
    'base',
    'file-only',
    'file-menu',
    'conflict',
    'move-tab',
  ]);
  expect(referenceVariantRules('move-tab').allowedRegions).toEqual([
    'tab-menu',
    'tabs',
  ]);
  expect(() => adaptReferenceHtml(bindingHtml, 'workspace' as never)).toThrow(
    'Unsupported reference variant',
  );
});
