# CI action pinning

Third-party GitHub Actions in `.github/workflows/` are pinned to full commit
SHAs, with a comment naming the corresponding release. The workflow runs
`npm run verify:workflow-actions` so new tags, branches, or short SHAs fail CI.

To update an action, identify the intended release in the action repository,
verify that its release tag resolves to the proposed commit SHA, then update
the SHA and release comment in the same reviewed change. For example:

```sh
gh api repos/OWNER/REPOSITORY/git/ref/tags/vX.Y.Z --jq '.object.sha'
```

Do not replace the SHA with a tag or branch reference.
