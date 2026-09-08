# Contributing

Thanks for considering a contribution.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Load the generated `dist` directory in Chrome through `chrome://extensions` with Developer mode enabled.

## Pull Requests

- Keep changes focused and explain the user-facing behavior they affect.
- Add or update tests for parsing, validation, local API behavior, and browser messaging changes.
- Do not commit build output, local captures, credentials, private pairing tokens, or machine-specific files.
- Avoid changes that bypass consent screens, CAPTCHA, rate limits, or other anti-abuse controls.

## Project Scope

The project captures visible organic Google results from a real browser page controlled by the user. It intentionally avoids scraping destination pages, bypassing protections, or using hidden scraping services.
