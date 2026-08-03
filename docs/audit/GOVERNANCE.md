# Implementation Governance & Change Control
## Volume 3 — Part 11 | Bundelkhandi Chhakri

---

## AUTHORITATIVE DOCUMENT HIERARCHY

| Priority | Document | Authority |
|---|---|---|
| 1 | Official Rulebook (Volume 2, RULE-001 to RULE-030) | Supreme — permanent; never changes |
| 2 | Repository Audit (Volume 3, Parts 1–15) | Derived from Rulebook |
| 3 | Migration Plan (GAP → MIG mapping) | Derived from Audit |
| 4 | Implementation Roadmap (phase order) | Derived from Migration Plan |
| 5 | Repository Source Code | Must match Rulebook; never overrides it |

---

## MANDATORY IMPLEMENTATION CHAIN

Every source code modification must follow this chain. No step may be skipped.

```
Official Rulebook
      ↓
Rulebook Section
      ↓
Gap ID (GAP-NNN)
      ↓
Migration ID (MIG-NNN)
      ↓
Repository Module
      ↓
Affected Files
      ↓
Implementation
      ↓
Verification (L1–L4)
      ↓
Testing
      ↓
Acceptance → Change Log Entry (CHG-NNN)
```

---

## APPROVED SOURCES

Gameplay decisions may originate ONLY from:
- Official Rulebook
- Verified Gap Register (GAP-001 to GAP-051)
- Approved Migration Plan (MIG-001 to MIG-051)

Repository source code, comments, tests, documentation, and prior AI sessions are **never** approved sources for gameplay decisions.

---

## PROHIBITED ACTIONS

| # | Prohibited Action |
|---|---|
| 1 | Invent gameplay rules not present in the Official Rulebook |
| 2 | Override any Official Rulebook rule with repository code logic |
| 3 | Implement behavior not documented in the Gap Register |
| 4 | Implement a Migration Item before all its dependencies are resolved |
| 5 | Merge unrelated changes into a single implementation task |
| 6 | Modify a completed and accepted Migration Item without creating a new Gap entry |
| 7 | Alter Migration IDs, Gap IDs, or their correspondence after registration |
| 8 | Accept an implementation that fails any required verification level |
| 9 | Mark a Migration Item complete without a corresponding Change Log entry |
| 10 | Use documentation, comments, or tests as the source of gameplay truth |

---

## INLINE COMMENT FORMAT (MANDATORY)

Every function, schema column, or type that implements a Rulebook rule must include:

```typescript
// [MIG-NNN] [GAP-NNN] Rulebook Section: "<Section Name>"
// Implements: <brief description of the Rulebook rule being satisfied>
```

Example:
```typescript
// [MIG-013] [GAP-032] Rulebook Section: "Series Engine"
// Implements: Series ends when either team's cumulative score reaches +52
export function applyRoundScore(...) { ... }
```

---

## PRE-IMPLEMENTATION CHECKLIST

Before writing any code for a migration item:

| Step | Requirement |
|---|---|
| 1 | Identify the Migration ID(s) for this session |
| 2 | Confirm all dependency Migration Items are ACCEPTED in the Change Log |
| 3 | Confirm the Gap ID and Rulebook Section for each item |
| 4 | Confirm the affected files from the Migration Plan |
| 5 | Confirm no changes touch files outside the current Migration Item scope |

## POST-IMPLEMENTATION CHECKLIST

| Step | Requirement |
|---|---|
| 1 | All required verification levels (L1/L2/L3/L4) completed |
| 2 | Verification evidence recorded |
| 3 | Change Log entry created (CHG-NNN) |
| 4 | All documentation referencing the affected module updated |
| 5 | Verification Status = PASS or FAIL |
| 6 | Acceptance Status = ACCEPTED or REJECTED |
| 7 | If REJECTED: no dependent Migration Items may proceed |

---

## DOCUMENTATION SYNCHRONIZATION RULE

Whenever an implementation changes observable behavior, these documents must be updated **before** the task is marked complete:

| Document | Updated When |
|---|---|
| `docs/ARCHITECTURE.md` | Module structure or interface changes |
| `docs/GAME_DESIGN.md` | Any gameplay behavior change |
| `docs/DATABASE_SCHEMA.md` | Any schema column addition, removal, or constraint change |
| `docs/MULTIPLAYER_DESIGN.md` | Any socket event addition, removal, or payload change |
| `docs/FLUTTER_CLIENT.md` | Any Flutter screen, widget, or event change |
| `docs/AI_DESIGN.md` | Any AI behaviour change |
| `replit.md` | Developer quick-reference when primary workflow changes |

---

## UNPLANNED DISCOVERY PROTOCOL

If implementation reveals a new gap not in GAP-001 through GAP-051:

| Step | Action |
|---|---|
| 1 | Do not fix it in the current session |
| 2 | Record it with source file evidence |
| 3 | Assign it GAP-052+ |
| 4 | Assign priority P0/P1/P2/P3 per Part 7 criteria |
| 5 | Assign MIG-052+ and implementation phase |
| 6 | Add to Verification Register |
| 7 | Proceed only after dependencies are met |

---

## PHASE GATE AUTHORITY

| Gate | Condition |
|---|---|
| Phase 1 → Phase 2 | All 16 Phase 1 Change Log entries ACCEPTED |
| Phase 2 → Phase 3 | All 14 Phase 2 entries ACCEPTED + engine plays Rulebook-compliant series |
| Phase 3 → Phase 4 | All 17 Phase 3 entries ACCEPTED + two players complete series over network |
| Phase 4 → Complete | All 4 Phase 4 entries ACCEPTED + Flutter meets all Rulebook UI requirements |

---

## 10 IMMUTABLE GOVERNANCE PRINCIPLES

1. **Rulebook Supremacy** — The Official Rulebook overrides all other sources. Always.
2. **Zero Assumption** — No gameplay behavior may be invented. If undefined, stop and request clarification.
3. **Server Authority** — The server decides all game state. The client displays only.
4. **Full Traceability** — Every line of gameplay code traces to a Gap ID, Migration ID, and Rulebook Section.
5. **Dependency Order** — No implementation item begins before its dependencies are accepted.
6. **Regression Protection** — Every change confirms existing functionality is preserved.
7. **Documentation Synchronization** — Implementation and documentation are updated together.
8. **Append-Only Audit** — The Change Log is never modified retroactively. Corrections create new entries.
9. **Single Source of Truth** — The Official Rulebook is the only source of gameplay truth. Repository code is its implementation.
10. **No Silent Fixes** — Every change is documented, regardless of how small.
