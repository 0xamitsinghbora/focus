import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FocusLogo } from '../components/FocusLogo'

describe('FocusLogo Component', () => {
  it('renders SVG icon with default tile variant and size', () => {
    const { container } = render(<FocusLogo size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0)
  })

  it('renders glyph variant without background rect', () => {
    const { container } = render(<FocusLogo variant="glyph" size={48} />)
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(0)
  })

  it('displays brand wordmark when showWordmark is true', () => {
    render(<FocusLogo showWordmark={true} />)
    expect(screen.getByText('Focus')).toBeDefined()
  })

  it('does not display brand wordmark by default', () => {
    render(<FocusLogo />)
    expect(screen.queryByText('Focus')).toBeNull()
  })
})
