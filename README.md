# PayLane — supplier data validation & invoice automation for Workday

An internal prototype concept: two working apps plus a landing page, framed as a Workday-native
capability with a roadmap to integrate with **Workday Financials** and **Workday HCM**.

## Easiest way to run (no npm, no build)

Just double-click these — they open in your browser and run directly:

- `paylane.html` — landing / overview page
- `data-assure.html` — supplier data validation & fraud-prevention app
- `invoice-ai.html` — touchless invoice-processing app

The two app HTML files load React and their libraries from a CDN and compile in the browser on
first load (a few seconds). Your browser trusts your corporate certificate, so these work even when
`npm` is blocked. If a screen never loads, your network may be blocking the CDN — use the Vite route
below instead.

## Full dev setup (Vite) — only if you want to edit/build

The `.jsx` files are the source (single-file React components, `export default function App()`).

```bash
npm create vite@latest paylane-demo -- --template react
cd paylane-demo            # IMPORTANT: the previous command made this subfolder
npm install
npm install lucide-react recharts
# copy data-assure.jsx (or invoice-ai.jsx) into src/ and import it in src/main.jsx:
#   import App from './data-assure.jsx'
npm run dev
```

### If npm fails with a certificate error (corporate proxy)

`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` means a TLS-inspecting proxy is intercepting HTTPS and Node
doesn't trust the corporate root CA. Fix it by pointing Node at your machine's trusted roots (macOS):

```bash
security find-certificate -a -p /Library/Keychains/System.keychain > ~/corp-ca.pem
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> ~/corp-ca.pem
export NODE_EXTRA_CA_CERTS=~/corp-ca.pem      # add to ~/.zshrc to persist
```

Then `npm create` / `npm install` and the Vite dev server all work. Quick-but-insecure alternative:
`npm config set strict-ssl false`, run your install, then `npm config set strict-ssl true` to re-enable.

## About the AI features

Each app has real Claude-powered features (Data Assure: Procurement Assistant + sanctions
adjudication; Invoice AI: field extraction + Invoice Assistant + exception suggestions). Inside
Claude they call Claude live; run standalone (the HTML files or Vite) they fall back to built-in
offline logic, so every screen still works — just not live AI. Never put an API key in the frontend
to "fix" this; that leaks the key and needs a small server proxy.

## What's real vs. simulated

Functional: validation logic, ABA routing + IBAN checksums (Data Assure), PO matching, tax and
invoice-math validation, duplicate detection, fuzzy name/sanctions matching, and the AI. Simulated:
writing back into Workday, the live government/banking/tax feeds, and the sanctions watchlist
(fictional sample entities).

*PayLane is an internal prototype concept, not a shipping product. Workday, Workday Financials, and
Workday HCM are trademarks of Workday, Inc.*
