// Server-side session tokens (HMAC-signed, stored in an HttpOnly cookie).
// This is what stops random people on the internet from calling the API
// directly to read, overwrite, or delete invoices.
import crypto from "crypto"

export const SESSION_COOKIE = "mcti_session"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12 // 12 hours

function getSecret(): string {
  const secret = process.env.APP_SECRET || process.env.HEAD_OFFICE_PASSWORD
  if (!secret) {
    throw new Error("Set APP_SECRET (or HEAD_OFFICE_PASSWORD) in the environment")
  }
  return secret
}

export function createSessionToken(branch: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const payload = `${branch}.${expiresAt}`
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

export function verifySessionToken(token: string | undefined): { branch: string } | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [branch, expiresAtString, signature] = parts
  const payload = `${branch}.${expiresAtString}`

  let expected: string
  try {
    expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  } catch {
    return null
  }

  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null

  const expiresAt = parseInt(expiresAtString, 10)
  if (!expiresAt || Date.now() > expiresAt) return null

  return { branch }
}
