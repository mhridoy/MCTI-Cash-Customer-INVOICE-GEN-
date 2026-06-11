"use client"

import React, { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { PlusCircle, FileDown, Printer, X, FileSpreadsheet, Package, Pencil, Check, Trash2, FileText, RefreshCw, Calendar, User, Hash, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { materialsList } from "@/lib/materials-list"
import { cn } from "@/lib/utils"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// jspdf-autotable attaches lastAutoTable to the jsPDF instance at runtime
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: { finalY: number }
  }
}

// Generate a collision-safe unique ID (Date.now() alone can collide on fast entry)
const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// Strip characters that are invalid in file names (e.g. "/" in a customer name)
const sanitizeFilename = (value: string): string =>
  value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Report"

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
  const [showSummaryTable, setShowSummaryTable] = useState(false)

  // Report number state
  const [reportNumber, setReportNumber] = useState<string | null>(null)
  const [isSavingToSheets, setIsSavingToSheets] = useState(false)

  // Password protection for Head Office (verified server-side via /api/auth)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false)

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
  
  // New state for showing saved reports before customer entry
  const [hasViewedReports, setHasViewedReports] = useState(false)

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
          setHasViewedReports(true)
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
    if (!selectedBranch || !customerName || materials.length === 0) {
      toast.error("Please ensure all data is filled before saving")
      return
    }

    setIsSavingToSheets(true)
    try {
      // If we never got a report number (e.g. the earlier fetch failed), get one now
      let numberToUse = reportNumber
      if (!numberToUse) {
        const numberResponse = await fetch(`/api/sheets?branch=${selectedBranch}`)
        const numberData = await numberResponse.json()
        if (numberData.success && numberData.reportNumber) {
          numberToUse = numberData.reportNumber
          setReportNumber(numberData.reportNumber)
        } else {
          toast.error("Could not get a report number from the server")
          return
        }
      }

      const response = await fetch("/api/sheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          materials,
          branch: selectedBranch,
          reportNumber: numberToUse,
        }),
      })

      const data = await response.json()
      if (data.success) {
        // The server may assign a different number if ours was already taken
        if (data.reportNumber && data.reportNumber !== reportNumber) {
          setReportNumber(data.reportNumber)
        }
        toast.success(`Saved ${data.rowsAdded} items to Google Sheets (Report #${data.reportNumber || reportNumber})`)
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
    setHasViewedReports(true)
    setIsCustomerSet(true)
    toast.success(`Loaded Report #${report.reportNumber}`)
  }

  const updateReport = async () => {
    if (!selectedBranch || !selectedReport) return
    setIsSavingToSheets(true)
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
    } finally {
      setIsSavingToSheets(false)
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

  const verifyPassword = async () => {
    if (!passwordInput || isVerifyingPassword) return
    setIsVerifyingPassword(true)
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      })
      const data = await response.json()
      if (data.success) {
        setShowPasswordPrompt(false)
        setPasswordInput("")
        setSelectedBranch("HEAD_OFFICE")
        setIsBranchSet(true)
        toast.success("Access granted to Head Office")
        fetchSavedReportsForBranch("HEAD_OFFICE")
      } else {
        toast.error(data.error || "Incorrect password")
        setPasswordInput("")
      }
    } catch (error) {
      console.error("Error verifying password:", error)
      toast.error("Could not verify password. Please try again.")
    } finally {
      setIsVerifyingPassword(false)
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
      setHasViewedReports(false)
      setMaterials([])
      setCurrentDate(new Date().toISOString().split("T")[0])
      setName("")
      setQuantity("")
      setUnitPrice("")
      setSuggestions([])
      setShowSuggestions(false)
      setReportNumber(null)
      setSelectedReport(null)
      setSavedReports([])
    }
  }

  // Handle branch selection
  const handleBranchSelect = (branch: BranchType) => {
    setSelectedBranch(branch)
    setIsBranchSet(true)
    // Automatically fetch saved reports when branch is selected
    setTimeout(() => {
      fetchSavedReportsForBranch(branch)
    }, 100)
  }
  
  // Fetch saved reports for a specific branch (used after branch selection)
  const fetchSavedReportsForBranch = async (branch: BranchType) => {
    setIsLoadingReports(true)
    try {
      const response = await fetch(`/api/sheets?branch=${branch}&action=getReports`)
      const data = await response.json()
      if (data.success) {
        setSavedReports(data.reports)
      }
    } catch (error) {
      console.error("Error fetching saved reports:", error)
    } finally {
      setIsLoadingReports(false)
    }
  }
  
  // Handle creating a new report (skip to customer name entry)
  const handleCreateNewReport = async () => {
    setHasViewedReports(true)
    // Fetch report number for new report
    if (!reportNumber) {
      await fetchReportNumber()
    }
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

    const parsedQuantity = Number.parseFloat(quantity)
    const parsedUnitPrice = Number.parseFloat(unitPrice)
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0 || Number.isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
      toast.error("Please enter a valid quantity and unit price")
      return
    }

    // Use the provided date or the most recent date
    const dateToUse = currentDate || getMostRecentDate() || new Date().toISOString().split("T")[0]

    const newMaterial: Material = {
      id: newId(),
      date: dateToUse,
      name,
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
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

    const parsedQuantity = Number.parseFloat(editQuantity)
    const parsedUnitPrice = Number.parseFloat(editUnitPrice)
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0 || Number.isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
      toast.error("Please enter a valid quantity and unit price")
      return
    }

    const updatedMaterials = materials.map((material) => {
      if (material.id === editingId) {
        return {
          ...material,
          date: editDate,
          name: editName,
          quantity: parsedQuantity,
          unitPrice: parsedUnitPrice,
        }
      }
      return material
    })

    setMaterials(updatedMaterials)
    cancelEdit()
  }

  // Cancel editing (also removes never-filled rows created via "Insert row after")
  const cancelEdit = () => {
    setMaterials((prev) => prev.filter((m) => m.name.trim() !== ""))
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
      id: newId(),
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

    return Array.from(groupMap.values()) /* Input sequence - no ABC sort */
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

  // Update unit price for all materials with the same name (from editable summary)
  const updateUnitPriceForMaterial = (materialName: string, newUnitPrice: number) => {
    const price = Number.parseFloat(newUnitPrice.toString())
    if (Number.isNaN(price) || price < 0) return
    const count = materials.filter((m) => m.name === materialName).length
    setMaterials((prev) =>
      prev.map((m) => (m.name === materialName ? { ...m, unitPrice: price } : m))
    )
    toast.success(`Updated unit price for all ${count} "${materialName}" item(s)`)
  }

  // Export to PDF - Professional layout with dynamic font sizing
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

      // Dynamic font sizing based on number of items
      const itemCount = materials.length
      let tableFontSize: number
      let headerFontSize: number
      let cellPadding: number
      
      if (itemCount <= 10) {
        tableFontSize = 11
        headerFontSize = 11
        cellPadding = 4
      } else if (itemCount <= 20) {
        tableFontSize = 10
        headerFontSize = 10
        cellPadding = 3.5
      } else if (itemCount <= 35) {
        tableFontSize = 9
        headerFontSize = 9
        cellPadding = 3
      } else {
        tableFontSize = 8
        headerFontSize = 8
        cellPadding = 2.5
      }

      // Draw header border/frame
      doc.setDrawColor(82, 82, 91)
      doc.setLineWidth(0.5)
      doc.rect(margin - 5, 8, pageWidth - 2 * (margin - 5), 45)

      // Company name - bold and centered
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(82, 82, 91)
      doc.text(getCompanyName(), pageWidth / 2, 18, { align: "center" })

      // Subtitle
      doc.setFontSize(14)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(80, 80, 80)
      doc.text("MATERIALS DELIVERY NOTE", pageWidth / 2, 26, { align: "center" })

      // Horizontal line under title
      doc.setDrawColor(82, 82, 91)
      doc.setLineWidth(0.3)
      doc.line(margin, 30, pageWidth - margin, 30)

      // Customer and report info - two columns, larger font
      doc.setFontSize(13)
      doc.setTextColor(0, 0, 0)
      doc.setFont("helvetica", "bold")
      doc.text("Customer:", margin, 38)
      doc.text("Date:", pageWidth / 2 + 10, 38)
      
      doc.setFont("helvetica", "bold")
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

      // Add grand total row as footer data
      const footerData = [
        {
          sno: "",
          date: "",
          name: "GRAND TOTAL",
          qty: grandTotalQuantity.toFixed(2),
          price: "",
          total: grandTotal.toFixed(2),
        },
      ]

      // Add table with footer included to prevent page break issues
      autoTable(doc, {
        columns: columns,
        body: data,
        foot: footerData,
        startY: 55,
        margin: { left: margin, right: margin },
        theme: "striped",
        styles: {
          cellPadding: cellPadding,
          fontSize: tableFontSize,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          valign: "middle",
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          fontSize: headerFontSize,
        },
        bodyStyles: {
          textColor: [50, 50, 50],
        },
        footStyles: {
          fillColor: [63, 63, 70],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: headerFontSize,
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
        showFoot: "lastPage",
      })

      // Page number footers (added after the table so the total count is correct)
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(128, 128, 128)
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: "center" })
      }

      // Save the PDF
      doc.save(`${sanitizeFilename(customerName)}_Materials_Report_${new Date().toISOString().split("T")[0]}.pdf`)
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
      const margin = 15 // Professional margins
      const tableWidth = pageWidth - (margin * 2)
      const colWidth = (tableWidth - 8) / 2 // Two columns with gap
      const usableHeight = pageHeight - 20 // Leave space for page numbers and footer

      // Header - larger professional font
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.text(getCompanyName(), pageWidth / 2, 8, { align: "center" })
      doc.setFontSize(12)
      doc.text("STOCK REPORT", pageWidth / 2, 14, { align: "center" })
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text(`Customer: ${customerName}  |  Date: ${formatDate(new Date().toISOString().split("T")[0])}`, pageWidth / 2, 20, { align: "center" })

      let yPos = 24

      // Summary table - full width, no dark bg (ink saving)
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(0, 0, 0)
      doc.text("SUMMARY", pageWidth / 2, yPos + 4, { align: "center" })
      doc.setDrawColor(50, 50, 50)
      doc.setLineWidth(0.3)
      doc.line(margin, yPos + 5, margin + tableWidth, yPos + 5)
      yPos += 8

      // Dynamic sizing for summary - larger font, fit on page 1
      const summaryRowCount = materialGroups.length + 2 // + header + footer
      const summaryFontSize = summaryRowCount > 20 ? 10 : summaryRowCount > 12 ? 11 : 12
      const summaryCellPadding = summaryRowCount > 20 ? 2 : 2.5

      const summaryColumns = ["S.No", "Material Name", "Qty", "Avg Price (SAR)", "Total (SAR)"]
      const summaryData = materialGroups.map((group, index) => [
        (index + 1).toString(),
        group.name,
        group.totalQuantity.toFixed(2),
        group.averagePrice.toFixed(2),
        group.totalAmount.toFixed(2),
      ])

      // Grand total footer for summary table
      const summaryFooter = [
        ["", "GRAND TOTAL", grandTotals.totalQuantity.toFixed(2), "", grandTotals.totalAmount.toFixed(2)],
      ]

      // Full-width summary table with grand total footer - PAGE 1 ONLY, no splitting
      autoTable(doc, {
        head: [summaryColumns],
        body: summaryData,
        foot: summaryFooter,
        startY: yPos,
        theme: "grid",
        pageBreak: "avoid", // Keep summary on one page
        rowPageBreak: "avoid",
        styles: {
          cellPadding: summaryCellPadding,
          fontSize: summaryFontSize,
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          cellPadding: summaryCellPadding,
          fontSize: summaryFontSize,
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          cellPadding: summaryCellPadding,
          fontSize: summaryFontSize,
        },
        columnStyles: {
          0: { cellWidth: tableWidth * 0.08, halign: "center" },
          1: { cellWidth: tableWidth * 0.35 },
          2: { cellWidth: tableWidth * 0.15, halign: "right" },
          3: { cellWidth: tableWidth * 0.20, halign: "right" },
          4: { cellWidth: tableWidth * 0.22, halign: "right" },
        },
        margin: { left: margin, right: margin },
        tableWidth: tableWidth,
        showFoot: "lastPage",
      })

      // Force new page - Detailed breakdown always starts on page 2
      doc.addPage()

      yPos = 15

      // Detailed breakdown header - professional style
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(0, 0, 0)
      doc.text("DETAILED BREAKDOWN", pageWidth / 2, yPos, { align: "center" })
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.line(margin, yPos + 2, margin + tableWidth, yPos + 2)
      yPos += 12

      // Two-column layout - alternate left→right→left→right
      let leftY = yPos
      let rightY = yPos

      const detailFontSize = 9
      const detailCellPadding = 2
      const rowHeight = 5

      materialGroups.forEach((group, groupIndex) => {
        const tableRows = group.items.length + 2
        const estimatedHeight = tableRows * rowHeight + 18

        const preferLeft = groupIndex % 2 === 0 // Alternate: 0-left, 1-right, 2-left, 3-right...
        const leftSpace = usableHeight - leftY
        const rightSpace = usableHeight - rightY

        let startY: number
        let startX: number
        let usedLeft: boolean

        if (preferLeft && leftSpace >= estimatedHeight) {
          startY = leftY
          startX = margin
          usedLeft = true
        } else if (!preferLeft && rightSpace >= estimatedHeight) {
          startY = rightY
          startX = margin + colWidth + 8
          usedLeft = false
        } else if (leftSpace >= estimatedHeight) {
          startY = leftY
          startX = margin
          usedLeft = true
        } else if (rightSpace >= estimatedHeight) {
          startY = rightY
          startX = margin + colWidth + 8
          usedLeft = false
        } else {
          doc.addPage()
          leftY = 15
          rightY = 15
          startY = leftY
          startX = margin
          usedLeft = true
        }

        // Material group title
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text(`${groupIndex + 1}. ${group.name}`, startX + 2, startY + 2.5)
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.3)
        doc.line(startX, startY + 5, startX + colWidth, startY + 5)

        const columns = ["No", "Date", "Qty", "Price", "Total"]
        const data = group.items.map((item, itemIndex) => [
          (itemIndex + 1).toString(),
          formatDate(item.date),
          item.quantity.toFixed(2),
          item.unitPrice.toFixed(2),
          (item.quantity * item.unitPrice).toFixed(2),
        ])

        const footData = [[
          "",
          "Subtotal",
          group.totalQuantity.toFixed(2),
          group.averagePrice.toFixed(2),
          group.totalAmount.toFixed(2),
        ]]

        autoTable(doc, {
          head: [columns],
          body: data,
          foot: footData,
          startY: startY + 8,
          theme: "grid",
          pageBreak: "avoid",
          rowPageBreak: "avoid",
          styles: {
            cellPadding: detailCellPadding,
            fontSize: detailFontSize,
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.15,
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: detailFontSize,
            cellPadding: detailCellPadding,
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontSize: detailFontSize,
            cellPadding: detailCellPadding,
          },
          footStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: detailFontSize,
            cellPadding: detailCellPadding,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: colWidth * 0.12, halign: "center" },
            1: { cellWidth: colWidth * 0.28, halign: "left" },
            2: { cellWidth: colWidth * 0.18, halign: "right" },
            3: { cellWidth: colWidth * 0.20, halign: "right" },
            4: { cellWidth: colWidth * 0.22, halign: "right" },
          },
          margin: { left: startX, right: pageWidth - startX - colWidth },
          tableWidth: colWidth,
          showFoot: "lastPage",
        })

        const finalY = doc.lastAutoTable.finalY + 6

        if (usedLeft) {
          leftY = finalY
        } else {
          rightY = finalY
        }
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

      doc.save(`Stock_Report_${sanitizeFilename(customerName)}_${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success("Stock PDF exported successfully")
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
      link.download = `${sanitizeFilename(customerName)}_Materials_Report_${new Date().toISOString().split("T")[0]}.xlsx`

      // Append to document, trigger click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Release the object URL
      URL.revokeObjectURL(url)
      toast.success("Excel file exported successfully")
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
      link.download = `Stock_Report_${sanitizeFilename(customerName)}_${new Date().toISOString().split("T")[0]}.xlsx`

      // Append to document, trigger click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Release the object URL
      URL.revokeObjectURL(url)
      toast.success("Stock Excel file exported successfully")
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
      setHasViewedReports(false)
      setMaterials([])
      setCurrentDate(new Date().toISOString().split("T")[0])
      setName("")
      setQuantity("")
      setUnitPrice("")
      setSuggestions([])
      setShowSuggestions(false)
      setReportNumber(null)
      setSelectedReport(null)
      // Refresh saved reports list
      if (selectedBranch) {
        fetchSavedReportsForBranch(selectedBranch)
      }
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
                  <Button onClick={verifyPassword} disabled={isVerifyingPassword} className="flex-1">
                    {isVerifyingPassword ? "Verifying..." : "Verify"}
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
      ) : !hasViewedReports ? (
        // Saved Reports View - Show before customer name entry
        <Card className="mb-8 max-w-5xl mx-auto overflow-hidden shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white px-6 py-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold tracking-tight">Saved Invoices</CardTitle>
                  <p className="text-slate-300 text-sm mt-0.5">{selectedBranch && BRANCH_OPTIONS[selectedBranch]}</p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => selectedBranch && fetchSavedReportsForBranch(selectedBranch)} 
                  disabled={isLoadingReports}
                  className="bg-white/10 hover:bg-white/20 text-white border-0"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-1.5", isLoadingReports && "animate-spin")} />
                  {isLoadingReports ? "Loading..." : "Refresh"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setIsBranchSet(false)
                    setSelectedBranch(null)
                    setSavedReports([])
                  }}
                  className="bg-white/5 text-white border-white/30 hover:bg-white/15"
                >
                  Change Branch
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingReports ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin"></div>
                </div>
                <span className="mt-4 text-slate-500 font-medium">Loading invoices...</span>
                <p className="text-sm text-slate-400 mt-1">Please wait</p>
              </div>
            ) : savedReports.length === 0 ? (
              <div className="text-center py-16 px-6">
                <div className="inline-flex p-4 bg-slate-100 rounded-full mb-6">
                  <FileText className="h-12 w-12 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">No saved invoices yet</h3>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto">Create your first invoice to get started. Your invoices will appear here for easy access.</p>
                <Button onClick={handleCreateNewReport} size="lg" className="text-base px-8 py-6 h-auto font-medium shadow-md">
                  <PlusCircle className="mr-2 h-5 w-5" />
                  Create New Invoice
                </Button>
              </div>
            ) : (
              <>
                <div className="p-5 bg-slate-50/80 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                        {savedReports.length} invoice{savedReports.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <Button onClick={handleCreateNewReport} size="lg" className="font-medium shadow-sm">
                      <PlusCircle className="mr-2 h-5 w-5" />
                      Create New Invoice
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><Hash className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Report No</th>
                        <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><User className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Customer</th>
                        <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><Calendar className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Date</th>
                        <th className="px-5 py-3.5 text-right font-semibold text-sm tracking-wide">Qty</th>
                        <th className="px-5 py-3.5 text-right font-semibold text-sm tracking-wide">Amount (SAR)</th>
                        <th className="px-5 py-3.5 text-center font-semibold text-sm tracking-wide w-36">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedReports.map((report, index) => (
                        <tr 
                          key={report.rowIndex} 
                          className={cn(
                            "border-b border-slate-100 transition-all duration-150 hover:bg-slate-50",
                            index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          )}
                        >
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center font-mono font-semibold text-slate-800 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-sm">
                              #{report.reportNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-slate-800">{report.customerName}</span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-sm">{report.dateCreated}</td>
                          <td className="px-5 py-3.5 text-right font-medium text-slate-700 tabular-nums">{report.totalQuantity.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right font-semibold text-emerald-700 tabular-nums">
                            ﷼ {report.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-1.5 justify-center">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => loadReport(report)}
                                className="h-8 px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                                title="Edit invoice"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => deleteReport(report.rowIndex)}
                                className="h-8 px-2.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                title="Delete invoice"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setHasViewedReports(false)}
                >
                  Back to Reports
                </Button>
                <Button type="submit" className="flex-1 text-lg py-6">
                  Continue
                </Button>
              </div>
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
                  <h2 className="text-2xl font-bold text-black">Customer: {customerName}</h2>
                  <p className="text-lg font-medium text-black">Date: {formatDate(new Date().toISOString().split("T")[0])}</p>
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
                    {showSavedReports ? "Hide Saved Invoices" : "View Saved Invoices"}
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
            <Card className="mb-8 print:hidden overflow-hidden shadow-lg border-slate-200">
              <CardHeader className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white px-6 py-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold tracking-tight">Saved Invoices</CardTitle>
                      <p className="text-slate-300 text-sm mt-0.5">Select an invoice to edit, export, or print</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={fetchSavedReports} disabled={isLoadingReports} className="bg-white/10 hover:bg-white/20 text-white border-0">
                    <RefreshCw className={cn("h-4 w-4 mr-1.5", isLoadingReports && "animate-spin")} />
                    {isLoadingReports ? "Loading..." : "Refresh"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingReports ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-12 w-12 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin"></div>
                    <span className="mt-4 text-slate-500 font-medium">Loading invoices...</span>
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-16 px-6">
                    <div className="inline-flex p-4 bg-slate-100 rounded-full mb-4">
                      <FileText className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">No saved invoices</h3>
                    <p className="text-slate-500 text-sm">Save your current report to see it here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><Hash className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Report No</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><User className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Customer</th>
                          <th className="px-5 py-3.5 text-left font-semibold text-sm tracking-wide"><Calendar className="h-3.5 w-3.5 inline mr-1 opacity-80" /> Date</th>
                          <th className="px-5 py-3.5 text-right font-semibold text-sm tracking-wide">Qty</th>
                          <th className="px-5 py-3.5 text-right font-semibold text-sm tracking-wide">Amount (SAR)</th>
                          <th className="px-5 py-3.5 text-center font-semibold text-sm tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedReports.map((report, index) => (
                          <tr 
                            key={report.rowIndex} 
                            className={cn(
                              "border-b border-slate-100 transition-all duration-150",
                              selectedReport?.rowIndex === report.rowIndex
                                ? "bg-blue-50 border-l-4 border-l-blue-500"
                                : cn("hover:bg-slate-50", index % 2 === 0 ? "bg-white" : "bg-slate-50/50")
                            )}
                          >
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center font-mono font-semibold text-slate-800 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-sm">
                                #{report.reportNumber}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-medium text-slate-800">{report.customerName}</span>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600 text-sm">{report.dateCreated}</td>
                            <td className="px-5 py-3.5 text-right font-medium text-slate-700 tabular-nums">{report.totalQuantity.toLocaleString()}</td>
                            <td className="px-5 py-3.5 text-right font-semibold text-emerald-700 tabular-nums">
                              ﷼ {report.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1.5 justify-center">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => loadReport(report)}
                                  className="h-8 px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    loadReport(report)
                                    setTimeout(() => exportToPDF(), 500)
                                  }}
                                  className="h-8 px-2.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  title="Download PDF"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    loadReport(report)
                                    setTimeout(() => handlePrint(), 500)
                                  }}
                                  className="h-8 px-2.5 text-violet-600 border-violet-200 hover:bg-violet-50"
                                  title="Print"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => deleteReport(report.rowIndex)}
                                  className="h-8 px-2.5 text-red-600 border-red-200 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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

          {/* Summary Table Button */}
          <div className="flex flex-wrap justify-end gap-2 mb-4 print:hidden">
            <Button
              variant={showSummaryTable ? "default" : "outline"}
              onClick={() => setShowSummaryTable(!showSummaryTable)}
              disabled={materials.length === 0}
              title="একই material এর সব item এর unit price একসাথে পরিবর্তন করুন"
            >
              <Table2 className="mr-2 h-4 w-4" />
              {showSummaryTable ? "Summary Table (Hide)" : "Summary Table"}
            </Button>
          </div>

          {/* Editable Summary Table */}
          {showSummaryTable && materials.length > 0 && (
            <Card className="mb-8 print:hidden overflow-hidden shadow-md border border-slate-200 bg-white">
              <CardHeader className="bg-white border-b border-slate-200 py-4 px-6">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <Table2 className="h-5 w-5 text-slate-700" />
                  Editable Summary Table
                </CardTitle>
                <p className="text-slate-600 text-sm mt-1">
                  Unit Price এ পরিবর্তন করলে ঐ material এর সব item এর price আপডেট হবে
                </p>
              </CardHeader>
              <CardContent className="p-0 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse bg-white">
                    <thead>
                      <tr className="bg-white border-b-2 border-slate-300">
                        <th className="px-5 py-3.5 text-left font-bold text-base text-black">Material Name</th>
                        <th className="px-5 py-3.5 text-center font-bold text-base text-black">Count</th>
                        <th className="px-5 py-3.5 text-right font-bold text-base text-black">Total Quantity</th>
                        <th className="px-5 py-3.5 text-right font-bold text-base text-black">Unit Price (﷼) - Editable</th>
                        <th className="px-5 py-3.5 text-right font-bold text-base text-black">Total Amount (﷼)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {getMaterialGroups().map((group) => (
                        <tr
                          key={`${group.name}-${group.averagePrice}`}
                          className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors bg-white"
                        >
                          <td className="px-5 py-3 font-medium text-black">{group.name}</td>
                          <td className="px-5 py-3 text-center tabular-nums text-black">
                            {group.items.length}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium text-black">
                            {group.totalQuantity.toFixed(2)}
                          </td>
                          <td className="px-5 py-3">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={group.averagePrice.toFixed(2)}
                              key={`${group.name}-${group.averagePrice}`}
                              className="text-right w-28 ml-auto block tabular-nums font-medium text-slate-800 border-emerald-200 focus:border-emerald-500"
                              onBlur={(e) => {
                                const val = e.target.value
                                const num = Number.parseFloat(val)
                                if (!Number.isNaN(num) && num >= 0) {
                                  updateUnitPriceForMaterial(group.name, num)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const input = e.target as HTMLInputElement
                                  const val = input.value
                                  const num = Number.parseFloat(val)
                                  if (!Number.isNaN(num) && num >= 0) {
                                    updateUnitPriceForMaterial(group.name, num)
                                  }
                                  input.blur()
                                }
                              }}
                            />
                          </td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums text-black">
                            {group.totalAmount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-white">
                      <tr className="bg-white border-t-2 border-slate-300">
                        <td className="px-5 py-4 font-bold text-black" colSpan={2}>
                          Grand Total
                        </td>
                        <td className="px-5 py-4 text-right font-bold tabular-nums text-black">
                          {getStockGrandTotals().totalQuantity.toFixed(2)}
                        </td>
                        <td className="px-5 py-4"></td>
                        <td className="px-5 py-4 text-right font-bold tabular-nums text-slate-800">
                          ﷼ {grandTotal.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

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
            <div ref={contentRef} className="print:block materials-print-view">
              {/* Report Header for Print/PDF */}
              <div className="print:block hidden mb-8 materials-print-header">
                                <h1 className="text-3xl font-bold text-center text-black">{getCompanyName()}</h1>
                                <p className="text-center text-lg font-medium text-black">
                                  Generated on: {formatDate(new Date().toISOString().split("T")[0])}
                                </p>
                                <p className="text-center text-xl font-bold mt-2 text-black">Customer: {customerName}</p>
              </div>

              {/* Materials Table - white bg for ink saving */}
              <Card className="mb-8 overflow-hidden shadow-md border border-slate-200 bg-white">
                <CardHeader className="bg-white border-b-2 border-slate-300 py-4 px-6">
                  <CardTitle className="text-lg font-bold text-slate-800">Materials List</CardTitle>
                </CardHeader>
                <CardContent className="p-0 bg-white">
                  {materials.length === 0 ? (
                    <p className="text-center text-slate-500 py-12">No materials added yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse materials-table materials-print-table bg-white">
                        <thead>
                          <tr className="bg-white border-b-2 border-slate-300">
                            <th className="px-5 py-3.5 text-center font-bold text-base w-14 text-black">S.No</th>
                            <th className="px-5 py-3.5 text-left font-bold text-base text-black">Date</th>
                            <th className="px-5 py-3.5 text-left font-bold text-base text-black">Material Name</th>
                            <th className="px-5 py-3.5 text-right font-bold text-base text-black">Quantity</th>
                            <th className="px-5 py-3.5 text-right font-bold text-base text-black">Unit Price (﷼)</th>
                            <th className="px-5 py-3.5 text-right font-bold text-base text-black">Total Price (﷼)</th>
                            <th className="px-5 py-3.5 text-center font-bold text-base print:hidden w-28 text-black">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDates.map((date, dateIndex) => (
                            <React.Fragment key={date}>
                              {groupedMaterials[date].map((material, index) => {
                                const serialNo = sortedDates.slice(0, dateIndex).reduce((sum, d) => sum + groupedMaterials[d].length, 0) + index + 1
                                return (
                                  <tr key={material.id} className={cn(
                                  "border-b border-slate-200 transition-colors hover:bg-slate-50/50",
                                  "bg-white"
                                )}>
                                  {editingId === material.id ? (
                                    <>
                                      <td className="px-5 py-3 text-center tabular-nums font-medium text-black">{serialNo}</td>
                                      <td className="px-5 py-3">
                                        <Input
                                          id="edit-date"
                                          type="date"
                                          value={editDate}
                                          onChange={(e) => setEditDate(e.target.value)}
                                          className="text-sm"
                                          required
                                        />
                                      </td>
                                      <td className="px-5 py-3">
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
                                      <td className="px-5 py-3">
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
                                      <td className="px-5 py-3">
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
                                      <td className="px-5 py-3 text-right tabular-nums">
                                        {(Number(editQuantity) * Number(editUnitPrice)).toFixed(2)}
                                      </td>
                                      <td className="px-5 py-3 text-right print:hidden">
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
                                      <td className="px-5 py-3 text-center tabular-nums font-medium text-black">{serialNo}</td>
                                      <td className="px-5 py-3 font-medium text-black">{formatDate(material.date)}</td>
                                      <td className="px-5 py-3 text-black">{material.name}</td>
                                      <td className="px-5 py-3 text-right tabular-nums text-black">{material.quantity.toFixed(2)}</td>
                                      <td className="px-5 py-3 text-right tabular-nums text-black">{material.unitPrice.toFixed(2)}</td>
                                      <td className="px-5 py-3 text-right font-medium tabular-nums text-black">
                                        {(material.quantity * material.unitPrice).toFixed(2)}
                                      </td>
                                      <td className="px-5 py-3 text-right print:hidden">
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
                                )
                              })}
                              {/* Subtotal for date group */}
                              <tr className="subtotal-row bg-white border-t-2 border-slate-300">
                                <td colSpan={5} className="px-5 py-3 text-right font-semibold text-black text-sm">
                                  Subtotal for {formatDate(date)}:
                                </td>
                                <td className="px-5 py-3 text-right font-semibold text-black text-sm tabular-nums">
                                  ﷼ {subtotalsByDate[dateIndex].subtotal.toFixed(2)}
                                </td>
                                <td className="print:hidden"></td>
                              </tr>
                              {/* Gap after each date group */}
                              <tr className="h-1 bg-white">
                                <td colSpan={7}></td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot className="bg-white">
                          <tr className="bg-white border-t-2 border-slate-300">
                            <td colSpan={3} className="px-5 py-4 text-right font-bold text-base text-black">
                              GRAND TOTAL:
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-base tabular-nums text-black">{grandTotalQuantity.toFixed(2)}</td>
                            <td className="px-5 py-4 text-right font-bold text-base"></td>
                            <td className="px-5 py-4 text-right font-bold text-base tabular-nums text-black">﷼ {grandTotal.toFixed(2)}</td>
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
            <div ref={stockReportRef} className="print:block stock-report-print">
              {/* Page 1: Report Header + Summary */}
              <div className="stock-report-page-1">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-center text-black">{getCompanyName()}</h1>
                  <h2 className="text-xl text-center text-black">Stock Report</h2>
                  <p className="text-center text-lg font-medium text-black">
                    Generated on: {formatDate(new Date().toISOString().split("T")[0])}
                  </p>
                  <p className="text-center text-xl font-bold mt-2 text-black">Customer: {customerName}</p>
                </div>

                {/* Stock Summary Table - Page 1 only, larger font - white bg for printer ink saving */}
                <Card className="mb-8 stock-summary-section overflow-hidden shadow-md border border-slate-200 bg-white">
                <CardHeader className="bg-white border-b border-slate-300 py-4 px-6">
                  <CardTitle className="text-xl font-bold text-slate-800">Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0 bg-white">
                  {materials.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No materials added yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse stock-summary-table bg-white">
                        <thead>
                          <tr className="bg-white border-b-2 border-slate-300">
                            <th className="px-6 py-4 text-left font-bold text-base text-black">Material Name</th>
                            <th className="px-6 py-4 text-right font-bold text-base text-black">Total Quantity</th>
                            <th className="px-6 py-4 text-right font-bold text-base text-black">Average Price (﷼)</th>
                            <th className="px-6 py-4 text-right font-bold text-base text-black">Total Amount (﷼)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {getMaterialGroups().map((group) => (
                            <tr key={group.name} className="border-b border-slate-200 bg-white">
                              <td className="px-6 py-4 text-base font-medium text-black">{group.name}</td>
                              <td className="px-6 py-4 text-right text-base tabular-nums text-black">{group.totalQuantity.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right text-base tabular-nums text-black">{group.averagePrice.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right text-base font-semibold tabular-nums text-black">{group.totalAmount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-white">
                          <tr className="grand-total bg-white border-t-2 border-slate-300">
                            <td className="px-6 py-4 text-lg font-bold text-black">Grand Total</td>
                            <td className="px-6 py-4 text-right text-lg font-bold tabular-nums text-black">{getStockGrandTotals().totalQuantity.toFixed(2)}</td>
                            <td className="px-6 py-4"></td>
                            <td className="px-6 py-4 text-right text-lg font-bold tabular-nums text-black">{getStockGrandTotals().totalAmount.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>

              {/* Page 2+: Detailed Breakdown */}
              <div className="stock-report-page-2">
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
                          <h3 className="text-lg font-bold mb-2 text-black">{group.name}</h3>
                          <table className="w-full border-collapse stock-report-table breakdown-table">
                            <thead>
                              <tr>
                                <th className="font-bold text-base text-black">Date</th>
                                <th className="font-bold text-base text-black">Quantity</th>
                                <th className="font-bold text-base text-black">Unit Price (﷼)</th>
                                <th className="font-bold text-base text-black">Total Price (﷼)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="text-black">{formatDate(item.date)}</td>
                                  <td className="text-right text-black">{item.quantity.toFixed(2)}</td>
                                  <td className="text-right text-black">{item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right text-black">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="group-total">
                                <td className="font-bold text-black">Subtotal</td>
                                <td className="text-right font-bold text-black">{group.totalQuantity.toFixed(2)}</td>
                                <td className="text-right font-bold text-black">{group.averagePrice.toFixed(2)}</td>
                                <td className="text-right font-bold text-black">{group.totalAmount.toFixed(2)}</td>
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
            </div>
          )}
        </>
      )}
    </main>
  )
}
