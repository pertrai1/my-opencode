const safetyPlugin = require('../../plugins/safety.ts').default;

async function SafetyPlugin({ directory }, options) {
  const sessionAgents = new Map();
  const hooks = { prompt: null, permission: null, before: null, after: null };

  const cleanup = await safetyPlugin.setup({
    options: options ?? {},
    location: { directory },
    event: { subscribe: () => [] },
    session: { hook: async (_name, handler) => { hooks.prompt = handler; } },
    permission: { hook: async (_name, handler) => { hooks.permission = handler; } },
    tool: {
      hook: async (name, handler) => {
        if (name === 'execute.before') hooks.before = handler;
        if (name === 'execute.after') hooks.after = handler;
      },
    },
  });

  return {
    dispose: async () => {
      cleanup?.();
    },
    'chat.message': async (input) => {
      // Adapt old fixtures to the agent field carried by V2 tool events.
      sessionAgents.set(input.sessionID, input.agent);
      await hooks.prompt({ sessionID: input.sessionID });
    },
    'permission.ask': async (input, output) => {
      const event = { agent: sessionAgents.get(input.sessionID), action: input.type, effect: 'ask' };
      await hooks.permission(event);
      if (event.effect === 'deny') output.status = 'deny';
    },
    'tool.execute.before': async (input, output) => hooks.before({
      tool: input.tool,
      sessionID: input.sessionID,
      agent: sessionAgents.get(input.sessionID),
      input: output.args ?? {},
    }),
    'tool.execute.after': async (input, output) => {
      const event = {
        tool: input.tool,
        sessionID: input.sessionID,
        input: input.args ?? {},
        status: 'completed',
        result: { content: output.output ?? '' },
      };
      await hooks.after(event);
      output.output = event.result.content;
    },
  };
}

module.exports = { SafetyPlugin };
