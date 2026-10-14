import hooks from 'eslint-plugin-react-hooks';
import parser from '@typescript-eslint/parser';
// Correctness checks across the port; type-aware correctness is checked by both tsc projects.
export default [{
  plugins: { 'react-hooks': hooks },
  files: ['**/*.{js,mjs,ts,tsx}'],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: {jsx:true} } },
  linterOptions: { reportUnusedDisableDirectives: false },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'no-constant-condition': 'error', 'no-cond-assign': 'error', 'no-debugger': 'error',
    'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-duplicate-case': 'error',
    'no-unreachable': 'error', 'no-unsafe-finally': 'error', 'valid-typeof': 'error',
  },
}];
