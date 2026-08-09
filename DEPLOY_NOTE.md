# Deploy note

Production was failing with:

```
src/App.tsx: TS2322 Property 'onSuggestion' does not exist on type EmptyState Props
```

Fixed on main by removing the obsolete `onSuggestion` prop from `<EmptyState />` (chips removed).

Build verified locally: `tsc -b && vite build` succeeds.
