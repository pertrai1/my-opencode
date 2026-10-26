const repository = {
  "settings.json": JSON.stringify({
    defaultModel: "example/model-a",
  }),
  "README.md": [
    "Supported models:",
    "- example/model-a",
    "- example/model-b",
  ].join("\n"),
};

export const cases = [
  {
    id: "missing-target",
    request: "Change the default model.",
    files: { ...repository },
    expected: {
      action: "ask",
      questionIntent: "Ask which model should become the default.",
      edits: {},
    },
  },
  {
    id: "explicit-target",
    request: "Change the default model to example/model-b",
    files: { ...repository },
    expected: {
      action: "edit",
      edits: {
        "settings.json": JSON.stringify({
          defaultModel: "example/model-b",
        }),
      },
    },
  },
  {
    id: "target-in-docs",
    request:
      "Update the default model to the target specified in our project docs.",
    files: {
      ...repository,
      "README.md": [
        repository["README.md"],
        "",
        "The target default model is example/model-b.",
      ].join("\n"),
    },
    expected: {
      action: "edit",
      edits: {
        "settings.json": JSON.stringify({
          defaultModel: "example/model-b",
        }),
      },
    },
  },
  {
    id: "conflicting-docs",
    request:
      "Update the default model to the target specified in our project docs.",
    files: {
      ...repository,
      "README.md": [
        repository["README.md"],
        "",
        "Default-model targets are documented in model-policy.md",
        "and runtime-policy.md. Neither takes precedence.",
      ].join("\n"),
      "model-policy.md": "The target default model is example/model-a.",
      "runtime-policy.md": "The target default model is example/model-b.",
    },
    expected: {
      action: "ask",
      questionIntent:
        "Identify the conflicting documented targets and ask which to use.",
      edits: {},
    },
  },
];
