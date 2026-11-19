import { FocusAPI } from '../shared/api'

declare global {
  interface Window {
    api: FocusAPI
  }
}
