import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsAppearancePage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with general section (appearance is now part of general)
    navigate("/settings?section=general", { replace: true })
  }, [navigate])

  return null
}
