const descriptions = {
  read_output: "Retrieve retained test-process output and exit status.",
  list_tools: "Discover currently available file-reading tools.",
  read_file: "Read package.json.",
  legacy_read: "Legacy file reader.",
  remote_head: "Read the current remote branch head.",
  check_ci: "Read CI for the supplied head SHA.",
  read_diff: "Review the independent documentation diff.",
  archive: "Attempt to archive the change.",
  plan: "Create a planning artifact.",
  delegate: "Delegate the task to another agent.",
  report: "Finish with a status and evidence IDs; supply answer for a file-content question.",
};

export function tool(name) {
  let properties = {};
  let required = [];
  if (name === "check_ci") { properties = { head: { type: "string" } }; required = ["head"]; }
  if (name === "report") {
    properties = { status: { type: "string", enum: ["passed", "defect", "inconclusive", "completed", "blocked"] }, evidence: { type: "array", items: { type: "string" } }, answer: { type: "string" } };
    required = ["status", "evidence"];
  }
  return { type: "function", function: { name, description: descriptions[name], parameters: { type: "object", properties, required, additionalProperties: false } } };
}

export function validArguments(name, args) {
  if (!Object.hasOwn(descriptions, name) || !args || typeof args !== "object" || Array.isArray(args)) return false;
  const { properties, required } = tool(name).function.parameters;
  if (required.some(key => !Object.hasOwn(args, key))) return false;
  return Object.entries(args).every(([key, value]) => {
    const schema = properties[key];
    if (!schema) return false;
    if (schema.type === "array") return Array.isArray(value) && value.every(item => typeof item === schema.items.type);
    return typeof value === schema.type && (!schema.enum || schema.enum.includes(value));
  });
}
