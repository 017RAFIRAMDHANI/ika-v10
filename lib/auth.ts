import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";

function safeLegacyCompare(password: string, legacyValue: string) {
  const supplied = Buffer.from(password);
  const stored = Buffer.from(legacyValue);
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}

export async function verifyPassword(password: string, passwordHash: string) {
  const modernHash = passwordHash.startsWith("$2");
  const valid = modernHash
    ? await bcrypt.compare(password, passwordHash)
    : safeLegacyCompare(password, passwordHash);

  return { valid, needsUpgrade: valid && !modernHash };
}
