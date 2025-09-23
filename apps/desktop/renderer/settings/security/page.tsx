import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsSecurityPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with security section
    navigate("/settings?section=security", { replace: true })
  }, [navigate])

  return null
} 