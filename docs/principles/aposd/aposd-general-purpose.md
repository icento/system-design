---
id: aposd-general-purpose
source: aposd
title: Somewhat general-purpose modules
domain:
  - general
severity: advisory
statement: Make a module somewhat more general than today’s need; over-specialization and over-generalization both cost.
triggers:
  - general purpose
  - special purpose
  - generality
  - reusable
  - parameterize
recommended_default: Choose the interface that is general enough to cover plausible needs but not speculative ones.
decision_question_template: How general should the {entity} interface be — specialized to today, or generalized for plausible future use?
anti_patterns:
  - speculative generality
  - an interface contorted to one caller
---
## Statement

A "somewhat general-purpose" interface is usually simpler AND more reusable than a narrowly specialized one.

## Why it matters

Both extremes hurt: over-specialization breeds near-duplicates; over-generalization breeds unused complexity.

## When to raise an ADR

Raise an ADR when the generality of a shared abstraction is genuinely in question.
