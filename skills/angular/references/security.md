# Angular Security

Source: [Angular Security Best Practices](https://angular.dev/best-practices/security), [DomSanitizer](https://angular.dev/api/platform-browser/DomSanitizer), and [SSR](https://angular.dev/guide/ssr).

## Rendering and data boundaries

- Do not use `bypassSecurityTrust*` with user-controlled or externally sourced values. Avoid `[innerHTML]` for untrusted content; use interpolation, text bindings, or explicit sanitization.
- Validate user-provided URLs before binding them to sensitive URL contexts. Never construct templates by concatenating user data.
- Use `HttpClient` so interceptors consistently apply. Type and validate API data at the boundary, and redact sensitive data from logs.

## Authentication and secrets

- Attach authentication through an interceptor, not per-call header duplication.
- Client guards improve UX but are not authorization. The server must enforce access control.
- Never commit credentials or place production secrets in browser configuration files. Prefer CI/CD or a secret manager for injection.
- Prefer HTTP-only cookies for tokens when backend support exists. Clear in-memory and persisted authentication state on logout.

## SSR and CSP

- For SSR, gate browser APIs behind an appropriate platform check or use injected platform tokens. Do not serialize server-only secrets into `TransferState`.
- Avoid hydration mismatches and sanitize data rendered on the server as well as the client.
- Configure CSP on the server. Avoid `unsafe-inline` and `unsafe-eval`; use a nonce where inline content is necessary.

For changes in these areas, add focused rendering, router, or interceptor tests and run the dependency audit command used by the project when dependencies change.
