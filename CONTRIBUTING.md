# Contributing

Thanks for your interest in MAW.

## Setup

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

Run `npm run typecheck` before opening a pull request.

## Guidelines

- Keep business rules in `packages/domain` and `packages/policy-engine`. HTTP handlers and React components stay thin.
- Keep provider SDK and HTTP usage inside `packages/payment-adapters`.
- Return structured `MawError` values rather than throwing plain errors from services.
- Every state-changing operation must write an audit event.
- Never commit secrets, private keys, `.env` files or provider response captures.
- Use conventional commit messages such as `feat:`, `fix:`, `docs:` and `chore:`.

## Security issues

Report vulnerabilities privately as described in [docs/security.md](docs/security.md).
