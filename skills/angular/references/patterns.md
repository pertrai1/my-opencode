# Angular Application Patterns

Source: [Angular Routing](https://angular.dev/guide/routing), [HTTP](https://angular.dev/guide/http), and [Signals](https://angular.dev/guide/signals).

Match the existing project's architecture and version support before introducing functional guards, `resource`, signal inputs, or signal forms.

## Boundaries and state

- Container components own data loading and state. Presentational components receive inputs and emit outputs; they do not fetch data or navigate.
- Services own HTTP calls and business logic. Do not inject `HttpClient` or use `fetch` directly in a presentation component.
- Keep derived state in `computed` or `linkedSignal`; do not mirror it through effects.
- Prefer `toSignal` or the `async` pipe for view data. If a manual subscription is required, clean it up with `takeUntilDestroyed`.

## Routing and HTTP

- Lazy-load feature routes when that matches the application structure. Keep route configuration close to the feature it serves.
- Use functional guards, resolvers, and interceptors on standalone-first projects.
- Use guards as a client-side UX boundary only; enforce authorization on the server. `canMatch` can prevent a normal navigation from matching or loading a lazy route, but it does not secure a client bundle.
- Put cross-cutting HTTP concerns such as authentication, error mapping, retries, and logging in small composable interceptors.
- Use `HttpClient` so configured interceptors apply. Validate external responses before they reach typed application state.

## Async resources

- Check the installed API signature and stability before adopting `resource` or `httpResource`; they first appeared experimentally in 19.0 and 19.2 respectively. Do not infer stable support from examples on upstream `main`.
- Use resources for reactive reads, not mutations. Parameter changes or destruction can cancel in-flight work; use explicit `HttpClient` mutation calls for POST/PUT/PATCH/DELETE with intentional duplicate-submission and error handling. Do not hide writes inside a resource loader.
- In a `resource` loader, pass its `abortSignal` to cancellable operations such as `fetch`. `httpResource` uses `HttpClient` and its configured interceptors and cancels obsolete requests. An `undefined` parameter/request can represent an idle resource without issuing a request; verify the installed API shape.
- Render idle, loading, success/empty, and error states explicitly. Reading `value()` in an error state can throw; guard reads with `hasValue()` and handle `error()` separately. Check `isLoading()`/`status()` for pending or reload UX rather than assuming an empty value means loading.
- Test rapid parameter changes, cancellation, failed reads, and empty responses. Keep existing RxJS flows when their streaming or sequencing semantics fit the task.

See [resource](https://angular.dev/guide/signals/resource) and [HTTP resources](https://angular.dev/guide/http/http-resource).

## Forms and rendering

- Match the current form approach. Prefer typed non-nullable reactive forms for complex validation unless the project has adopted a supported alternative.
- Do not mix reactive and template-driven patterns within a form.
- In SSR code, do not access browser globals without a platform check or an injected Angular token.
- For SSR request scoping, hydration, and HTTP transfer-cache decisions, also load [security](security.md).
