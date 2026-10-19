import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const forbid = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

const infrastructureDependencies = [
  'undici',
  'cheerio',
  'better-sqlite3',
  'robots-parser',
  'fast-xml-parser',
];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/', '.zero-audit/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid(
      [
        '**/application/**',
        '**/infrastructure/**',
        '**/cli/**',
        ...infrastructureDependencies,
        ...infrastructureDependencies.map((name) => `${name}/*`),
        'node:*',
      ],
      'The domain must not depend on outer layers, infrastructure libraries or I/O.',
    ),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: forbid(
      ['**/infrastructure/**', '**/cli/**', ...infrastructureDependencies],
      'The application layer must not depend on infrastructure or CLI.',
    ),
  },
  { files: ['*.js'], ...tseslint.configs.disableTypeChecked },
);
