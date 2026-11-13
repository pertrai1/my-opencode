// Static last-match-wins evaluation of OpenCode permission rules for policy
// regression tests. It is not evidence that the runtime enforces a boundary.
export function matches(pattern, value) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`).test(value);
}

export function effect(rules, action, resource) {
  return rules.reduce((result, rule) =>
    matches(rule.action, action) && matches(rule.resource, resource) ? rule.effect : result, "allow");
}
