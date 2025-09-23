import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsAIPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with AI section
    navigate("/settings?section=ai", { replace: true })
  }, [navigate])

  return null
}
