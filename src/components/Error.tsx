// error popup component when error occurs
import { useEffect, useState } from 'react'

export const Error = ({ error, onclose,}: { error: string, onclose: () => void}) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [onclose])

  if (!isVisible) {
    return null
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-red-500 text-white p-4 rounded-md shadow-lg">
        <p>{error}</p>
      </div>
    </div>
  )
}
