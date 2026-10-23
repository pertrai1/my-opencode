import { Plugin } from "@opencode/plugin";
import { createToolObserver } from "../scripts/tool-observation.mjs";

export default Plugin.define({
  id: "local-tool-observation",
  async setup(ctx) {
    if (process.env.OPENCODE_TOOL_OBSERVATION !== "1") return;
    const observer = createToolObserver({ enabled: true });
    try {
      await ctx.tool.hook("execute.before", observer.before);
      await ctx.tool.hook("execute.after", observer.after);
    } catch {
      observer.close();
    }
    return () => observer.close();
  },
});
