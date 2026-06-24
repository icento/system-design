---
description: Write or refine the SPEC for a request and burn down its open questions (gate G1). A TRIVIAL request is taken straight to done.
argument-hint: "[req-id]"
---

Run the **SPEC** phase for request `$ARGUMENTS` (or the active request if no id is
given). Follow the `sd-spec` skill: read the intake, draft `requests/<id>/SPEC.md`
with structured requirements, resolve every open question (gate G1), validate the
SPEC with the engine, and advance to SPECCED. If the request is TRIVIAL, make the
CHANGELOG change and take it to DONE.
