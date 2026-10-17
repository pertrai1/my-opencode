// Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
module.exports = function (varName, prompt, otherVars) {
  if (varName === "context") {
    return {
      output: `... Documents for ${otherVars.inquiry} for prompt: ${prompt} ...`,
    };
  }

  // Default variable value
  return {
    output: "Document A, Document B, Document C, ...",
  };
};
