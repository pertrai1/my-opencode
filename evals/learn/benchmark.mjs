import { readFileSync } from "node:fs";
import yaml from "js-yaml";

// Share the existing command prompt, all ten cases, and every assertion.
const learn = yaml.load(readFileSync(new URL("./promptfooconfig.yaml", import.meta.url), "utf8"));
const [provider] = learn.providers;

export default {
  ...learn,
  description: "Learn benchmark: baseline and candidate on the same ten cases",
  providers: [
    { ...provider, id: process.env.LEARN_BASELINE_PROVIDER ?? provider.id, label: "baseline" },
    { ...provider, id: process.env.LEARN_CANDIDATE_PROVIDER ?? "openai:chat:gpt-4o-mini", label: "candidate" },
  ],
};
