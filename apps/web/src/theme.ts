export const theme = {
  color: {
    canvas: '#160d08',
    surface: 'rgba(49,28,17,.72)',
    surfaceRaised: 'rgba(79,42,20,.82)',
    text: '#fff5eb',
    muted: '#d9bda8',
    brand: '#ff7a18',
    brandStrong: '#ff9c4a',
    danger: '#ff625f',
    border: 'rgba(255,197,154,.24)',
  },
  space: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  radius: { sm: '0.5rem', lg: '1.25rem', pill: '999px' },
  shadow: { surface: '0 1rem 3rem rgba(0,0,0,.24)' },
  font: { body: 'Inter,ui-sans-serif,system-ui,sans-serif' },
  layout: { content: '72rem', blur: '1rem' },
} as const;
export function applyTheme() {
  for (const group of Object.values(theme))
    for (const [name, value] of Object.entries(group))
      document.documentElement.style.setProperty(`--asr-${name}`, value);
}
