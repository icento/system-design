---
id: aposd-comments-intent
source: aposd
title: Comments capture intent
domain:
  - general
severity: advisory
statement: Comments should record information that is not obvious from the code — intent, units, invariants, rationale.
triggers:
  - comment
  - documentation
  - intent
  - non-obvious
  - rationale
recommended_default: Document the interface contract and the non-obvious "why"; do not paraphrase the code.
decision_question_template: What interface-level contract for {entity} must be documented because it is not obvious from the code?
---
## Statement

Comments exist to capture what the code cannot say: intent, rationale, and constraints.

## Why it matters

Missing intent forces every reader to reverse-engineer decisions, eroding the design over time.

## When to raise an ADR

Lightweight: usually a convention, not an ADR — raise one only if it sets a project-wide documentation contract.
