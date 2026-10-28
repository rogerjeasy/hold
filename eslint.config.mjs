import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['**/.next/**', 'apps/web/public/vendor/**', '**/cdk.out/**', '**/next-env.d.ts', '**/playwright-report/**', '**/test-results/**', '.superpowers/**', '.claude/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs', 'apps/web/postcss.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)
