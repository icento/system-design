---
id: aposd-deep-modules
source: aposd
title: Deep modules
domain:
  - general
severity: recommended
statement: A module should provide powerful functionality behind a simple interface; depth = functionality / interface area.
triggers:
  - module
  - interface
  - abstraction
  - encapsulation
  - public api
recommended_default: "Design a deep module: a small interface hiding substantial implementation. Resist shallow pass-through layers."
decision_question_template: How should the {entity} interface be shaped so it stays simple while absorbing the underlying complexity?
anti_patterns:
  - shallow wrapper that adds an interface but no functionality
  - "classitis: many tiny classes"
---
## Statement

Deep modules hide complexity behind a narrow interface. Interface simplicity, not implementation size, is the cost users pay.

## Why it matters

Shallow modules leak complexity to every caller and multiply the surface that must be learned and kept consistent.

## When to raise an ADR

Raise an ADR when introducing a new module boundary, public API, or service seam where interface shape is a real choice.
