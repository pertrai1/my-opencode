#!/usr/bin/env python3
import subprocess
import json
import sys
import re
import os

def run_command(cmd, workdir=None):
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=workdir)
    if result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        print(f"STDOUT:\n{result.stdout}")
        print(f"STDERR:\n{result.stderr}")
        raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
    return result.stdout.strip()

def main():
    repo_path = "/home/pertrai1/my-opencode"
    
    # 1. Fetch available 'ready-for-agent' issues that are not 'claimed'
    print("Listing open issues to find 'ready-for-agent' tasks...")
    try:
        issues_json = run_command([
            "gh", "issue", "list", 
            "--repo", "pertrai1/my-opencode", 
            "--label", "ready-for-agent", 
            "--state", "open", 
            "--json", "number,title,labels,body"
        ], workdir=repo_path)
        issues = json.loads(issues_json)
    except Exception as e:
        print(f"Error fetching issues: {e}", file=sys.stderr)
        sys.exit(1)

    # Filter out claimed issues
    unclaimed_issues = []
    for issue in issues:
        labels = [l['name'] for l in issue.get('labels', [])]
        if 'claimed' not in labels:
            unclaimed_issues.append(issue)

    if not unclaimed_issues:
        print("No unclaimed 'ready-for-agent' issues found.")
        sys.exit(0)

    target_issue = unclaimed_issues[0]
    issue_num = target_issue['number']
    issue_title = target_issue['title']
    issue_body = target_issue['body']

    print(f"Picking up Issue #{issue_num}: '{issue_title}'")

    # 2. Claim the issue
    print(f"Claiming Issue #{issue_num} on GitHub...")
    try:
        run_command([
            "gh", "issue", "edit", str(issue_num),
            "--repo", "pertrai1/my-opencode",
            "--add-label", "claimed"
        ], workdir=repo_path)
    except Exception as e:
        print(f"Warning: Failed to add 'claimed' label: {e}", file=sys.stderr)

    # 3. Create a clean branch task/issue-<number> from main
    branch_name = f"task/issue-{issue_num}"
    print(f"Setting up branch '{branch_name}'...")
    try:
        # Fetch latest changes
        run_command(["git", "fetch", "origin"], workdir=repo_path)
        # Checkout branch
        run_command(["git", "checkout", "-B", branch_name, "origin/main"], workdir=repo_path)
    except Exception as e:
        print(f"Error preparing git branch: {e}", file=sys.stderr)
        sys.exit(1)

    # 4. Invoke OpenCode Agent to implement the issue!
    print("Starting OpenCode agent to implement the issue...")
    prompt_msg = f"""Implement all requirements for issue #{issue_num}: '{issue_title}'

Requirements:
{issue_body}

Instructions:
1. Read the relevant files in the repository.
2. Carefully implement the changes needed.
3. Verify your changes by running the test suite: 'npm run test' or 'npm test'.
4. Ensure code linting passes: 'npm run lint'.
5. Once your changes are complete and verified, stop. Do not commit or push.
"""
    try:
        # We run the opencode CLI with --auto to auto-approve safe tools.
        # This will run the agent to execute the requested changes!
        run_command([
            "opencode", "run", prompt_msg, "--auto"
        ], workdir=repo_path)
        print("OpenCode agent finished execution.")
    except Exception as e:
        print(f"Error during OpenCode agent execution: {e}", file=sys.stderr)
        # We do not exit immediately; we check if any changes were made and if they pass tests.

    # 5. Verify the changes using the repository's Unified Bug Scanner (UBS)
    print("Verifying changes with Unified Bug Scanner (UBS)...")
    try:
        # Run scripts/ubs.sh or npm run test
        run_command(["bash", "scripts/ubs.sh"], workdir=repo_path)
        print("✅ UBS checks passed successfully!")
    except Exception as e:
        print(f"❌ Verification failed: {e}", file=sys.stderr)
        # Let's see if we should still commit/push or stop
        print("Stopping due to verification failure.")
        sys.exit(1)

    # 6. Commit the changes
    print("Committing changes...")
    try:
        status_out = run_command(["git", "status", "--porcelain"], workdir=repo_path)
        if not status_out:
            print("No changes to commit. OpenCode did not make any edits, or they are already committed.")
        else:
            run_command(["git", "add", "."], workdir=repo_path)
            commit_msg = f"feat: implement issue #{issue_num} - {issue_title}"
            run_command(["git", "commit", "-m", commit_msg], workdir=repo_path)
            print("Successfully committed changes.")
    except Exception as e:
        print(f"Error committing changes: {e}", file=sys.stderr)
        sys.exit(1)

    # 7. Push the branch to the fork repository
    print(f"Pushing branch '{branch_name}' to fork repository...")
    try:
        run_command(["git", "push", "-f", "fork", branch_name], workdir=repo_path)
        print("Successfully pushed branch to fork.")
    except Exception as e:
        print(f"Error pushing branch to fork: {e}", file=sys.stderr)
        sys.exit(1)

    # 8. Submit a pull request on GitHub
    print("Submitting pull request on GitHub...")
    try:
        pr_title = f"feat: implement issue #{issue_num} - {issue_title}"
        pr_body = f"This automated PR implements issue #{issue_num}.\n\nCloses #{issue_num}"
        pr_url = run_command([
            "gh", "pr", "create",
            "--repo", "pertrai1/my-opencode",
            "--head", f"pertrai1-bot:{branch_name}",
            "--base", "main",
            "--title", pr_title,
            "--body", pr_body
        ], workdir=repo_path)
        print(f"🎉 Successfully created pull request: {pr_url}")
    except Exception as e:
        print(f"Error creating pull request: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
