import { NextRequest, NextResponse } from "next/server"

// Head Office password is verified server-side so it never ships in the client bundle.
// Set HEAD_OFFICE_PASSWORD in your environment (see .env.example).
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

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

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Invalid request", success: false }, { status: 400 })
  }
}
