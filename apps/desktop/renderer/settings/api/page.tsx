import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsApiPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with API section
    navigate("/settings?section=api", { replace: true })
  }, [navigate])

  return null
}
