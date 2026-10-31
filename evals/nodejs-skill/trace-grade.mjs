function completedRead(toolCalls, reference) {
  return toolCalls.some(call => call.name === "read" && call.status === "completed" &&
    typeof call.arguments?.filePath === "string" &&
    call.arguments.filePath.replaceAll("\\", "/").endsWith(`/skills/nodejs/references/${reference}.md`));
}

export default function assertion(output, context) {
  try {
    const { toolCalls } = JSON.parse(output);
    const { activate, references, forbiddenReferences } = context.vars;
    if (typeof activate !== "boolean" || !Array.isArray(references) ||
        !Array.isArray(forbiddenReferences)) return false;
    const loaded = toolCalls.some(call => call.name === "skill" &&
      call.arguments?.id === "nodejs" && call.status === "completed");
    if (forbiddenReferences.some(reference => completedRead(toolCalls, reference))) return false;
    if (!activate) return !loaded;
    return loaded && references.every(reference => completedRead(toolCalls, reference));
  } catch {
    return false;
  }
}
