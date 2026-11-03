# Sources and license

The five topic references in this directory adapt selected guidance from
[Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md), by **Yoni Goldberg and contributors**,
at commit `dc3d60c29d5483d9ea99cf261bbd6203516a2ba7` (2026 edition), retrieved
2026-10-30. Section numbers on each reference identify the source material.

The adapted references, including our changes, are licensed under
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
The [upstream license text](../LICENSE.txt), with normalized line endings, retains its disclaimer of
warranties and limitations of liability. Section 7(b) contains a duplicated suffix
in the pinned upstream file; it is retained verbatim for provenance, rather than
silently editing the upstream license. The canonical license is linked above.
No upstream endorsement is implied.
This notice applies to these adapted documents; it does not relicense unrelated
repository code or the separately authored eval harness.

Changes: condensed and regrouped prose; omitted branding, examples, library/vendor
rankings, formatting mandates, and framework/TypeScript migration recommendations.
Added task boundaries for CLIs, scripts, libraries, and mixed monorepos. Qualified
blanket promise-return rules, ORM safety claims, and outdated rejection behavior.
Added cancellation, resource ownership, and version checks rather than importing
all upstream advice as mandatory rules.

For runtime-sensitive details, consult the project's supported version of the
[Node.js process documentation](https://nodejs.org/docs/latest-v22.x/api/process.html),
[globals documentation](https://nodejs.org/docs/latest-v22.x/api/globals.html),
and [stream documentation](https://nodejs.org/docs/latest-v22.x/api/stream.html).
These links illustrate the Node 22 documentation used during curation; Node 22
is not a required version for consumers of this skill.

To update: inspect the upstream diff and license, review affected topic sections
against current runtime/framework documentation, revise section mappings and
this pin together, preserve attribution and license notices, and rerun the evals
and repository checks. Do not automatically sync or vendor the whole collection.
