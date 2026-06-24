---
id: aposd-strategic
source: aposd
title: Strategic, not tactical programming
domain:
  - general
severity: advisory
statement: Invest continuously in design quality rather than racing to working code and accruing debt.
triggers:
  - technical debt
  - tactical
  - strategic
  - investment
  - design upfront
recommended_default: Budget ~10-20% of effort on design investment; record the decision rather than taking the tactical shortcut.
decision_question_template: For {entity}, how much design investment is warranted now versus deferring (and recording the debt)?
limits:
  investment_pct_min: 10
  investment_pct_max: 20
---
## Statement

Strategic programming treats working code as necessary but not sufficient; the goal is a good design that keeps changing cheap.

## Why it matters

Tactical tornadoes ship fast and leave a system nobody can change.

## When to raise an ADR

Raise an ADR when a tactical shortcut would create durable debt that others will inherit.
