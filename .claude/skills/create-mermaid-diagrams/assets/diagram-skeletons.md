# Diagram Skeletons

Copy-paste starting points — each is empty-but-valid Mermaid using real inventory-style module names
as placeholders. Replace the placeholder nodes/participants/entities with the ones your diagram
actually needs; keep the quoting and `end`-matching structure intact.

## Flowchart (`flowchart LR`) — use for a use-case or data flow

```mermaid
flowchart LR
    source["ui/widgets (source)"] --> store["logic/store (thunk)"]
    store --> adapter["logic/adapter"]
    adapter --> handler["Go handler (internal/<pkg>)"]
    handler --> service["Go service (internal/<pkg>svc)"]
    service --> repo["Repository / OS resource"]
```

Use for: the inward-pointing `thunk → adapter → handler → service → repository` path, or any other
layered/pipeline flow. Swap `LR` for `TD` when depicting layered architecture rather than a
left-to-right pipeline.

## Sequence diagram (`sequenceDiagram`) — use for a request/response or event interaction

```mermaid
sequenceDiagram
    participant UI as "ui/widgets/<feature>"
    participant AD as "logic/adapter"
    participant H as "Handler (internal/<pkg>)"
    UI->>AD: call(request)
    AD->>H: bound call
    H-->>AD: "apperr.*Result"
    AD-->>UI: "dispatch → store"
```

Use for: interactions and event streams — an agent progress/stream loop, an `OnFileOpen`/drag-and-drop
routing sequence, a settings save round-trip.

## State diagram (`stateDiagram-v2`) — use for a lifecycle

```mermaid
stateDiagram-v2
    [*] --> stateA
    stateA --> stateB: "transition condition"
    stateB --> stateC: "transition condition"
    stateB --> stateA: "returned/blocked"
    stateC --> [*]
```

Use for: lifecycles — the story lifecycle (`draft → ready → in-progress → done → superseded`), a
document's clean/dirty/saving states, a provider-verification draft-config state machine.

## Entity-relationship diagram (`erDiagram`) — use for related tables

```mermaid
erDiagram
    TABLE_ONE {
        string id PK
        string value
    }
    TABLE_TWO {
        integer id PK
        string path
    }
    TABLE_ONE ||--o{ TABLE_TWO : "relates to"
```

Use for: persisted schema — the `settings(key, value, type)` KV table, the recent-files table, or (in
Stage 3) the additive `providers` table. Drop the relationship line entirely if the tables don't
actually relate in the schema.
