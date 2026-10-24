import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ACCESS_AGE_MS = 15 * 60 * 1000;

type RegistrationAccessPayload = {
  purpose: "public-registration";
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function primaryCode() {
  const value = process.env.REGISTRATION_PRIMARY_CODE?.trim();
  if (!value || value.length < 8) {
    throw new Error("REGISTRATION_PRIMARY_CODE minimal 8 karakter dan wajib dikonfigurasi.");
  }
  return value;
}

function signingSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET minimal 32 karakter dan wajib dikonfigurasi.");
  }
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function sign(value: string) {
  const key = createHash("sha256")
    .update(signingSecret())
    .update("\0")
    .update(primaryCode())
    .digest();
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function verifyRegistrationPrimaryCode(value: string) {
  return timingSafeEqual(digest(value.trim()), digest(primaryCode()));
}

export function createRegistrationAccessToken() {
  const issuedAt = Date.now();
  const payload: RegistrationAccessPayload = {
    purpose: "public-registration",
    issuedAt,
    expiresAt: issuedAt + ACCESS_AGE_MS,
    nonce: randomBytes(18).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded)}`,
    expiresAt: payload.expiresAt
  };
}

export function validateRegistrationAccessToken(token: string) {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return false;
  const expected = Buffer.from(sign(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as RegistrationAccessPayload;
    return payload.purpose === "public-registration"
      && typeof payload.issuedAt === "number"
      && typeof payload.expiresAt === "number"
      && typeof payload.nonce === "string"
      && payload.nonce.length >= 16
      && payload.issuedAt <= Date.now() + 5000
      && payload.expiresAt >= Date.now()
      && payload.expiresAt - payload.issuedAt === ACCESS_AGE_MS;
  } catch {
    return false;
  }
}
