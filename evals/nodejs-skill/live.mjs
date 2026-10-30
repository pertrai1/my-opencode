import replay from "./replay.mjs";

export default {
  ...replay,
  description: "Node.js skill model plan evaluation — paid, explicit opt-in",
  providers: ["openai:gpt-6.1-sol"],
  evaluateOptions: { maxConcurrency: 1 },
};
