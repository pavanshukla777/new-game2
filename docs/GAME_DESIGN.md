# Bundelkhandi Chhakri — Game Design Document

## Overview

**Chhakri** (also spelled Chhakka, Chhakki) is a traditional trick-taking card game from the Bundelkhand region (the cultural belt spanning southern Uttar Pradesh and northern Madhya Pradesh, India). This document defines the authoritative rules and mechanics for the digital adaptation.

---

## Players and Setup

| Property | Value |
|---|---|
| Players | 4 (standard) |
| Teams | 2 teams of 2 (partners sit opposite each other) |
| Deck | Standard 52-card deck (no jokers) |
| Cards per player | 13 cards each |
| Goal | Be the first team to reach the target score |

### Seat Positions
```
         North (Player 1)
              │
West (P4) ───┼─── East (P2)
              │
         South (Player 3)

Teams: {North, South} vs {East, West}
```

---

## Card Values and Hierarchy

### Suit Hierarchy (when trump is active)
Trump suit beats all other suits. Within a suit:

```
A (Ace) > K (King) > Q (Queen) > J (Jack) > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2
```

### Point Cards (Counting Cards)
Not all cards carry points. Only specific cards have scoring value:

| Card | Points |
|---|---|
| Ace (A) | 4 points |
| King (K) | 3 points |
| Queen (Q) | 2 points |
| Jack (J) | 1 point |
| 10 | 10 points |
| 5 | 5 points |

**Total points in a full deck: (4+3+2+1+10+5) × 4 suits = 100 points**

Non-point cards (2, 3, 4, 6, 7, 8, 9) are "blank" cards — they capture tricks but carry no point value.

---

## Dealing

1. Dealer is chosen randomly for the first game; rotates clockwise each game.
2. Cards are shuffled and dealt clockwise, 13 to each player.
3. Each player receives their hand privately (face-down to others).

---

## Bidding Phase

### What is a Bid?
A bid is the number of points a team commits to winning in the current round. The minimum bid is **51 points** (just over half of 100).

### Bidding Rules
1. The player to the dealer's left starts the bidding.
2. Each player may **bid** or **pass**.
3. Bids must be higher than the current highest bid (increments of 1 point minimum).
4. Bidding continues until three players in a row pass.
5. The player with the highest bid wins the bid and becomes the **bidder**.
6. The bidder's team must score at least their bid to win the round.
7. **Chhakri** (special bid): A bid of 100 points (all points). High risk, high reward.

### Minimum and Maximum Bids
- Minimum: 51
- Maximum: 100 (called **Chhakri** or **Baazi**)
- If the first player to bid passes, the next player must bid at least 51 or also pass. If all four pass, cards are re-dealt.

---

## Trump Selection

After winning the bid, the bidder:
1. May call any of the 4 suits as **trump** (Hukm).
2. Alternatively, may call **"No Trump"** (advanced rule, enable in settings).
3. The trump suit is revealed to all players.
4. Trump cards beat all non-trump cards regardless of value.

---

## Gameplay — Trick Taking

### A Trick
- Each trick consists of 4 cards, one from each player.
- The player who wins the previous trick leads the next.
- The bidder leads the first trick.

### Following Rules
- Players **must follow suit** if they have cards of the led suit.
- If a player cannot follow suit, they may play any card (including trump).
- A player may voluntarily **trump** even when holding the led suit, but only if they have no cards of that suit.

### Winning a Trick
- If no trump was played: the highest card of the led suit wins.
- If trump was played: the highest trump wins.
- The winner of a trick collects all 4 cards face-down in their team's capture pile.

### The Chhakri Rule (Special)
- If a player wins **6 consecutive tricks** (a Chhakri), their team immediately wins the round regardless of point count.
- This is the origin of the game's name.

---

## Scoring

### Round Scoring
At the end of 13 tricks, the points in each team's capture pile are counted.

**If bidding team meets or exceeds their bid:**
- Bidding team earns their bid value as positive points.
- Defending team earns the points they captured.

**If bidding team fails their bid:**
- Bidding team loses their bid value (goes negative).
- Defending team earns the points they captured as a bonus.

**Chhakri Bonus:**
- If a team wins by Chhakri (6 consecutive tricks), they earn double points.

### Game Scoring
- A game is played to **500 points** (configurable: 300, 500, 750).
- The first team to reach the target score wins the game.
- If both teams cross the target in the same round, the higher score wins.

### Negative Score Handling
- A team may go negative. If a team is at -250, they must climb back.
- **"Doobna"** (drowning): If a team's score goes below -500, they lose immediately.

---

## Special Rules

### Kaat (Cut)
- A player may "cut" (play trump) on any trick they cannot follow suit.
- Cutting with a lower trump when a higher trump is already played is called **overcut** — it must be avoided if higher trump is available.

### Double (Dobla)
- After cards are dealt but before bidding, any player may call **Double**.
- All point values for this round are doubled.
- The opposing team may call **Redouble** (Char-Guna) to quadruple points.

### Pair Play (Jodi)
- If a player holds both cards of the same rank in a suit (e.g., two Aces across suits… actually this varies), specific local rules apply.
- Configurable in game settings as a regional variant.

---

## Game Modes

| Mode | Description |
|---|---|
| Standard 4P | Classic 4-player team game (2v2) |
| Tournament | Rated games with ELO scoring |
| Practice | Play against AI opponents |
| Solo Quick Play | Shorter game (target: 300 points) |
| Chhakri Classic | Strict traditional rules, no variants |

---

## AI Difficulty Levels

| Level | Behavior |
|---|---|
| Beginner | Random legal moves, no strategy |
| Intermediate | Follows basic card counting, tries to protect partner |
| Advanced | Card counting, bidding optimization, trump management |
| Expert | Full minimax with alpha-beta pruning, partner signaling |

---

## UI/UX Design Principles

1. **Cultural Authenticity** — Use Devanagari script for UI labels where appropriate, Hindi card names as option.
2. **Low-Latency Feel** — Optimistic UI: show card play immediately, reconcile from server.
3. **Accessibility** — Colorblind mode, large card mode, text-to-speech for card names.
4. **Spectator Mode** — Allow watching in-progress games.
5. **Replay System** — Full game replays stored and viewable.

---

## Localization

| Language | Status |
|---|---|
| Hindi (हिंदी) | Primary |
| English | Secondary |
| Bundeli dialect | Phase 2 |

---

## Glossary

| Term | Meaning |
|---|---|
| Chhakri / Chhakka | Six consecutive tricks — instant win |
| Hukm | Trump suit |
| Baazi | A round / the act of bidding 100 |
| Doobna | Going below minimum score (drowning) |
| Kaat | Cutting with trump |
| Dobla | Doubling the stakes |
| Char-Guna | Redouble (4x stakes) |
| Boli | Bid |
| Haath | Trick / hand |
| Joodi | Partnership / team |
