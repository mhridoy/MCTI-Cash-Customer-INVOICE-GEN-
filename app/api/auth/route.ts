import { NextRequest, NextResponse } from "next/server"
import { createSessionToken, verifySessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session"

// Report whether the caller already has a valid session (used on page load)
export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  return NextResponse.json({
    authenticated: session !== null,
    branch: session?.branch ?? null,
    success: true,
  })
}

// Issues an HttpOnly session cookie per branch. The /api/sheets route requires
// this cookie, so the data API is no longer open to the whole internet.
//
// - HEAD_OFFICE always requires HEAD_OFFICE_PASSWORD.
// - MCTI_TASLIYA requires MCTI_PASSWORD only if that env var is set;
//   otherwise it stays open (same workflow as before).
export async function POST(request: NextRequest) {
  try {
    const { branch, password } = await request.json()

    if (branch !== "HEAD_OFFICE" && branch !== "MCTI_TASLIYA") {
      return NextResponse.json({ error: "Invalid branch", success: false }, { status: 400 })
    }

    if (branch === "HEAD_OFFICE") {
      const expected = process.env.HEAD_OFFICE_PASSWORD
      if (!expected) {
        console.error("HEAD_OFFICE_PASSWORD is not set in the environment")
        return NextResponse.json(
          { error: "Server is not configured for Head Office access", success: false },
          { status: 500 },
        )
      }
      if (typeof password !== "string" || password !== expected) {
        return NextResponse.json({ error: "Incorrect password", success: false }, { status: 401 })
      }
    } else {
      const expected = process.env.MCTI_PASSWORD
      if (expected && (typeof password !== "string" || password !== expected)) {
        return NextResponse.json(
          { error: "Incorrect password", success: false, requiresPassword: true },
          { status: 401 },
        )
      }
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set(SESSION_COOKIE, createSessionToken(branch), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    console.error("Error in auth:", error)
    return NextResponse.json({ error: "Invalid request", success: false }, { status: 400 })
  }
}
