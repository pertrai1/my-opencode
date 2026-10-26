// Format/arithmetic checks only. This cannot judge evidence or semantic ratings.
export default function checkMechanics(output) {
  const fail = (reason) => ({ pass: false, score: 0, reason });
  if (typeof output !== "string") return fail("Expected a five-line assessment");
  const lines = output.trim().split(/\r?\n/);
  const [firstLine = ""] = lines;
  const header = /^Review risk \((?:proposed|reviewer)\): R([0-2]) \+ C([0-2]) \+ U([0-2]) = ([0-6])\/6; (quick|focused|deep) \([^\n]+\); override: (.+)\.$/.exec(firstLine);
  if (!header) return fail("Invalid rating range or assessment header");
  const [, reach, consequence, uncertainty, total, budget, override] = header;
  if (!override.trim()) return fail("Missing override reason or none");
  if (+reach + +consequence + +uncertainty !== +total) return fail("Incorrect sum");
  const overridden = override.trim().toLowerCase() !== "none";
  if (+consequence === 2 && !overridden) return fail("C2 requires an explicit override");
  const expected = overridden || +total >= 4 ? "deep" : +total >= 2 ? "focused" : "quick";
  if (budget !== expected) return fail("Budget does not match total/override");
  const labels = ["Scope:", "Evidence:", "Impact:", "Focus / gaps:"];
  if (lines.length !== 5 || labels.some((label, index) => !lines[index + 1]?.startsWith(`${label} `) || !lines[index + 1].slice(label.length).trim())) {
    return fail("Missing scope, evidence, impact, or focus/gaps field");
  }
  return { pass: true, score: 1, reason: "Mechanics pass; semantic judgment remains unverified" };
}
