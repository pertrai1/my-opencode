export function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("Expected a credential-free local HTTP endpoint");
  }
  return url;
}

const descriptions = {
  read_output: "Retrieve retained test-process output and exit status.",
  list_tools: "Discover currently available file-reading tools.",
  read_file: "Read package.json.",
  legacy_read: "Legacy file reader.",
  remote_head: "Read the current remote branch head.",
  check_ci: "Read CI for the supplied head SHA.",
  read_diff: "Review the independent documentation diff.",
  archive: "Attempt to archive the change.",
  plan: "Create a planning artifact.",
  delegate: "Delegate the task to another agent.",
  report: "Finish with a status and evidence IDs; supply answer for a file-content question.",
};

function tool(name) {
  let properties = {};
  let required = [];
  if (name === "check_ci") { properties = { head: { type: "string" } }; required = ["head"]; }
  if (name === "report") {
    properties = { status: { type: "string", enum: ["passed", "defect", "inconclusive", "completed", "blocked"] }, evidence: { type: "array", items: { type: "string" } }, answer: { type: "string" } };
    required = ["status", "evidence"];
  }
  return { type: "function", function: { name, description: descriptions[name], parameters: { type: "object", properties, required, additionalProperties: false } } };
}

export function createPolicy({ endpoint, model, agent, transport = fetch }) {
  const url = localEndpoint(endpoint);
  const messages = [{ role: "system", content: agent }, { role: "system", content: "This is a simulated tool environment. Use one tool call per turn. Finish via report, citing observation IDs. Tools have no real external effects." }];
  const responses = [];
  let previous;
  async function next(input) {
    next.trace = structuredClone(input.trace);
    if (!previous) messages.push({ role: "user", content: `${input.request}\ninitial: ${input.trace[0].observation}` });
    else {
      const observation = input.trace.at(-1);
      messages.push({ role: "tool", tool_call_id: previous.id, content: `${observation.id}: ${observation.observation}` });
    }
    const response = await transport(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, messages, tools: [...input.tools, "report"].map(tool), tool_choice: "required", parallel_tool_calls: false }),
    });
    if (!response.ok) throw new Error(`Local model HTTP ${response.status}`);
    const data = await response.json();
    responses.push(data);
    const message = data.choices?.[0]?.message;
    if (message?.tool_calls?.length !== 1) return undefined;
    messages.push(message);
    previous = message.tool_calls[0];
    try { return { name: previous.function.name, arguments: JSON.parse(previous.function.arguments) }; }
    catch { return undefined; }
  }
  next.responses = responses;
  return next;
}
