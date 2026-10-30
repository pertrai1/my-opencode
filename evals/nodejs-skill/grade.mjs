export function grade(output, scenario) {
  try {
    const plan = JSON.parse(output);
    const refs = plan.references;
    const actions = plan.actions;
    if (plan.activate !== scenario.activate || !Array.isArray(refs) ||
        !Array.isArray(actions) || !Array.isArray(plan.migrations) ||
        plan.migrations.length !== 0) return false;
    const allowed = new Set(scenario.references);
    return refs.length === allowed.size && new Set(refs).size === refs.length &&
      refs.every(ref => allowed.has(ref)) &&
      actions.length === scenario.actions.length &&
      new Set(actions).size === actions.length &&
      actions.every(action => typeof action === "string" && scenario.actions.includes(action)) &&
      (scenario.activate || actions.length === 0);
  } catch {
    return false;
  }
}

export default function assertion(output, context) {
  return grade(output, context.vars.scenario);
}
