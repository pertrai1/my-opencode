---
name: angular
description: Use when an Angular project contains angular.json or @angular/core, or when working on Angular components, templates, services, routing, security, configuration, or tests.
---

# Angular Development

Use this skill only after confirming the repository is an Angular project from `angular.json` or `@angular/core` in `package.json`.

Before changing code, inspect `package.json`, `angular.json`, the relevant `tsconfig`, and nearby code. Confirm the installed Angular version (including minor version and lockfile), test runner, Zone.js or zoneless setup, rendering mode, and established local conventions. Do not introduce newer Angular APIs or migrate between NgModule and standalone patterns as part of unrelated work.

Check both API availability and stability in documentation matching that version. Current upstream `main` can describe unreleased features; it is not evidence that an installed version supports them. Keep experimental or developer-preview APIs opt-in, and preserve supported existing patterns rather than performing incidental migrations.

Read the reference files that match the work:

- TypeScript, DI, signals, RxJS, or change detection: [coding style](references/coding-style.md)
- Components, templates, styles, inputs, outputs, or lifecycle: [components and templates](references/components-and-templates.md)
- Services, state, HTTP, forms, routing, guards, resolvers, interceptors, or SSR: [application patterns](references/patterns.md)
- `angular.json`, `package.json`, bootstrap, providers, routes, or file layout: [project structure](references/project-structure.md)
- Untrusted content, auth, secrets, HTTP boundaries, guards, CSP, or SSR safety: [security](references/security.md)
- Specs, TestBed, HTTP tests, routing tests, harnesses, or async tests: [testing](references/testing.md)

Load more than one reference when a change crosses those surfaces. Follow repository-local instructions when they conflict with a reference. Run the narrowest configured test, lint, and build commands that cover the change.
