# Angular Testing

Source: [Angular Testing](https://angular.dev/guide/testing), [HTTP Testing](https://angular.dev/guide/testing/http), and [CDK Test Harnesses](https://material.angular.io/cdk/test-harnesses/overview).

Inspect `angular.json`, package scripts, test setup files, and Zone.js usage first. Use the project's configured runner, matchers, spies, and lifecycle APIs.

## Test behavior

- Test observable behavior: rendered output, inputs, outputs, interactions, public service methods, guards, resolvers, and HTTP behavior. Do not test private methods or incidental implementation details.
- Components need meaningful UI states and interactions. Services need public-method, error-path, and caching or state coverage where applicable.
- Keep setup local until a project-specific helper has at least two real consumers.

## Angular test utilities

- Import standalone components directly into `TestBed`. Provide `provideHttpClient()` before `provideHttpClientTesting()` for HTTP code on standalone-first projects so the testing backend overrides the real one.
- Set signal inputs through `fixture.componentRef.setInput`, not field assignment.
- Prefer `RouterTestingHarness` to hand-written `ActivatedRoute` mocks for routed-component behavior.
- Use `HttpTestingController` with one expectation per request and call `verify()` after each test.
- Prefer CDK harnesses for supported component-library interactions. Use stable project selectors where raw DOM queries are necessary.
- Prefer `async`/`await` and `fixture.whenStable()` for Angular-scheduled updates. In zoneless tests, trigger change detection through production notification paths (signals, `setInput`, events, or `markForCheck`) rather than masking missing notifications with unconditional `detectChanges()`. Follow local setup for initial rendering.
- Use `fakeAsync`/`tick` only with Zone.js testing support and a compatible runner. They do not work with Vitest; use native async or that runner's fake timers for actual timer behavior. Do not switch runners or add Zone.js just to use an example. Restore fake timers after each test, and avoid unmanaged `setTimeout` waits.
- For HTTP tests, trigger the request, assert it, flush a response or error, then await stabilization. Waiting for stability before flushing pending HTTP can deadlock the test.

Run the narrowest configured test command that covers the changed behavior, then broaden verification only when necessary.

See [zoneless testing](https://angular.dev/guide/zoneless#testing-and-debugging), [fakeAsync requirements](https://angular.dev/api/core/testing/fakeAsync), and [Vitest migration](https://angular.dev/guide/testing/migrating-to-vitest).
