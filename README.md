# Hold

A deposit and damage system for small rental shops. A PayPal authorization hold replaces the cash deposit, photographs
are compared at the return, and a person approves every charge. Built for the PayPal AI Hackathon 2026.

The product is described in `docs/project-description.md`, the design in `docs/architecture.md` and the extensions in
`docs/extensions.md`.

## How reliable is the comparison

Measured on the gate half of the evaluation set, which is never used for tuning. Every figure is a count. The same
figures are on the reliability page of the deployed app.

<!-- scorecard:start -->
Not measured yet: no run over the evaluation set has been accepted. Until one is, Hold claims no accuracy for the
comparison.
<!-- scorecard:end -->
