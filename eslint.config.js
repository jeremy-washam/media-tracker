import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/.pnpm-store/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/web/**/*.{jsx,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['apps/web/**/*.{jsx,tsx}'],
    ...reactRefresh.configs.vite,
  },
  {
    files: [
      'apps/web/src/features/**/*.tsx',
      'apps/web/src/pages/**/*.tsx',
      'apps/web/src/components/**/*.tsx',
    ],
    ignores: ['apps/web/src/components/ui/**', 'apps/web/src/components/library-controls.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]',
          message:
            'Use the installed shadcn component. Application media rows and inspector backdrops use the documented shared wrappers in library-controls.tsx.',
        },
        {
          selector: 'JSXAttribute[name.name="role"][value.value=/^(tab|tablist|tabpanel)$/]',
          message:
            'Use shadcn Tabs, TabsList, TabsTrigger, and TabsContent rather than hand-writing tab semantics.',
        },
        {
          selector:
            'JSXOpeningElement[name.name=/^(button|a|span|Link|Button)$/] > JSXAttribute[name.name="title"]',
          message:
            'Use Hint/Tooltip for UI explanations and retain an independent accessible name.',
        },
      ],
    },
  },
)
