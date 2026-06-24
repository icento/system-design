---
id: tiger-name-units
source: tiger-style
title: Name things with units
domain:
  - general
severity: advisory
statement: Encode units in names (timeout_ms, size_bytes) so misuse is visible at the call site.
triggers:
  - units
  - timeout
  - duration
  - size limit
  - milliseconds
recommended_default: Suffix quantities with their unit (e.g. _ms, _bytes, _count) in names and schemas.
decision_question_template: What units must be encoded in {entity}’s names and fields to prevent unit-confusion bugs?
lint_rule: name-units
---
## Statement

Units in names make wrong conversions obvious and prevent a whole class of bugs.

## Why it matters

Bare numbers (timeout = 30) hide whether it is seconds or milliseconds.

## When to raise an ADR

Usually a naming convention; raise an ADR only to set it project-wide.
