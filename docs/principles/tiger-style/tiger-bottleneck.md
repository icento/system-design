---
id: tiger-bottleneck
source: tiger-style
title: Design for the bottleneck
domain:
  - general
  - systems
  - io-bound
  - data
severity: recommended
statement: Optimize for the actual bottleneck resource; the usual order is network > disk > memory > cpu.
triggers:
  - performance
  - throughput
  - latency
  - bottleneck
  - network
recommended_default: Identify the bottleneck resource first and design around it; do not micro-optimize cheaper resources.
decision_question_template: What is the bottleneck resource for {entity} (network/disk/memory/cpu), and how does the design target it?
---
## Statement

Designing for the dominant resource yields order-of-magnitude wins; optimizing the wrong one wastes effort.

## Why it matters

Premature CPU micro-optimization while network dominates is a classic mis-investment.

## When to raise an ADR

Raise an ADR when a performance-sensitive path’s bottleneck drives the design.
