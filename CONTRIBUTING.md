# Contributing to jsOFD

Thanks for your interest in contributing!

## Development setup

```sh
git clone <your-fork>
cd jsOFD
npm install
```

Toolchain: Node ≥ 18, TypeScript (strict), Vitest, tsup, ESLint + Prettier.

## Common tasks

```sh
npm run dev          # launch the interactive playground (Vite)
npm test             # run the full test suite
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run lint:fix     # ESLint --fix
npm run format       # Prettier
npm run build        # build dist/ (ESM + CJS + UMD + types)
```

## Pull requests

1. Create a feature branch (`git checkout -b feat/my-feature`).
2. Make your change with tests — aim to keep coverage of public APIs.
3. Ensure `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass.
4. Add a note to `CHANGELOG.md` under **Unreleased**.
5. Open the PR with a clear description and motivation.

## Code style

- TypeScript strict mode; no `any` in `src/` (tests may relax).
- English JSDoc for public APIs; keep comments about _why_, not _what_.
- Units: the internal model stores points (pt); serialisation converts to mm.
- OFD output must stay compliant with GB/T 33190-2016. When in doubt,
  cross-validate with an independent reader such as
  [ofdrw](https://github.com/ofdrw/ofdrw).

## Reporting bugs

Please include a minimal reproduction (code sample or PDF input) and the
generated `.ofd` when relevant.
