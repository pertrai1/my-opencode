# OpenCode Software Factory Architecture

This harness uses a top-level OpenSpec lifecycle orchestrator. It selects the target workspace and change, owns lifecycle transitions, and delegates artifact work, delivery, review, and verification to scoped agents. The human remains the archive gate.

```mermaid
flowchart TD
    User([User request]) --> Entry{Workflow entry}
    Entry -->|OpenSpec lifecycle / opsx-*| SDLC[SDLC orchestrator]
    Entry -->|/apply or behavioral delivery| TDD[TDD orchestrator]
    Entry -->|/code-review| Review[Code-review command]

    subgraph Lifecycle[OpenSpec lifecycle: SDLC orchestrator owns transitions]
        SDLC --> Discover[Target discovery and evidence collection]
        Discover --> Resolve[Change resolution and OpenSpec status]
        Resolve --> PlanGate{Planning and execution-ready?}

        PlanGate -->|No: delegate by artifact| Proposal[Proposal author\nproposal.md]
        PlanGate -->|No: delegate by artifact| Spec[Spec author\ndelta specs]
        PlanGate -->|No: delegate by artifact| Design[Design author\ndesign.md]
        PlanGate -->|No: delegate by artifact| Tasks[Task planner\ntasks.md]
        Proposal --> PlanGate
        Spec --> PlanGate
        Design --> PlanGate
        Tasks --> PlanGate

        PlanGate -->|Yes| Classify{Task classification}
        Classify -->|Behavioral code| TDD
        Classify -->|Type or schema only| TypeOnly[Type author]
        Classify -->|Config, docs, or trivial work| Direct[Implementer\ndirect-task mode]
        TypeOnly --> DeliveryEvidence[Delivery evidence]
        Direct --> DeliveryEvidence
    end

    subgraph Delivery[Type-driven TDD delivery]
        TDD --> TypeCheck{Viable type checker?}
        TypeCheck -->|Yes| Contract[Phase 0: Type author\ncontract plus typecheck]
        TypeCheck -->|No| NoContract[No-contract mode\nrecord public API source]
        Contract --> ContractGate{Contract valid and confirmed?}
        ContractGate -->|No| Escalate[Return to owner or human]
        ContractGate -->|Yes| Red[Phase 1: Test author\none failing observable test]
        NoContract --> Red
        Red --> RedGate{RED evidence and test quality valid?}
        RedGate -->|No| Red
        RedGate -->|Yes| Green[Phase 2: Implementer\nproduction code only]
        Green --> GreenGate{Tests, typecheck, and checksums pass?}
        GreenGate -->|No: max 3 retries| Green
        GreenGate -->|Yes| DeliveryEvidence
        GreenGate -->|Escalated| Escalate
    end

    DeliveryEvidence --> Verify[Change verifier\nverification.md]
    Verify --> Verdict{Verification verdict}
    Verdict -->|Blocking or drift| Replan[Return to planning or delivery]
    Replan --> PlanGate
    Verdict -->|Warning or clear| Human[Human review and archive approval]
    Human -->|Changes requested| Replan
    Human -->|Approved| Sync{Delta spec sync needed?}
    Sync -->|Yes| Syncer[Spec syncer\nmain specs]
    Syncer --> SyncCheck{Sync complete?}
    SyncCheck -->|No| Replan
    SyncCheck -->|Yes| Archive[SDLC orchestrator\nopenspec archive]
    Sync -->|No| Archive
    Archive --> Done([Change closed])

    subgraph ReviewFlow[Independent diff review]
        Review --> Router[TypeSafe reviewer router\nor fallback rules]
        Router --> Specialists[Specialist reviewers as relevant\narchitecture, boundary, performance, production, tests, security, accessibility]
        Specialists --> Difit[Difit review and synthesis]
    end

    Explore[Explore agent\nread-only evidence collection] -. scoped analysis .-> Discover
    Explore -. scoped analysis .-> PlanGate

    classDef authority fill:#1f6feb,color:#fff,stroke:#0d419d;
    classDef gate fill:#f59e0b,color:#111827,stroke:#b45309;
    classDef agent fill:#e0f2fe,color:#0c4a6e,stroke:#0284c7;
    classDef human fill:#fce7f3,color:#831843,stroke:#db2777;
    class SDLC,TDD authority;
    class PlanGate,Classify,TypeCheck,ContractGate,RedGate,GreenGate,Verdict,Sync,SyncCheck gate;
    class Proposal,Spec,Design,Tasks,TypeOnly,Direct,Contract,NoContract,Red,Green,Verify,Syncer,Explore,Review,Router,Specialists,Difit agent;
    class Human human;
```

## Authority boundaries

- `sdlc-orchestrator` alone owns OpenSpec lifecycle commands, state transitions, task-completion status, and archive readiness.
- Planning authors edit only their assigned artifact. `spec-syncer` updates main specs only after orchestrator gating.
- `tdd-orchestrator` owns the type → RED → GREEN protocol. `type-author`, `test-author`, and `implementer` work in separated scopes; the orchestrator independently checks each phase.
- `change-verifier` writes `verification.md`, the canonical human review surface. It advises archive readiness but does not transition lifecycle state.
- Specialist reviewers and `explore` are evidence-gathering roles; they do not change the target worktree.
- A human must review current verification evidence and explicitly approve before `openspec archive` runs.
