import { describe, it, expect } from "vitest";
import {
  createEvent,
  getEventsByType,
  summariseEvents,
} from "../replay.js";
import type { GameEvent } from "../types.js";

describe("createEvent", () => {
  it("creates an event with the correct shape", () => {
    const ev = createEvent(5, "bid", 2, { amount: 65 }, 12345);
    expect(ev).toEqual({
      sequence: 5,
      type: "bid",
      seat: 2,
      payload: { amount: 65 },
      timestamp: 12345,
    });
  });
  it("system events have undefined seat", () => {
    const ev = createEvent(0, "deal", undefined, { cards: [] }, 0);
    expect(ev.seat).toBeUndefined();
  });
  it("sequence is preserved exactly", () => {
    expect(createEvent(100, "pass", 3, {}, 0).sequence).toBe(100);
  });
});

describe("getEventsByType", () => {
  const events: GameEvent[] = [
    createEvent(0, "deal", undefined, {}, 0),
    createEvent(1, "bid", 1, { amount: 55 }, 0),
    createEvent(2, "pass", 2, {}, 0),
    createEvent(3, "pass", 3, {}, 0),
    createEvent(4, "pass", 0, {}, 0),
    createEvent(5, "bid_won", 1, { bid: 55 }, 0),
  ];

  it("returns only events of the specified type", () => {
    const passes = getEventsByType(events, "pass");
    expect(passes).toHaveLength(3);
    expect(passes.every((e) => e.type === "pass")).toBe(true);
  });
  it("returns empty array when no events of type", () => {
    expect(getEventsByType(events, "chhakri")).toEqual([]);
  });
  it("returns all events of the type", () => {
    expect(getEventsByType(events, "bid")).toHaveLength(1);
    expect(getEventsByType(events, "bid")[0].payload).toEqual({ amount: 55 });
  });
});

describe("summariseEvents", () => {
  it("returns a string for each event", () => {
    const events: GameEvent[] = [
      createEvent(0, "deal", undefined, { dealerSeat: 0 }, 0),
      createEvent(1, "bid", 1, { amount: 65 }, 0),
      createEvent(2, "pass", 2, {}, 0),
      createEvent(3, "bid_won", 1, { bid: 65, seat: 1 }, 0),
      createEvent(4, "trump_selected", 1, { suit: "H", noTrump: false }, 0),
      createEvent(5, "play_card", 1, { card: "AS" }, 0),
      createEvent(6, "trick_ended", 1, { winnerSeat: 1, points: 15, trickIndex: 0, cards: [] }, 0),
      createEvent(7, "chhakri", 1, { team: 0, trickIndex: 5, consecutiveWins: 6 }, 0),
      createEvent(8, "round_ended", undefined, { capturedPoints: [60, 40] }, 0),
      createEvent(9, "game_ended", undefined, { winner: 1 }, 0),
      createEvent(10, "redeal", undefined, {}, 0),
    ];

    const summary = summariseEvents(events);
    expect(summary).toHaveLength(events.length);
    expect(summary[0]).toMatch(/Cards dealt/i);
    expect(summary[1]).toMatch(/Bid 65/);
    expect(summary[2]).toMatch(/Pass/i);
    expect(summary[3]).toMatch(/Won bid/i);
    expect(summary[4]).toMatch(/H/);
    expect(summary[5]).toMatch(/AS/);
    expect(summary[6]).toMatch(/Won trick/i);
    expect(summary[7]).toMatch(/CHHAKRI/i);
    expect(summary[8]).toMatch(/Round ended/i);
    expect(summary[9]).toMatch(/Game ended/i);
    expect(summary[10]).toMatch(/Redeal/i);
  });

  it("handles double and redouble events", () => {
    const events: GameEvent[] = [
      createEvent(1, "double", 2, { seat: 2 }, 0),
      createEvent(2, "redouble", 3, { seat: 3 }, 0),
    ];
    const summary = summariseEvents(events);
    expect(summary[0]).toMatch(/Double/i);
    expect(summary[1]).toMatch(/Redouble/i);
  });

  it("includes sequence number in each summary line", () => {
    const events = [createEvent(42, "pass", 1, {}, 0)];
    expect(summariseEvents(events)[0]).toMatch(/\[42\]/);
  });
});
