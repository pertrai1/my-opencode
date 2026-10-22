import { Plugin } from "@opencode/plugin";
import {
  hasExplicitAgentSelection,
  getRoutingDiagnostic,
  isRoutingEnabled,
  parseModelRef,
  routeAgent,
} from "../scripts/route-agent.mjs";
import {
  createRoutingProvenance,
  emitRoutingProvenance,
} from "../scripts/routing-provenance.mjs";

function currentModelRef(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const value = model as { providerID?: unknown; id?: unknown; variant?: unknown };
  if (typeof value.providerID !== "string" || typeof value.id !== "string") return undefined;
  return `${value.providerID}/${value.id}${typeof value.variant === "string" ? `#${value.variant}` : ""}`;
}

export default Plugin.define({
  id: "jev-routing",
  async setup(ctx) {
    console.info("[jev-routing] diagnostic", getRoutingDiagnostic());
    if (!isRoutingEnabled()) {
      return;
    }

    await ctx.session.hook("prompt", async (input) => {
      const session = await ctx.session.get({ sessionID: input.sessionID });
      if (hasExplicitAgentSelection(input.prompt, session.agent)) {
        console.info("[jev-routing] preserving explicit agent selection", {
          agent: session.agent,
        });
        await emitRoutingProvenance(createRoutingProvenance({
          sessionId: input.sessionID,
          timestamp: new Date().toISOString(),
          currentAgent: session.agent,
          currentModel: currentModelRef(session.model),
          decision: {
            source: "explicit",
            route: "current",
            agent: session.agent,
            model: currentModelRef(session.model),
            accepted: false,
            reason: "explicit-selection-bypass",
          },
          explicitSelectionBypass: true,
        }), console.info, { enabled: true });
        return;
      }
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
        probabilities: decision.probabilities,
        confidence: decision.confidence,
        latencyMs: decision.latencyMs,
        reason: decision.reason,
      });

      await emitRoutingProvenance(createRoutingProvenance({
        sessionId: input.sessionID,
        timestamp: new Date().toISOString(),
        currentAgent: session.agent,
        currentModel,
        decision: {
          ...decision,
          source: decision.source === "typesafe" ? "jev" : decision.source,
        },
      }), console.info, { enabled: true });

      if (decision.route === "current" || process.env.OPENCODE_JEV_ROUTING_DRY_RUN === "1") return;
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
