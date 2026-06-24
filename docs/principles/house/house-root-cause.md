---
id: house-root-cause
source: house
title: Fix the root cause at the shared site, not the symptom
domain:
  - general
severity: recommended
statement: A report names a symptom; enumerate every caller of the function you are about to touch and fix it once where they route through, rather than guarding the single path the ticket names and leaving sibling callers broken.
triggers:
  - bug
  - symptom
  - root cause
  - workaround
  - regression
recommended_default: Grep all callers before editing and prefer one guard in the shared function over a guard per call site, which is both the smaller diff and the real fix.
decision_question_template: For {entity}, have all callers been enumerated so the fix lands at the shared root rather than on the one path the report names?
anti_patterns:
  - Patching only the code path named in the ticket
  - Duplicating the same guard across every caller
---
## Statement

A bug report names a symptom, not a location. Before editing, enumerate every caller of the function in question and fix it once at the shared site they route through.

## Why it matters

One guard in the shared function is a smaller diff than a guard per caller, so the root-cause fix is also the lazy fix; patching only the path the ticket names leaves every sibling caller broken.

## When to raise an ADR

Raise an ADR when the shared site is load-bearing or widely called, so the blast radius of the root-cause fix is reviewed rather than discovered in production.

Distilled from the ponytail lazy-senior-dev discipline.
