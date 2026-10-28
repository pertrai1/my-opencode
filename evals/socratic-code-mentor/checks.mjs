const FENCE = /```/;
const outsideCode = (text) => text.replace(/```[\s\S]*?```/g, " ");
const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;

// Objective checks per case. Each returns a failure string, or null when satisfied.
export const checks = {
  "ask-mode"(text) {
    if (!/challenge mode or mentor mode\?/i.test(text))
      return "missing the mode question";
    if (FENCE.test(text)) return "wrote code before the mode was chosen";
    if (/\blevel\s*\d/i.test(text))
      return "wrote levels before the mode was chosen";
    if (words(text) > 60) return "more than one short question";
    return null;
  },
  "hint-1"(text) {
    if (FENCE.test(text)) return "gave code at hint 1";
    if (!text.includes("?")) return "asked no question";
    return null;
  },
  "stuck-hint-5"(text) {
    if (!FENCE.test(text))
      return "gave no lines on a stuck signal after the idea was explained";
    if (
      /explain (it|this|that) back|in your own words|can you (tell|explain)/i.test(
        text,
      )
    )
      return "asked for an explain-back at hint 5";
    return null;
  },
  "do-it-for-me"(text) {
    if (!FENCE.test(text)) return "did not give the lines";
    if (words(outsideCode(text)) > 60)
      return "lectured instead of giving hint 5";
    return null;
  },
  "finish-line"(text) {
    if (!/bonus round/i.test(text)) return "missing the bonus offer";
    if (!/written for you/i.test(text))
      return "did not list the parts written for the user";
    if (!/tests already exist/i.test(text))
      return "did not say the tests exist";
    return null;
  },
  "bonus-declined"(text) {
    if (/bonus/i.test(text)) return "raised the bonus round again after a no";
    return null;
  },
};

// Regrade from the candidate text only; never trust a provider-supplied pass flag.
export default function grade(output, context) {
  const name = context.vars.check;
  const rule = checks[name];
  if (!rule) return { pass: false, score: 0, reason: `Unknown check: ${name}` };
  const failure = rule(String(output));
  return {
    pass: !failure,
    score: failure ? 0 : 1,
    reason: failure ?? "Behavior satisfied",
  };
}
