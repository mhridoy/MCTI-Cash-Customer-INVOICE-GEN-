import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session"

// Every method requires a valid session cookie (issued by /api/auth) so the
// data API cannot be read or modified by anonymous internet traffic.
function requireSession(request: NextRequest): NextResponse | null {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated. Please select your branch again.", success: false },
      { status: 401 },
    )
  }
  return null
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || "1-nHu605DRJ-qF6nmRteI30X7rvDBiu2INq8ti20f76A"

// Service-account credentials are read from environment variables.
// See .env.example — never commit the private key to source control.
function getCredentials() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL

  if (!privateKey || !clientEmail) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL in your environment (see .env.example).",
    )
  }

  return {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key: privateKey.replace(/\\n/g, "\n"),
    client_email: clientEmail,
  }
}

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}

type SheetsClient = ReturnType<typeof google.sheets>

function getSheetName(branch: string): string {
  return branch === "HEAD_OFFICE" ? "HeadOffice_Reports" : "MCTI_Tasliya_Reports"
}

async function getNextReportNumber(sheets: SheetsClient, sheetName: string): Promise<string> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    })

    const values = response.data.values || []
    let maxNumber = 0

    for (const row of values) {
      if (row[0] && typeof row[0] === "string") {
        const match = row[0].match(/^(\d+)$/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxNumber) {
            maxNumber = num
          }
        }
      }
    }

    return String(maxNumber + 1).padStart(6, "0")
  } catch {
    return "000001"
  }
}

async function reportNumberExists(sheets: SheetsClient, sheetName: string, reportNumber: string): Promise<boolean> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    })
    const values = response.data.values || []
    return values.some((row) => row[0] === reportNumber)
  } catch {
    return false
  }
}

async function ensureSheetExists(sheets: SheetsClient, sheetName: string) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    })

    const sheetExists = spreadsheet.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName
    )

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      })

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:G1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Report No", "Customer Name", "Date Created", "Total Quantity", "Total Amount", "Materials JSON", "Branch"]],
        },
      })
    }
  } catch (error) {
    console.error("Error ensuring sheet exists:", error)
  }
}

// Resolve the actual row for a report. Row indexes shift when rows are deleted,
// so trusting a stale rowIndex can update/delete the WRONG report. We verify the
// report number at the given index, and if it doesn't match, find it by number.
async function resolveRowIndex(
  sheets: SheetsClient,
  sheetName: string,
  rowIndex: number,
  reportNumber: string | undefined,
): Promise<number | null> {
  if (!reportNumber) return rowIndex // backwards compatibility

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    })
    const values = response.data.values || []

    // Fast path: the row is where the client thinks it is
    if (values[rowIndex - 1]?.[0] === reportNumber) return rowIndex

    // Rows shifted - find the report by its number instead
    for (let i = 1; i < values.length; i++) {
      if (values[i]?.[0] === reportNumber) return i + 1
    }
    return null // report no longer exists
  } catch {
    return rowIndex
  }
}

async function getSheetId(sheets: SheetsClient, sheetName: string): Promise<number | null> {
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    })

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    )

    return sheet?.properties?.sheetId ?? null
  } catch {
    return null
  }
}

interface MaterialPayload {
  quantity: number
  unitPrice: number
}

function computeTotals(materials: MaterialPayload[]) {
  const totalQuantity = materials.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0)
  const totalAmount = materials.reduce(
    (sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0),
    0,
  )
  return { totalQuantity, totalAmount }
}

export async function GET(request: NextRequest) {
  const authError = requireSession(request)
  if (authError) return authError
  try {
    const { searchParams } = new URL(request.url)
    const branch = searchParams.get("branch") || "MCTI_TASLIYA"
    const action = searchParams.get("action") || "getReportNumber"

    const sheets = await getGoogleSheetsClient()
    const sheetName = getSheetName(branch)

    await ensureSheetExists(sheets, sheetName)

    if (action === "getReports") {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:G`,
      })

      const values = response.data.values || []
      if (values.length <= 1) {
        return NextResponse.json({ reports: [], success: true })
      }

      const reports = values.slice(1).map((row, index) => {
        let materials = []
        try {
          materials = JSON.parse(row[5] || "[]")
        } catch {
          materials = []
        }
        return {
          rowIndex: index + 2,
          reportNumber: row[0] || "",
          customerName: row[1] || "",
          dateCreated: row[2] || "",
          totalQuantity: parseFloat(row[3]) || 0,
          totalAmount: parseFloat(row[4]) || 0,
          materials,
          branch: row[6] || "",
        }
      })

      return NextResponse.json({ reports, success: true })
    }

    const reportNumber = await getNextReportNumber(sheets, sheetName)
    return NextResponse.json({ reportNumber, success: true })
  } catch (error) {
    console.error("Error in GET:", error)
    return NextResponse.json({ error: "Failed to process request", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = requireSession(request)
  if (authError) return authError
  try {
    const body = await request.json()
    const { customerName, materials, branch, reportNumber } = body

    if (!customerName || !Array.isArray(materials) || materials.length === 0 || !branch || !reportNumber) {
      return NextResponse.json({ error: "Missing required fields", success: false }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient()
    const sheetName = getSheetName(branch)

    await ensureSheetExists(sheets, sheetName)

    // Guard against duplicate report numbers (e.g. two users saving at the same time).
    // If the number is already taken, assign the next available one.
    let finalReportNumber: string = reportNumber
    if (await reportNumberExists(sheets, sheetName, reportNumber)) {
      finalReportNumber = await getNextReportNumber(sheets, sheetName)
    }

    const { totalQuantity, totalAmount } = computeTotals(materials)
    const dateCreated = new Date().toISOString().split("T")[0]
    const branchName = branch === "HEAD_OFFICE" ? "Head Office" : "MCTI Tasliya"

    const row = [
      finalReportNumber,
      customerName,
      dateCreated,
      totalQuantity,
      totalAmount,
      JSON.stringify(materials),
      branchName,
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:G`,
      valueInputOption: "RAW",
      requestBody: {
        values: [row],
      },
    })

    return NextResponse.json({
      success: true,
      reportNumber: finalReportNumber,
      rowsAdded: materials.length,
    })
  } catch (error) {
    console.error("Error saving report:", error)
    return NextResponse.json({ error: "Failed to save report", success: false }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authError = requireSession(request)
  if (authError) return authError
  try {
    const body = await request.json()
    const { branch, rowIndex, customerName, materials, reportNumber } = body

    if (!branch || !rowIndex || !customerName || !Array.isArray(materials)) {
      return NextResponse.json({ error: "Missing required fields", success: false }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient()
    const sheetName = getSheetName(branch)

    const actualRowIndex = await resolveRowIndex(sheets, sheetName, rowIndex, reportNumber)
    if (actualRowIndex === null) {
      return NextResponse.json(
        { error: `Report #${reportNumber} no longer exists. Refresh the list and try again.`, success: false },
        { status: 409 },
      )
    }

    const { totalQuantity, totalAmount } = computeTotals(materials)
    const branchName = branch === "HEAD_OFFICE" ? "Head Office" : "MCTI Tasliya"

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${actualRowIndex}:G${actualRowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[reportNumber, customerName, new Date().toISOString().split("T")[0], totalQuantity, totalAmount, JSON.stringify(materials), branchName]],
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating report:", error)
    return NextResponse.json({ error: "Failed to update report", success: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authError = requireSession(request)
  if (authError) return authError
  try {
    const { searchParams } = new URL(request.url)
    const branch = searchParams.get("branch") || "MCTI_TASLIYA"
    const rowIndex = parseInt(searchParams.get("rowIndex") || "0", 10)
    const reportNumber = searchParams.get("reportNumber") || undefined

    if (!rowIndex || rowIndex < 2) {
      return NextResponse.json({ error: "Invalid row index", success: false }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient()
    const sheetName = getSheetName(branch)

    const actualRowIndex = await resolveRowIndex(sheets, sheetName, rowIndex, reportNumber)
    if (actualRowIndex === null) {
      return NextResponse.json(
        { error: `Report #${reportNumber} no longer exists. Refresh the list.`, success: false },
        { status: 409 },
      )
    }

    const sheetId = await getSheetId(sheets, sheetName)
    if (sheetId === null) {
      return NextResponse.json({ error: "Sheet not found", success: false }, { status: 404 })
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: actualRowIndex - 1,
                endIndex: actualRowIndex,
              },
            },
          },
        ],
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting report:", error)
    return NextResponse.json({ error: "Failed to delete report", success: false }, { status: 500 })
  }
}
