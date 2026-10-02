# Design system

Short guide for building screens in this portal. The visual reference is `design/portal-prototype.html` (open it, click around). Tokens live in `src/index.css`. If this file and the prototype disagree, update this file after deciding which is right.

## Principles

1. **Billboard, not brochure.** Users scan. One clear title, one primary action per screen, no instructions that need reading.
2. **Money and counts are the product.** Right-align, tabular digits, always show currency (`৳`), never round silently.
3. **Say what is final.** Draft vs Finalized is always visible. Locked data looks locked.
4. **Errors say what to do next.** Name the cause and link to the fix (e.g. 409 `USAGE_NOT_COMPLETE` → a "Requeue all" button in the banner on Billing periods).
5. **Omit, then omit again.** If a field or column is not used by someone every week, leave it out.

## Surfaces

| Surface | `data-surface` | Accent | Sidebar | Users |
|---|---|---|---|---|
| Staff Console | `staff` | Green | Navy | RVL Admin, RVL Finance |
| Institution Portal | `fi` | Blue | Blue-navy | Financial-institution users |

Set `document.documentElement.dataset.surface` once per surface. Never hard-code accent colours; use the tokens so a surface (or later a per-institution brand) can retheme by changing `--accent`.

## Brand

Relief Validation Limited (RVL): navy and green with a clean, trustworthy tone. Montserrat for headings and brand text, Inter for UI and tables, JetBrains Mono for IDs, payloads and secrets. Bengali falls back to Noto Sans Bengali. The logo in the prototype is a placeholder QR glyph; replace with the official asset in `public/`.

## Tokens

Defined as CSS variables in `src/index.css` and exposed to Tailwind. Use the utility, not the hex.

| Token | Utility examples | Use |
|---|---|---|
| `accent`, `accent-strong`, `accent-soft`, `on-accent` | `bg-accent`, `text-on-accent` | Primary buttons, active nav, focus ring, chart series |
| `canvas`, `surface`, `surface-2` | `bg-canvas`, `bg-surface` | Page background, cards, table header/zebra |
| `line`, `line-2` | `border-line` | Hairline borders (prefer borders over shadows) |
| `text`, `text-2`, `text-3` | `text-text-2` | Primary, secondary, tertiary text |
| `ok`, `warn`, `bad`, `info` (+ `-bg`) | `text-ok bg-ok-bg` | Status chips and banners |
| `side`, `side-2`, `side-text`, `side-head` | `bg-side` | Sidebar and hero panels |

Dark mode comes from `prefers-color-scheme`, or `data-theme="light|dark"` to force it. Every token has a dark value; do not add colours outside the token set.

## Typography

- Body 14/20, table header 12 semibold, KPI value 26 semibold, page title 24 bold (Montserrat), card title 15 semibold.
- Use `.num` (tabular numerals) on every number in a column or KPI.
- Do not use more than 3 sizes in one card.

## Layout and spacing

- 4/8px grid. Cards 12px radius, controls 9px, chips and nav pills fully rounded.
- Page: sidebar (244px) + top bar (64px) + content (max 1360px, 28px padding). Below 900px the sidebar becomes an overlay menu.
- KPI row: 4 columns, collapses to 2 then 1.

## Components

Build with Radix primitives plus Tailwind. They live in `src/shared/ui`, one file each, no component library on top. Import from the barrel:

```tsx
import { Button, Card, CardHeader, Kpi, StatusChip, Table, Th, Td, Tr, Drawer, ConfirmDialog, Field, Input, Banner, BarChart, toast } from '../../shared/ui'
```

Available: Button, Chip/StatusChip, Card/CardHeader/Kpi, Table/Th/Td/Tr/EmptyRow, Drawer, ConfirmDialog, Field/Input/Select/Textarea, Banner, Toaster/`toast`, BarChart. Not built yet (add when a screen needs it): sidebar/top-bar shell, tabs, switch, dropdown menu, pagination. `src/tokens.test.ts` fails the build if a component uses a raw hex colour or a default Tailwind palette class.

| Component | Rules |
|---|---|
| Button | Primary (accent), default (outline), danger (outline red; solid red only inside a confirm dialog). Height 38, 30 in tables. One primary per view. |
| Status chip | Dot + label. Colour is never the only signal. Mapping below. |
| Table | Header row `surface-2`, hairline rows, right-aligned numeric columns, whole row clickable when it opens a detail drawer, empty state inside the table. |
| Drawer | Right side, 480px (620 for statements). Forms, details, finalize. Esc and scrim close it. |
| Dialog | Confirmations only. Destructive confirm uses solid red button. |
| Banner | `warn`, `info`, `bad`, `ok`. Title + one sentence + link to the fix. |
| Form field | Label above, error text below in `bad`, helper in `text-3`. Validate with zod and react-hook-form. |
| Toast | Top centre, 3s, success green or error red. |
| Chart | Stacked bars, generations lighter, validations solid, draft month at reduced opacity, compact axis labels (`60k`), `<title>` tooltips. |

### Status mapping

| Meaning | Chip |
|---|---|
| Active, In effect, Finalized, Applied, Complete, VALID, GENERATED | `ok` |
| Pending, Scheduled, NON_P2P | `info` |
| Draft, Queued, Suspended, KEY_NOT_FOUND, KEY_SUSPENDED, KEY_REVOKED, KEY_NOT_ACTIVE, REQUEST_STALE | `warn` |
| Terminated, INVALID_SIGNATURE, STRUCTURAL_INVALID | `bad` |

Usage verdicts are shown with a readable label (`verdictLabel` in `src/shared/usage/usage.ts`) but coloured by their code.

## Money, dates, numbers

- Currency `৳` (BDT), thousands separators, 2 decimals only when not a whole number. Negative uses a true minus `−`; adjustments show a sign (`+৳ 250`, `−৳ 500`).
- Dates ISO in tables (`2026-10-02`), month names in headings (`September 2026`). Billing periods are `YYYY-MM`.
- Counts are whole numbers with separators.

## Accessibility

- Contrast AA in light and dark. Visible `:focus-visible` ring on everything interactive.
- Touch targets 44px on mobile. Tables scroll horizontally inside their card, never the page.
- Icons that stand alone have an `aria-label`. Drawers and dialogs trap focus and return it on close.
- Respect `prefers-reduced-motion`.

## Screens (MVP)

Staff, Admin: Overview, Institutions (list, detail with Applications, Certificate and credentials, Billing; onboarding wizard), Crypto keys, QR inspector.
Staff, Finance: Overview, Rate cards, Billing periods (finalize), Adjustments, Reports (monthly summary, by institution, revenue trend; Download PDF prints the view, Download CSV exports it). A statement opens as a printable A4 bill from Billing periods.
Institution: Overview, Usage, Statements, Applications and certificate, Account.
Out of MVP: Payments, Dues.

## Notes

- `rvl-sbqr-admin-portal` used a Bangladesh-green token set (`bqr-green`). This portal uses the RVL brand set above; do not mix the two when porting pages, map them to the tokens here.
- Statements are billing records, not tax invoices; keep that note on statement views.
