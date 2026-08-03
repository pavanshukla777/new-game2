// ============================================================================
// Bundelkhandi Chhakri — Rule Engine Core Types
// Pure TypeScript, zero runtime dependencies.
// ============================================================================

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** The four suits in a standard deck. */
export type Suit = "S" | "H" | "D" | "C";

/**
 * Card ranks.
 * 4-player deck: all 13 ranks (2–A).
 * 6-player deck: 12 ranks (3–A, no 2s).
 */
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

/**
 * A card code is `{rank}{suit}`, e.g. "AS", "10H", "3C".
 * This matches the CardCode type used in the DB schema.
 */
export type CardCode = string;

// ---------------------------------------------------------------------------
// Game configuration
// ---------------------------------------------------------------------------

export type PlayerCount = 4 | 6;
export type TeamId = 0 | 1;

/**
 * Round point multiplier.
 *   1 = normal
 *   2 = Dobla (Double)
 *   4 = Char-Guna (Redouble)
 */
export type Multiplier = 1 | 2 | 4;

export interface GameConfig {
  /** Number of human/AI seats. */
  playerCount: PlayerCount;
  /** Game ends when a team reaches this score. */
  targetScore: number;
  /** If true, bidder may declare "No Trump". */
  allowNoTrump: boolean;
  /** If true, players may call Dobla / Char-Guna before bidding. */
  allowDobla: boolean;
  /** Minimum opening bid. */
  minBid: number;
  /**
   * A team loses immediately if their cumulative score drops below this.
   * Negative number — default -500 ("Doobna" rule).
   */
  doobnaThreshold: number;
  /**
   * [MIG-025] [GAP-017] Rulebook Section: "Bidding — exactly 2 rounds"
   * When true: bidding runs for exactly 2 full rounds (2×playerCount actions),
   * passes are non-permanent, and bidding ends by round count rather than
   * consecutive-pass elimination.
   * When false (default): legacy pass-elimination model (3 consecutive passes win).
   * Set to true in production via defaultGameConfig overrides.
   */
  useTwoRoundBidding: boolean;
}

// ---------------------------------------------------------------------------
// In-round state
// ---------------------------------------------------------------------------

export type GamePhase =
  | "dealing"
  | "primary_bid"             // [MIG-024] Forced bid=5 by first Secret Hand recipient
  | "primary_trump_selection" // [MIG-024] Mandatory Primary Trump by same player
  | "bidding"
  | "trump_selection"
  | "playing"
  | "trick_ended"
  | "round_ended"
  | "game_ended";

export interface BidEntry {
  seat: number;
  action: "bid" | "pass";
  /** Present only when action === "bid". */
  amount?: number;
}

export interface TrickCard {
  seat: number;
  card: CardCode;
}

export interface CompletedTrick {
  index: number; // 0-based trick number within the round
  cards: TrickCard[];
  ledSuit: Suit;
  winnerSeat: number;
  winnerTeam: TeamId;
  /** Sum of point-card values in this trick. */
  points: number;
}

// ---------------------------------------------------------------------------
// Bidding result
// ---------------------------------------------------------------------------

export type BiddingStatus =
  | "ongoing"   // bidding still in progress
  | "won"       // a bidder has been determined
  | "redeal";   // all players passed — must re-deal

// ---------------------------------------------------------------------------
// Round state
// ---------------------------------------------------------------------------

export interface RoundState {
  roundNumber: number;
  dealerSeat: number;
  phase: GamePhase;

  /** seat → cards in hand */
  hands: Record<number, CardCode[]>;

  // --- Bidding ---
  bids: BidEntry[];
  consecutivePasses: number;
  highestBid: number;
  highestBidderSeat: number | null;
  biddingStatus: BiddingStatus;

  // --- Double / Redouble (Dobla / Char-Guna) ---
  multiplier: Multiplier;
  /** Seat that called Double; null if not called. */
  doubleSeat: number | null;
  /** Seat that called Redouble; null if not called. */
  redoubleSeat: number | null;

  // --- Trump ---
  trumpSuit: Suit | null;
  /** True when bidder declared "No Trump" (requires allowNoTrump config). */
  noTrump: boolean;
  /**
   * [MIG-026] [GAP-019] Rulebook Section: "Trump — Primary vs Final"
   * Primary Trump is selected immediately after the Primary Bid by the same player.
   * If no one raises the bid above PRIMARY_BID_AMOUNT in regular bidding,
   * trumpSuit = primaryTrump and no Final Trump selection is needed.
   * null in legacy (non-two-round) bidding mode.
   */
  primaryTrump: Suit | null;

  // --- Trick-taking ---
  /** Seat that leads the current trick. */
  currentTrickLeaderSeat: number | null;
  currentTrick: TrickCard[];
  completedTricks: CompletedTrick[];

  /**
   * Consecutive tricks won by each team in the current streak.
   * Resets to 0 for a team when the other team wins a trick.
   */
  consecutiveWins: [number, number];
  /** Set when the Chhakri rule fires (6 consecutive tricks). */
  chhakri: { team: TeamId; trickIndex: number } | null;

  /** Running point totals captured by each team this round. */
  capturedPoints: [number, number];

  // --- Replay log ---
  events: GameEvent[];
  nextSequence: number;

  /**
   * Per-player card allocation by physical zone (secret_hand / face_down / face_up).
   * Populated by initRound from the dealt hands (MIG-017).
   * Optional for backward compatibility with pre-zone test fixtures.
   *
   * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
   * Total per player: secretHand(2) + faceDown(3) + faceUp(3) = 8 cards.
   */
  playerCards?: Record<number, PlayerCards>;

  /**
   * [MIG-024] [GAP-003] Remaining deck cards after Phase 1 deal.
   * Only set when useTwoRoundBidding=true and phase is "primary_bid" or
   * "primary_trump_selection". Cleared (undefined) once Phase 2/3 are dealt.
   */
  remainingDeck?: CardCode[];

  /**
   * The full shuffled deck as it was ordered when dealing began.
   * Set once by initRound; never modified thereafter.
   * Stored for replay and audit purposes.
   */
  shuffledDeck?: CardCode[];

  /**
   * [MIG-025] [GAP-017] Whether this round uses the two-round bidding structure.
   * Copied from GameConfig.useTwoRoundBidding at round initialisation.
   * false for backward-compatible test fixtures (pass-elimination model).
   */
  useTwoRoundBidding: boolean;
}

// ---------------------------------------------------------------------------
// Game-level state
// ---------------------------------------------------------------------------

export interface GameState {
  gameId: string;
  config: GameConfig;
  /** Cumulative scores per team. */
  scores: [number, number];
  roundNumber: number;
  currentRound: RoundState | null;
  /** Seat of the dealer for the next round (rotates after each round). */
  nextDealerSeat: number;
  winner: TeamId | null;
}

// ---------------------------------------------------------------------------
// Events (for replay)
// ---------------------------------------------------------------------------

export type EventType =
  | "deal"
  | "bid"
  | "pass"
  | "bid_won"
  | "double"
  | "redouble"
  | "primary_bid"              // [MIG-024] Forced bid=5 by first Secret Hand recipient
  | "primary_trump_selected"   // [MIG-024] Mandatory Primary Trump selection
  | "trump_selected"
  | "play_card"
  | "trick_ended"
  | "chhakri"
  | "round_ended"
  | "game_ended"
  | "redeal";

export interface GameEvent {
  sequence: number;
  type: EventType;
  seat?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
  /** Unix ms timestamp — use Date.now() or a deterministic counter in tests. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Card zones
// [MIG-001] [GAP-025] Rulebook Section: "Card Zone Structure"
// Implements: The three physical zones a card occupies in a Chhakri round.
// ---------------------------------------------------------------------------

/**
 * The three physical zones a card occupies during a Bundelkhandi Chhakri round.
 *   secret_hand — 2 cards, visible only to their owner.
 *   face_down   — 3 cards, face-down; unknown to all until played.
 *   face_up     — 3 cards, face-up; visible to all players at all times.
 */
export type CardZone = "secret_hand" | "face_down" | "face_up";

/**
 * Per-player card allocation by physical zone.
 * Populated during phased dealing (implemented in MIG-017, Phase 2).
 * Total: 2 + 3 + 3 = 8 cards per player.
 */
export interface PlayerCards {
  /** 2 cards — dealt first; visible only to their owner. */
  secretHand: CardCode[];
  /** 3 cards — dealt after Primary Bid; face-down until played. */
  faceDown: CardCode[];
  /** 3 cards — dealt last; visible to all players. */
  faceUp: CardCode[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface RoundResult {
  bidTeam: TeamId;
  defTeam: TeamId;
  /**
   * The winning bid value (5, 6, 7, or 8 — representing a trick count target).
   * [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
   */
  bid: number;
  /**
   * Number of tricks won by each team this round.
   * [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
   * Implements: scoring uses trick count vs bid, not card-point accumulation.
   */
  tricksWon: [number, number];
  multiplier: Multiplier;
  chhakri: { team: TeamId } | null;
}

export interface RoundScore {
  /** Score delta applied to each team. May be negative for bidding team. */
  deltas: [number, number];
  /** Text description (for UI / replay). */
  outcome:
    | "bid_made"
    | "bid_failed"
    | "chhakri_bid_team"
    | "chhakri_def_team";
}

// ---------------------------------------------------------------------------
// RNG abstraction (for deterministic testing)
// ---------------------------------------------------------------------------

/**
 * Returns a random integer in [0, max).
 * Default implementation uses node:crypto for security.
 * Tests inject a seeded PRNG for full determinism.
 */
export type RangeRng = (max: number) => number;
