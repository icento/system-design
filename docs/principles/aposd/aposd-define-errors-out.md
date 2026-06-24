---
id: aposd-define-errors-out
source: aposd
title: Define errors out of existence
domain:
  - general
severity: recommended
statement: Design interfaces so that common error cases simply cannot arise, reducing special-case handling.
triggers:
  - error handling
  - exception
  - special case
  - edge case
  - error model
recommended_default: Prefer an API where the error case is defined away (e.g. idempotent delete, clamping) over one that proliferates exceptions.
decision_question_template: What error model should {entity} use — can the common errors be defined out of existence rather than handled?
anti_patterns:
  - throwing for an absent-but-expected case
  - exception soup that callers must each handle
---
## Statement

The best error handling is an interface in which the error cannot occur. Fewer special cases means fewer bugs.

## Why it matters

Each exceptional path is a branch that must be written, tested, and understood by every caller.

## When to raise an ADR

Raise an ADR when defining a new error model or an API whose failure modes callers must repeatedly handle.
