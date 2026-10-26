import { cases } from "./cases.mjs";
import { tools } from "./tools.mjs";
import { createEnvironment } from "./environment.mjs";

export default class ClarificationProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
  }

  id() {
    return "clarification-simulation";
  }

  async callApi(prompt, context) {
    const scenario = cases.find((item) => item.id === context.vars.scenario);

    if (!scenario) return { error: "Unknown clarification scenario." };
    if (!process.env.OPENAI_API_KEY) {
      return { error: "OPENAI_API_KEY is missing." };
    }

    const environment = createEnvironment(scenario.files);
    const model = this.config.model ?? "gpt-6-astra";
    const effort = this.config.reasoningEffort ?? "high";
    const responses = [];

    const instructions = [
      prompt,
      "You are operating in a simulated repository.",
      "Use read_file and edit_file to access its files.",
      "Communicate questions through ask_user; end completed tasks with finish.",
      "Only the supplied tools are available. They have no external effects.",
    ].join("\n\n");

    let previousResponseId;
    let input = [
      {
        role: "user",
        content: [
          scenario.request,
          `Available files: ${Object.keys(scenario.files).join(", ")}`,
        ].join("\n\n"),
      },
    ];

    try {
      for (let step = 0; step < 8; step += 1) {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: AbortSignal.timeout(120_000),
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            reasoning: { effort },
            instructions,
            input,
            tools,
            tool_choice: "required",
            parallel_tool_calls: false,
            previous_response_id: previousResponseId,
            store: true,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `OpenAI HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const data = await response.json();
        responses.push(data);

        if (data.status !== "completed") {
          throw new Error(`Response did not complete: ${data.status}`);
        }

        const calls = data.output.filter(
          (item) => item.type === "function_call",
        );
        if (calls.length !== 1) {
          throw new Error("Expected exactly one tool call.");
        }

        const call = calls.at(0);
        const args = JSON.parse(call.arguments);
        let result;

        try {
          result = environment.call(call.name, args);
        } catch (error) {
          result = `Tool error: ${error.message}`;
        }

        if (environment.snapshot().stopped) break;

        previousResponseId = data.id;
        input = [
          {
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          },
        ];
      }

      return {
        output: {
          scenario: scenario.id,
          ...environment.snapshot(),
        },
        metadata: { model, effort, responses },
      };
    } catch (error) {
      return {
        error: error.message,
        metadata: {
          model,
          effort,
          responses,
          trace: environment.snapshot().trace,
        },
      };
    }
  }
}
