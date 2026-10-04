# Mermaid diagram types

## Flowchart

```mermaid
flowchart TD
    startNode["Start"] --> finishNode["Finish"]
```

## Sequence

```mermaid
sequenceDiagram
    actor user as User
    participant app as Editor
    user->>app: Open document
    app-->>user: Show preview
```

## Class

```mermaid
classDiagram
    class Animal {
        +String name
    }
    Animal <|-- Dog
```

## State

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Editing: Open
    Editing --> [*]: Close
```

## Entity relationship

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        int id PK
    }
    ORDER {
        int id PK
    }
```

## Gantt

```mermaid
gantt
    title Release plan
    dateFormat YYYY-MM-DD
    section Build
    Design :done, design, 2025-01-01, 2d
    Ship :ship, after design, 1d
```

## Pie

```mermaid
pie title Traffic sources
    "Direct" : 55
    "Search" : 45
```

## Mindmap

```mermaid
mindmap
    root((Project))
        Frontend
            Editor
        Backend
            Storage
```

## Timeline

```mermaid
timeline
    title Roadmap
    2025 : Draft
    2026 : Release
```

## Git graph

```mermaid
gitGraph
    commit id: "start"
    branch feature
    checkout feature
    commit id: "draft"
```

## Journey

```mermaid
journey
    title New user onboarding
    section Setup
        Open editor: 5: User
        Write note: 4: User
```

## Quadrant

```mermaid
quadrantChart
    title Priority matrix
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Plan
    quadrant-2 Build
    quadrant-3 Defer
    quadrant-4 Review
    A: [0.25, 0.75]
```
