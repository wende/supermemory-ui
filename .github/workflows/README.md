# CI workflow

`ci.yml` typechecks, tests, and builds both the app and Storybook on every push
and pull request. It does not deploy — **Vercel's Git integration** handles that.

The Storybook step is not decorative: stories import the real components, so a
component that breaks fails this build even when no route uses it yet.

## How deploys work

The Vercel project is connected directly to this repository, so Vercel builds
and deploys on its own:

- push to `main` → **production**
- open a pull request → **preview**, with the URL posted to the PR by Vercel

No tokens or repository secrets are involved. To manage the connection, use
Project → Settings → Git in the Vercel dashboard, or `vercel git connect` /
`vercel git disconnect` locally.

Because Vercel deploys independently of this workflow, a failing typecheck or
build here does **not** block a deploy. To make it block, mark **Typecheck &
build** as a required status check in Settings → Branches → branch protection.

## Deploying by hand

```bash
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

## Environment variables

The app runs against its bundled mock backend with no configuration, which is
what makes the deployed site self-contained.

To point a deployment at a real supermemory instance instead, set these
**server-only** variables in Vercel (Project → Settings → Environment
Variables). Route handlers proxy to the remote so the key never reaches the
browser — do **not** use `NEXT_PUBLIC_*` names:

- `SUPERMEMORY_URL`
- `SUPERMEMORY_KEY`

Note that a Vercel deployment cannot reach a server on your own `localhost`, so
this only makes sense for an instance that is reachable from the internet.
