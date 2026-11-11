# Angular Components And Templates

Source: [Angular Components](https://angular.dev/guide/components), [Templates](https://angular.dev/guide/templates), and [Inputs](https://angular.dev/guide/components/inputs).

Check the Angular version and follow the component style already used in the target area. Do not convert an established NgModule or decorator-based area as incidental cleanup.

## Component shape

- On standalone-first projects, create standalone components and declare their template dependencies in `imports`.
- Use `ChangeDetectionStrategy.OnPush` for new components.
- Keep components focused on presentation and UI coordination. Put data access, business rules, and cross-component state in the project's existing service or state layer.
- Use one component, template, stylesheet, and spec file per artifact.

## Inputs, outputs, and templates

- Gate each API separately: `input`/`input.required` arrived in 17.1, `model` in 17.2, and `output` in 17.3. These APIs became stable in 19. Before 19, preserve decorators unless the project deliberately uses preview APIs. On supported stable versions, follow the local input/output conventions. `output()` is an output initializer, not a signal.
- Use `model` only for an intentional two-way binding contract, not as a substitute for every input.
- Use required inputs when a parent must provide a value. Do not type inputs or outputs as `any`.
- On projects using block syntax, use `@if`, `@for`, and `@switch`; every `@for` needs a stable `track` expression.
- Keep templates declarative. Move complex transformations and branching into the component, a `computed`, or a pure pipe.
- Call signals as functions in templates. Use the `async` pipe for observable-only template data, or `toSignal` where component code also needs the value.
- Use `@defer` only for genuinely non-critical UI. Direct deferred dependencies must be standalone and not eagerly referenced outside `@defer` blocks in the same file (including view queries) to be split out; placeholder/loading/error dependencies load eagerly. Keep critical above-the-fold content eager, reserve layout space, and choose accessible triggers and loading/error states.
- Do not assume browser defer triggers run during SSR: default server rendering emits the placeholder (or nothing). Check the installed version and hydration configuration before choosing incremental hydration behavior.

## Lifecycle, DOM, and styles

- Use signal queries where supported by the installed version and project convention. Queries do not cross component template boundaries. Optional query results can be `undefined`, including when `@if` hides a target; use a required query only when that target is guaranteed. Do not read required view queries before the view exists.
- Treat `<ng-content>` as compile-time projection, not a lazy view. Do not wrap it in `@if`/`@for`/`@switch` to avoid creating projected content; use a template fragment (`TemplateRef`/`NgTemplateOutlet`) for conditional instantiation. Preserve slot selectors and fallback semantics.
- Do DOM work after rendering, not in `ngOnInit`.
- Keep styles scoped to the component. Preserve semantic HTML, labels, keyboard support, and focus behavior for interactive UI.
- Do not mutate input objects in place on `OnPush` components.

See [queries](https://angular.dev/guide/components/queries), [projection](https://angular.dev/guide/components/content-projection), [defer](https://angular.dev/guide/templates/defer), and the [v19 stabilization notes](https://github.com/angular/angular/blob/19.0.0/CHANGELOG.md).
