import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createOpenApiHelpers } from "../skills/promptfoo-provider-setup/scripts/openapi-helpers.mjs";
import { responseTransform } from "../skills/promptfoo-provider-setup/scripts/response-contract.mjs";
import { load } from "../skills/promptfoo-provider-setup/scripts/vendor/js-yaml.mjs";

const helpers = createOpenApiHelpers((message) => { throw new Error(message); });

function operationWithExample(example) {
  return {
    requestBody: { content: { "application/json": { example } } },
    responses: { 200: { content: { "application/json": { example } } } },
  };
}

test("OpenAPI examples handle empty arrays and preserve falsy array values", () => {
  const empty = helpers.operationInputs({}, {}, operationWithExample([]), []);
  assert.deepEqual(empty.bodyFields, []);
  assert.deepEqual(empty.requestExampleFields, {});
  assert.equal(empty.responseField, undefined);
  assert.equal(empty.requestBodyIsArray, true);
  for (const value of [0, false, ""]) {
    const inputs = helpers.operationInputs({}, {}, operationWithExample([value]), []);
    assert.deepEqual(inputs.requestExampleFields, { message: value });
    assert.deepEqual(inputs.bodyFields, ["message"]);
  }
  const object = helpers.operationInputs({}, {}, operationWithExample([{ answer: "PONG" }]), []);
  assert.deepEqual(object.requestExampleFields, { answer: "PONG" });
  assert.equal(object.responseField, "answer");
});

test("OpenAPI record defaults accept absent records but reject malformed falsy records", () => {
  assert.deepEqual(helpers.operationInputs({}, {}, {}, []).bodyFields, []);
  for (const value of [false, 0, ""]) {
    assert.throws(() => helpers.operationInputs({}, {}, { requestBody: value }, []), /must be an object/);
    assert.throws(() => helpers.operationInputs({}, {}, { responses: value }, []), /must be an object/);
  }
});

test("schema examples and read/write flags retain literal boolean semantics", () => {
  for (const value of [0, false, ""]) {
    assert.equal(helpers.schemaSample({}, { examples: [value] }, "count"), value);
  }
  assert.equal(helpers.schemaSample({}, { examples: [], type: "number" }, "count"), 1);
  const properties = {
    output: { type: "string", readOnly: "true", writeOnly: "true" },
    internal: { type: "string", readOnly: true, writeOnly: true },
  };
  const content = { "application/json": { schema: { type: "object", properties } } };
  const inputs = helpers.operationInputs({}, {}, {
    requestBody: { content }, responses: { 200: { content } },
  }, []);
  assert.deepEqual(inputs.bodyFields, ["output"]);
  assert.equal(inputs.responseField, "output");
  assert.deepEqual(inputs.responseProperties, properties);
});

test("credential matching includes both known names and suffixed names", () => {
  assert.equal(helpers.isCredentialParamName("authorization"), true);
  assert.equal(helpers.isCredentialParamName("custom_api_key"), true);
  assert.equal(helpers.isCredentialParamName("message"), false);
});

function transformFor(schema) {
  return runInNewContext(responseTransform({ schema, resolveRef: (value) => value }));
}

test("response transforms distinguish false schemas, missing schemas, and literal nullable flags", () => {
  assert.throws(() => transformFor(false)(null, '"PONG"'), /declared JSON type/);
  assert.equal(transformFor(undefined)(null, "false"), "false");
  assert.equal(transformFor({ type: "number" })(null, "0"), "0");
  assert.equal(transformFor({ type: "string" })(null, '""'), "");
  assert.equal(transformFor({ type: "string", nullable: true })(null, "null"), "null");
  assert.throws(() => transformFor({ type: "string", nullable: "true" })(null, "null"), /declared JSON type/);
});

for (const mode of ["provider", "redteam"]) {
  test(`${mode} CLI retains blank-option defaults, YAML merge keys, and credential placeholders`, async () => {
    const root = await mkdtemp(join(tmpdir(), "promptfoo-openapi-"));
    try {
      const spec = join(root, "openapi.yaml");
      await writeFile(spec, `openapi: 3.0.3
info: {title: Fixture, version: '1'}
x-parameter: &parameter
  in: query
  schema: {type: string}
paths:
  /chat:
    post:
      operationId: chat
      parameters:
        - <<: *parameter
          name: custom_trace_id
        - <<: *parameter
          name: custom_api_key
          example: synthetic-secret
      requestBody:
        content:
          application/json:
            example: {message: hello}
      responses:
        '200':
          content:
            application/json:
              example: {output: PONG}
`);
      const script = mode === "provider"
        ? "../skills/promptfoo-provider-setup/scripts/openapi-operation-to-config.mjs"
        : "../skills/promptfoo-redteam-setup/scripts/openapi-operation-to-redteam-config.mjs";
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL(script, import.meta.url)),
        "--spec", spec, "--operation-id", "chat", "--base-url-env", "API_URL",
        "--description", "", "--policy", "", "--num-tests", "",
      ], { encoding: "utf8" });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /synthetic-secret/);
      const config = load(result.stdout);
      const targets = config.providers ?? config.targets;
      assert.equal(targets.length, 1);
      const [{ config: http, inputs } = {}] = targets;
      assert.equal(http.headers["Content-Type"], "application/json");
      assert.equal(http.queryParams.custom_api_key, "{{env.CUSTOM_API_KEY}}");
      assert.match(config.description, /setup generated from chat/);
      assert.equal(runInNewContext(http.transformResponse)({ output: "PONG" }), "PONG");
      if (mode === "redteam") {
        assert.equal(inputs.custom_trace_id, "Target input field: custom_trace_id.");
        assert.equal(config.redteam.numTests, 1);
        assert.match(config.redteam.purpose, /chat target must not/);
        assert.deepEqual(config.redteam.plugins.map(({ id }) => id), ["policy"]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
