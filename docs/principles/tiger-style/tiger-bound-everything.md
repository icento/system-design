---
id: tiger-bound-everything
source: tiger-style
title: Bound everything
domain:
  - general
  - systems
  - concurrency
severity: enforced
statement: Every loop and every queue must have a fixed upper bound; unbounded resource use is a defect.
triggers:
  - loop
  - unbounded
  - queue
  - buffer
  - retry
recommended_default: Give every loop and queue an explicit, justified upper bound and define behaviour at the bound.
decision_question_template: What explicit upper bound governs {entity}, and what happens when that bound is reached?
anti_patterns:
  - while (true) with no exit bound
  - unbounded in-memory queue
lint_rule: unbounded-loop
---
## Statement

Bounding everything makes resource use predictable and turns overload into a handled case, not a crash.

## Why it matters

Unbounded loops and queues are how systems fail under load in production.

## When to raise an ADR

Raise an ADR when introducing a queue, retry policy, or batch loop whose bound affects behaviour under load.
