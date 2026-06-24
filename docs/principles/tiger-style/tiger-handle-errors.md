---
id: tiger-handle-errors
source: tiger-style
title: Handle all errors
domain:
  - general
severity: recommended
statement: Every error must be handled explicitly; corruption and partial failure must be anticipated.
triggers:
  - error handling
  - failure
  - fault
  - corruption
  - crash
recommended_default: Handle every error path explicitly; design for partial failure and corruption, not just the happy path.
decision_question_template: How does {entity} handle each failure mode, including partial failure and corruption?
anti_patterns:
  - swallowed errors
  - ignoring a returned error code
lint_rule: error-handling
---
## Statement

Explicit error handling is what separates robust systems from demos; failures are normal operating conditions.

## Why it matters

Unhandled errors become silent data loss or crashes in production.

## When to raise an ADR

Raise an ADR when defining the failure-handling contract of a critical path.
