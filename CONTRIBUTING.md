# Contributing

Thanks for helping improve supermemory-ui. This is an unofficial operator
console for Supermemory, with a bundled mock backend that should keep every
screen and mutation usable without external credentials.

## Before opening a change

1. Search existing issues and pull requests.
2. For a substantial feature or model change, open an issue first so the
   approach can be agreed before implementation.
3. Keep documents, memories, spaces, and profiles distinct. Preserve async
   ingestion, memory versioning, soft forget, and first-class relations.

## Local development

Use Node.js 22 and npm:

```bash
npm ci
npm run dev
```

Before submitting a pull request, run the same checks as CI:

```bash
npm run typecheck
npm test
npm run build
npm run build-storybook
```

Keep pull requests focused, describe the operator-facing behavior, and include
screenshots for visible UI changes. Never commit credentials, private corpus
content, or environment files.

By contributing, you agree that your contributions are licensed under the
repository's [MIT License](LICENSE) and that you will follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
