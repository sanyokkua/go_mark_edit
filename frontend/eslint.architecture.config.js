// Architecture rules, run by `just archtest` — separate from eslint.config.js so that a normal
// `just lint` stays about code style and this stays about boundaries that must never move.
//
// Each block names the rule in docs/delivery/architecture/rules.md that it enforces.

import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'wailsjs/**', 'node_modules/**', 'tests/**'],
  },
  // The TypeScript parser only. No style rules — this config is boundaries, not taste.
  tseslint.configs.base,
  {
    // architecture/rules.md#only-the-adapter-imports-wailsjs
    //
    // wailsjs/ is generated and its shape changes with every backend signature change. One wrapping
    // layer means one place to fix, and it is the only seam a test can mock — a component that
    // imports a binding directly cannot be tested without a running Go process.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/logic/adapter/**', 'src/dev/bridge-mock/**'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/wailsjs/**', 'wailsjs/**'],
              message:
                'Only frontend/src/logic/adapter/ may import from wailsjs/. Add an adapter method wrapped in guardArity() and call that. See docs/delivery/architecture/rules.md#only-the-adapter-imports-wailsjs',
            },
          ],
        },
      ],
    },
  },
  {
    // architecture/rules.md#strings-go-through-t
    //
    // A hard-coded string is invisible to translation and, more immediately, invisible to review:
    // en.json is where all of the product's copy can be read and made consistent in one sitting.
    //
    // Tests are excluded because a test asserts on the rendered English, which is the point of it.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/test/**', 'src/dev/**'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z]{2}/]',
          message:
            'User-visible text must come from the catalogue: use t("key") and add the key to src/i18n/locales/en.json. See docs/delivery/architecture/rules.md#strings-go-through-t',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|placeholder|title|alt|aria-valuetext)$/] > Literal[value=/[A-Za-z]{2}/]',
          message:
            'An accessible name is user-visible text: use t("key") and add the key to src/i18n/locales/en.json. See docs/delivery/architecture/rules.md#strings-go-through-t',
        },
      ],
    },
  },
);
