This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Testing

Run unit and snapshot tests with vitest:

```bash
# CI / single-run (exits with 0 on pass)
npm test

# Watch mode during development
npm run test:watch
```

### E2E integration tests (`tests/e2e/`)

The `full-pipeline.test.ts` test drives the complete feed-poll → score → draft → schedule → publish pipeline against a **real Postgres database** with the LLM and LinkedIn API mocked at their network boundaries.

**Requirements:**

- A running Postgres instance accessible via `DATABASE_URL`
- The test automatically creates a clean schema and runs all migrations before the suite

**Run the E2E tests:**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sma_test npm test
```

**Skip behaviour:** If `DATABASE_URL` is not set the E2E suite is skipped with a clear console message and `npm test` exits 0. Unit/snapshot tests are unaffected.

> **Note:** The E2E suite takes longer than unit tests (~5–15 seconds depending on your Postgres setup). It runs sequentially (not `concurrent`) to avoid schema-state conflicts between test cases.

Smoke tests (require DB + LLM env vars) are separate scripts under `src/lib/*/`.  
See each file's header comment for usage instructions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
