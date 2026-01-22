"use client"

import React, { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { PlusCircle, FileDown, Printer, X, FileSpreadsheet, Package, Pencil, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { materialsList } from "@/lib/materials-list"
import { cn } from "@/lib/utils"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// Define the Material type
interface Material {
  id: string
  date: string
  name: string
  quantity: number
  unitPrice: number
}

// Define the StockItem type for inventory export
interface StockItem {
  name: string
  totalQuantity: number
  averagePrice: number
  totalAmount: number
}

// Define the MaterialGroup type for grouped stock report
interface MaterialGroup {
  name: string
  items: Material[]
  totalQuantity: number
  totalAmount: number
  averagePrice: number
}

// Define the SavedData type for localStorage
interface SavedData {
  customerName: string
  materials: Material[]
  lastUpdated: string
  selectedBranch?: string
  reportNumber?: string
}

// Branch options
const BRANCH_OPTIONS = {
  HEAD_OFFICE: "Tabib Al Arabia for Environmental Services: Head Office",
  MCTI_TASLIYA: "MCTI Branch, Tasliya",
} as const

type BranchType = keyof typeof BRANCH_OPTIONS

// LocalStorage key
const STORAGE_KEY = "material_tracker_data"

export default function Home() {
  // Branch selection state
  const [selectedBranch, setSelectedBranch] = useState<BranchType | null>(null)
  const [isBranchSet, setIsBranchSet] = useState(false)

  // Customer information state
  const [customerName, setCustomerName] = useState("")
  const [isCustomerSet, setIsCustomerSet] = useState(false)

  // Get company name based on selected branch
  const getCompanyName = () => {
    if (!selectedBranch) return ""
    return BRANCH_OPTIONS[selectedBranch]
  }

  // Material form state
  const [currentDate, setCurrentDate] = useState("")
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitPrice, setUnitPrice] = useState("")

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editQuantity, setEditQuantity] = useState("")
  const [editUnitPrice, setEditUnitPrice] = useState("")
  const [editDate, setEditDate] = useState("")

  // View state
  const [showStockReport, setShowStockReport] = useState(false)

  // Report number state
  const [reportNumber, setReportNumber] = useState<string | null>(null)
  const [isSavingToSheets, setIsSavingToSheets] = useState(false)

  // Password protection for Head Office
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const HEAD_OFFICE_PASSWORD = "Password2025"

  // Saved reports state
  interface SavedReport {
    rowIndex: number
    reportNumber: string
    customerName: string
    dateCreated: string
    totalQuantity: number
    totalAmount: number
    materials: Material[]
    branch: string
  }
  const [showSavedReports, setShowSavedReports] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(false)
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null)

  // Input refs for focus management
  const nameInputRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const unitPriceInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const editNameInputRef = useRef<HTMLInputElement>(null)
  const stockReportRef = useRef<HTMLDivElement>(null)

  // Materials list state
  const [materials, setMaterials] = useState<Material[]>([])

  // Reference for the content to be exported
  const contentRef = useRef<HTMLDivElement>(null)

  // Load saved data from localStorage on initial load
  useEffect(() => {
    const savedDataString = localStorage.getItem(STORAGE_KEY)
    if (savedDataString) {
      try {
        const savedData: SavedData = JSON.parse(savedDataString)
        setCustomerName(savedData.customerName)
        setMaterials(savedData.materials)
        if (savedData.selectedBranch) {
          setSelectedBranch(savedData.selectedBranch as BranchType)
          setIsBranchSet(true)
        }
        if (savedData.customerName) {
          setIsCustomerSet(true)
        }
        if (savedData.reportNumber) {
          setReportNumber(savedData.reportNumber)
        }
        console.log(`Loaded saved data from ${savedData.lastUpdated}`)
      } catch (error) {
        console.error("Error loading saved data:", error)
      }
    }

    // Set today's date as default
    const today = new Date().toISOString().split("T")[0]
    setCurrentDate(today)
  }, [])

  // Save data to localStorage whenever materials, customer name, branch, or report number changes
  useEffect(() => {
    if (materials.length > 0 || customerName || selectedBranch || reportNumber) {
      const dataToSave: SavedData = {
        customerName,
        materials,
        lastUpdated: new Date().toISOString(),
        selectedBranch: selectedBranch || undefined,
        reportNumber: reportNumber || undefined,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
    }
  }, [materials, customerName, selectedBranch, reportNumber])

  // Fetch report number from Google Sheets API
  const fetchReportNumber = async () => {
    if (!selectedBranch) return
    try {
      const response = await fetch(`/api/sheets?branch=${selectedBranch}`)
      const data = await response.json()
      if (data.success && data.reportNumber) {
        setReportNumber(data.reportNumber)
      }
    } catch (error) {
      console.error("Error fetching report number:", error)
      toast.error("Failed to fetch report number from server")
    }
  }

  // Save data to Google Sheets
  const saveToGoogleSheets = async () => {
    if (!selectedBranch || !customerName || materials.length === 0 || !reportNumber) {
      toast.error("Please ensure all data is filled before saving")
      return
    }

    setIsSavingToSheets(true)
    try {
      const response = await fetch("/api/sheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          materials,
          branch: selectedBranch,
          reportNumber,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success(`Saved ${data.rowsAdded} items to Google Sheets (Report #${reportNumber})`)
      } else {
        toast.error(data.error || "Failed to save to Google Sheets")
      }
    } catch (error) {
      console.error("Error saving to Google Sheets:", error)
      toast.error("Failed to save to Google Sheets")
    } finally {
      setIsSavingToSheets(false)
    }
  }

  const fetchSavedReports = async () => {
    if (!selectedBranch) return
    setIsLoadingReports(true)
    try {
      const response = await fetch(`/api/sheets?branch=${selectedBranch}&action=getReports`)
      const data = await response.json()
      if (data.success) {
        setSavedReports(data.reports)
      } else {
        toast.error(data.error || "Failed to fetch saved reports")
      }
    } catch (error) {
      console.error("Error fetching saved reports:", error)
      toast.error("Failed to fetch saved reports")
    } finally {
      setIsLoadingReports(false)
    }
  }

  const loadReport = (report: SavedReport) => {
    setCustomerName(report.customerName)
    setMaterials(report.materials)
    setReportNumber(report.reportNumber)
    setSelectedReport(report)
    setShowSavedReports(false)
    setIsCustomerSet(true)
    toast.success(`Loaded Report #${report.reportNumber}`)
  }

  const updateReport = async () => {
    if (!selectedBranch || !selectedReport) return
    try {
      const response = await fetch("/api/sheets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: selectedBranch,
          rowIndex: selectedReport.rowIndex,
          customerName,
          materials,
          reportNumber: selectedReport.reportNumber,
        }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Report updated successfully")
        fetchSavedReports()
      } else {
        toast.error(data.error || "Failed to update report")
      }
    } catch (error) {
      console.error("Error updating report:", error)
      toast.error("Failed to update report")
    }
  }

  const deleteReport = async (rowIndex: number) => {
    if (!selectedBranch) return
    if (!confirm("Are you sure you want to delete this report? This cannot be undone.")) return
    try {
      const response = await fetch(`/api/sheets?branch=${selectedBranch}&rowIndex=${rowIndex}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Report deleted successfully")
        fetchSavedReports()
        if (selectedReport?.rowIndex === rowIndex) {
          setSelectedReport(null)
        }
      } else {
        toast.error(data.error || "Failed to delete report")
      }
    } catch (error) {
      console.error("Error deleting report:", error)
      toast.error("Failed to delete report")
    }
  }

  const toggleSavedReports = () => {
    if (!showSavedReports) {
      fetchSavedReports()
    }
    setShowSavedReports(!showSavedReports)
  }

  const verifyPassword = () => {
    if (passwordInput === HEAD_OFFICE_PASSWORD) {
      setIsPasswordVerified(true)
      setShowPasswordPrompt(false)
      setPasswordInput("")
      setSelectedBranch("HEAD_OFFICE")
      setIsBranchSet(true)
      toast.success("Access granted to Head Office")
    } else {
      toast.error("Incorrect password")
      setPasswordInput("")
    }
  }

  const handleHeadOfficeSelect = () => {
    setShowPasswordPrompt(true)
  }

  // Clear saved data
  const clearSavedData = () => {
    if (confirm("Are you sure you want to clear all saved data? This cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY)
      setSelectedBranch(null)
      setIsBranchSet(false)
      setCustomerName("")
      setIsCustomerSet(false)
      setMaterials([])
      setCurrentDate(new Date().toISOString().split("T")[0])
      setName("")
      setQuantity("")
      setUnitPrice("")
      setSuggestions([])
      setShowSuggestions(false)
      setReportNumber(null)
    }
  }

  // Handle branch selection
  const handleBranchSelect = (branch: BranchType) => {
    setSelectedBranch(branch)
    setIsBranchSet(true)
  }

  // Handle customer form submission
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim()) {
      toast.error("Please enter a customer name")
      return
    }
    setIsCustomerSet(true)

    // Fetch report number if not already set
    if (!reportNumber) {
      await fetchReportNumber()
    }

    // Focus the first input after setting customer
    setTimeout(() => {
      nameInputRef.current?.focus()
    }, 100)
  }

  // Handle material form submission
  const handleMaterialSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }

    if (!name || !quantity || !unitPrice) {
      toast.error("Please fill in all material fields")
      return
    }

    // Use the provided date or the most recent date
    const dateToUse = currentDate || getMostRecentDate() || new Date().toISOString().split("T")[0]

    const newMaterial: Material = {
      id: Date.now().toString(),
      date: dateToUse,
      name,
      quantity: Number.parseFloat(quantity),
      unitPrice: Number.parseFloat(unitPrice),
    }

    setMaterials([...materials, newMaterial])

    // Reset form fields except date
    setName("")
    setQuantity("")
    setUnitPrice("")
    setSuggestions([])
    setShowSuggestions(false)

    // Focus back to the material name input for quick entry
    setTimeout(() => {
      nameInputRef.current?.focus()
    }, 100)
  }

  // Start editing a material
  const startEditing = (material: Material) => {
    setEditingId(material.id)
    setEditName(material.name)
    setEditQuantity(material.quantity.toString())
    setEditUnitPrice(material.unitPrice.toString())
    setEditDate(material.date)

    // Focus on the name input after rendering
    setTimeout(() => {
      if (editNameInputRef.current) {
        editNameInputRef.current.focus()
      }
    }, 100)
  }

  // Save edited material
  const saveEdit = () => {
    if (!editName || !editQuantity || !editUnitPrice) {
      toast.error("Please fill in all fields")
      return
    }

    const updatedMaterials = materials.map((material) => {
      if (material.id === editingId) {
        return {
          ...material,
          date: editDate,
          name: editName,
          quantity: Number.parseFloat(editQuantity),
          unitPrice: Number.parseFloat(editUnitPrice),
        }
      }
      return material
    })

    setMaterials(updatedMaterials)
    cancelEdit()
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditQuantity("")
    setEditUnitPrice("")
    setEditDate("")
  }

  // Insert a new item after a specific material
  const insertAfter = (materialId: string) => {
    const index = materials.findIndex(m => m.id === materialId)
    if (index === -1) return
    
    const materialToCopy = materials[index]
    const newMaterial: Material = {
      id: Date.now().toString(),
      date: materialToCopy.date,
      name: "",
      quantity: 0,
      unitPrice: 0,
    }
    
    const newMaterials = [...materials]
    newMaterials.splice(index + 1, 0, newMaterial)
    setMaterials(newMaterials)
    
    // Start editing the new material immediately
    setTimeout(() => {
      startEditing(newMaterial)
    }, 100)
    
    toast.success("New row inserted - please fill in the details")
  }

  // Handle material name input change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setName(value)

    // Filter suggestions based on input
    if (value.trim()) {
      const filtered = materialsList.filter((material) => material.toLowerCase().includes(value.toLowerCase()))
      setSuggestions(filtered)
      setShowSuggestions(true)
      setActiveSuggestion(0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  // Handle edit name input change for suggestions
  const handleEditNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEditName(value)

    // Filter suggestions based on input
    if (value.trim()) {
      const filtered = materialsList.filter((material) => material.toLowerCase().includes(value.toLowerCase()))
      setSuggestions(filtered)
      setShowSuggestions(true)
      setActiveSuggestion(0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  // Handle keyboard navigation in suggestions
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isEdit = false) => {
    // Tab to select current suggestion and move to next field
    if (e.key === "Tab") {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault()
        if (isEdit) {
          setEditName(suggestions[activeSuggestion])
        } else {
          setName(suggestions[activeSuggestion])
        }
        setShowSuggestions(false)
        if (isEdit) {
          const quantityInput = document.getElementById("edit-quantity")
          if (quantityInput) {
            ;(quantityInput as HTMLInputElement).focus()
          }
        } else {
          quantityInputRef.current?.focus()
        }
      }
      return
    }

    // Enter to select suggestion or move to next field
    if (e.key === "Enter") {
      e.preventDefault()

      if (showSuggestions && suggestions.length > 0) {
        if (isEdit) {
          setEditName(suggestions[activeSuggestion])
        } else {
          setName(suggestions[activeSuggestion])
        }
        setShowSuggestions(false)
        if (isEdit) {
          const quantityInput = document.getElementById("edit-quantity")
          if (quantityInput) {
            ;(quantityInput as HTMLInputElement).focus()
          }
        } else {
          quantityInputRef.current?.focus()
        }
      } else {
        if (isEdit) {
          const quantityInput = document.getElementById("edit-quantity")
          if (quantityInput) {
            ;(quantityInput as HTMLInputElement).focus()
          }
        } else {
          quantityInputRef.current?.focus()
        }
      }
      return
    }

    // Arrow down to navigate suggestions
    if (e.key === "ArrowDown") {
      if (showSuggestions && activeSuggestion < suggestions.length - 1) {
        setActiveSuggestion(activeSuggestion + 1)
      }
      return
    }

    // Arrow up to navigate suggestions
    if (e.key === "ArrowUp") {
      if (showSuggestions && activeSuggestion > 0) {
        setActiveSuggestion(activeSuggestion - 1)
      }
      return
    }

    // Escape to close suggestions
    if (e.key === "Escape") {
      setShowSuggestions(false)
      return
    }
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string, isEdit = false) => {
    if (isEdit) {
      setEditName(suggestion)
      const quantityInput = document.getElementById("edit-quantity")
      if (quantityInput) {
        ;(quantityInput as HTMLInputElement).focus()
      }
    } else {
      setName(suggestion)
      quantityInputRef.current?.focus()
    }
    setShowSuggestions(false)
  }

  // Handle click outside suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        event.target !== nameInputRef.current &&
        event.target !== editNameInputRef.current
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Handle keyboard shortcuts for other fields
  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault()

      if (field === "quantity") {
        unitPriceInputRef.current?.focus()
      } else if (field === "unitPrice") {
        // If all fields are filled, submit the form
        if (name && quantity && unitPrice) {
          handleMaterialSubmit()
        }
      }
    }

    // Excel-like behavior: Tab in the last field submits the form
    if (e.key === "Tab" && field === "unitPrice") {
      if (name && quantity && unitPrice) {
        e.preventDefault()
        handleMaterialSubmit()
      }
    }
  }

  // Handle keyboard shortcuts for edit fields
  const handleEditKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault()

      if (field === "quantity") {
        const unitPriceInput = document.getElementById("edit-unitPrice")
        if (unitPriceInput) {
          ;(unitPriceInput as HTMLInputElement).focus()
        }
      } else if (field === "unitPrice") {
        // If all fields are filled, save the edit
        if (editName && editQuantity && editUnitPrice) {
          saveEdit()
        }
      }
    }

    // Excel-like behavior: Tab in the last field saves the edit
    if (e.key === "Tab" && field === "unitPrice") {
      if (editName && editQuantity && editUnitPrice) {
        e.preventDefault()
        saveEdit()
      }
    }

    // Escape to cancel edit
    if (e.key === "Escape") {
      cancelEdit()
    }
  }

  // Get the most recent date from materials
  const getMostRecentDate = (): string => {
    if (materials.length === 0) return ""

    return materials.reduce((latest, material) => {
      return new Date(material.date) > new Date(latest) ? material.date : latest
    }, materials[0].date)
  }

  // Group materials by date
  const groupedMaterials = materials.reduce((groups: Record<string, Material[]>, material) => {
    if (!groups[material.date]) {
      groups[material.date] = []
    }
    groups[material.date].push(material)
    return groups
  }, {})

  // Sort dates for display
  const sortedDates = Object.keys(groupedMaterials).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

  // Calculate subtotals by date
  const subtotalsByDate = sortedDates.map((date) => {
    const subtotal = groupedMaterials[date].reduce(
      (total, material) => total + material.quantity * material.unitPrice,
      0,
    )
    return { date, subtotal }
  })

  // Calculate grand total
  const grandTotal = materials.reduce((total, material) => total + material.quantity * material.unitPrice, 0)

  // Calculate grand total quantity
  const grandTotalQuantity = materials.reduce((total, material) => total + material.quantity, 0)

  // Group materials by name for stock management
  const getMaterialGroups = (): MaterialGroup[] => {
    const groupMap = new Map<string, MaterialGroup>()

    materials.forEach((material) => {
      const itemTotal = material.quantity * material.unitPrice

      if (groupMap.has(material.name)) {
        const existingGroup = groupMap.get(material.name)!
        existingGroup.items.push(material)
        existingGroup.totalQuantity += material.quantity
        existingGroup.totalAmount += itemTotal
        // Recalculate average price
        existingGroup.averagePrice = existingGroup.totalAmount / existingGroup.totalQuantity
      } else {
        groupMap.set(material.name, {
          name: material.name,
          items: [material],
          totalQuantity: material.quantity,
          totalAmount: itemTotal,
          averagePrice: material.unitPrice,
        })
      }
    })

    return Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  // Get stock items (simplified version of material groups)
  const getStockItems = (): StockItem[] => {
    const materialGroups = getMaterialGroups()
    return materialGroups.map((group) => ({
      name: group.name,
      totalQuantity: group.totalQuantity,
      averagePrice: group.averagePrice,
      totalAmount: group.totalAmount,
    }))
  }

  // Calculate grand totals for stock report
  const getStockGrandTotals = () => {
    const materialGroups = getMaterialGroups()
    const totalQuantity = materialGroups.reduce((sum, group) => sum + group.totalQuantity, 0)
    const totalAmount = materialGroups.reduce((sum, group) => sum + group.totalAmount, 0)
    return { totalQuantity, totalAmount }
  }

  // Export to PDF - Professional layout
  const exportToPDF = () => {
    if (materials.length === 0) {
      toast.warning("No data to export")
      return
    }

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15

      // Draw header border/frame
      doc.setDrawColor(0, 51, 102)
      doc.setLineWidth(0.5)
      doc.rect(margin - 5, 8, pageWidth - 2 * (margin - 5), 45)

      // Company name - bold and centered
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(0, 51, 102)
      doc.text(getCompanyName(), pageWidth / 2, 18, { align: "center" })

      // Subtitle
      doc.setFontSize(12)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(80, 80, 80)
      doc.text("MATERIALS DELIVERY NOTE", pageWidth / 2, 26, { align: "center" })

      // Horizontal line under title
      doc.setDrawColor(0, 51, 102)
      doc.setLineWidth(0.3)
      doc.line(margin, 30, pageWidth - margin, 30)

      // Customer and report info - two columns
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.setFont("helvetica", "bold")
      doc.text("Customer:", margin, 38)
      doc.text("Date:", pageWidth / 2 + 10, 38)
      
      doc.setFont("helvetica", "normal")
      doc.text(customerName, margin + 22, 38)
      doc.text(formatDate(new Date().toISOString().split("T")[0]), pageWidth / 2 + 22, 38)

      if (reportNumber) {
        doc.setFont("helvetica", "bold")
        doc.text("Report No:", margin, 45)
        doc.setFont("helvetica", "normal")
        doc.text(reportNumber, margin + 25, 45)
      }

      // Define columns with proper widths
      const columns = [
        { header: "S.No", dataKey: "sno" },
        { header: "Date", dataKey: "date" },
        { header: "Material Name", dataKey: "name" },
        { header: "Qty", dataKey: "qty" },
        { header: "Unit Price", dataKey: "price" },
        { header: "Total", dataKey: "total" },
      ]

      // Prepare data with serial numbers
      const data = materials.map((material, index) => ({
        sno: (index + 1).toString(),
        date: formatDate(material.date),
        name: material.name,
        qty: material.quantity.toFixed(2),
        price: material.unitPrice.toFixed(2),
        total: (material.quantity * material.unitPrice).toFixed(2),
      }))

      // Add table
      autoTable(doc, {
        columns: columns,
        body: data,
        startY: 55,
        margin: { left: margin, right: margin },
        theme: "striped",
        styles: {
          cellPadding: 3,
          fontSize: 9,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          valign: "middle",
        },
        headStyles: {
          fillColor: [0, 51, 102],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 9,
        },
        bodyStyles: {
          textColor: [50, 50, 50],
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        columnStyles: {
          sno: { halign: "center", cellWidth: 12 },
          date: { halign: "center", cellWidth: 28 },
          name: { halign: "left", cellWidth: "auto" },
          qty: { halign: "right", cellWidth: 22 },
          price: { halign: "right", cellWidth: 28 },
          total: { halign: "right", cellWidth: 28 },
        },
        didDrawPage: (data) => {
          // Page number footer
          const pageCount = doc.getNumberOfPages()
          doc.setFontSize(8)
          doc.setTextColor(128, 128, 128)
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: "center" }
          )
        },
      })

      // Add grand total section after table
      const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5

      // Grand total box
      doc.setFillColor(0, 51, 102)
      doc.rect(pageWidth - margin - 70, finalY, 70, 12, "F")
      
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(255, 255, 255)
      doc.text("GRAND TOTAL:", pageWidth - margin - 65, finalY + 8)
      doc.text(`${grandTotal.toFixed(2)}`, pageWidth - margin - 5, finalY + 8, { align: "right" })

      // Total quantity
      doc.setTextColor(0, 0, 0)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.text(`Total Quantity: ${grandTotalQuantity.toFixed(2)}`, margin, finalY + 8)

      // Save the PDF
      doc.save(`${customerName}_Materials_Report_${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting to PDF:", error)
      toast.error("Failed to export to PDF. Please try again.")
    }
  }

  // Export stock report to PDF - Professional full-width layout
  const exportStockToPDF = () => {
    if (materials.length === 0) {
      toast.warning("No data to export")
      return
    }

    try {
      // Create PDF in portrait orientation with minimal margins for full-width layout
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
      })

      // Get material groups and grand totals
      const materialGroups = getMaterialGroups()
      const grandTotals = getStockGrandTotals()
      const pageHeight = doc.internal.pageSize.getHeight()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 5 // Minimal margin for full-width tables
      const tableWidth = pageWidth - (margin * 2)
      const usableHeight = pageHeight - 12 // Leave space for page numbers
      const colWidth = tableWidth / 2 - 2 // Width for two-column layout

      // Compact header
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text(getCompanyName(), pageWidth / 2, 8, { align: "center" })
      doc.setFontSize(10)
      doc.text("STOCK REPORT", pageWidth / 2, 13, { align: "center" })
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.text(`Customer: ${customerName}  |  Date: ${formatDate(new Date().toISOString().split("T")[0])}`, pageWidth / 2, 18, { align: "center" })

      let yPos = 22

      // Summary table - full width
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setFillColor(50, 50, 50)
      doc.rect(margin, yPos, tableWidth, 5, "F")
      doc.setTextColor(255, 255, 255)
      doc.text("SUMMARY", pageWidth / 2, yPos + 3.5, { align: "center" })
      doc.setTextColor(0, 0, 0)
      yPos += 6

      const summaryColumns = ["Material Name", "Qty", "Avg Price (SAR)", "Total (SAR)"]
      const summaryData = materialGroups.map((group) => [
        group.name,
        group.totalQuantity.toFixed(2),
        group.averagePrice.toFixed(2),
        group.totalAmount.toFixed(2),
      ])

      // Full-width summary table
      autoTable(doc, {
        head: [summaryColumns],
        body: summaryData,
        startY: yPos,
        theme: "grid",
        styles: {
          cellPadding: 1.5,
          fontSize: 7,
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [180, 180, 180],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: tableWidth * 0.4 },
          1: { cellWidth: tableWidth * 0.15, halign: "right" },
          2: { cellWidth: tableWidth * 0.22, halign: "right" },
          3: { cellWidth: tableWidth * 0.23, halign: "right" },
        },
        margin: { left: margin, right: margin },
        tableWidth: tableWidth,
      })

      yPos = doc.lastAutoTable.finalY + 4

      // Detailed breakdown header
      doc.setFillColor(50, 50, 50)
      doc.rect(margin, yPos, tableWidth, 5, "F")
      doc.setTextColor(255, 255, 255)
      doc.text("DETAILED BREAKDOWN", pageWidth / 2, yPos + 3.5, { align: "center" })
      doc.setTextColor(0, 0, 0)
      yPos += 7

      // Two-column layout for detailed breakdown
      let leftY = yPos
      let rightY = yPos
      let useLeftColumn = true

      materialGroups.forEach((group, groupIndex) => {
        const rowHeight = 4
        const estimatedTableHeight = (group.items.length + 3) * rowHeight + 6

        // Determine which column to use
        const currentY = useLeftColumn ? leftY : rightY
        const xOffset = useLeftColumn ? margin : margin + colWidth + 4

        // Check if we need a new page
        if (currentY + estimatedTableHeight > usableHeight) {
          if (useLeftColumn) {
            // Try right column first
            if (rightY + estimatedTableHeight <= usableHeight) {
              useLeftColumn = false
            } else {
              // Both columns full, new page
              doc.addPage()
              leftY = 10
              rightY = 10
              useLeftColumn = true
            }
          } else {
            // Right column full, check left
            if (leftY + estimatedTableHeight <= usableHeight) {
              useLeftColumn = true
            } else {
              // Both columns full, new page
              doc.addPage()
              leftY = 10
              rightY = 10
              useLeftColumn = true
            }
          }
        }

        const startY = useLeftColumn ? leftY : rightY
        const startX = useLeftColumn ? margin : margin + colWidth + 4

        // Material name header
        doc.setFontSize(7)
        doc.setFont("helvetica", "bold")
        doc.setFillColor(100, 100, 100)
        doc.rect(startX, startY, colWidth, 4, "F")
        doc.setTextColor(255, 255, 255)
        doc.text(group.name, startX + 2, startY + 2.8)
        doc.setTextColor(0, 0, 0)

        const columns = ["Date", "Qty", "Price", "Total"]
        const data = group.items.map((item) => [
          formatDate(item.date),
          item.quantity.toFixed(2),
          item.unitPrice.toFixed(2),
          (item.quantity * item.unitPrice).toFixed(2),
        ])

        const footData = [[
          "Subtotal",
          group.totalQuantity.toFixed(2),
          group.averagePrice.toFixed(2),
          group.totalAmount.toFixed(2),
        ]]

        autoTable(doc, {
          head: [columns],
          body: data,
          foot: footData,
          startY: startY + 4,
          theme: "grid",
          styles: {
            cellPadding: 1,
            fontSize: 6,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [200, 200, 200],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            cellPadding: 1.2,
          },
          footStyles: {
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
            fontStyle: "bold",
          },
          columnStyles: {
            0: { cellWidth: colWidth * 0.3 },
            1: { cellWidth: colWidth * 0.2, halign: "right" },
            2: { cellWidth: colWidth * 0.25, halign: "right" },
            3: { cellWidth: colWidth * 0.25, halign: "right" },
          },
          margin: { left: startX, right: pageWidth - startX - colWidth },
          tableWidth: colWidth,
          showFoot: "lastPage",
        })

        const finalY = doc.lastAutoTable.finalY + 3

        if (useLeftColumn) {
          leftY = finalY
          useLeftColumn = false
        } else {
          rightY = finalY
          useLeftColumn = true
        }
      })

      // Grand total at the end - full width
      yPos = Math.max(leftY, rightY) + 3
      if (yPos + 15 > usableHeight) {
        doc.addPage()
        yPos = 10
      }

      doc.setFillColor(50, 50, 50)
      doc.rect(margin, yPos, tableWidth, 5, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.text("GRAND TOTAL", pageWidth / 2, yPos + 3.5, { align: "center" })
      doc.setTextColor(0, 0, 0)
      yPos += 6

      autoTable(doc, {
        head: [["Description", "Total Quantity", "Total Amount (SAR)"]],
        body: [[
          "All Materials",
          grandTotals.totalQuantity.toFixed(2),
          grandTotals.totalAmount.toFixed(2),
        ]],
        startY: yPos,
        theme: "grid",
        styles: {
          cellPadding: 2,
          fontSize: 8,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          fontStyle: "bold",
        },
        headStyles: {
          fillColor: [80, 80, 80],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        bodyStyles: {
          fillColor: [220, 220, 220],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: tableWidth * 0.4 },
          1: { cellWidth: tableWidth * 0.3, halign: "right" },
          2: { cellWidth: tableWidth * 0.3, halign: "right" },
        },
        margin: { left: margin, right: margin },
        tableWidth: tableWidth,
      })

      // Add page numbers
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 3,
          { align: "center" }
        )
      }

      doc.save(`Stock_Report_${customerName}_${new Date().toISOString().split("T")[0]}.pdf`)
    } catch (error) {
      console.error("Error exporting stock to PDF:", error)
      toast.error("Failed to export stock to PDF. Please try again.")
    }
  }

  // Export to Excel
  const exportToExcel = async () => {
    if (materials.length === 0) {
      toast.warning("No data to export")
      return
    }

    try {
      // Dynamically import xlsx
      const xlsx = await import("xlsx")

      // Create a workbook
      const wb = xlsx.utils.book_new()

      // Prepare data for Excel with header information
      const excelData: (string | number)[][] = [
        ["Company:", getCompanyName(), "", "", ""],
        ["Customer:", customerName, "", "", ""],
        ["Date:", new Date().toLocaleDateString(), "", "", ""],
        ["Report No:", reportNumber || "N/A", "", "", ""],
        ["", "", "", "", ""], // Empty row for spacing
        ["Date", "Material Name", "Quantity", "Unit Price (﷼)", "Total Price (﷼)"],
      ]

      // Add material rows
      materials.forEach((material) => {
        excelData.push([
          formatDate(material.date),
          material.name,
          material.quantity,
          material.unitPrice,
          material.quantity * material.unitPrice,
        ])
      })

      // Add a grand total row
      excelData.push(["", "", "", "", ""])
      excelData.push(["", "GRAND TOTAL", grandTotalQuantity, "", grandTotal])

      // Create worksheet from the array of arrays
      const ws = xlsx.utils.aoa_to_sheet(excelData)

      // Add the materials sheet
      xlsx.utils.book_append_sheet(wb, ws, "Materials Report")

      // Generate Excel file as a binary string
      const excelBinary = xlsx.write(wb, { bookType: "xlsx", type: "binary" })

      // Convert binary string to ArrayBuffer
      const buffer = new ArrayBuffer(excelBinary.length)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < excelBinary.length; i++) {
        view[i] = excelBinary.charCodeAt(i) & 0xff
      }

      // Create Blob from ArrayBuffer
      const blob = new Blob([buffer], { type: "application/octet-stream" })

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${customerName}_Materials_Report_${new Date().toISOString().split("T")[0]}.xlsx`

      // Append to document, trigger click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Release the object URL
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting to Excel:", error)
      toast.error("Failed to export to Excel. Please try again.")
    }
  }

  // Export stock items to Excel
  const exportStockToExcel = async () => {
    if (materials.length === 0) {
      toast.warning("No data to export")
      return
    }

    try {
      // Dynamically import xlsx
      const xlsx = await import("xlsx")

      // Get material groups
      const materialGroups = getMaterialGroups()
      const grandTotals = getStockGrandTotals()

      // Create a workbook
      const wb = xlsx.utils.book_new()

      // Prepare header data for Excel
      const headerData = [
        [`STOCK REPORT - ${getCompanyName()}`],
        [`Customer: ${customerName}`],
        [`Date: ${formatDate(new Date().toISOString().split("T")[0])}`],
        [`Report No: ${reportNumber || "N/A"}`],
        [""],
      ]

      // Create worksheet
      const ws = xlsx.utils.aoa_to_sheet(headerData)

      // Current row index
      let rowIndex = headerData.length

      // First, add the summary section
      xlsx.utils.sheet_add_aoa(ws, [["SUMMARY"]], { origin: { r: rowIndex, c: 0 } })
      rowIndex += 1

      // Add column headers for summary
      xlsx.utils.sheet_add_aoa(ws, [["Material Name", "Total Quantity", "Average Price (﷼)", "Total Amount (﷼)"]], {
        origin: { r: rowIndex, c: 0 },
      })
      rowIndex += 1

      // Add each material group summary
      materialGroups.forEach((group) => {
        xlsx.utils.sheet_add_aoa(
          ws,
          [[group.name, group.totalQuantity, group.averagePrice.toFixed(2), group.totalAmount]],
          { origin: { r: rowIndex, c: 0 } },
        )
        rowIndex += 1
      })

      // Add grand total row
      xlsx.utils.sheet_add_aoa(ws, [["GRAND TOTAL", grandTotals.totalQuantity, "", grandTotals.totalAmount]], {
        origin: { r: rowIndex, c: 0 },
      })
      rowIndex += 2

      // Add detailed breakdown header
      xlsx.utils.sheet_add_aoa(ws, [["DETAILED BREAKDOWN"]], { origin: { r: rowIndex, c: 0 } })
      rowIndex += 2

      // Add each material group with detailed breakdown
      materialGroups.forEach((group) => {
        // Add material name as header
        xlsx.utils.sheet_add_aoa(ws, [[group.name]], { origin: { r: rowIndex, c: 0 } })
        rowIndex += 1

        // Add column headers for this section
        xlsx.utils.sheet_add_aoa(ws, [["Date", "Quantity", "Unit Price (﷼)", "Total Price (﷼)"]], {
          origin: { r: rowIndex, c: 0 },
        })
        rowIndex += 1

        // Add each item in the group
        group.items.forEach((item) => {
          xlsx.utils.sheet_add_aoa(
            ws,
            [[formatDate(item.date), item.quantity, item.unitPrice, item.quantity * item.unitPrice]],
            { origin: { r: rowIndex, c: 0 } },
          )
          rowIndex += 1
        })

        // Add group subtotal row
        xlsx.utils.sheet_add_aoa(
          ws,
          [["Subtotal", group.totalQuantity, group.averagePrice.toFixed(2), group.totalAmount]],
          { origin: { r: rowIndex, c: 0 } },
        )
        rowIndex += 2
      })

      // Set column widths
      ws["!cols"] = [
        { width: 20 }, // Material Name/Date
        { width: 12 }, // Quantity
        { width: 15 }, // Unit Price
        { width: 15 }, // Total Price
      ]

      // Add the stock items sheet
      xlsx.utils.book_append_sheet(wb, ws, "Stock Report")

      // Generate Excel file as a binary string
      const excelBinary = xlsx.write(wb, { bookType: "xlsx", type: "binary" })

      // Convert binary string to ArrayBuffer
      const buffer = new ArrayBuffer(excelBinary.length)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < excelBinary.length; i++) {
        view[i] = excelBinary.charCodeAt(i) & 0xff
      }

      // Create Blob from ArrayBuffer
      const blob = new Blob([buffer], { type: "application/octet-stream" })

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Stock_Report_${customerName}_${new Date().toISOString().split("T")[0]}.xlsx`

      // Append to document, trigger click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Release the object URL
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting stock to Excel:", error)
      toast.error("Failed to export stock to Excel. Please try again.")
    }
  }

  // Print function
  const handlePrint = () => {
    window.print()
  }

  // Print stock report
  const handlePrintStock = () => {
    setShowStockReport(true)
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        setShowStockReport(false)
      }, 500)
    }, 500)
  }

  // Reset the entire form to start over
  const handleReset = () => {
    if (
      confirm(
        "Are you sure you want to start over? This will clear all data from the current session but keep the saved data.",
      )
    ) {
      setCustomerName("")
      setIsCustomerSet(false)
      setMaterials([])
      setCurrentDate(new Date().toISOString().split("T")[0])
      setName("")
      setQuantity("")
      setUnitPrice("")
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  return (
    <main className="container mx-auto py-8 px-4">
      {isBranchSet && (
        <>
          <h1 className="text-3xl font-bold text-center mb-2 print:hidden">{getCompanyName()}</h1>
          <h2 className="text-xl text-center mb-8 print:hidden">Material Tracking System</h2>
        </>
      )}

      {/* Password Prompt Modal for Head Office */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-center">Head Office Access</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  Please enter the password to access Head Office:
                </p>
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  className="text-lg"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setShowPasswordPrompt(false)
                      setPasswordInput("")
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button onClick={verifyPassword} className="flex-1">
                    Verify
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isBranchSet ? (
        // Branch Selection Form
        <Card className="mb-8 max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">Select Branch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-center text-muted-foreground mb-4">
                Please select the branch you are working from:
              </p>
              <Button
                onClick={handleHeadOfficeSelect}
                className="w-full text-lg py-6 h-auto whitespace-normal"
                variant="outline"
              >
                <span className="flex items-center gap-2">
                  🔒 {BRANCH_OPTIONS.HEAD_OFFICE}
                </span>
              </Button>
              <Button
                onClick={() => handleBranchSelect("MCTI_TASLIYA")}
                className="w-full text-lg py-6 h-auto whitespace-normal"
                variant="outline"
              >
                {BRANCH_OPTIONS.MCTI_TASLIYA}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !isCustomerSet ? (
        // Customer Information Form
        <Card className="mb-8 max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCustomerSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  className="text-lg"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full text-lg py-6">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Customer Info Display */}
          <Card className="mb-8 print:hidden">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold">Customer: {customerName}</h2>
                  <p className="text-muted-foreground">Date: {formatDate(new Date().toISOString().split("T")[0])}</p>
                  {reportNumber && (
                    <p className="text-lg font-semibold text-primary">Report No: {reportNumber}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedReport ? (
                    <Button 
                      variant="default" 
                      onClick={updateReport} 
                      disabled={isSavingToSheets || materials.length === 0}
                    >
                      {isSavingToSheets ? "Updating..." : "Update Report"}
                    </Button>
                  ) : (
                    <Button 
                      variant="default" 
                      onClick={saveToGoogleSheets} 
                      disabled={isSavingToSheets || materials.length === 0}
                    >
                      {isSavingToSheets ? "Saving..." : "Save to Database"}
                    </Button>
                  )}
                  <Button 
                    variant="secondary" 
                    onClick={toggleSavedReports}
                  >
                    {showSavedReports ? "Hide Saved Reports" : "View Saved Reports"}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    handleReset()
                    setSelectedReport(null)
                  }}>
                    New Report
                  </Button>
                  <Button variant="destructive" onClick={clearSavedData}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear Local Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saved Reports View */}
          {showSavedReports && (
            <Card className="mb-8 print:hidden">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-t-lg">
                <CardTitle className="flex justify-between items-center">
                  <span className="text-xl font-bold">Saved Reports</span>
                  <Button variant="secondary" size="sm" onClick={fetchSavedReports} disabled={isLoadingReports}>
                    {isLoadingReports ? "Loading..." : "Refresh"}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingReports ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-muted-foreground">Loading reports...</span>
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">📋</div>
                    <p className="text-muted-foreground text-lg">No saved reports found</p>
                    <p className="text-sm text-muted-foreground mt-2">Save your first report to see it here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left font-semibold text-sm">Report No</th>
                          <th className="px-4 py-3 text-left font-semibold text-sm">Customer Name</th>
                          <th className="px-4 py-3 text-left font-semibold text-sm">Date Created</th>
                          <th className="px-4 py-3 text-right font-semibold text-sm">Total Qty</th>
                          <th className="px-4 py-3 text-right font-semibold text-sm">Total Amount</th>
                          <th className="px-4 py-3 text-center font-semibold text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedReports.map((report, index) => (
                          <tr 
                            key={report.rowIndex} 
                            className={`border-b hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                              selectedReport?.rowIndex === report.rowIndex ? 'bg-blue-100 dark:bg-blue-900/40' : ''
                            } ${index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                #{report.reportNumber}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">{report.customerName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{report.dateCreated}</td>
                            <td className="px-4 py-3 text-right font-medium">{report.totalQuantity.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400">
                              {report.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 justify-center">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => loadReport(report)}
                                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    loadReport(report)
                                    setTimeout(() => exportToPDF(), 500)
                                  }}
                                  className="text-green-600 border-green-600 hover:bg-green-50"
                                >
                                  PDF
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    loadReport(report)
                                    setTimeout(() => handlePrint(), 500)
                                  }}
                                  className="text-purple-600 border-purple-600 hover:bg-purple-50"
                                >
                                  Print
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => deleteReport(report.rowIndex)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Input Form */}
          <Card className="mb-8 print:hidden">
            <CardHeader>
              <CardTitle>Add New Material</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => handleMaterialSubmit(e)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="date">Date (Optional)</Label>
                    <Input
                      id="date"
                      type="date"
                      value={currentDate}
                      onChange={(e) => setCurrentDate(e.target.value)}
                      className="text-base"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-4 relative">
                    <Label htmlFor="name">Material Name</Label>
                    <Input
                      ref={nameInputRef}
                      id="name"
                      type="text"
                      value={name}
                      onChange={handleNameChange}
                      onKeyDown={(e) => handleNameKeyDown(e)}
                      onFocus={() => {
                        if (name && suggestions.length > 0) {
                          setShowSuggestions(true)
                        }
                      }}
                      placeholder="Type material name..."
                      className="text-base"
                      autoComplete="off"
                      required
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute z-10 w-full bg-background border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto"
                      >
                        {suggestions.map((suggestion, index) => (
                          <div
                            key={suggestion}
                            className={cn(
                              "px-3 py-2 cursor-pointer hover:bg-muted",
                              index === activeSuggestion && "bg-muted",
                            )}
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      ref={quantityInputRef}
                      id="quantity"
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "quantity")}
                      placeholder="Quantity"
                      min="0.01"
                      step="0.01"
                      className="text-base"
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="unitPrice">Unit Price (﷼)</Label>
                    <Input
                      ref={unitPriceInputRef}
                      id="unitPrice"
                      type="number"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "unitPrice")}
                      placeholder="Unit price"
                      min="0.01"
                      step="0.01"
                      className="text-base"
                      required
                    />
                  </div>

                  <div className="md:col-span-1">
                    <Button ref={addButtonRef} type="submit" className="w-full h-10">
                      <PlusCircle className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p>💡 Pro tips:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Tab</kbd> to auto-complete suggestion
                      and move to next field
                    </li>
                    <li>
                      Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Tab</kbd> in the Unit Price field to
                      add the item and start a new row
                    </li>
                    <li>Use arrow keys to navigate suggestions</li>
                  </ul>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Export Buttons */}
          <div className="flex flex-wrap justify-end gap-2 mb-4 print:hidden">
            <Button variant="outline" onClick={handlePrint} disabled={materials.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              Print Materials
            </Button>
            <Button variant="outline" onClick={handlePrintStock} disabled={materials.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              Print Stock Report
            </Button>
            <Button variant="outline" onClick={exportToPDF} disabled={materials.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              Export to PDF
            </Button>
            <Button variant="outline" onClick={exportStockToPDF} disabled={materials.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              Export Stock to PDF
            </Button>
            <Button variant="outline" onClick={exportToExcel} disabled={materials.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
            <Button variant="outline" onClick={exportStockToExcel} disabled={materials.length === 0}>
              <Package className="mr-2 h-4 w-4" />
              Export Stock to Excel
            </Button>
          </div>

          {/* Printable Content - Materials Report */}
          {!showStockReport ? (
            <div ref={contentRef} className="print:block">
              {/* Report Header for Print/PDF */}
              <div className="print:block hidden mb-8">
                                <h1 className="text-3xl font-bold text-center">{getCompanyName()}</h1>
                                <p className="text-center text-muted-foreground">
                                  Generated on: {formatDate(new Date().toISOString().split("T")[0])}
                                </p>
                                <p className="text-center font-medium mt-2">Customer: {customerName}</p>
              </div>

              {/* Materials Table */}
              <Card className="mb-8">
                <CardHeader className="print:py-2">
                  <CardTitle>Materials List</CardTitle>
                </CardHeader>
                <CardContent>
                  {materials.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No materials added yet</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
                            <th className="px-4 py-3 text-left font-semibold text-sm">Date</th>
                            <th className="px-4 py-3 text-left font-semibold text-sm">Material Name</th>
                            <th className="px-4 py-3 text-right font-semibold text-sm">Quantity</th>
                            <th className="px-4 py-3 text-right font-semibold text-sm">Unit Price (﷼)</th>
                            <th className="px-4 py-3 text-right font-semibold text-sm">Total Price (﷼)</th>
                            <th className="px-4 py-3 text-center font-semibold text-sm print:hidden">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDates.map((date, dateIndex) => (
                            <React.Fragment key={date}>
                              {groupedMaterials[date].map((material, index) => (
                                <tr key={material.id} className={`border-b border-gray-100 dark:border-gray-700 transition-colors ${index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-blue-50 dark:hover:bg-blue-900/20`}>
                                  {editingId === material.id ? (
                                    <>
                                      <td className="p-2">
                                        <Input
                                          id="edit-date"
                                          type="date"
                                          value={editDate}
                                          onChange={(e) => setEditDate(e.target.value)}
                                          className="text-sm"
                                          required
                                        />
                                      </td>
                                      <td className="p-2">
                                        <div className="relative">
                                          <Input
                                            ref={editNameInputRef}
                                            id="edit-name"
                                            type="text"
                                            value={editName}
                                            onChange={handleEditNameChange}
                                            onKeyDown={(e) => handleNameKeyDown(e, true)}
                                            onFocus={() => {
                                              if (editName && suggestions.length > 0) {
                                                setShowSuggestions(true)
                                              }
                                            }}
                                            className="text-sm"
                                            autoComplete="off"
                                            required
                                          />
                                          {showSuggestions && suggestions.length > 0 && (
                                            <div
                                              ref={suggestionsRef}
                                              className="absolute z-10 w-full bg-background border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto"
                                            >
                                              {suggestions.map((suggestion, index) => (
                                                <div
                                                  key={suggestion}
                                                  className={cn(
                                                    "px-3 py-2 cursor-pointer hover:bg-muted",
                                                    index === activeSuggestion && "bg-muted",
                                                  )}
                                                  onClick={() => handleSuggestionClick(suggestion, true)}
                                                >
                                                  {suggestion}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="p-2">
                                        <Input
                                          id="edit-quantity"
                                          type="number"
                                          value={editQuantity}
                                          onChange={(e) => setEditQuantity(e.target.value)}
                                          onKeyDown={(e) => handleEditKeyDown(e, "quantity")}
                                          className="text-sm text-right"
                                          min="0.01"
                                          step="0.01"
                                          required
                                        />
                                      </td>
                                      <td className="p-2">
                                        <Input
                                          id="edit-unitPrice"
                                          type="number"
                                          value={editUnitPrice}
                                          onChange={(e) => setEditUnitPrice(e.target.value)}
                                          onKeyDown={(e) => handleEditKeyDown(e, "unitPrice")}
                                          className="text-sm text-right"
                                          min="0.01"
                                          step="0.01"
                                          required
                                        />
                                      </td>
                                      <td className="p-2 text-right">
                                        {(Number(editQuantity) * Number(editUnitPrice)).toFixed(2)}
                                      </td>
                                      <td className="p-2 text-right print:hidden">
                                        <div className="flex justify-end gap-1">
                                          <Button variant="ghost" size="sm" onClick={saveEdit} className="h-8 w-8 p-0">
                                            <span className="sr-only">Save</span>
                                            <Check className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={cancelEdit}
                                            className="h-8 w-8 p-0"
                                          >
                                            <span className="sr-only">Cancel</span>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      {index === 0 ? (
                                        <td className="p-2 font-medium">{formatDate(material.date)}</td>
                                      ) : (
                                        <td className="p-2 font-medium">{formatDate(material.date)}</td>
                                      )}
                                      <td className="p-2">{material.name}</td>
                                      <td className="p-2 text-right">{material.quantity.toFixed(2)}</td>
                                      <td className="p-2 text-right">{material.unitPrice.toFixed(2)}</td>
                                      <td className="p-2 text-right">
                                        {(material.quantity * material.unitPrice).toFixed(2)}
                                      </td>
                                      <td className="p-2 text-right print:hidden">
                                        <div className="flex justify-end gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => startEditing(material)}
                                            className="h-8 w-8 p-0"
                                            title="Edit"
                                          >
                                            <span className="sr-only">Edit</span>
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => insertAfter(material.id)}
                                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                                            title="Insert row after"
                                          >
                                            <span className="sr-only">Insert After</span>
                                            <PlusCircle className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setMaterials(materials.filter((m) => m.id !== material.id))
                                            }}
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                            title="Delete"
                                          >
                                            <span className="sr-only">Delete</span>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                              {/* Subtotal for date group */}
                              <tr className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-t-2 border-blue-200 dark:border-blue-700">
                                <td colSpan={4} className="px-4 py-2 text-right font-semibold text-blue-800 dark:text-blue-200">
                                  Subtotal for {formatDate(date)}:
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-blue-800 dark:text-blue-200">
                                  ﷼ {subtotalsByDate[dateIndex].subtotal.toFixed(2)}
                                </td>
                                <td className="print:hidden"></td>
                              </tr>
                              {/* Gap after each date group */}
                              <tr className="h-2 bg-gray-100 dark:bg-gray-800">
                                <td colSpan={6}></td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
                            <td colSpan={2} className="px-4 py-3 text-right font-bold text-sm">
                              GRAND TOTAL:
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-sm">{grandTotalQuantity.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-bold text-sm"></td>
                            <td className="px-4 py-3 text-right font-bold text-sm">﷼ {grandTotal.toFixed(2)}</td>
                            <td className="print:hidden"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            // Stock Report View for Printing
            <div ref={stockReportRef} className="print:block">
              {/* Report Header for Print */}
              <div className="mb-8">
                                <h1 className="text-3xl font-bold text-center">{getCompanyName()}</h1>
                                <h2 className="text-xl text-center">Stock Report</h2>
                <p className="text-center text-muted-foreground">
                  Generated on: {formatDate(new Date().toISOString().split("T")[0])}
                </p>
                <p className="text-center font-medium mt-2">Customer: {customerName}</p>
              </div>

              {/* Stock Summary Table */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {materials.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No materials added yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse stock-report-table">
                        <thead>
                          <tr>
                            <th>Material Name</th>
                            <th>Total Quantity</th>
                            <th>Average Price (﷼)</th>
                            <th>Total Amount (﷼)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getMaterialGroups().map((group) => (
                            <tr key={group.name}>
                              <td>{group.name}</td>
                              <td className="text-right">{group.totalQuantity.toFixed(2)}</td>
                              <td className="text-right">{group.averagePrice.toFixed(2)}</td>
                              <td className="text-right">{group.totalAmount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="grand-total">
                            <td>Grand Total</td>
                            <td className="text-right">{getStockGrandTotals().totalQuantity.toFixed(2)}</td>
                            <td></td>
                            <td className="text-right">{getStockGrandTotals().totalAmount.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Breakdown */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Detailed Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {materials.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No materials added yet</p>
                  ) : (
                    <div className="detailed-breakdown-grid">
                      {getMaterialGroups().map((group) => (
                        <div key={group.name} className="material-group">
                          <h3 className="text-lg font-bold mb-1">{group.name}</h3>
                          <table className="w-full border-collapse stock-report-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Quantity</th>
                                <th>Unit Price (﷼)</th>
                                <th>Total Price (﷼)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item) => (
                                <tr key={item.id}>
                                  <td>{formatDate(item.date)}</td>
                                  <td className="text-right">{item.quantity.toFixed(2)}</td>
                                  <td className="text-right">{item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="group-total">
                                <td>Subtotal</td>
                                <td className="text-right">{group.totalQuantity.toFixed(2)}</td>
                                <td className="text-right">{group.averagePrice.toFixed(2)}</td>
                                <td className="text-right">{group.totalAmount.toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </main>
  )
}
