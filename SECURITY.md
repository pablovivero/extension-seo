# Security Policy

## Supported Versions

Security fixes are handled on the latest version in `main`.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report it privately to the maintainer through GitHub's private vulnerability reporting if it is enabled, or by contacting the repository owner directly. Include the affected version or commit, a short reproduction path, and the expected impact.

## Local Data Handling

This extension stores the local pairing token in `chrome.storage.local` on the user's machine. Captured SERP data is kept temporarily in `chrome.storage.session` and can be downloaded as JSON.

The extension does not include a remote backend, proxy, analytics service, or third-party scraping API.
