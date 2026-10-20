const net = require("node:net");

// Loaded only by eval:calibrate. Also blocks Promptfoo's telemetry opt-out event.
net.Socket.prototype.connect = function () {
  throw new Error("Network connections are disabled for offline calibration");
};
globalThis.fetch = async function () {
  throw new Error("Fetch is disabled for offline calibration");
};
