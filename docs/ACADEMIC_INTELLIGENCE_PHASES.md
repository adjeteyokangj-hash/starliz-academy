# Academic Intelligence Phases

Phase 1 added curriculum denominator coverage so mastery now has an expected-topic baseline rather than relying only on observed activity.

Phase 2 adds mastery evidence gates that block over-confident progression when coverage, attempts, sessions, retention, or weak-area signals are too thin.

Phase 3 adds weak-area revisit effectiveness so the system can describe whether revisit work is improving, stable, declining, or still too early to judge.

Phase 4 adds HEART BEAT recommendation accuracy checks so the canonical action can be compared with the evidence and flagged as aligned or needing review.

Phase 5 adds Learning Twin outcome attribution so explanation-style signals are treated as directional evidence, not causal proof.

Phase 6 adds GCSE readiness calibration so readiness is paired with evidence strength, coverage gaps, and low-confidence warnings when mock/exam-like evidence is absent.

All six phases are additive and backward compatible. Older snapshots and payloads may omit the new fields; routes should continue to return safe fallback objects rather than breaking.

Future work should stay in calibration mode only: these signals can be refined with more evidence and better thresholds, but they should not be promoted to certainty without external validation.
