---
id: tiger-static-allocation
source: tiger-style
title: Static allocation
domain:
  - systems
severity: recommended
statement: Allocate all memory at startup; avoid dynamic allocation on the hot path.
triggers:
  - allocation
  - dynamic memory
  - heap
  - buffer pool
  - gc pressure
recommended_default: Pre-allocate pools at startup; size them explicitly; avoid per-request allocation on the hot path.
decision_question_template: Can {entity} use static, startup-time allocation instead of dynamic allocation on the hot path?
---
## Statement

Static allocation removes a whole class of runtime failures and makes performance predictable.

## Why it matters

Dynamic allocation introduces latency tails, fragmentation, and out-of-memory failure modes.

## When to raise an ADR

Raise an ADR for memory strategy in latency-sensitive or systems components (gated off io-bound/web work).
