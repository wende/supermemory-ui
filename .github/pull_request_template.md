## Summary

Describe the operator-facing change and why it is needed.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run build-storybook`
- [ ] I tested the bundled mock without `.env.local`.
- [ ] I included screenshots for visible UI changes, or this change has no visible UI.

## Memory semantics

- [ ] This change preserves the distinction between documents, memories,
      spaces, and profiles.
- [ ] This change preserves versioned revisions, soft forget, relations, and
      asynchronous ingestion where relevant.

## Security and privacy

- [ ] No credentials, private URLs, or real personal/corpus data are included.
