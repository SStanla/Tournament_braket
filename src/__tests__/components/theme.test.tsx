import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import App from '../../App';

// Read the theme stylesheet source so we can assert that the required
// interactive-state rules exist. jsdom does not apply real CSS, so we verify
// class-name wiring + the CSS source text rather than computed colors.
// Resolve from the vitest working directory (project root).
const themeCss = readFileSync(
  path.resolve(process.cwd(), 'src/theme.css'),
  'utf-8'
);

// ---------------------------------------------------------------------------
// WCAG contrast helpers (pure math implemented here for the test — Req 8.6)
// ---------------------------------------------------------------------------

/** Parse a #rrggbb hex string into [r, g, b] in the 0..255 range. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/** sRGB channel -> linearized value per WCAG relative-luminance definition. */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an #rrggbb color. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG contrast ratio between two colors (>= 1, symmetric). */
function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Token values mirrored from src/theme.css (:root custom properties).
// Kept in sync manually; if theme.css changes these, this test must too.
// ---------------------------------------------------------------------------

const TOKENS = {
  white: '#ffffff',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue900: '#1e3a8a',
  text: '#1f2937',
  textOnPrimary: '#ffffff',
  error: '#b91c1c',
};

// Pairs relied on for NORMAL-size text — must be >= 4.5:1 (Req 8.6).
const NORMAL_TEXT_PAIRS: Array<{ name: string; fg: string; bg: string }> = [
  { name: 'body text on surface', fg: TOKENS.text, bg: TOKENS.white },
  { name: 'heading text on surface', fg: TOKENS.blue900, bg: TOKENS.white },
  { name: 'primary button text on blue-700', fg: TOKENS.textOnPrimary, bg: TOKENS.blue700 },
  { name: 'error text on surface', fg: TOKENS.error, bg: TOKENS.white },
  { name: 'secondary button text on surface', fg: TOKENS.blue900, bg: TOKENS.white },
];

// Pairs relied on ONLY for LARGE text / accents — must be >= 3:1 (Req 8.6).
const LARGE_TEXT_PAIRS: Array<{ name: string; fg: string; bg: string }> = [
  { name: 'accent blue-600 on surface (large/accent only)', fg: TOKENS.blue600, bg: TOKENS.white },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UI theme — contrast (Req 8.6)', () => {
  it('contrast math matches known WCAG reference values', () => {
    // Black on white is exactly 21:1.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    // White on white is 1:1.
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Contrast is symmetric.
    expect(contrastRatio('#1d4ed8', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1d4ed8'),
      5
    );
  });

  it('all normal-text token pairs meet WCAG AA (>= 4.5:1)', () => {
    for (const pair of NORMAL_TEXT_PAIRS) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.name} (${pair.fg} on ${pair.bg}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('all large-text/accent token pairs meet WCAG AA (>= 3:1)', () => {
    for (const pair of LARGE_TEXT_PAIRS) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.name} (${pair.fg} on ${pair.bg}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('UI theme — interactive states (Req 8.3, 8.4, 8.5)', () => {
  it('defines a hover state, a focus-visible state, and a fast transition for buttons', () => {
    expect(themeCss).toMatch(/\.btn:hover\s*\{/);
    expect(themeCss).toMatch(/\.btn:focus-visible\s*\{/);
    // Fast transition under 200ms (8.4).
    expect(themeCss).toMatch(/--transition-fast:\s*120ms/);
    expect(themeCss).toMatch(/\.btn\s*\{[\s\S]*transition:/);
  });

  it('declares :focus-visible AFTER :hover so focus wins on coincidence (Req 8.5)', () => {
    const hoverIdx = themeCss.indexOf('.btn:hover');
    const focusIdx = themeCss.indexOf('.btn:focus-visible');
    expect(hoverIdx).toBeGreaterThan(-1);
    expect(focusIdx).toBeGreaterThan(-1);
    expect(focusIdx).toBeGreaterThan(hoverIdx);
  });

  it('defines a visible focus ring token', () => {
    expect(themeCss).toMatch(/--focus-ring:/);
    expect(themeCss).toMatch(/\.btn:focus-visible\s*\{[\s\S]*box-shadow:\s*var\(--focus-ring\)/);
  });
});

describe('UI theme — palette wiring (Req 8.1)', () => {
  it('primary action button carries the shared button class', () => {
    render(<App />);
    // On the initial screen the "Create Tournament" button is the primary action.
    const createBtn = screen.getByRole('button', { name: /create tournament/i });
    expect(createBtn).toHaveClass('btn');
  });

  it('theme defines the blue + white palette tokens', () => {
    expect(themeCss).toMatch(/--color-white:\s*#ffffff/i);
    expect(themeCss).toMatch(/--color-blue-700:\s*#1d4ed8/i);
    expect(themeCss).toMatch(/--color-blue-900:\s*#1e3a8a/i);
  });
});
