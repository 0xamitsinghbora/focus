import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../components/ui/button'

describe('Button Component', () => {
  it('renders button with children', () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole('button', { name: /click me/i })
    expect(btn).toBeDefined()
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Submit</Button>)
    const btn = screen.getByRole('button', { name: /submit/i })
    fireEvent.click(btn)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is set', () => {
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Disabled Action
      </Button>
    )
    const btn = screen.getByRole('button', { name: /disabled action/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders destructive variant with destructive classes', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('bg-destructive')
  })

  it('renders outline variant with outline classes', () => {
    const { container } = render(<Button variant="outline">Cancel</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('border')
  })
})
