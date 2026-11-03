import assert from "node:assert/strict";
import test from "node:test";
import grade from "../evals/review-delegation/assertion.mjs";
import ReviewDelegationProvider from "../evals/review-delegation/provider.mjs";
import { action, delegate, finish } from "./fixtures/review-delegation-provider.mjs";

function scriptedProvider(batches) {
  const requests = [];
  const provider = new ReviewDelegationProvider({ config: { model: "fixture" } }, {
    transport: async (_url, init) => {
      const index = requests.length % batches.length;
      requests.push(JSON.parse(init.body));
      const tool_calls = batches[index].map((next, i) => ({
        id: `call-${index}-${i}`, type: "function",
        function: { name: next.name, arguments: JSON.stringify(next.arguments) },
      }));
      return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls } }] }) };
    },
  });
  return { provider, requests };
}

const context = scenario => ({ vars: { scenario } });
const viewer = action("shell", { command: "difit ." });
const inspect = action("shell", { command: "git diff" });

test("batched calls retain order and send each correlated observation before the next model turn", async () => {
  const batches = [
    [action("skill", { id: "difit-review" }), action("shell", { command: "git status --short" }), inspect],
    [delegate()],
    [finish("reviewed", ["tool-3"])],
  ];
  const { provider, requests } = scriptedProvider(batches);
  for (let run = 0; run < 2; run += 1) {
    const result = await provider.callApi("Instructions", context("ready"));
    assert.equal(result.error, undefined);
    assert.equal((await grade(result.output, context("ready"))).pass, true);
    assert.deepEqual(result.output.trace.slice(1).map(entry => entry.action), batches.flat());
    assert.deepEqual(result.output.trace.slice(1).map(entry => entry.turn), [0, 0, 0, 1, 2]);
    const first = requests[run * 3];
    assert.deepEqual(first.messages.map(message => message.role), ["system", "user"], "Episodes must start with one system message and fresh history");
    assert.match(first.messages[0].content, /^Instructions\n\nThis is a simulated repository\./);
    assert.match(first.messages[0].content, /Finish through finish, citing tool observation IDs you have received\./);
    assert.equal(first.parallel_tool_calls, false);
    const second = requests[run * 3 + 1];
    assert.deepEqual(second.messages.at(-4).tool_calls.map(call => call.id), ["call-0-0", "call-0-1", "call-0-2"]);
    assert.deepEqual(second.messages.slice(-3), result.output.trace.slice(1, 4).map((entry, i) => ({
      role: "tool", tool_call_id: `call-0-${i}`, content: `${entry.id}: ${entry.observation}`,
    })));
  }
});

test("batch execution preserves review-before-viewer checks in both orders and on reviewer failure", async () => {
  for (const [scenario, batch, status, evidence, expected] of [
    ["ready", [delegate(), viewer], "reviewed", "tool-0", null],
    ["ready", [viewer, delegate()], "reviewed", "tool-1", /before delegated difit-review/],
    ["unavailable", [delegate(), viewer], "blocked", "tool-0", /without a completed independent review/],
  ]) {
    const { provider } = scriptedProvider([batch, [finish(status, [evidence])]]);
    const result = await provider.callApi("Instructions", context(scenario));
    assert.equal(result.error, undefined);
    const verdict = await grade(result.output, context(scenario));
    if (expected) assert.match(verdict.reason, expected);
    else assert.equal(verdict.pass, true);
  }
});

test("finish cannot claim to have observed review or viewer results from its own response", async () => {
  for (const [scenario, first, status] of [["ready", delegate(), "reviewed"], ["human-viewer", viewer, "viewer-opened"]]) {
    const { provider } = scriptedProvider([[first, finish(status, ["tool-0"])]]);
    const result = await provider.callApi("Instructions", context(scenario));
    assert.equal(result.error, undefined);
    assert.match((await grade(result.output, context(scenario))).reason, /before observing/);
  }
});

test("replay rejects forged turn boundaries", async () => {
  const { provider } = scriptedProvider([[delegate(), viewer], [finish("reviewed", ["tool-0"])]]);
  const { output } = await provider.callApi("Instructions", context("ready"));
  output.trace.at(-1).turn = 0;
  assert.equal((await grade(output, context("ready"))).pass, false);
  output.trace.at(-1).turn = 99;
  assert.match((await grade(output, context("ready"))).reason, /boundaries do not match replay/);
});

test("batches exceeding the action budget or containing actions after finish fail explicitly", async () => {
  for (const [batches, expected] of [
    [[Array(9).fill(inspect), [delegate(), finish("reviewed", ["tool-9"])]], /remaining action budget/],
    [[[delegate()], [finish("reviewed", ["tool-0"]), viewer]], /after finish/],
  ]) {
    const { provider } = scriptedProvider(batches);
    const result = await provider.callApi("Instructions", context("ready"));
    assert.equal(result.output, undefined);
    assert.match(result.error, expected);
    assert.ok(result.metadata.trace.length > 1);
  }
  const { provider, requests } = scriptedProvider([Array(10).fill(inspect)]);
  const result = await provider.callApi("Instructions", context("ready"));
  assert.equal(result.error, undefined);
  assert.equal(result.output.trace.length, 11);
  assert.equal(requests.length, 1);
  assert.match((await grade(result.output, context("ready"))).reason, /No final report/);
});

test("empty and malformed batches are protocol errors rather than partial executions", async () => {
  const call = { id: "call-0", type: "function", function: { name: "shell", arguments: '{"command":"git diff"}' } };
  for (const calls of [[], [call, call], [{ ...call, id: "" }], [call, { ...call, id: "call-1", function: { name: "shell", arguments: "{" } }]]) {
    const provider = new ReviewDelegationProvider({ config: { model: "fixture" } }, {
      transport: async () => ({ ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls: calls } }] }) }),
    });
    const result = await provider.callApi("Instructions", context("ready"));
    assert.equal(result.output, undefined);
    assert.ok(result.error);
    assert.equal(result.metadata.trace.length, 1);
  }
});
