---
id: tiger-batch
source: tiger-style
title: Batch to amortize
domain:
  - general
  - io-bound
  - data
  - systems
severity: recommended
statement: Amortize fixed per-operation costs by batching work (I/O, syscalls, round trips).
triggers:
  - batch
  - n+1
  - round trip
  - amortize
  - bulk
recommended_default: Batch operations that carry fixed overhead; eliminate N+1 patterns.
decision_question_template: Where does {entity} pay a fixed per-operation cost that should be amortized by batching?
anti_patterns:
  - N+1 queries
  - per-row network round trips
---
## Statement

Batching turns many fixed-cost operations into one, often the single biggest throughput lever.

## Why it matters

N+1 and per-item round trips dominate latency once volume grows.

## When to raise an ADR

Raise an ADR when a data-access or I/O pattern’s batching strategy is a real choice.
