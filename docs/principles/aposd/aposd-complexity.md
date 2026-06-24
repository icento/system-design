---
id: aposd-complexity
source: aposd
title: Complexity is incremental
domain:
  - general
severity: advisory
statement: Complexity accrues from dependencies and obscurity; manage it by isolating, not just by adding comments.
triggers:
  - complexity
  - complicated
  - change amplification
  - cognitive load
  - hard to understand
recommended_default: Treat a complexity symptom (change amplification, high cognitive load, unknown unknowns) as the trigger to decide deliberately.
decision_question_template: Is the complexity around {entity} significant enough to warrant a recorded architecture decision?
---
## Statement

Complexity shows up as change amplification, cognitive load, and unknown unknowns. Naming the symptom focuses the decision.

## Why it matters

Unmanaged complexity compounds; every later change pays interest.

## When to raise an ADR

Use this as a filter: if none of the three symptoms apply, an ADR may not be warranted.
