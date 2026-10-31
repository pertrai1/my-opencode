export function syntheticPlan(scenario) {
  return {
    activate: scenario.activate,
    references: [...scenario.references],
    actions: [...scenario.actions],
    migrations: [],
  };
}
