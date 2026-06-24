---
id: house-simplicity-ladder
source: house
title: Climb the simplicity ladder and stop at the first rung that holds
domain:
  - general
severity: recommended
statement: Prefer the cheapest viable option in order — does it need to exist (YAGNI), is it already in this codebase, does the standard library do it, does a native platform feature cover it, does an installed dependency solve it, only then write new code.
triggers:
  - new dependency
  - library
  - from scratch
  - abstraction
  - boilerplate
recommended_default: Reach for reuse, the standard library, and native features before new code or a new dependency; take the higher rung when two hold, and justify in writing only when a cheaper rung is skipped.
decision_question_template: For {entity}, which is the highest simplicity-ladder rung that holds (reuse, stdlib, native, installed dependency) before new code is written?
anti_patterns:
  - Adding a dependency for what a few lines of standard library already do
  - Introducing an abstraction with a single implementation
  - Hand-building a control the platform already ships
---
## Statement

When something must be built, climb in priority order and stop at the first rung that holds: skip it (YAGNI), reuse what is already here, use the standard library, use a native platform feature, use an installed dependency, and only then write the minimum new code.

## Why it matters

An explicit, ordered ladder turns "keep it simple" from a value into a repeatable decision anyone can audit, and the stop rule bounds deliberation: you evaluate to the first option that works, not all of them.

## When to raise an ADR

Raise an ADR when a cheaper rung is deliberately skipped — a new dependency or abstraction over a reuse or stdlib option — so the reason for the heavier choice is on record.

Distilled from the ponytail lazy-senior-dev discipline.
