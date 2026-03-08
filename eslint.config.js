import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import litPlugin from 'eslint-plugin-lit';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.vitest,
      },
    },
  },
  {
    plugins: {
      lit: litPlugin,
    },
    rules: {
      ...litPlugin.configs.recommended.rules,
      'lit/no-useless-template-literals': 'error',
      'lit/no-invalid-html': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
      },
    },
  },
  prettierConfig,
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
