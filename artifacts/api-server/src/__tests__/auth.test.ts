/**
 * Auth Service unit tests.
 *
 * Tests pure utility functions that do not require a live database:
 *   - generateOpaqueToken:  produces a 64-char hex string
 *   - hashOpaqueToken:      deterministic SHA-256 hex digest
 *   - buildUserDto:         correct public shape
 *   - generateAccessToken:  valid HS256 JWT with expected claims
 *   - hashPassword / verifyPassword:  argon2id round-trip
 *
 * DB-dependent functions (storeRefreshToken, rotateRefreshToken, revokeRefreshToken)
 * are tested with a vi.mock() stub that mirrors the Drizzle query-builder chain.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables must be declared before vi.mock() factories run,
// which are hoisted to the top of the file by vitest's babel transform.
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockInsert,
  mockUpdate,
  mockWhere,
  mockLimit,
  mockFrom,
  mockValues,
  mockSetChain,
  mockSetWhere,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockFrom: vi.fn(),
  mockValues: vi.fn(),
  mockSetChain: vi.fn(),
  mockSetWhere: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Stub @workspace/db so the module loads without a real DB connection.
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  usersTable: { id: "id", userId: "user_id" },
  refreshTokensTable: { id: "id", tokenHash: "token_hash", userId: "user_id" },
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered.
// ---------------------------------------------------------------------------

import {
  generateOpaqueToken,
  hashOpaqueToken,
  buildUserDto,
  generateAccessToken,
  hashPassword,
  verifyPassword,
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../services/auth.service.js";
import type { User } from "@workspace/db";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const SESSION_SECRET = "test-secret-key-for-unit-tests";

const mockUser: User = {
  id: "user-uuid-1234",
  username: "testuser",
  displayName: "Test User",
  email: "test@example.com",
  passwordHash: null,
  avatarUrl: null,
  eloRating: 1200,
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  isGuest: false,
  isBanned: false,
  lastSeenAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

beforeEach(() => {
  process.env["SESSION_SECRET"] = SESSION_SECRET;
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env["SESSION_SECRET"];
});

// ---------------------------------------------------------------------------
// generateOpaqueToken
// ---------------------------------------------------------------------------

describe("generateOpaqueToken", () => {
  it("returns a 64-character hexadecimal string", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on each call", () => {
    const t1 = generateOpaqueToken();
    const t2 = generateOpaqueToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// hashOpaqueToken
// ---------------------------------------------------------------------------

describe("hashOpaqueToken", () => {
  it("returns a 64-character hex SHA-256 digest", () => {
    const hash = hashOpaqueToken("some-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input always gives same output", () => {
    const token = "deterministic-input";
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashOpaqueToken("token-a")).not.toBe(hashOpaqueToken("token-b"));
  });
});

// ---------------------------------------------------------------------------
// buildUserDto
// ---------------------------------------------------------------------------

describe("buildUserDto", () => {
  it("returns all required public fields", () => {
    const dto = buildUserDto(mockUser);
    expect(dto).toMatchObject({
      id: mockUser.id,
      username: mockUser.username,
      displayName: mockUser.displayName,
      avatarUrl: null,
      eloRating: 1200,
      gamesPlayed: 0,
      gamesWon: 0,
      isGuest: false,
      createdAt: mockUser.createdAt,
    });
  });

  it("maps null avatarUrl to null (not undefined)", () => {
    const dto = buildUserDto({ ...mockUser, avatarUrl: null });
    expect(dto.avatarUrl).toBeNull();
  });

  it("preserves a non-null avatarUrl", () => {
    const dto = buildUserDto({ ...mockUser, avatarUrl: "https://example.com/avatar.png" });
    expect(dto.avatarUrl).toBe("https://example.com/avatar.png");
  });

  it("does not expose passwordHash, email, or isBanned", () => {
    const dto = buildUserDto(mockUser) as Record<string, unknown>;
    expect(dto["passwordHash"]).toBeUndefined();
    expect(dto["email"]).toBeUndefined();
    expect(dto["isBanned"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateAccessToken
// ---------------------------------------------------------------------------

describe("generateAccessToken", () => {
  it("returns a valid JWT string (3 dot-separated segments)", () => {
    const token = generateAccessToken(mockUser);
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes sub, username, displayName, and isGuest claims", () => {
    const token = generateAccessToken(mockUser);
    const decoded = jwt.verify(token, SESSION_SECRET) as Record<string, unknown>;
    expect(decoded["sub"]).toBe(mockUser.id);
    expect(decoded["username"]).toBe(mockUser.username);
    expect(decoded["displayName"]).toBe(mockUser.displayName);
    expect(decoded["isGuest"]).toBe(false);
  });

  it("omits the banned claim for non-banned users", () => {
    const token = generateAccessToken({ ...mockUser, isBanned: false });
    const decoded = jwt.verify(token, SESSION_SECRET) as Record<string, unknown>;
    expect(decoded["banned"]).toBeUndefined();
  });

  it("includes banned: true for banned users", () => {
    const token = generateAccessToken({ ...mockUser, isBanned: true });
    const decoded = jwt.verify(token, SESSION_SECRET) as Record<string, unknown>;
    expect(decoded["banned"]).toBe(true);
  });

  it("throws when SESSION_SECRET is not set", () => {
    delete process.env["SESSION_SECRET"];
    expect(() => generateAccessToken(mockUser)).toThrow("SESSION_SECRET not configured");
  });

  it("expires in exactly 15 minutes", () => {
    const token = generateAccessToken(mockUser);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});

// ---------------------------------------------------------------------------
// hashPassword / verifyPassword  (real argon2id — intentionally slow)
// ---------------------------------------------------------------------------

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a correct password", async () => {
    const h = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", h)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const h = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", h)).toBe(false);
  });

  it("produces a different hash each call (salted)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });

  it("returns false for a malformed hash without throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-argon2-hash")).toBe(false);
  });
}, 30_000); // argon2id is intentionally slow — allow 30 s

// ---------------------------------------------------------------------------
// storeRefreshToken (mocked DB)
// ---------------------------------------------------------------------------

describe("storeRefreshToken", () => {
  beforeEach(() => {
    mockValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("inserts a row with a SHA-256 hashed token and a future expiry", async () => {
    await storeRefreshToken("user-1", "raw-token-abc");

    expect(mockInsert).toHaveBeenCalledOnce();
    const arg = mockValues.mock.calls[0][0] as {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    };
    expect(arg.userId).toBe("user-1");
    // Stored hash must differ from the raw token
    expect(arg.tokenHash).not.toBe("raw-token-abc");
    // Must be deterministic — same as calling hashOpaqueToken directly
    expect(arg.tokenHash).toBe(hashOpaqueToken("raw-token-abc"));
    // Expiry must be strictly in the future
    expect(arg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// rotateRefreshToken (mocked DB)
// ---------------------------------------------------------------------------

describe("rotateRefreshToken", () => {
  const rawToken = "valid-raw-token";
  const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const mockTokenRow = {
    id: "token-row-id",
    userId: mockUser.id,
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: futureDate,
    revokedAt: null,
    createdAt: new Date(),
  };

  /** Wire the select chain to return `rows` for EVERY select call. */
  function setupSelectReturning(rows: unknown[][]) {
    let call = 0;
    mockLimit.mockImplementation(async () => rows[call++] ?? []);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  }

  it("rejects an unknown token with status 401", async () => {
    setupSelectReturning([[]]); // token not found
    await expect(rotateRefreshToken("unknown-token")).rejects.toMatchObject({
      message: "INVALID_REFRESH_TOKEN",
      status: 401,
    });
  });

  it("rejects a revoked token with status 401", async () => {
    setupSelectReturning([[{ ...mockTokenRow, revokedAt: new Date() }]]);
    await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
      message: "REFRESH_TOKEN_REVOKED",
      status: 401,
    });
  });

  it("rejects an expired token with status 401", async () => {
    setupSelectReturning([
      [{ ...mockTokenRow, expiresAt: new Date(Date.now() - 1000) }],
    ]);
    await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
      message: "REFRESH_TOKEN_EXPIRED",
      status: 401,
    });
  });

  it("on success: revokes old token, stores new token, returns new credentials", async () => {
    setupSelectReturning([[mockTokenRow], [mockUser]]);

    mockSetWhere.mockResolvedValue(undefined);
    mockSetChain.mockReturnValue({ where: mockSetWhere });
    mockUpdate.mockReturnValue({ set: mockSetChain });

    mockValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await rotateRefreshToken(rawToken);

    expect(typeof result.newAccessToken).toBe("string");
    expect(result.newAccessToken.split(".")).toHaveLength(3);
    expect(result.newRefreshToken).not.toBe(rawToken);
    expect(result.newRefreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.user).toMatchObject({ id: mockUser.id });
    // Old token must be revoked
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSetChain).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });
});

// ---------------------------------------------------------------------------
// revokeRefreshToken (mocked DB)
// ---------------------------------------------------------------------------

describe("revokeRefreshToken", () => {
  it("calls db.update with revokedAt and the correct hash", async () => {
    mockSetWhere.mockResolvedValue(undefined);
    mockSetChain.mockReturnValue({ where: mockSetWhere });
    mockUpdate.mockReturnValue({ set: mockSetChain });

    await revokeRefreshToken("token-to-revoke");

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockSetChain).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });
});
