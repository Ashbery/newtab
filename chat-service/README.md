# Ashbery Newtab local chat

This Windows helper connects the character's in-page conversation to the official **Sign in with ChatGPT** token-sharing API. The website never receives OAuth tokens. It does not embed chatgpt.com or access existing ChatGPT / Dot conversations or memories.

## Install and use

Requires Node.js 22.12 or newer and an eligible ChatGPT account. Run `powershell -NoProfile -ExecutionPolicy Bypass -File chat-service/install.ps1` from a checkout. The installer creates a user-local runtime under `%LOCALAPPDATA%\AshberyNewtabChat\runtime`, installs locked dependencies without lifecycle scripts, starts it hidden, and adds a per-user Startup shortcut. It does not require administrator rights. `uninstall.ps1` stops only this helper and removes its startup shortcut while retaining files and encrypted account data.

Click the character on the newtab page, allow browser access to this computer if prompted, then choose **使用 ChatGPT 登入**. Complete the OpenAI authorization in the browser. The panel updates automatically and all subsequent conversations happen inside the newtab. Plan eligibility, models, and usage are determined by OpenAI and the user's account. Disconnect in the panel to revoke the helper's authorization and remove local credentials.

The Brave newtab wrapper must delegate `loopback-network` (and `local-network-access` for older Chromium versions) to its GitHub Pages iframe. The browser may still require the user to grant access. No browser security flag is disabled by this application.

## Data and boundaries

- Listener: `127.0.0.1:43127`, loopback only. Exact Host and Origin checks plus a required non-simple header protect all routes. Only `https://ashbery.github.io` is allowed in production. A single explicit `NEWTAB_DEV_ORIGIN=http://127.0.0.1:<port>` may be added for development.
- OAuth uses the official SDK's PKCE, state, nonce, signed ID-token validation, refresh and revocation. Credentials are protected with Windows DPAPI CurrentUser under `%LOCALAPPDATA%\AshberyNewtabChat\account`; no plaintext fallback, website storage, credential logging, or committed account files.
- Conversation history is bounded and kept in the current tab's session storage. Only submitted user/assistant messages are sent to the selected OpenAI model. No tools, filesystem, browsing, or account-history access is provided. Responses use `store:false` and streaming; incomplete streams are errors, not successful replies.
- The helper has one active response at a time. Closing/stopping the panel cancels it; abandoned requests time out. Failed or stopped assistant responses are excluded from later model context.
- Origin checks trust all content at the GitHub Pages origin; unrelated applications must not be hosted there without considering that shared trust boundary. The OS account and website must remain trusted.

## Dependencies and provenance

The vendored `@siwc/local` 0.1.0 package was built from OpenAI's [sign-in-with-chatgpt-devkit](https://github.com/openai/sign-in-with-chatgpt-devkit), commit `0a36fefeb913055c8c7a1a29b63d82b96b2e841a`. Its **OpenAI Noncommercial License 1.0**, source maps, and third-party notices are retained inside `vendor/siwc-local-0.1.0.tgz`. This SDK is subject to its own license; this integration is intended for personal noncommercial use. The package lock pins runtime dependencies, including an override to undici 7.30.1.

Official protocol: [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source). Tests use explicitly injected fake clients; they never log into an account or spend real model usage. Run `npm test` inside this directory. A real account authorization and a real response must be checked separately before claiming end-to-end inference validation.
