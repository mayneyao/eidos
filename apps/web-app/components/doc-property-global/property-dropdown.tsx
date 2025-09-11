import { useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"

import { PropertyIcon } from "./property-icon"
import { inferType } from "./utils"

interface PropertyDropdownProps {
  availableProperties: Record<string, any>
  systemProperties?: Record<string, any>
  onSelectProperty: (propertyName: string) => Promise<void>
  onCreateNew: (searchQuery?: string) => void
  onClose: () => void
}

export const PropertyDropdown: React.FC<PropertyDropdownProps> = ({
  availableProperties,
  systemProperties = {},
  onSelectProperty,
  onCreateNew,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectableProperties = useMemo(() => {
    return Object.entries(availableProperties)
  }, [availableProperties])

  const selectableSystemProperties = useMemo(() => {
    return Object.entries(systemProperties)
  }, [systemProperties])

  const filteredSelectableProperties = useMemo(() => {
    if (!searchQuery.trim()) {
      return selectableProperties
    }
    return selectableProperties.filter(
      ([propertyName, value]) =>
        propertyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [selectableProperties, searchQuery])

  const filteredSystemProperties = useMemo(() => {
    if (!searchQuery.trim()) {
      return selectableSystemProperties
    }
    return selectableSystemProperties.filter(
      ([propertyName, value]) =>
        propertyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [selectableSystemProperties, searchQuery])

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [filteredSelectableProperties, filteredSystemProperties])

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems =
      filteredSystemProperties.length + filteredSelectableProperties.length + 1 // +1 for "Create new property"

    if (e.key === "Escape") {
      onClose()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault()
      if (selectedIndex < filteredSystemProperties.length) {
        // Select system property
        const [propertyName] = filteredSystemProperties[selectedIndex]
        onSelectProperty(propertyName)
      } else if (
        selectedIndex <
        filteredSystemProperties.length + filteredSelectableProperties.length
      ) {
        // Select existing custom property
        const [propertyName] =
          filteredSelectableProperties[
            selectedIndex - filteredSystemProperties.length
          ]
        onSelectProperty(propertyName)
      } else {
        // Create new property
        onCreateNew(searchQuery.trim() || undefined)
      }
    }
  }

  return (
    <div ref={dropdownRef} className="absolute top-full left-0 mt-1 w-80 z-50">
      <div className="border border-border rounded bg-popover shadow-lg max-h-96 overflow-hidden">
        {/* Search Input */}
        <div className="p-2 border-b">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 text-sm border border-input rounded focus:outline-none focus:border-ring"
            placeholder="Search properties..."
          />
        </div>

        {/* Property List */}
        <div className="max-h-72 overflow-y-auto">
          {/* Custom Properties Section */}
          {filteredSelectableProperties.length > 0 ? (
            <>
              <div className="px-2 py-1 text-xs text-muted-foreground bg-muted border-b">
                Custom Properties
              </div>
              {filteredSelectableProperties.map(
                ([propertyName, value], index) => {
                  const propertyType = inferType(value, propertyName)
                  const isSelected =
                    selectedIndex === filteredSystemProperties.length + index
                  return (
                    <button
                      key={propertyName}
                      onClick={() => onSelectProperty(propertyName)}
                      className={`w-full px-2 py-1 text-sm text-left hover:bg-accent hover:border hover:border-border border border-transparent flex items-center gap-2 transition-colors ${
                        isSelected ? "bg-accent border-border" : ""
                      }`}
                    >
                      <span className="text-muted-foreground">
                        <PropertyIcon type={propertyType} />
                      </span>
                      <span className="text-foreground">{propertyName}</span>
                      <span className="text-xs text-muted-foreground ml-auto truncate">
                        {String(value).substring(0, 20)}
                        {String(value).length > 20 ? "..." : ""}
                      </span>
                    </button>
                  )
                }
              )}
              <div className="border-t" />
            </>
          ) : filteredSystemProperties.length === 0 &&
            selectableProperties.length > 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground bg-muted border-b">
              No properties match your search
            </div>
          ) : filteredSystemProperties.length === 0 &&
            selectableSystemProperties.length === 0 &&
            selectableProperties.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground bg-muted border-b">
              No existing properties found
            </div>
          ) : null}

          {/* System Properties Section */}
          {filteredSystemProperties.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs text-muted-foreground bg-muted border-b">
                System Properties (read-only)
              </div>
              {filteredSystemProperties.map(([propertyName, value], index) => {
                const propertyType = inferType(value, propertyName)
                const isSelected = selectedIndex === index
                return (
                  <button
                    key={propertyName}
                    onClick={() => onSelectProperty(propertyName)}
                    className={`w-full px-2 py-1 text-sm text-left hover:bg-accent hover:border hover:border-border border border-transparent flex items-center gap-2 transition-colors ${
                      isSelected ? "bg-accent border-border" : ""
                    }`}
                  >
                    <span className="text-muted-foreground">
                      <PropertyIcon type={propertyType} />
                    </span>
                    <span className="text-foreground">{propertyName}</span>
                    <span className="text-xs text-muted-foreground ml-auto truncate">
                      {String(value).substring(0, 24)}
                      {String(value).length > 24 ? "..." : ""}
                    </span>
                  </button>
                )
              })}
              {filteredSelectableProperties.length > 0 && (
                <div className="border-t" />
              )}
            </>
          )}

          {/* Create New Property Button */}
          <button
            onClick={() => onCreateNew(searchQuery.trim() || undefined)}
            className={`w-full px-2 py-1 text-sm text-left hover:bg-accent hover:border hover:border-border border border-transparent flex items-center gap-2 text-muted-foreground transition-colors ${
              selectedIndex ===
              filteredSystemProperties.length +
                filteredSelectableProperties.length
                ? "bg-accent border-border"
                : ""
            }`}
          >
            <Plus className="w-3 h-3" />
            Create new property
            {searchQuery.trim() && (
              <span className="text-xs bg-muted px-1 rounded">
                "{searchQuery.trim()}"
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
