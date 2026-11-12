import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/.temp', 'playwright-report', 'test-results', 'src/lib/database.types.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Regra opinativa do React Compiler: acusa o padrão comum (e correto) de
      // buscar dados ao abrir a tela (setState após await dentro de useEffect).
      'react-hooks/set-state-in-effect': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
