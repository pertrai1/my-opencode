export default function assertion(output, context) {
  try {
    const { toolCalls } = JSON.parse(output);
    const loaded = toolCalls.some(call => call.name === "skill" &&
      call.arguments?.id === "nodejs" && call.status === "completed");
    if (!context.vars.activate) return !loaded;
    return loaded && context.vars.references.every(reference => toolCalls.some(call =>
      call.name === "read" && call.status === "completed" &&
      typeof call.arguments?.filePath === "string" &&
      call.arguments.filePath.replaceAll("\\", "/").endsWith(`/skills/nodejs/references/${reference}.md`)
    ));
  } catch {
    return false;
  }
}
