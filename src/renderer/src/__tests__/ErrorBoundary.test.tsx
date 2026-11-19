import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'

// Component that throws on demand
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }): ReactElement {
  if (shouldThrow) {
    throw new Error('Test crash in child component')
  }
  return <div>Normal Content</div>
}

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Normal Content')).toBeDefined()
  })

  it('catches render errors and renders default fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.queryByText('Normal Content')).toBeNull()
    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText(/Test crash in child component/)).toBeDefined()
    expect(screen.getByRole('button', { name: /report error/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /copy issue report/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /report on github/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /open logs folder/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reload focus/i })).toBeNull()
  })

  it('renders custom fallback title when provided', () => {
    render(
      <ErrorBoundary fallbackTitle="Custom System Fault">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom System Fault')).toBeDefined()
  })
})
