---
id: house-comprehend-first
source: house
title: Understand before deciding
domain:
  - general
severity: recommended
statement: Trace the real end-to-end flow and read every file a change touches before choosing a solution shape; the smallest diff in the wrong place is a second bug, not a simplification.
triggers:
  - existing code
  - legacy
  - refactor
  - unfamiliar
  - blast radius
recommended_default: Map the actual call path and the in-scope files before proposing an approach, and let comprehension gate the design; never substitute a small diff for having read the system.
decision_question_template: For {entity}, has the real end-to-end flow been traced and the touched files enumerated before a solution shape is chosen?
anti_patterns:
  - Choosing an approach from the ticket title without reading the affected code
  - A minimal diff applied to the wrong layer because the flow was not traced
---
## Statement

The decision procedure runs after you understand the problem, not instead of it: read the code a change touches and trace the real flow end to end, then choose the approach.

## Why it matters

A small change in the wrong place is not a simplification, it is a second bug dressed up as efficiency. Skipping comprehension to ship a tight diff is the dangerous failure mode, because it looks responsible.

## When to raise an ADR

Raise an ADR when the affected flow is non-obvious or spans modules, so the comprehension that gates the design is recorded rather than assumed.

Distilled from the ponytail lazy-senior-dev discipline.
