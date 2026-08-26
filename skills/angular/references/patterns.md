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

## Forms and rendering

- Match the current form approach. Prefer typed non-nullable reactive forms for complex validation unless the project has adopted a supported alternative.
- Do not mix reactive and template-driven patterns within a form.
- In SSR code, do not access browser globals without a platform check or an injected Angular token.
