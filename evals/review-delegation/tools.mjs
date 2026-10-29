const string = { type: "string" };
const definitions = {
  skill: {
    description: "Load an available skill's full instructions.",
    properties: { id: { type: "string", enum: ["difit", "difit-review"] } },
  },
  shell: {
    description: "Run a simulated shell command. Supports git diff, git status --short, npm test, command -v difit, difit ., and npx difit . only. No real command executes.",
    properties: { command: string },
  },
  subagent: {
    description: "Run a separate agent to completion. Supply the task, workflow, scoped diff, and verification evidence in prompt. Returns a simulated independent review result.",
    properties: {
      agent: { type: "string", enum: ["general", "test-reviewer", "tdd-orchestrator"] },
      description: string,
      prompt: string,
    },
  },
  finish: {
    description: "Finish with the observed review status, summary, and relevant tool observation IDs. viewer-opened means a human viewer was opened, not an AI review.",
    properties: {
      status: { type: "string", enum: ["reviewed", "needs-changes", "blocked", "viewer-opened"] },
      summary: string,
      evidence: { type: "array", items: string },
    },
  },
};

export const tools = Object.entries(definitions).map(([name, definition]) => ({
  type: "function",
  function: {
    name,
    description: definition.description,
    parameters: {
      type: "object",
      properties: definition.properties,
      required: Object.keys(definition.properties),
      additionalProperties: false,
    },
  },
}));

function validValue(value, schema) {
  if (schema.type === "array") return Array.isArray(value) && value.every(item => typeof item === "string");
  if (typeof value !== "string") return false;
  if (!value.trim()) return false;
  return schema.enum ? schema.enum.includes(value) : true;
}

export function validAction(action) {
  const properties = definitions[action?.name]?.properties;
  if (!properties) return false;
  const args = action.arguments;
  if (!args || typeof args !== "object") return false;
  if (Array.isArray(args)) return false;
  if (Object.keys(args).length !== Object.keys(properties).length) return false;
  return Object.entries(properties).every(([key, schema]) => validValue(args[key], schema));
}
