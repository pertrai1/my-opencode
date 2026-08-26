# Angular Coding Style

Source: [Angular Style Guide](https://angular.dev/style-guide), [Signals](https://angular.dev/guide/signals), and [Dependency Injection](https://angular.dev/guide/di).

Check the installed Angular version before using `inject`, signals, `linkedSignal`, `resource`, functional APIs, or `takeUntilDestroyed`.

## Dependency injection

- On projects that have adopted it, prefer field-level `inject()` over constructor injection. Keep constructors empty unless the local style requires otherwise.
- Use `InjectionToken` for non-class dependencies such as configuration and capabilities.
- Prefer `providedIn: 'root'` for application-wide singletons. Scope providers only when their lifecycle must match a component or route subtree.
- Call `inject()` only in an injection context. Use `runInInjectionContext` for a legitimate external context.

## Reactive state and change detection

- Use `signal` for writable state and `computed` for derived state. Use `linkedSignal` only for derived state that must remain writable.
- Do not synchronize derived signals with `effect`; use `computed` or `linkedSignal`.
- Reserve `effect` for side effects such as telemetry and imperative third-party APIs. Use `afterRenderEffect` or `afterNextRender` for DOM work after rendering.
- Bridge observables with `toSignal` rather than a manual subscription which writes to a signal.
- Default new components to `ChangeDetectionStrategy.OnPush`. Prefer signals and the `async` pipe over `ChangeDetectorRef` calls.

## RxJS and types

- Select flattening operators intentionally: `switchMap` for latest-wins work, `mergeMap` for independent work, `exhaustMap` for submissions, and `concatMap` for ordered work.
- Handle errors in long-lived streams. Use `takeUntilDestroyed` for necessary component or directive subscriptions.
- Keep `strict` and `strictTemplates` enabled. Type public surfaces and validate external data from `unknown` at the boundary.
- Do not add `any`, `as any`, or non-null assertions to silence compiler or template errors.

## File conventions

- Keep one artifact per file and co-locate a component with its template and styles.
- Match the repository's import ordering and member ordering before applying generic conventions.
