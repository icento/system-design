---
id: aposd-pull-complexity-down
source: aposd
title: Pull complexity downward
domain:
  - general
severity: recommended
statement: It is better for a module to absorb complexity than to expose it as configuration the caller must manage.
triggers:
  - configuration
  - config knob
  - tunable
  - default
  - parameter
recommended_default: Absorb the complexity inside the module with a sensible default rather than adding a configuration knob.
decision_question_template: Should {entity} expose this as a configuration knob, or absorb the complexity behind a good default?
anti_patterns:
  - configuration parameters that push a decision onto every caller
---
## Statement

Pulling complexity down means the module handles the hard case so its many users do not have to.

## Why it matters

Each config knob multiplies across all callers and becomes a compatibility constraint forever.

## When to raise an ADR

Raise an ADR when adding a configuration surface or a tuning parameter to a shared component.
