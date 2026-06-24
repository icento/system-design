---
id: aposd-information-hiding
source: aposd
title: Information hiding
domain:
  - general
severity: recommended
statement: Each module should encapsulate a design decision so that knowledge does not leak across boundaries.
triggers:
  - information hiding
  - leak
  - internals
  - decomposition
  - coupling
recommended_default: Hide the volatile decision (format, protocol, schema) inside one module; expose only what callers must know.
decision_question_template: Which knowledge about {entity} should be hidden inside a single module rather than shared across the system?
anti_patterns:
  - information leakage between modules
  - temporal decomposition by execution order
---
## Statement

Information hiding localizes change: a decision encapsulated in one module can change without touching its callers.

## Why it matters

Leaked knowledge creates dependencies that turn a one-line change into a cross-cutting edit.

## When to raise an ADR

Raise an ADR when a representation/protocol/format decision will be touched by more than one module.
