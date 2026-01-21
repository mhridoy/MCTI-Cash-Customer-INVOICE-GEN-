import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"

const SPREADSHEET_ID = "1-nHu605DRJ-qF6nmRteI30X7rvDBiu2INq8ti20f76A"

const credentials = {
  type: "service_account",
  project_id: "tabib-al-arabia-cntr",
  private_key_id: "800b10790fe10e1a434350a342ca9df5bb53f5ad",
  private_key: process.env.GOOGLE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCs86cwL8kvFnmt\ncqpW+p+ruAWr65bNrxt2/ik2kLZiOJVo6CfEfcllckhBWBFWqbbA+cgQ545/5kgc\nlqZhX46eiBKoOvb4O6CMBI6ti0FrghMQBys9gqkmAx2neIO9FGY0jri86ryNrZvJ\nfk53jO3TUTDl9ONj7PUJTBKYnq2uH+ESENfzhGbpQwNVA9GvEvqVecC4teXEZTNy\nSIQS6YI7h75n2P/rKmqzTqILSna1Qw/0sbzjNb3WzVs7LsFbq9g7wqPuBmhtwjn0\nikoA0qPblJ5abQXxLXrtlsQA4jxL7hkuTTLY99P57i2SemCA1zYmfPORqXLe7HYV\nEvABLSebAgMBAAECggEAKWTZl4VgY/Y/oh1HGrE6ZQmSxe6JdeoaqzSynX4uQLzl\nOaoS1or6mF6tX4JaCAFvnalK0ozxRLhTexAtezG5O0U7Heua75ep2ck/ctbZDgeg\nU1474alznYbyYoJMGYWX3q1oFsMh5NDv795cnm1rAIA2sVsWz3RHw3VjIAceb4WJ\nXLRkgWimtWMyTIlEDi7wMNyF26gabUyXosPNLOrgCPQmDQJcdwihvvRVCExShhRP\nIZk9cewfpR4u/tVwrv8AF8ypjKmFpdf7CHuuhTDA1LFhvO3WZfLvaBbO59YBEl0a\nN+S6rvdrmnGX+E5VUP1SSrszIefsFyCg7uY5PfSDsQKBgQDsR6hEjtyO+jszgu1W\nlG5EKJSq3jzUB/PGmlMUFw9AZ6f4KlUoEcPacf46rzSImMewctpeg+5ize7GIFED\nDjQthO16O3zNmCoGkMjPM9sxpoAQJC7g481PpR0ZfrwwtTIE55O0jjG7PPCEhE40\nl/VpcpBoMd1lghd9rSHMTJa80QKBgQC7Yu4w1cffBCz4opwKavuQ2ZiaPJggXHOx\n3/DNpTRfjPUMaLWfPgI392EqWbSHzDgL2z2X4lE+sqIUUTL+rEOLfunV7PLR61Tt\nqvOob4q1Wh3svr2WrEtH4opH3PNthAtloJy+M3+np1Jf+wgNNHpOBy0zl02hnKJw\nrHAUlM6IqwKBgQCLwz9HfnH8qQvHxpR5eEdZTd/Syq6UhTevrK2j3pgI8seqxe+l\nSgzd9Dv7npOmkSjduLJu4f9qtoGc9JS3B/nZSx3mBbYnLvD8/TurRPNNhT2PTrfk\nExvpFrQF1q+e6C90Mz9tuAa2yK9E07Ym6hQikb/VwllBqBgZIQYzAMLRYQKBgEoq\nfuH/Syt+yJnkKmSJMWaEaTzqrL9qODR30SRjtdX3wWmW7APKFDC4jdGoTabN8oTm\n0nsSDVwGcdYeyVM5NUa6Ba0xKm5heWzUE7pf44Oh1mREnl9LdERQarDEx+hZsfUY\nW9GAKo9dz2HDxs0LLzlA5+gag5RqnXSBG59ZwmEfAoGBANKorwlQqjbteI8J9/il\nV50vH3dvYGdvf0Om28R+Qw+8viyNxzj7axDxYufElbIW3RBwRfcKvbZf0kBXrRt7\nMEoKJPnNlYW/Edl/CRrJopOQkYWHbRBHxqa2uh+u3fPDZTAoYKpzs96CZ5HlwEV2\naeBQMKDUbt3c2OUco2KAJwe/\n-----END PRIVATE KEY-----\n",
  client_email: "delivery-note-backend@tabib-al-arabia-cntr.iam.gserviceaccount.com",
  client_id: "114549260139904985576",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/delivery-note-backend%40tabib-al-arabia-cntr.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
}

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  return sheets
}

async function getNextReportNumber(sheets: ReturnType<typeof google.sheets>, branch: string): Promise<string> {
  const sheetName = branch === "HEAD_OFFICE" ? "HeadOffice" : "MCTI_Tasliya"
  
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

async function ensureSheetExists(sheets: ReturnType<typeof google.sheets>, sheetName: string) {
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
        range: `${sheetName}!A1:H1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Report No", "Date", "Customer Name", "Material Name", "Quantity", "Unit Price", "Total Price", "Branch"]],
        },
      })
    }
  } catch (error) {
    console.error("Error ensuring sheet exists:", error)
  }
}

async function getSheetId(sheets: ReturnType<typeof google.sheets>, sheetName: string): Promise<number | null> {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const branch = searchParams.get("branch") || "MCTI_TASLIYA"
    const action = searchParams.get("action") || "getReportNumber"
    
    const sheets = await getGoogleSheetsClient()
    const sheetName = branch === "HEAD_OFFICE" ? "HeadOffice" : "MCTI_Tasliya"
    
    await ensureSheetExists(sheets, sheetName)
    
    if (action === "getData") {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:H`,
      })
      
      const values = response.data.values || []
      if (values.length <= 1) {
        return NextResponse.json({ data: [], success: true })
      }
      
      const data = values.slice(1).map((row, index) => ({
        rowIndex: index + 2,
        reportNumber: row[0] || "",
        date: row[1] || "",
        customerName: row[2] || "",
        materialName: row[3] || "",
        quantity: parseFloat(row[4]) || 0,
        unitPrice: parseFloat(row[5]) || 0,
        totalPrice: parseFloat(row[6]) || 0,
        branch: row[7] || "",
      }))
      
      return NextResponse.json({ data, success: true })
    }
    
    const reportNumber = await getNextReportNumber(sheets, branch)
    return NextResponse.json({ reportNumber, success: true })
  } catch (error) {
    console.error("Error in GET:", error)
    return NextResponse.json({ error: "Failed to process request", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerName, materials, branch, reportNumber } = body
    
    if (!customerName || !materials || !branch || !reportNumber) {
      return NextResponse.json({ error: "Missing required fields", success: false }, { status: 400 })
    }
    
    const sheets = await getGoogleSheetsClient()
    const sheetName = branch === "HEAD_OFFICE" ? "HeadOffice" : "MCTI_Tasliya"
    
    await ensureSheetExists(sheets, sheetName)
    
    const rows = materials.map((material: { date: string; name: string; quantity: number; unitPrice: number }) => [
      reportNumber,
      material.date,
      customerName,
      material.name,
      material.quantity,
      material.unitPrice,
      material.quantity * material.unitPrice,
      branch === "HEAD_OFFICE" ? "Head Office" : "MCTI Tasliya",
    ])
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:H`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    })
    
    return NextResponse.json({ success: true, reportNumber, rowsAdded: rows.length })
  } catch (error) {
    console.error("Error saving to Google Sheets:", error)
    return NextResponse.json({ error: "Failed to save to Google Sheets", success: false }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { branch, rowIndex, date, customerName, materialName, quantity, unitPrice } = body
    
    if (!branch || !rowIndex || !materialName) {
      return NextResponse.json({ error: "Missing required fields", success: false }, { status: 400 })
    }
    
    const sheets = await getGoogleSheetsClient()
    const sheetName = branch === "HEAD_OFFICE" ? "HeadOffice" : "MCTI_Tasliya"
    
    const totalPrice = quantity * unitPrice
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!B${rowIndex}:G${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[date, customerName, materialName, quantity, unitPrice, totalPrice]],
      },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating record:", error)
    return NextResponse.json({ error: "Failed to update record", success: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const branch = searchParams.get("branch") || "MCTI_TASLIYA"
    const rowIndex = parseInt(searchParams.get("rowIndex") || "0", 10)
    
    if (!rowIndex || rowIndex < 2) {
      return NextResponse.json({ error: "Invalid row index", success: false }, { status: 400 })
    }
    
    const sheets = await getGoogleSheetsClient()
    const sheetName = branch === "HEAD_OFFICE" ? "HeadOffice" : "MCTI_Tasliya"
    
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
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting record:", error)
    return NextResponse.json({ error: "Failed to delete record", success: false }, { status: 500 })
  }
}
