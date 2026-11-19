import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  title?: string
  message: string
  type: ToastType
  duration?: number
  action?: ToastAction
}

interface ToastContextType {
  toast: {
    show: (
      message: string,
      options?: { title?: string; type?: ToastType; duration?: number; action?: ToastAction }
    ) => void
    success: (message: string, title?: string, action?: ToastAction) => void
    error: (message: string, title?: string) => void
    info: (message: string, title?: string) => void
  }
}

export const ToastContext = createContext<ToastContextType | null>(null)

export function useToast(): ToastContextType['toast'] {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context.toast
}
