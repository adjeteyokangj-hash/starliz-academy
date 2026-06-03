# Student Blood Transport Architecture

## What Blood Is

Blood is the transport layer that delivers verified learning signals between organs.

- Brain thinks and classifies intelligence.
- Heart (HEART BEAT) monitors system health and next action signals.
- Spinal Cord routes workflows and task execution.
- Blood moves event evidence between those organs.

Blood is intentionally transport-only. It does not replace Brain intelligence calculations.

## Push vs Pull

### Push flow

When a learning event occurs, Blood routes it to destination organs.

Example:
- `lesson_completed` -> Brain, Heartbeat, Knowledge Graph, Coach, Reports, Audit

### Pull flow

An organ requests approved fields for a student from Brain/Blood contracts.

Example:
- `knowledge_graph` may request `evidence_summary`, `learning_data_state`, `heartbeat_summary`.

### Push and pull

Some events route immediately and are also available for pull verification by other organs.

## What Belongs in Blood

- Event typing and routing contracts
- Destination mapping
- Delivery mode declarations (`push`, `pull`, `push_and_pull`)
- Pull field allow-lists per requesting organ
- Safe fallback for unsupported event types

## What Must Not Go in Blood

- Intelligence scoring and recommendation algorithms
- Database writes or schema updates
- Migration logic
- UI rendering
- Payment/subscription business logic

## Organ Connectivity

Blood links these organs:

- Student Learning Brain
- HEART BEAT
- Knowledge Graph
- Coach
- Parent Reports
- Admin Reports
- Assignments
- Homework
- Certificates
- Notifications
- Audit Log
- Placement routing

## Emitting Future Blood Events

When adding a feature:

1. Define a new `BloodEventType` only if genuinely new transport semantics are needed.
2. Add deterministic route destinations.
3. Specify delivery mode.
4. Update pull contracts only for minimum required fields.
5. Add tests for route behavior and unsupported event safety.

This keeps Blood stable, explainable, and transport-only.
