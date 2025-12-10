# ByteStream Design Guidelines

## Design Approach

**Selected Approach:** Reference-Based (Fintech/Crypto)

Drawing inspiration from Stripe's minimal trust-building aesthetic, Phantom wallet's clarity, and Linear's refined dashboard design. This creates a professional, security-focused interface that builds user confidence in handling Bitcoin transactions.

**Core Principles:**
- Clarity over decoration: Every element serves a functional purpose
- Trust through simplicity: Clean layouts reduce cognitive load for financial operations
- Progressive disclosure: Complex wallet operations broken into clear steps
- Status transparency: Always show current state of transactions and balances

---

## Typography

**Font Stack:** Inter (Google Fonts) for all text

**Hierarchy:**
- Page Title: 2xl, semibold (ByteStream branding)
- Section Headers: xl, semibold
- Subsection Labels: base, medium, uppercase tracking-wide
- Body Text: base, normal
- Technical Data (addresses, txids): sm, mono font (JetBrains Mono), normal
- Helper Text/Status: sm, normal
- Button Text: base, medium

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16, 24

**Container Structure:**
- Main container: max-w-4xl mx-auto with px-6 py-12
- Card/Section spacing: mb-8 between major sections
- Inner card padding: p-6
- Form element spacing: space-y-4 for vertical stacking
- Button spacing: mt-6 for primary actions

**Grid Usage:**
- Single column layout for wallet connection and funding flows
- Two-column grid (gap-6) for displaying address + QR code side-by-side on desktop

---

## Component Library

### Navigation/Header
- Fixed top bar with ByteStream logo (left) and wallet connection button (right)
- Height: h-16, px-6
- Bottom border for subtle separation

### Wallet Connection
- Prominent card at top when disconnected
- Shows connected address in truncated format when connected (first 8...last 8 characters)
- Disconnect option in dropdown/popover

### Action Cards
- Border with rounded-lg corners
- Each major action (Generate Wallet, Fund Address, Create Merchant) gets its own card
- Disabled state with reduced opacity when prerequisites not met
- Clear "Step 1, Step 2, Step 3" visual flow

### Address Display
- Monospace font in bordered box with copy-to-clipboard icon
- Background treatment to differentiate from regular text
- QR code generation displayed alongside address (128px × 128px)

### Transaction Status
- Progress indicator with clear states:
  - Pending: animated spinner + "Waiting for confirmation"
  - Confirmed: checkmark icon + "Confirmed" badge
  - Error: warning icon + error message
- Status badge with appropriate styling (not relying on color alone)

### Balance Display
- Large text showing BTC amount
- Smaller USD equivalent below (if applicable)
- Enclosed in highlighted card to draw attention

### Forms
- Input fields with clear labels above
- Border on all sides, rounded corners
- Focus state with border emphasis
- Error messages below fields in small text
- Submit buttons full-width within form context

### Merchant Payment URL
- Generated URL displayed in highlighted box
- Copy button adjacent
- Visual indication of successful copy

### Merchant Payment Page
- Simplified layout showing:
  - Merchant name as page header
  - Current L2 balance prominently
  - Single focused "Pay Merchant" button
  - Transaction history list below (if applicable)

### Buttons
**Primary Actions:**
- Full-width on mobile, auto-width on desktop (px-8)
- Height: h-12
- Rounded: rounded-lg
- States: default, hover (subtle transform/shadow), active, disabled (opacity-50)

**Secondary Actions:**
- Similar sizing but visually de-emphasized
- Border-based styling

### Loading States
- Spinner icon (16px) + "Processing..." text for async operations
- Skeleton placeholders for address generation
- Disabled form inputs during API calls

### Error Handling
- Inline error messages below relevant inputs
- Toast/alert at top for system-level errors
- Clear retry actions when applicable

---

## Images

**No hero image required** - This is a functional application focused on utility

**QR Codes:**
- Generated programmatically for Taproot addresses
- Displayed at 128×128px in funding section
- White background with adequate padding

**Icons:**
- Use Heroicons via CDN (outline style for navigation, solid for status indicators)
- Bitcoin logo in header (24×24px)
- Wallet icon for connection status
- Copy, checkmark, warning, and spinner icons throughout

---

## Animations

**Minimal Approach:**
- Loading spinners only (rotate animation)
- Subtle hover lift on buttons (transform: translateY(-1px))
- Smooth transitions on form validation states (200ms)
- No scroll-triggered or decorative animations