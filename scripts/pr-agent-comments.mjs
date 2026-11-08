import { patchFiles, safePath } from "./pr-agent-snapshot.mjs";

function linesInHunks(chunk, side) {
  const lines = new Set();
  let line;
  for (const text of chunk.split("\n")) {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { line = Number(hunk[side === "old" ? 1 : 2]); continue; }
    if (line === undefined || !/^[ +-]/.test(text)) continue;
    const skipped = side === "old" ? "+" : "-";
    if (!text.startsWith(skipped)) { lines.add(line); line++; }
  }
  return lines;
}

function credentialLike(body) {
  return /gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|password|token|secret)\s*[:=]\s*["']?[a-z0-9_+/-]{16,}/i.test(body);
}

function validBody(body) {
  if (!nonEmptyString(body)) return false;
  return body.length <= 8000 && !credentialLike(body);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function lineRange(line) {
  if (typeof line !== "object" || line === null) return { start: line, end: line };
  return line;
}

function validRange(start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
  return start > 0 && end >= start && end - start <= 200;
}

function anchorFile(comment, patch) {
  const key = comment.position.side === "old" ? "oldPath" : "newPath";
  return patchFiles(patch).find(item => item[key] === comment.filePath);
}

function validPosition(comment, patch) {
  const { side, line } = comment.position ?? {};
  if (!["old", "new"].includes(side)) return false;
  const { start, end } = lineRange(line);
  if (!validRange(start, end)) return false;
  const file = anchorFile(comment, patch);
  if (!file) return false;
  const available = linesInHunks(file.chunk, side);
  for (let at = start; at <= end; at++) if (!available.has(at)) return false;
  return true;
}

export function validComment(comment, patch) {
  if (comment?.type !== "thread" || !safePath(comment.filePath)) return false;
  return validBody(comment.body) && validPosition(comment, patch);
}

function issuePosition(issue, patch) {
  const file = patchFiles(patch).find(item => item.newPath === issue.relevant_file || item.oldPath === issue.relevant_file);
  const line = issue.start_line === issue.end_line ? issue.start_line : { start: issue.start_line, end: issue.end_line };
  return { side: file?.newPath ? "new" : "old", line };
}

function issueComment(issue, patch) {
  if (!nonEmptyString(issue?.issue_content)) return null;
  return {
    type: "thread", filePath: issue.relevant_file,
    position: issuePosition(issue, patch),
    body: `${issue.issue_header ?? "Review finding"}\n\n${issue.issue_content}`,
  };
}

function reviewIssues(payload) {
  const issues = payload?.review?.key_issues_to_review;
  if (!Array.isArray(issues)) throw new Error("Invalid structured review: expected key_issues_to_review array.");
  return issues;
}

export function reviewCandidates(payload, patch) {
  const issues = reviewIssues(payload);
  const comments = [];
  const unanchored = [];
  for (const [index, issue] of issues.entries()) {
    const comment = issueComment(issue, patch);
    if (validComment(comment, patch)) comments.push(comment);
    else unanchored.push({ issueIndex: index, reason: "Invalid anchor or unsafe/invalid body; inspect original review locally." });
  }
  return { comments, unanchored, coverage: payload.coverage ?? { status: "unknown" } };
}
