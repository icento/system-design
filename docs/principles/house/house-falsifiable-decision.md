---
id: house-falsifiable-decision
source: house
title: Make decisions falsifiable and validate to disprove
domain:
  - general
severity: advisory
statement: State the single observable a decision should move and seek evidence built to disprove it rather than flatter it; treat a null result as a valid outcome that blocks the change, and revise a claim downward when its baseline was an artifact.
triggers:
  - assumption
  - hypothesis
  - optimization
  - benchmark
  - trade-off
recommended_default: Name the metric the decision must move and the evidence that would refute it before committing; if the measured effect is within noise, do not ship the change.
decision_question_template: For {entity}, what single observable would prove this decision wrong, and has evidence designed to refute it been sought?
anti_patterns:
  - Validating a change only against cases chosen to confirm it
  - Shipping a rule or optimization that shows no measurable effect
---
## Statement

A decision is a claim that can be wrong. Name the one observable it should move, then design the check to refute it: include a plausible-but-wrong control and isolate the single variable.

## Why it matters

A goal you cannot falsify can never be shown wrong, so it teaches nothing. Evidence built to confirm flatters; evidence built to disprove is the only kind that earns trust, and a null result is a real, shippable answer of "do not ship".

## When to raise an ADR

Raise an ADR when a decision rests on a performance, cost, or behavior assumption, so the falsifying observable and its result are recorded alongside the choice.

Distilled from the ponytail lazy-senior-dev discipline.
