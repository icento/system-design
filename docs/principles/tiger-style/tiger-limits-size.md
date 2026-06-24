---
id: tiger-limits-size
source: tiger-style
title: Limit function and line size
domain:
  - general
severity: enforced
statement: Keep functions <= 70 lines and lines <= 100 columns; large units hide bugs.
triggers:
  - function length
  - file size
  - line length
  - long function
  - god object
recommended_default: Split functions over 70 lines; wrap lines over 100 columns; one responsibility per unit.
decision_question_template: How should {entity} be decomposed so each function stays within the size limits?
limits:
  line_columns_max: 100
  function_lines_max: 70
lint_rule: size
---
## Statement

Small units fit in working memory, are easy to test, and localize bugs.

## Why it matters

Large functions accumulate state and branches that defeat review.

## When to raise an ADR

Usually mechanized via tiger-lint; raise an ADR only for a deliberate, justified exception.
