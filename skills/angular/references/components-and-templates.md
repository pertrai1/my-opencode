# Angular Components And Templates

Source: [Angular Components](https://angular.dev/guide/components), [Templates](https://angular.dev/guide/templates), and [Inputs](https://angular.dev/guide/components/inputs).

Check the Angular version and follow the component style already used in the target area. Do not convert an established NgModule or decorator-based area as incidental cleanup.

## Component shape

- On standalone-first projects, create standalone components and declare their template dependencies in `imports`.
- Use `ChangeDetectionStrategy.OnPush` for new components.
- Keep components focused on presentation and UI coordination. Put data access, business rules, and cross-component state in the project's existing service or state layer.
- Use one component, template, stylesheet, and spec file per artifact.

## Inputs, outputs, and templates

- On Angular 17.1+ projects that use the signal APIs, prefer typed `input`, `input.required`, `output`, and `model`. Otherwise retain the local decorator-based style.
- Use required inputs when a parent must provide a value. Do not type inputs or outputs as `any`.
- On projects using block syntax, use `@if`, `@for`, and `@switch`; every `@for` needs a stable `track` expression.
- Keep templates declarative. Move complex transformations and branching into the component, a `computed`, or a pure pipe.
- Call signals as functions in templates. Use the `async` pipe for observable-only template data, or `toSignal` where component code also needs the value.
- Use `@defer` only for genuinely non-critical UI and provide suitable placeholder, loading, and error states.

## Lifecycle, DOM, and styles

- Use signal queries where supported by the installed version and project convention.
- Do DOM work after rendering, not in `ngOnInit`.
- Keep styles scoped to the component. Preserve semantic HTML, labels, keyboard support, and focus behavior for interactive UI.
- Do not mutate input objects in place on `OnPush` components.
