const safetyPlugin = require('../../plugins/safety.ts').default;

function createAsyncEventStream() {
  const pending = [];
  const waiters = [];
  let closed = false;

  return {
    emit(event) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value: event, done: false });
      } else {
        pending.push(event);
      }
    },
    close() {
      closed = true;
      while (waiters.length > 0) waiters.shift()({ done: true });
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (pending.length > 0) return Promise.resolve({ value: pending.shift(), done: false });
            if (closed) return Promise.resolve({ done: true });
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    },
  };
}

async function SafetyPlugin({ directory }, options) {
  const events = createAsyncEventStream();
  const sessionAgents = new Map();
  const hooks = { prompt: null, permission: null, before: null, after: null };

  const cleanup = await safetyPlugin.setup({
    options: options ?? {},
    location: { directory },
    event: { subscribe: () => events.stream },
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
      events.close();
      cleanup?.();
    },
    'chat.message': async (input) => {
      if (!sessionAgents.has(input.sessionID) && sessionAgents.size >= 1000) {
        sessionAgents.delete(sessionAgents.keys().next().value);
      }
      sessionAgents.set(input.sessionID, input.agent);
      await hooks.prompt({ sessionID: input.sessionID });
    },
    event: async ({ event }) => {
      if (event.type === 'session.deleted') sessionAgents.delete(event.properties.sessionID);
      events.emit({ type: event.type, data: event.properties });
      await new Promise((resolve) => setImmediate(resolve));
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
