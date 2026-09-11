import eslint from '@eslint/js';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = ['frontend/src/**/*.{ts,tsx}'];
const allFiles = [
  'frontend/**/*.{js,mjs,cjs,ts,tsx}',
  'tools/**/*.{js,mjs,cjs,ts,tsx}',
];
const colourLiteral =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:white|black|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|gold|beige|ivory|coral|salmon|khaki|indigo|violet|crimson|tomato|orchid|plum|tan|wheat)\b/i;

const userVisibleAttributes =
  'JSXAttribute[name.name=/^(aria-label|aria-description|placeholder|title|alt|aria-valuetext)$/] > Literal[value=/[A-Za-z]{2}/]';

export default tseslint.config(
  {
    ignores: [
      'frontend/dist/**',
      'frontend/wailsjs/**',
      'frontend/node_modules/**',
      'frontend/test-results/**',
      'frontend/playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: allFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: {
          defaultProject: 'tsconfig.test.json',
          allowDefaultProject: [
            'jest.config.mjs',
            'stylelint.config.mjs',
            'tests/*.ts',
            'tests/*.tsx',
            'tests/*/*.ts',
            'tests/*/*.tsx',
            'tests/*/*/*.ts',
            'tests/*/*/*.tsx',
            'tests/*/*/*/*.ts',
            'tests/*/*/*/*.tsx',
            '../tools/*.mjs',
            '../tools/*/*.mjs',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 300,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Existing production and test code has a typed-lint backlog. Keep the
      // recommendedTypeChecked rules active and visible while the two
      // contract-critical promise rules remain blocking.
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      '@typescript-eslint/require-await': 'warn',
    },
  },
  {
    files: sourceFiles,
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['frontend/**/*.{test,spec}.{js,mjs,cjs,ts,tsx}'],
    plugins: { 'no-only-tests': noOnlyTests },
    rules: { 'no-only-tests/no-only-tests': 'error' },
  },
  {
    files: ['frontend/tests/**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      // Jest's matcher and mock APIs intentionally expose methods that are
      // detached from their owning object, and the legacy suites await a few
      // synchronous test helpers for a stable call shape.
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['frontend/scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: sourceFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/wailsjs/**', 'wailsjs/**'],
              message:
                'Only frontend/src/logic/adapter/ may import from wailsjs/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/src/logic/adapter/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: [
      'frontend/src/ui/primitives/**/*.{ts,tsx}',
      'frontend/src/ui/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/logic/store',
                '**/logic/store/**',
                '**/logic/adapter',
                '**/logic/adapter/**',
                '**/logic/actions',
                '**/logic/actions/**',
              ],
              message:
                'Shared UI must receive state and commands through its props or a local primitive.',
            },
          ],
        },
      ],
    },
  },
  {
    files: sourceFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='createPortal']",
          message: 'Only Popup may own a portal.',
        },
        {
          selector:
            "JSXOpeningElement:not([name.name='Popup']) > JSXAttribute[name.name='role'] > Literal[value=/^(menu|menuitem)$/]",
          message: 'Only Popup may own menu roles.',
        },
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name='addEventListener'] Literal[value=/^(keydown|pointerdown|mousedown)$/]",
          message: 'Only Popup may own global popup-dismiss listeners.',
        },
        {
          selector:
            "CallExpression[callee.object.object.name='globalThis'][callee.object.property.name='document'][callee.property.name='addEventListener'] Literal[value=/^(keydown|pointerdown|mousedown)$/]",
          message: 'Only Popup may own global popup-dismiss listeners.',
        },
        {
          selector:
            "CallExpression[callee.property.name='querySelector'] > Literal[value=/\\.application-frame/]",
          message: 'Only Popup may resolve the application frame.',
        },
        {
          selector: "JSXAttribute[name.name='role'] > Literal[value='dialog']",
          message: 'Only ModalShell may own dialog roles.',
        },
        {
          selector: "JSXAttribute[name.name='aria-modal']",
          message: 'Only ModalShell may own modal semantics.',
        },
        {
          selector:
            'Literal[value=/focus-trap|focusTrap|focusableSelector|tabindex/i]',
          message: 'Only ModalShell may own focus-trap selectors.',
        },
        {
          selector:
            "JSXAttribute[name.name='role'] > Literal[value=/^(tab|tablist)$/]",
          message: 'Only TabBar may own tab roles.',
        },
        {
          selector: "JSXElement[openingElement.name.name='button']",
          message: 'Use the shared Button, ToolButton or MenuItem primitive.',
        },
        {
          selector:
            "JSXAttribute[name.name='role'] > Literal[value='radiogroup']",
          message: 'Only Segmented may own the radiogroup role.',
        },
        {
          selector: "JSXElement[openingElement.name.name='svg']",
          message: 'Use the shared Icon primitive for inline SVG.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]{2}/]',
          message: 'User-visible text must come from t().',
        },
        {
          selector:
            'JSXElement > JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]',
          message: 'User-visible text must come from t().',
        },
        {
          selector: userVisibleAttributes,
          message: 'User-visible attributes must come from t().',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|placeholder|title|alt|aria-valuetext)$/] > JSXExpressionContainer > Literal[value=/[A-Za-z]{2}/]',
          message: 'User-visible attributes must come from t().',
        },
        {
          selector:
            'JSXElement > JSXExpressionContainer > TemplateLiteral[quasis.0.value.raw=/[A-Za-z]{2}/]',
          message: 'User-visible text must come from t().',
        },
        {
          selector: `JSXAttribute[name.name='style'] Literal[value=${colourLiteral}]`,
          message:
            'Inline style colours must use a token class or CSS variable.',
        },
      ],
    },
  },
  {
    files: ['frontend/src/ui/components/Popup/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['frontend/src/ui/components/ModalShell/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['frontend/src/ui/components/TabBar/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: [
      'frontend/src/ui/primitives/Button/**/*.{ts,tsx}',
      'frontend/src/ui/primitives/ToolButton/**/*.{ts,tsx}',
      'frontend/src/ui/components/MenuItem/**/*.{ts,tsx}',
      'frontend/src/ui/components/TabBar/**/*.{ts,tsx}',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['frontend/src/ui/primitives/Segmented/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['frontend/src/ui/primitives/Icon/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: [
      'frontend/src/**/*.test.{ts,tsx}',
      'frontend/src/**/*.spec.{ts,tsx}',
      'frontend/src/dev/**',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
