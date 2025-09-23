import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsGeneralPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with general section
    navigate("/settings?section=general", { replace: true })
  }, [navigate])

  return null
}
