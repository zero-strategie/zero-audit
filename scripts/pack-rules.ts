const SQLITE_MIGRATIONS = [
  '001_init.sql',
  '002_projects.sql',
  '003_blocked_pages.sql',
  '004_site_files.sql',
  '005_page_canonical.sql',
  '006_host_probes.sql',
  '007_slash_probes.sql',
  '008_page_text_ratio.sql',
  '009_accounts.sql',
  '010_api_launches.sql',
  '011_audit_queue.sql',
  '012_page_html_facts.sql',
];

const POSTGRES_MIGRATIONS = [
  '001_init.sql',
  '002_slash_probes.sql',
  '003_page_text_ratio.sql',
  '004_accounts.sql',
  '005_api_launches.sql',
  '006_audit_queue.sql',
  '007_page_html_facts.sql',
];

const migrationPaths = (engine: string, names: readonly string[]): string[] =>
  names.map((name) => `dist/infrastructure/${engine}/migrations/${name}`);

export const REQUIRED_PACK_FILES: readonly string[] = [
  'package.json',
  'LICENSE',
  'COPYRIGHT',
  'README.md',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/cli/main.js',
  ...migrationPaths('sqlite', SQLITE_MIGRATIONS),
  ...migrationPaths('postgres', POSTGRES_MIGRATIONS),
];

const ALLOWED_ROOT_FILES: ReadonlySet<string> = new Set([
  'package.json',
  'LICENSE',
  'COPYRIGHT',
  'README.md',
]);

const isAllowed = (file: string): boolean =>
  file.startsWith('dist/') || ALLOWED_ROOT_FILES.has(file);

export const checkPackFiles = (files: readonly string[]): string[] => {
  const present = new Set(files);
  const forbidden = files
    .filter((file) => !isAllowed(file))
    .map((file) => `forbidden file in package: ${file}`);
  const missing = REQUIRED_PACK_FILES.filter((file) => !present.has(file)).map(
    (file) => `missing file in package: ${file}`,
  );
  return [...forbidden, ...missing];
};
