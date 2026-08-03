# Bundelkhandi Chhakri — AI Opponent Design

## Overview

The AI system provides single-player practice and fills empty seats in multiplayer games when a player disconnects. AI opponents run entirely server-side — no client-side logic, no cheating possible.

---

## Architecture

### AI as a Service

The AI engine is a standalone TypeScript module at `artifacts/api-server/src/ai/`. It exposes a simple interface:

```typescript
interface AIEngine {
  /**
   * Given the current game state visible to this seat, return the best action.
   * This is the ONLY public method — all complexity is internal.
   */
  chooseAction(
    state: AIGameView,        // what this AI "sees" (own hand, public info)
    difficulty: AIDifficulty,
    timeoutMs: number,        // must respond within this window
  ): Promise<AIAction>;
}

type AIAction =
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'select_trump'; suit: 'S' | 'H' | 'D' | 'C' }
  | { type: 'play_card'; card: string };

type AIDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
```

### AIGameView — What AI "Sees"

The AI only receives information a real player would know:
- Its own hand (private)
- Cards played in all previous tricks (public)
- Cards played in the current trick (public)
- Bid values and who bid/passed (public)
- Declared trump suit (public)
- Current score (public)
- Number of tricks won by each team (public)
- **NOT**: opponents' hands, partner's hand

This is enforced by the same state-hiding logic used for human clients.

---

## AI Turn Execution

When it is an AI's turn:

```
GameService detects it's an AI seat's turn
    │
    ├── Construct AIGameView from authoritative GameState
    │
    ├── Call AIEngine.chooseAction(view, difficulty, timeoutMs)
    │
    ├── Wait for response (max timeoutMs = 3000ms)
    │   If timeout → fall back to random legal move
    │
    ├── Validate action (same validation as human moves)
    │
    └── Apply action to GameState → broadcast to all clients
```

AI moves are delayed by a configurable "think time" to feel natural:
- Beginner: 500–1500ms random delay
- Intermediate: 800–2000ms random delay  
- Advanced: 1000–2500ms random delay
- Expert: 1500–3000ms random delay

---

## Difficulty Levels

### Beginner — Random Legal Player

Strategy: Pick any legal action at random.

```
Bidding:   50% chance to pass. If bidding, random value 51–65.
Trump:     Random suit.
Playing:   Random card from legal hand.
```

Beginner AI loses frequently. Good for absolute newcomers learning the rules.

---

### Intermediate — Heuristic Player

Strategy: Basic card-counting heuristics.

**Bidding:**
- Count point cards in hand
- Estimate bid = (own points × 2) + 10 as rough target
- Bid only if estimated win ≥ target bid
- Pass if hand is weak

**Trump selection:**
- Choose suit where AI has the most cards
- Prefer suit where AI holds Ace or King

**Playing:**
```
Phase 1 (first 3 tricks): Lead high cards to gauge opponents
Phase 2 (middle tricks):   Count played point cards; preserve own high cards
Phase 3 (last 4 tricks):   Play aggressively to win tricks with points
```

**Partner awareness:**
- If partner is winning a trick and AI has no better card, play lowest card (yield)
- If opponent is winning trick with a point card, trump if possible

---

### Advanced — Card Counter

Strategy: Track all played cards, compute probable hands.

**Card Memory:**
```typescript
interface CardMemory {
  playedCards: Set<string>;     // cards seen so far
  voidSuits: Map<number, Set<string>>; // seat → suits they've shown void in
}
```

**Bidding:**
- Monte Carlo estimate: simulate 100 possible deal permutations of unseen cards
- Count expected tricks won per simulation
- Bid = median(expectedPointsWon across simulations) × 0.85 (safety margin)

**Trump selection:**
- Choose suit that maximizes expected tricks + points given known voids

**Playing:**
- Track which opponents are void in which suits
- Lead trump strategically to exhaust opponent trump
- Protect partner's winning tricks more aggressively
- Manage Chhakri risk: if opponent team at 5 consecutive tricks, break sequence

**Double/Redouble:**
- Advanced AI uses Double when confidence is high (> 70% win probability)

---

### Expert — Minimax with Alpha-Beta Pruning

Strategy: Game tree search over the remaining tricks.

**Algorithm:**
```
MiniMax(state, depth, alpha, beta, maximizing):
  if depth == 0 or game over:
    return evaluate(state)
  
  if maximizing (AI team's turn):
    best = -∞
    for each legal card in AI's hand:
      child = apply(state, card)
      score = MiniMax(child, depth-1, alpha, beta, false)
      best = max(best, score)
      alpha = max(alpha, best)
      if beta ≤ alpha: break  // prune
    return best
  else:
    best = +∞
    for each probable opponent card:
      child = apply(state, card)
      score = MiniMax(child, depth-1, alpha, beta, true)
      best = min(best, score)
      beta = min(beta, best)
      if beta ≤ alpha: break  // prune
    return best
```

**Uncertainty handling:**
- Expert AI doesn't know exact opponent hands
- Uses probability-weighted opponent moves based on card memory
- Samples 10 likely distributions; averages minimax scores (Monte Carlo Tree Search hybrid)

**Search depth:**
- Early game (tricks 1-4): depth 3
- Mid game (tricks 5-9): depth 5
- End game (tricks 10-13): depth = remaining tricks (full solve)

**Evaluation function:**
```typescript
function evaluate(state: GameState): number {
  const myTeam = state.aiTeam;
  const oppTeam = 1 - myTeam;
  
  return (
    (state.teamPoints[myTeam] - state.teamPoints[oppTeam]) * 2 +
    (state.tricksWon[myTeam] - state.tricksWon[oppTeam]) * 3 +
    chhakri_bonus(state, myTeam) +
    hand_strength(state, myTeam)
  );
}
```

**Partner Signaling (Expert Only):**
Expert AI recognizes patterns in partner's play to infer partner's hand and coordinate strategy (e.g., if partner leads a low card, they may be signaling trump void).

---

## AI Bidding Reference

```typescript
function estimateBidValue(hand: Card[]): { bid: number; confidence: number } {
  const pointCards = hand.filter(isPointCard);
  const pointValue = pointCards.reduce((sum, c) => sum + cardPoints(c), 0);
  
  // High cards that can likely win tricks
  const aces = hand.filter(c => c.rank === 'A').length;
  const kings = hand.filter(c => c.rank === 'K').length;
  const strongCards = aces * 4 + kings * 3;
  
  // Trump potential (most cards in a suit)
  const suitCounts = getSuitCounts(hand);
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const trumpPotential = maxSuitCount >= 5 ? 10 : maxSuitCount >= 4 ? 5 : 0;
  
  const estimated = Math.round(pointValue * 1.8 + strongCards + trumpPotential);
  const bid = Math.max(51, Math.min(100, estimated));
  const confidence = pointValue / 25; // 0-1 scale
  
  return { bid, confidence };
}
```

---

## AI Seat Assignment

When filling an empty seat:
1. If a human disconnected: AI takes their seat at the configured game difficulty
2. If a room has < 4 humans: empty seats filled with AI at selected difficulty
3. AI players are clearly labeled in UI: "🤖 Beginner CPU" etc.
4. AI players have a special `user_id` prefix: `ai-{difficulty}-{uuid}`

---

## Testing Strategy

The AI module is fully unit-testable:

```typescript
// Example test
test('beginner AI makes a legal move', () => {
  const state = buildTestGameState({ phase: 'playing', hand: ['AS', 'KH', '2C'] });
  const action = await ai.chooseAction(state, 'beginner', 1000);
  expect(['AS', 'KH', '2C']).toContain(action.card);
});

test('intermediate AI does not play trump when can follow suit', () => {
  const state = buildTestGameState({
    phase: 'playing',
    ledSuit: 'H',
    hand: ['KH', '5S', '2H'],
    trumpSuit: 'S',
  });
  const action = await ai.chooseAction(state, 'intermediate', 1000);
  expect(['KH', '2H']).toContain(action.card);
});
```

---

## Phase Implementation Plan

| Phase | AI Feature |
|---|---|
| Phase 3 | Beginner (random) |
| Phase 3 | Intermediate (heuristic) |
| Phase 4 | Advanced (card counting) |
| Phase 5 | Expert (minimax) |
| Phase 5 | Partner signaling (expert) |
