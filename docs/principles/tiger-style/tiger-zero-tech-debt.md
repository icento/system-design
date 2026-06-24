---
id: tiger-zero-tech-debt
source: tiger-style
title: Zero technical debt
domain:
  - general
severity: recommended
statement: Do not accumulate technical debt; fix problems as they are found rather than deferring.
triggers:
  - tech debt
  - technical debt
  - todo
  - shortcut
  - workaround
recommended_default: Pay debt down immediately; if you must defer, record it explicitly as a decision with a paydown trigger.
decision_question_template: For {entity}, is the proposed shortcut acceptable, or must the debt be paid down now?
---
## Statement

A zero-debt posture keeps the system continuously changeable and avoids compounding interest.

## Why it matters

Deferred debt is rarely paid and silently raises the cost of every future change.

## When to raise an ADR

Raise an ADR when knowingly deferring work that others will inherit.
