# Steinberg ASIO SDK licence (option A, chosen 2026-10-22)

Decision: ship ASIO inside Mizin Playout under the **proprietary Steinberg ASIO SDK Licensing
Agreement 2.0.5** (no fee, §4). Until Steinberg returns the countersigned agreement, official builds keep
`MIZIN_ENABLE_ASIO=OFF` (scripts/compile.cmd).

## Steps
1. Fill `binaries/asio-sdk/licensee.json` (template below) and run
   `python scripts/fill-asio-agreement.py binaries/asio-sdk/licensee.json`.
2. The legal representative reviews, prints and signs page 8 (or applies a qualified digital
   signature, e.g. gov.br), dating "Date executed".
3. Email the signed PDF to Steinberg (reception@steinberg.de, the contact in the SDK README) with the
   draft below and keep their countersigned copy in `binaries/asio-sdk/` (ignored, private).
4. When it arrives: enable ASIO in the official build and add the obligations below in the same release.

## Obligations once licensed (§3) — to implement in the ASIO release
- About box / startup screen and the bundled docs (quick start, THIRD_PARTY.md): "ASIO" or the
  ASIO-compatible logo plus the notice **"ASIO is a trademark of Steinberg Media Technologies GmbH,
  registered in Europe and other countries."**
- Website: the ASIO-compatible logo + notice on the product page (and legal/imprint page if any);
  every page/document that mentions "ASIO" carries the notice.
- Logo only unaltered, per the usage guidelines in the SDK ("Steinberg ASIO Logo Artwork").
- Never "ASIO" in a product or company name (e.g. no "Mizin ASIO …"); "ASIO compatible" / "for ASIO"
  next to the product name is allowed in regular type.
- Do not redistribute the SDK itself; keep a record of ASIO trademark use per country/year/product
  (§3.1.j) — the release history (site What's new + CHANGELOG) serves as the base.

## licensee.json template
```json
{
  "company": "Legal company name",
  "represented_by": "Full name of the legal representative",
  "address": "Street, number, complement",
  "city_zip": "City - State, ZIP",
  "country": "Brazil",
  "signatory_name": "Full name of who signs",
  "signatory_title": "Managing Partner",
  "date_executed": "",
  "tech_name": "Technical contact name",
  "tech_address": "Street, number - City - State, ZIP, Brazil",
  "tech_phone": "+55 ...",
  "tech_fax": "",
  "tech_email": "contact e-mail"
}
```

## Email draft (English)
Subject: ASIO SDK Licensing Agreement 2.0.5 — <Company> (Mizin Playout)

Dear Steinberg team,

Please find attached our signed Steinberg ASIO SDK Licensing Agreement 2.0.5 (SDK version 2.3.4,
15.10.2025) for countersignature.

We develop Mizin Playout, a native Windows video playout application for live shows and events
(https://playoutmizin.pages.dev). We will use the ASIO SDK solely to host ASIO device drivers for
low-latency audio output (e.g. Dante Virtual Soundcard, Behringer UMC and Blackmagic devices). The
SDK itself will not be redistributed, and we will follow the ASIO trademark and logo guidelines.

Could you please return the countersigned agreement to this address?

Kind regards,
<Name>
<Title>, <Company>
<Phone> · <Email>
