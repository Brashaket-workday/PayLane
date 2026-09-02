# Attavo — supplier data validation & invoice automation for Workday

An internal prototype concept: two working apps plus a landing page, framed as a Workday-native
capability with a roadmap to integrate with **Workday Financials** and **Workday HCM**.

## Easiest way to run — fully offline, no npm, no CDN

Just double-click these. They open in your browser and run with **zero network access** — React and
all libraries are compiled and bundled directly into the file:

- `index.html` — landing / overview page
- `data-assure.html` — supplier data validation & fraud-prevention app
- `invoice-ai.html` — touchless invoice-processing app

Nothing is fetched from a CDN, so a corporate proxy that blocks or inspects traffic can't break them.
(The apps try to load their display fonts from Google when you're online, and fall back to your
system fonts offline — the apps themselves need no network either way.)

These are the versions to use for a demo on a locked-down machine.

## Editing the source (optional, needs the dev toolchain)

The `.jsx` files are the source (single-file React components, `export default function App()`).
To change and rebuild them:

```bash
npm create vite@latest paylane-demo -- --template react
cd paylane-demo            # IMPORTANT: the previous command made this subfolder
npm install
npm install lucide-react recharts
# copy data-assure.jsx (or invoice-ai.jsx) into src/ and import it in src/main.jsx:
#   import App from './data-assure.jsx'
npm run dev                # or `npm run build` for your own bundled dist/
```

### If npm fails with a certificate error (corporate proxy)

`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` means a TLS-inspecting proxy is intercepting HTTPS and Node
doesn't trust the corporate root CA. Point Node at your machine's trusted roots (macOS):

```bash
security find-certificate -a -p /Library/Keychains/System.keychain > ~/corp-ca.pem
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> ~/corp-ca.pem
export NODE_EXTRA_CA_CERTS=~/corp-ca.pem      # add to ~/.zshrc to persist
```

Then npm and the Vite dev server work. Quick-but-insecure alternative:
`npm config set strict-ssl false`, run your install, then `npm config set strict-ssl true`.

(You don't need any of this just to run the demo — the `.html` files above already work standalone.)

## About the AI features

Each app has real Claude-powered features (Verify: Procurement Assistant + sanctions
adjudication; Invoices: field extraction + Invoice Assistant + exception suggestions). Inside
Claude they call Claude live; run standalone (the `.html` files) they fall back to built-in offline
logic, so every screen still works — just not live AI. Never put an API key in the frontend to "fix"
this; that leaks the key and needs a small server proxy.

## What's real vs. simulated

Functional: validation logic, ABA routing + IBAN checksums (Verify), PO matching, tax and
invoice-math validation, duplicate detection, fuzzy name/sanctions matching, and the AI. Simulated:
writing back into Workday, the live government/banking/tax feeds, and the sanctions watchlist
(fictional sample entities).

*Attavo is an internal prototype concept, not a shipping product. Workday, Workday Financials, and
Workday HCM are trademarks of Workday, Inc.*
