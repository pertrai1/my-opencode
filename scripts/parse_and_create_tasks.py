#!/usr/bin/env python3
import subprocess
import json
import re
import sys
import os

def run_command(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return result.stdout.strip()

def main():
    print("Fetching body of Issue #3...")
    try:
        body = run_command(["gh", "issue", "view", "3", "--repo", "pertrai1/my-opencode", "--json", "body", "--jq", ".body"])
    except Exception as e:
        print(f"Error fetching issue #3: {e}", file=sys.stderr)
        sys.exit(1)

    lines = body.split("\n")
    backlog_start = -1
    for i, line in enumerate(lines):
        if "## 📋 Actionable Backlog" in line:
            backlog_start = i
            break

    if backlog_start == -1:
        print("Could not find '## 📋 Actionable Backlog' section in Issue #3 body.")
        sys.exit(1)

    print(f"Found backlog section starting at line {backlog_start}")

    # Identify lines that represent unchecked tasks
    updated_lines = list(lines)
    issues_created = 0

    # Pattern: * [ ] **Title** (Description)
    # Let's match: * [ ] **Title** (Description) with optional extra text at end
    task_regex = re.compile(r"^\*\s+\[\s*\]\s+\*\*(.*?)\*\*\s+\((.*?)\)(.*)$")

    for i in range(backlog_start + 1, len(lines)):
        line = lines[i]
        # Stop at next major section if any
        if line.startswith("## ") or line.startswith("---"):
            # Wait, let's not stop unless it's a completely new major header,
            # but let's check if the line matches our task regex
            pass

        match = task_regex.match(line)
        if match:
            title = match.group(1).strip()
            description = match.group(2).strip()
            extra = match.group(3).strip()

            # Check if there is already an issue number linked (e.g. #12 or similar)
            if re.search(r"#\d+", line) or re.search(r"#\d+", extra):
                print(f"Task '{title}' already has a linked issue. Skipping.")
                continue

            print(f"Found unlinked task: '{title}' - '{description}'")

            # Let's check if this is one of the closed ones or we should create it
            # The task asks us to: "create structured sub-tasks linked to issue #3"
            # Let's create a GitHub issue for it!
            issue_title = f"[Task] {title}"
            issue_body = f"""Part of #3

## What to build
{description}

## Acceptance criteria
- [ ] Implement the feature conforming to specifications
- [ ] Verify using the project's test suite and typechecker

## Blocked by
None — can start immediately
"""

            print(f"Creating GitHub issue for '{title}'...")
            try:
                # Create issue with labels 'ready-for-agent'
                issue_url = run_command([
                    "gh", "issue", "create",
                    "--repo", "pertrai1/my-opencode",
                    "--title", issue_title,
                    "--body", issue_body,
                    "--label", "ready-for-agent"
                ])
                # The output is like: https://github.com/pertrai1/my-opencode/issues/15
                issue_num_match = re.search(r"/issues/(\d+)", issue_url)
                if issue_num_match:
                    issue_num = issue_num_match.group(1)
                    print(f"Created issue #{issue_num} for '{title}'")
                    # Update the line to include the linked issue
                    updated_lines[i] = f"* [ ] **{title}** ({description}) - #{issue_num}"
                    issues_created += 1
                else:
                    print(f"Warning: Could not parse issue number from URL: {issue_url}")
            except Exception as e:
                print(f"Error creating issue for '{title}': {e}", file=sys.stderr)

    if issues_created > 0:
        print("Updating Issue #3 with linked issue numbers...")
        new_body = "\n".join(updated_lines)
        try:
            # Write to a temporary file to avoid shell argument limit/issues with large body
            with open("/tmp/updated_issue_3_body.md", "w") as f:
                f.write(new_body)
            run_command([
                "gh", "issue", "edit", "3",
                "--repo", "pertrai1/my-opencode",
                "--body-file", "/tmp/updated_issue_3_body.md"
            ])
            print("Successfully updated Issue #3 on GitHub.")
        except Exception as e:
            print(f"Error updating issue #3 body: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print("No new issues needed to be created.")

if __name__ == "__main__":
    main()
