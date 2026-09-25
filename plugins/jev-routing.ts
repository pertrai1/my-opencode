import { Plugin } from "@opencode/plugin";
import { isRoutingEnabled, parseModelRef, routeAgent } from "../scripts/route-agent.mjs";

function currentModelRef(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const value = model as { providerID?: unknown; id?: unknown; variant?: unknown };
  if (typeof value.providerID !== "string" || typeof value.id !== "string") return undefined;
  return `${value.providerID}/${value.id}${typeof value.variant === "string" ? `#${value.variant}` : ""}`;
}

export default Plugin.define({
  id: "jev-routing",
  async setup(ctx) {
    if (!isRoutingEnabled()) {
      console.info("[jev-routing] disabled; set OPENCODE_JEV_ROUTING=1 to enable");
      return;
    }

    await ctx.session.hook("prompt", async (input) => {
      const session = await ctx.session.get({ sessionID: input.sessionID });
      const currentModel = currentModelRef(session.model);
      const decision = await routeAgent({
        text: input.prompt.text,
        currentAgent: session.agent,
        currentModel,
        context: {
          attachedFiles: input.prompt.files?.length ?? 0,
          attachedAgents: input.prompt.agents?.length ?? 0,
          attachedSkills: input.prompt.skills?.length ?? 0,
        },
      });

      console.info("[jev-routing] decision", {
        route: decision.route,
        source: decision.source,
        probability: decision.probability,
        confidence: decision.confidence,
        latencyMs: decision.latencyMs,
        reason: decision.reason,
      });

      if (decision.route === "current") return;
      if (decision.agent && decision.agent !== session.agent) {
        await ctx.session.switchAgent({ sessionID: input.sessionID, agent: decision.agent });
      }
      const model = parseModelRef(decision.model);
      if (model && decision.model !== currentModel) {
        await ctx.session.switchModel({ sessionID: input.sessionID, model });
      }
    });
  },
});
