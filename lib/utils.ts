import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format date to display in a more readable format
export function formatDate(dateString: string): string {
  if (!dateString) return ""

  const date = new Date(dateString)

  // Check if date is valid
  if (isNaN(date.getTime())) return dateString

  // Format: Month name Day, Year (e.g., January 1, 2023)
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  }

  return date.toLocaleDateString("en-US", options)
}
