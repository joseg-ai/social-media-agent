# SKILL: Wiring Path Aliases in Next.js 15 + TypeScript + ESLint 9

## Context
Next.js 15 scaffolds with `@/*` → `./src/*` in `tsconfig.json`. This covers all subdirectory aliases
(`@/db/*`, `@/lib/*`, etc.) via the wildcard, but adding explicit aliases is better for discoverability.

## Pattern

### 1. tsconfig.json — add explicit paths alongside the wildcard

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/db/*": ["./src/db/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/server/*": ["./src/server/*"],
      "@/jobs/*": ["./src/jobs/*"],
      "@/agents/*": ["./src/agents/*"]
    }
  }
}
```

The `@/*` wildcard already resolves all subpaths — the explicit entries are documentation and
redundant for the compiler. However they signal intent clearly to humans and tools.

### 2. No ESLint plugin needed for path aliases in Next.js 15 + ESLint 9 (flat config)

`eslint-config-next` (included via `eslint-config-next/core-web-vitals`) already handles `@/` imports
correctly. No additional import-resolver plugin required.

### 3. ESLint ignores for non-application directories

ESLint flat config (`eslint.config.mjs`) lints everything by default. Exclude directories that aren't
application source:

```js
{
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".squad/**",      // squad agent templates — not app code
    "workspace/**",  // nested workspaces / build artifacts
  ],
}
```

### 4. .gitignore negation for .env.example

Next.js scaffold ignores `.env*`. Add a negation to track the example:

```gitignore
.env*
!.env.example
```

## Verified in
- Next.js 15.5.3, TypeScript 5, ESLint 9 flat config
- `npm run lint` ✓ `npm run build` ✓
- See PR #3 (WI-01 branch: `squad/1-wi-01-project-foundation`)
