function defineTool(name, description, properties) {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const tools = [
  defineTool("read_file", "Read a file from the simulated repository.", {
    path: { type: "string" },
  }),
  defineTool("edit_file", "Replace the entire contents of an existing file.", {
    path: { type: "string" },
    content: { type: "string" },
  }),
  defineTool(
    "ask_user",
    "Ask the user a question and pause until they answer.",
    {
      question: { type: "string" },
    },
  ),
  defineTool("finish", "End the task.", {}),
];
