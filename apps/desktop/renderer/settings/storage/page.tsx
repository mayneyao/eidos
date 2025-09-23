import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsStoragePage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with storage section
    navigate("/settings?section=storage", { replace: true })
  }, [navigate])

  return null
}
