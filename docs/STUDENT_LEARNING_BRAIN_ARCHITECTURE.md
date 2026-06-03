# Student Learning Brain Architecture

## Purpose

The Student Learning Brain is the canonical read layer for learning intelligence in StarLiz Academy.

It gives student, parent, admin, and dashboard routes a shared place to read consistent learning evidence, summaries, and recommendations so developers do not rebuild the same logic in multiple routes.

## What the Brain is

- A read-focused composition layer for learning intelligence.
- A place to combine evidence from assignments, attempts, weak areas, progress, quick level finder, learning DNA summaries, and related academic signals.
- A place to expose role-friendly views (student, parent, admin, progression/dashboard view mappers).
- A place to summarize intelligence for display surfaces.

## What belongs inside the Brain

- Read-only learning intelligence assembly.
- Evidence summarization logic for display and reporting.
- Recommendation read outputs used by dashboards and display APIs.
- Role-specific view mappers that shape safe output for student, parent, and admin use.
- Language readiness and heartbeat-style learning intelligence summaries.

## What must NOT go inside the Brain

- Route-specific write workflows.
- Approval workflows and audit decisions.
- Payment or access gating decisions.
- Live coach runtime/session loop logic.
- Homework or catch-up persistence ownership.

## Read-only Brain rule

The Brain is the canonical read layer.

Developers must not duplicate learning intelligence reads in routes when a Brain read or view mapper exists.

If a route needs learning intelligence for display, it should consume Brain outputs first and only keep route-local concerns that are not Brain concerns.

## Write and action workflows stay outside

- Write/action flows remain in their own services and routes.
- The Brain may summarize results of those flows, but it must not become the orchestration point for write actions.
- Approval, mutation, and audit operations stay in dedicated workflows.

## Consumer boundaries

- Student, parent, admin, and dashboard display routes should consume Brain views.
- Coach can consume Brain intelligence, but live runtime remains local to Coach services.
- Admin promotion can consume Brain recommendations, but approval, writes, and audit remain local.
- Homework persistence remains separate from Brain summaries.

## Homework and Catch-Up Persistence Boundary

Current state:

- The Brain can summarize homework and catch-up evidence for display.
- Some persistence paths still rely on AuditLog metadata.

Target state:

- Dedicated Homework and Catch-Up services and models should own persistence.
- Persistence ownership should move out of generic AuditLog metadata over time.
- The Brain should only read and summarize this evidence for student, parent, admin, and dashboard views.

Hard rule:

- The Brain must not become the write layer for homework or catch-up persistence.
- Write workflows, mutation orchestration, approvals, and audit decisions remain in dedicated services/routes.

## Future Brain Module Checklist

Potential modules that should plug into this architecture:

- Adult Learning
- Ga Learning
- Live Tutor Support
- GCSE Exam Readiness
- Homework 2.0
- Competitions
- Certificates
- Coach upgrades
- Parent reports
- Safeguarding learning signals

For each new feature, decide all of the following before implementation:

1. Is it learning intelligence?
2. Is it evidence?
3. Is it a recommendation?
4. Is it a write/action workflow?
5. Is it dashboard display?
6. Which Brain view should expose it?

If it is write/action workflow logic, keep it out of the Brain and only expose read summaries through Brain views.