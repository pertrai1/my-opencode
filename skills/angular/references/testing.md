# Angular Testing

Source: [Angular Testing](https://angular.dev/guide/testing), [HTTP Testing](https://angular.dev/guide/testing/http), and [CDK Test Harnesses](https://material.angular.io/cdk/test-harnesses/overview).

Inspect `angular.json` and package scripts first. Use the project's configured runner, matchers, spies, and lifecycle APIs.

## Test behavior

- Test observable behavior: rendered output, inputs, outputs, interactions, public service methods, guards, resolvers, and HTTP behavior. Do not test private methods or incidental implementation details.
- Components need meaningful UI states and interactions. Services need public-method, error-path, and caching or state coverage where applicable.
- Keep setup local until a project-specific helper has at least two real consumers.

## Angular test utilities

- Import standalone components directly into `TestBed`. Use `provideHttpClient()` with `provideHttpClientTesting()` for HTTP code on standalone-first projects.
- Set signal inputs through `fixture.componentRef.setInput`, not field assignment.
- Prefer `RouterTestingHarness` to hand-written `ActivatedRoute` mocks for routed-component behavior.
- Use `HttpTestingController` with one expectation per request and call `verify()` after each test.
- Prefer CDK harnesses for supported component-library interactions. Use stable project selectors where raw DOM queries are necessary.
- Use `fakeAsync` and `tick` for controlled timer or scheduler behavior. Avoid unmanaged `setTimeout` waits.

Run the narrowest configured test command that covers the changed behavior, then broaden verification only when necessary.
