# Issues

- None logged yet.

- LSP diagnostics tooling is unavailable in this environment: configured biome and typescript language servers are not installed, so static diagnostics could not be executed via lsp_diagnostics.

- Resolved: installed missing biome and typescript language servers, then lsp_diagnostics reported clean results for backend/package.json and the new backend/tests/*.test.js files.

- Blocker for Task 2 verification: no reachable PostgreSQL at `127.0.0.1:5432` (P1001) and Docker is not available, so I cannot run `prisma db push` safely against a local test DB yet.

- Resolved: installed and started `postgresql@16` via Homebrew, created local role/db `test`, and verified `npx prisma db push` succeeds against `postgresql://test:test@127.0.0.1:5432/test?schema=public`.

- Blocker: Task 7 (frontend menu/page shell) delegation timed out multiple times (session `ses_3100f8a2dffeag9rGoN5DL4eUs`) and produced no frontend file changes. Proceeding with backend-only tasks while this remains unresolved.
