import LiveProvider from "../angular-skill/live-provider.mjs";

export default class NodeTraceProvider extends LiveProvider {
  constructor() {
    super({
      id: "nodejs-skill-live-trace",
      title: "Node.js skill eval",
      fixtureVariables: {
        node: "NODEJS_SKILL_NODE_ROOT",
        browser: "NODEJS_SKILL_BROWSER_ROOT",
      },
      traceInputTools: ["skill", "read"],
    });
  }
}
