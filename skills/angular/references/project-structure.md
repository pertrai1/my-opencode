# Angular Project Structure

Source: [Angular Style Guide](https://angular.dev/style-guide), [CLI](https://angular.dev/tools/cli), and [Workspace Configuration](https://angular.dev/reference/configs/workspace-config).

Treat workspace configuration and bootstrap changes as project-wide changes. Inspect existing layout and routes before creating files or folders.

## Naming and layout

- Use Angular CLI naming: kebab-case files, PascalCase classes, and one artifact per file. Keep specs next to the artifact they test.
- Prefer CLI generation when its output matches the project's configured conventions.
- Group application code by feature. Do not create generic `shared` or `utils` buckets for unrelated code.
- Keep feature routes near their feature. Place truly app-wide providers and concerns in the established application configuration location.

## Bootstrap and configuration

- Retain an existing NgModule-centered application unless the task is an intentional migration. For standalone-first applications, use functional providers and bootstrap APIs.
- Do not casually alter builders, TypeScript settings, top-level paths, package scripts, or application bootstrap. Verify all configuration changes with the configured build, test, and lint commands.
- Environment files define configuration shape; do not store production secrets there.
- Do not introduce another frontend framework's conventions into an Angular application. Isolate genuinely cross-framework code behind a framework-neutral library.
