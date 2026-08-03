# Official Rulebook Summary
## Volume 2 | Bundelkhandi Chhakri

**Authority:** This document is the supreme source of all gameplay truth.
**Rules:** RULE-001 through RULE-030 (fully received)

---

## PLAYER COUNT & TEAMS

| Rule | Section | Specification |
|---|---|---|
| RULE-001 | Players | 4 or 6 players only; no other count permitted |
| RULE-005 | Teams | Alternating A-B seating: seats 0,2(,4) = Team A; seats 1,3(,5) = Team B |
| RULE-006 | Teams | Seat assignments fixed at match start; unchangeable for full series |

## DECK CONSTRUCTION

| Rule | Section | Specification |
|---|---|---|
| RULE-002 | Deck — 4-Player | Remove ranks 2, 3, 4, 5, 6 from all 4 suits → 32 cards |
| RULE-003 | Deck — 4-Player | Remaining ranks: 7, 8, 9, 10, J, Q, K, A (8 × 4 suits = 32) |
| RULE-004 | Deck — 6-Player | Remove only the four 2s → 48 cards (ranks 3–A across all 4 suits) |

## CARD DISTRIBUTION

| Rule | Section | Specification |
|---|---|---|
| — | Card Zones | Each player has: 2 Secret Hand + 3 Face-down + 3 Face-up = 8 cards |
| — | Deal Order | Deal 2 Secret Hand → Primary Bid pause → deal 3 Face-down → deal 3 Face-up |

## PRIMARY BID

| Rule | Section | Specification |
|---|---|---|
| — | Primary Bid | Made only by first Secret Hand recipient |
| — | Primary Bid | Mandatory value = 5; cannot be passed; cannot be any other value |
| — | Primary Trump | Selected immediately after Primary Bid; by same player; mandatory |

## BIDDING

| Rule | Section | Specification |
|---|---|---|
| — | Rounds | Exactly 2 bidding rounds |
| — | Values | Only 5, 6, 7, 8 are valid bid values |
| — | Pass | Passing is never permanent; player may bid again in Round 2 |
| — | Final Trump | If Final Bid > Primary Bid: Final Trump requested; else Primary Trump stands |

## VALIDATION ORDER

| Rule | Section | Specification |
|---|---|---|
| RULE-007 | Server Validation | Identity → Match State → Turn Ownership → Action Legality → Rule Compliance → State Update → Client Sync |

## TURN & LEGAL MOVES

| Rule | Section | Specification |
|---|---|---|
| — | Follow Suit | Must play Lead Suit if held in Face-up or Secret Hand |
| — | Face-down | Eligible only when Lead Suit absent from BOTH Face-up AND Secret Hand |
| — | Face-down Reveal | Compulsory; server reveals one card; player cannot choose which |

## TRICK RESOLUTION

| Rule | Section | Specification |
|---|---|---|
| — | Trump Wins | Highest Trump wins if any Trump played |
| — | No Trump | Highest Lead Suit wins if no Trump played |
| — | Trick Count | Always exactly 8 tricks per round; no early termination |

## SCORING (ZERO-SUM)

| Rule | Section | Specification |
|---|---|---|
| — | Bid Success | Bid Team won ≥ Bid tricks → Bid Team +Bid, Opponent −Bid |
| — | Bid Failure | Bid Team won < Bid tricks → Bid Team −(2×Bid), Opponent +(2×Bid) |
| — | Invariant | Team A score + Team B score = 0 at all times |
| — | No Bonus | No Chhakri bonus or multiplier applies to scoring |

## SERIES ENGINE

| Rule | Section | Specification |
|---|---|---|
| — | Series End | Either team reaches +52 → Series Winner declared immediately |
| — | Perfect 8/8 | Bid=8 + Bid Team wins all 8 tricks → Instant Series Victory |
| — | Dealer Rotation | Team currently behind in series score becomes Dealer Team for next round |

## ROOM MANAGEMENT

| Rule | Section | Specification |
|---|---|---|
| — | Room Code | Exactly 5 characters |
| — | Room Types | Public or Private; no passwords |
| — | Dual Admin | One Admin per team; equal authority; auto-reassigns on departure |

## RECONNECTION & DEVICE

| Rule | Section | Specification |
|---|---|---|
| — | Reconnect Window | Configurable timeout (set by Admin) |
| — | AI Takeover | AI takes over on reconnect timer expiry; player resumes on return |
| — | One Device | One account = one active device; second login logs out first device |

## UI REQUIREMENTS

| Rule | Section | Specification |
|---|---|---|
| — | Orientation | Landscape only |
| — | Table | Oval, wooden texture |
| — | Card Zones | Three zones per player (Secret Hand, Face-down, Face-up) |
| — | Live Panel | Match Progress Panel permanently visible during gameplay |
| — | Result Popup | Appears after each round completes |
| — | Player Identity | Profile Photo, Display Name, Village Name, Online/Connection/Mic Status, Admin/Dealer/Bid Winner badges |
