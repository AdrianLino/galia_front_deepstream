# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Dev server at http://localhost:4200/
npm run build      # Production build
npm run watch      # Watch mode (development config)
npm test           # Unit tests via Vitest
```

There is no lint script configured.

## Architecture

Angular 21 application using **standalone components** (no NgModules), **signals** for reactive state, and **Vitest** for testing.

### Key Patterns

- **Standalone components**: All components declare their own `imports` array in the decorator — no shared modules.
- **Signals**: Use `signal()` for component state (e.g., `title = signal('...')`).
- **Dependency injection**: Use `inject()` function, not constructor injection.
- **Routing**: Routes defined in `src/app/app.routes.ts`. Secondary routes use lazy loading via dynamic `import().then()`. Navigation is done via `inject(Router).navigate([...])`.
- **Styling**: Tailwind CSS loaded globally in `src/styles.css`, with PostCSS processing.
- **Formatting**: Prettier with 100-char line width and single quotes (`.prettierrc`).
- **TypeScript**: Strict mode enabled including `strictTemplates` and `strictInjectionParameters`.

### Structure

```
src/app/
├── pages/          # One directory per page/feature
│   └── service/    # Shared services
├── app.ts          # Root component
├── app.routes.ts   # Route definitions
├── app.config.ts   # App-level providers (router, etc.)
└── app.html        # Root template (contains <router-outlet>)
```

Each page component lives in its own directory with co-located `.html`, `.css`, and `.spec.ts` files. Component selectors use the `app-` prefix.
