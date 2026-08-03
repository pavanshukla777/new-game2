import { describe, it, expect } from "vitest";
import {
  seatToTeam,
  teamSeats,
  opposingTeam,
  nextSeat,
  prevSeat,
  seatsInOrder,
  currentTrickSeat,
  nextDealerSeat,
  isValidSeat,
} from "../turn-order.js";

describe("seatToTeam", () => {
  it("even seats → Team 0", () => {
    expect(seatToTeam(0)).toBe(0);
    expect(seatToTeam(2)).toBe(0);
    expect(seatToTeam(4)).toBe(0);
  });
  it("odd seats → Team 1", () => {
    expect(seatToTeam(1)).toBe(1);
    expect(seatToTeam(3)).toBe(1);
    expect(seatToTeam(5)).toBe(1);
  });
});

describe("teamSeats", () => {
  it("4-player: Team 0 = {0, 2}, Team 1 = {1, 3}", () => {
    expect(teamSeats(0, 4)).toEqual([0, 2]);
    expect(teamSeats(1, 4)).toEqual([1, 3]);
  });
  it("6-player: Team 0 = {0, 2, 4}, Team 1 = {1, 3, 5}", () => {
    expect(teamSeats(0, 6)).toEqual([0, 2, 4]);
    expect(teamSeats(1, 6)).toEqual([1, 3, 5]);
  });
});

describe("opposingTeam", () => {
  it("0 ↔ 1", () => {
    expect(opposingTeam(0)).toBe(1);
    expect(opposingTeam(1)).toBe(0);
  });
});

describe("nextSeat", () => {
  it("increments clockwise", () => {
    expect(nextSeat(0, 4)).toBe(1);
    expect(nextSeat(3, 4)).toBe(0); // wrap
    expect(nextSeat(5, 6)).toBe(0); // wrap
  });
});

describe("prevSeat", () => {
  it("decrements clockwise", () => {
    expect(prevSeat(1, 4)).toBe(0);
    expect(prevSeat(0, 4)).toBe(3); // wrap
    expect(prevSeat(0, 6)).toBe(5); // wrap
  });
});

describe("seatsInOrder", () => {
  it("lists all seats starting from given seat", () => {
    expect(seatsInOrder(2, 4)).toEqual([2, 3, 0, 1]);
    expect(seatsInOrder(0, 4)).toEqual([0, 1, 2, 3]);
    expect(seatsInOrder(4, 6)).toEqual([4, 5, 0, 1, 2, 3]);
  });
});

describe("currentTrickSeat", () => {
  it("returns the leader when trick is empty", () => {
    expect(currentTrickSeat(1, 0, 4)).toBe(1);
  });
  it("returns the next seat after 1 card played", () => {
    expect(currentTrickSeat(1, 1, 4)).toBe(2);
  });
  it("wraps around correctly", () => {
    expect(currentTrickSeat(3, 1, 4)).toBe(0);
    expect(currentTrickSeat(3, 2, 4)).toBe(1);
    expect(currentTrickSeat(3, 3, 4)).toBe(2);
  });
});

describe("nextDealerSeat", () => {
  it("rotates clockwise", () => {
    expect(nextDealerSeat(0, 4)).toBe(1);
    expect(nextDealerSeat(3, 4)).toBe(0);
    expect(nextDealerSeat(5, 6)).toBe(0);
  });
});

describe("isValidSeat", () => {
  it("valid seats return true", () => {
    expect(isValidSeat(0, 4)).toBe(true);
    expect(isValidSeat(3, 4)).toBe(true);
    expect(isValidSeat(5, 6)).toBe(true);
  });
  it("out-of-range seats return false", () => {
    expect(isValidSeat(4, 4)).toBe(false);
    expect(isValidSeat(-1, 4)).toBe(false);
    expect(isValidSeat(6, 6)).toBe(false);
  });
  it("non-integer seat returns false", () => {
    expect(isValidSeat(1.5, 4)).toBe(false);
  });
});
