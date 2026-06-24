---
id: tiger-assert-floor
source: tiger-style
title: Assert aggressively (floor of 2)
domain:
  - general
severity: enforced
statement: Assert all function arguments, return values, invariants, preconditions and postconditions; aim for >= 2 assertions per function on average.
triggers:
  - assert
  - assertion
  - invariant
  - precondition
  - postcondition
recommended_default: Add positive and negative space assertions; target an average of at least two per function.
decision_question_template: What invariants of {entity} must be asserted at its boundaries to fail fast on programmer error?
limits:
  assertions_per_function_avg_min: 2
lint_rule: assert-density
---
## Statement

Assertions catch programmer error close to the source and document invariants executably.

## Why it matters

Without a floor, asserts get skipped exactly where they matter and corruption propagates silently.

## When to raise an ADR

Raise an ADR when defining the invariants of a core data structure or protocol boundary.
