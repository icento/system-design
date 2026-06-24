---
id: tiger-no-recursion
source: tiger-style
title: No unbounded recursion
domain:
  - systems
severity: recommended
statement: Avoid recursion (and unbounded call depth) so stack usage stays bounded and predictable.
triggers:
  - recursion
  - recursive
  - stack depth
  - call depth
recommended_default: Prefer explicit iteration with a bounded work list over recursion; if recursion is unavoidable, bound its depth.
decision_question_template: Should {entity} avoid recursion in favour of bounded iteration to keep stack usage predictable?
---
## Statement

Bounded, iterative control flow keeps stack usage knowable and avoids stack-overflow failure modes.

## Why it matters

Unbounded recursion can blow the stack on adversarial or large inputs.

## When to raise an ADR

Raise an ADR for traversal/parsing strategy in systems components (gated off io-bound work).
