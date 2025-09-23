import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function SettingsSyncPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the unified settings page with sync section
    navigate("/settings?section=sync", { replace: true })
  }, [navigate])

  return null
}
