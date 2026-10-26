export function createEnvironment(initialFiles) {
  const files = structuredClone(initialFiles);
  const trace = [];
  let stopped = false;

  function call(name, args = {}) {
    const entry = {
      name,
      args: structuredClone(args),
    };
    trace.push(entry);

    function reject(message) {
      entry.error = message;
      throw new Error(message);
    }

    if (stopped) {
      reject("Episode already stopped.");
    }

    switch (name) {
      case "read_file": {
        if (!Object.hasOwn(files, args.path)) {
          reject("File not found.");
        }
        entry.result = files[args.path];
        break;
      }
      case "edit_file": {
        if (!Object.hasOwn(files, args.path)) {
          reject("File not found.");
        }
        if (typeof args.content !== "string") {
          reject("File content must be a string");
        }
        files[args.path] = args.content;
        entry.result = "File updated";
        break;
      }
      case "ask_user": {
        if (typeof args.question !== "string" || !args.question.trim()) {
          reject("A nonempty question is required");
        }
        stopped = true;
        entry.result = "Waiting for the user's answer.";
        break;
      }
      case "finish": {
        stopped = true;
        entry.result = "Episode finished.";
        break;
      }
      default:
        reject(`Unknown tool: ${name}`);
    }

    return entry.result;
  }

  return {
    call,
    snapshot: () => structuredClone({ files, trace, stopped }),
  };
}
