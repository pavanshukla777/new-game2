// ============================================================================
// Bundelkhandi Chhakri — Rule Engine Public API
// ============================================================================

// Core types
export type {
  Suit,
  Rank,
  CardCode,
  PlayerCount,
  TeamId,
  Multiplier,
  GameConfig,
  GamePhase,
  BidEntry,
  TrickCard,
  CompletedTrick,
  BiddingStatus,
  RoundState,
  GameState,
  EventType,
  GameEvent,
  RoundResult,
  RoundScore,
  RangeRng,
  // [MIG-001] [GAP-025] Rulebook Section: "Card Zone Structure"
  CardZone,
  PlayerCards,
} from "./types.js";

// Constants
export {
  SUITS,
  ALL_RANKS,
  FOUR_PLAYER_RANKS,
  SIX_PLAYER_RANKS,
  getRankValue,
  getPointValue,
  parseCard,
  getSuit,
  getRank,
  getCardPoints,
  makeCardCode,
  CARDS_PER_PLAYER,
  TRICKS_PER_ROUND,
  CHHAKRI_THRESHOLD,
  TOTAL_DECK_POINTS,
  DECK_TOTAL_POINTS,
  SERIES_TARGET,
  DEFAULT_TARGET_SCORE,
  DEFAULT_MIN_BID,
  MAX_BID,
  VALID_BID_VALUES,
  DEFAULT_DOOBNA_THRESHOLD,
  PASSES_TO_END_BIDDING,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  // [MIG-024] [MIG-025]
  PRIMARY_BID_AMOUNT,
  BIDDING_ROUNDS,
} from "./constants.js";

// PRNG
export { cryptoRng, createSeededRng, createFixedRng } from "./prng.js";

// Deck
export {
  generateDeck,
  shuffleDeck,
  dealCards,
  cardsOfSuit,
  removeCardFromHand,
  handContains,
} from "./deck.js";

// Zone-aware dealing utilities + phased deal functions
// [MIG-017] [GAP-001] Card Zone Structure
// [MIG-020] [GAP-003] Distribution Sequence — phased
// [MIG-021] [GAP-026] Face-down Logic — zone mutation utilities
export {
  SECRET_HAND_COUNT,
  FACE_DOWN_COUNT,
  FACE_UP_COUNT,
  emptyPlayerCards,
  assignCardsToZones,
  buildZonedHands,
  flattenPlayerCards,
  getAccessibleHand,
  dealPhase1Cards,
  dealPhase2Cards,
  dealPhase3Cards,
  assertCompletePlayerCards,
  removeCardFromZone,
  isInFaceDownPhase,
  getRevealableCards,
} from "./dealing.js";
export type {
  Phase1DealResult,
  Phase2DealResult,
  Phase3DealResult,
} from "./dealing.js";

// Bidding
export type { BiddingState } from "./bidding.js";
export {
  initBiddingState,
  placeBid,
  passBid,
  getValidBidRange,
  isCurrentBidder,
  // [MIG-025]
  currentBiddingRound,
} from "./bidding.js";

// Trump
export type { TrumpDeclaration } from "./trump.js";
export { declareTrump, isTrump, validTrumpChoices } from "./trump.js";

// Turn order
export {
  seatToTeam,
  teamSeats,
  opposingTeam,
  nextSeat,
  prevSeat,
  seatsInOrder,
  currentTrickSeat,
  nextDealerSeat,
  // [MIG-030] Trailing-team dealer rotation
  trailingTeamDealerSeat,
  isValidSeat,
} from "./turn-order.js";

// Move validation
export type { MoveValidationResult } from "./move-validator.js";
export {
  getLegalMoves,
  validateMove,
  getLedSuit,
  // [MIG-018] [GAP-023] Zone-aware move validation
  getLegalMovesZoned,
  validateMoveZoned,
} from "./move-validator.js";

// Trick
export { evaluateTrick, beats, countTrickPoints, countCapturedPoints } from "./trick.js";

// Scoring
export type { GameScoreResult } from "./scoring.js";
export {
  calculateRoundScore,
  applyRoundScore,
  // [MIG-029] Perfect 8/8 Instant Series Victory
  checkPerfect8Victory,
  tallyPoints,
  tricksNeeded,
  pointsNeeded,
} from "./scoring.js";

// Round state machine
// [MIG-023] [GAP-024] getLegalMovesZonedForSeat — always zone-aware
// [MIG-024] applyPrimaryBid / applyPrimaryTrumpSelection
export {
  initRound,
  callDouble,
  callRedouble,
  applyBid,
  applyPass,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyTrumpSelection,
  applyPlayCard,
  currentSeatForTrick,
  buildRoundResult,
  getLegalMovesForSeat,
  getLegalMovesZonedForSeat,
} from "./round.js";

// Replay
export {
  createEvent,
  replayEvents,
  getEventsByType,
  summariseEvents,
} from "./replay.js";

// Engine (orchestrator)
export { GameEngine, defaultGameConfig } from "./engine.js";

// AI move picker
// [MIG-039] [GAP-044] Rulebook Section: "AI Control — move generation"
export type { AiAction } from "./ai.js";
export { pickAiAction } from "./ai.js";

// Deck integrity validation
// [RULE-002] [RULE-003] [RULE-004] Official Rulebook: "Deck Construction"
export {
  DECK_SIZE,
  DeckValidationError,
  validateDeck,
  validateDeal,
  assertDealIntegrity,
} from "./deck-validator.js";
