# Open Gauge UI Layout Reference

This document defines the standard page layout and UI patterns used across all Open Gauge pages.
All new pages **must** follow these patterns unless there is a documented reason to deviate.

---

## Standard Page Layout

Every full page uses this outer wrapper:

```tsx
<div className="p-6 space-y-5">
  {/* header */}
  {/* content panels */}
</div>
```

- `p-6` — uniform padding on all sides
- `space-y-5` — consistent vertical gap between sections
- The page lives inside `<main className="flex-1 overflow-y-auto og-grid-bg">` which provides the grid background and scroll

---

## Page Header

The header floats over the grid background — no background color, no border, no card.

```tsx
<div className="flex items-start justify-between">
  <div>
    <h1 className="text-xl font-bold text-og-text">Page title</h1>
    <p className="text-sm text-gray-400 mt-1">
      Brief description or live count
    </p>
  </div>
  <div className="flex items-center gap-2">
    {/* Action buttons */}
    <button type="button"
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
      Secondary action
    </button>
    <button type="button"
      className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors">
      <span className="text-sm leading-none">+</span>
      Primary action
    </button>
  </div>
</div>
```

---

## Content Panels (Cards)

All content areas are floating rounded cards — never flush-edge sections.

```tsx
<div className="bg-og-surface rounded-xl border border-og-border shadow-sm">
  {/* content */}
</div>
```

For panels with a header row:

```tsx
<div className="bg-og-surface rounded-xl border border-og-border shadow-sm">
  <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
    <p className="text-xs font-semibold text-og-text">Panel title</p>
  </div>
  <div className="p-4">
    {/* content */}
  </div>
</div>
```

---

## Two-Panel (Split) Layout

Used for pages with a sidebar tree/list and a detail panel (e.g. Locations).

```tsx
<div className="flex gap-5 items-start">
  {/* Sidebar panel — fixed width, scrolls independently */}
  <div className="w-72 flex-shrink-0 bg-og-surface rounded-xl border border-og-border shadow-sm overflow-y-auto max-h-[calc(100vh-180px)] sticky top-0">
    <div className="px-3 py-3 border-b border-og-border sticky top-0 bg-og-surface rounded-t-xl z-10">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Section label</p>
    </div>
    <div className="p-2">
      {/* tree / list items */}
    </div>
  </div>

  {/* Detail panel — grows to fill remaining space */}
  <div className="flex-1 min-w-0 space-y-5">
    {/* detail cards */}
  </div>
</div>
```

---

## Info Cards (Small Data Fields)

Used inside detail panels for displaying individual field values.

```tsx
<div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Field label</p>
  <p className="text-sm text-og-text">Value</p>
</div>
```

Arranged in a 2-column grid:

```tsx
<div className="grid grid-cols-2 gap-3">
  <InfoCard label="Type" value="..." />
  <InfoCard label="Code" value="..." />
</div>
```

**Rule: Never display an info card if its value is null/empty. Skip it.**

---

## Edit Form Inputs (Inline Edit Pattern)

Inline editing replaces the display view directly in the panel — no modal, no separate page.

### Field components

```tsx
const INPUT_BASE = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-none focus:ring-1 transition-colors placeholder-gray-300";
const INPUT_OK   = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";
const INPUT_ERR  = "border-red-400 focus:border-red-400 focus:ring-red-400/20";
```

### Edit/Save/Cancel pattern

- **Edit button** — appears in the panel header (right side), secondary style
- **Clicking Edit** — replaces display fields with form inputs in-place; Edit button becomes Save + Cancel
- **Save** — calls PUT API, re-fetches data, exits edit mode
- **Cancel** — restores original data without API call, exits edit mode
- **Save/Cancel button area** — top-right of the panel, consistent with where Edit was

```tsx
{editing ? (
  <div className="flex items-center gap-2">
    <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
      <XIcon size={12} /> Cancel
    </button>
    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
      <CheckIcon size={12} /> Save
    </button>
  </div>
) : (
  <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
    <EditIcon size={12} /> Edit
  </button>
)}
```

---

## Image Upload Field

Circular picture with click-to-preview and, in edit mode, two overlaid round buttons (upload /
remove). Used for any editable picture field — asset picture, organization logo, user profile
picture — via the shared `ImageUploadField` component (`@/components/image-upload-field`), which
owns the interactive chrome (clickable circle, preview modal, overlaid buttons, hidden file input)
while the caller supplies the visual content as `children` (a plain `<img>`+fallback-icon block,
or `Avatar` for initials-based fallback):

```tsx
<ImageUploadField
  imageUrl={profile.picture_url}
  alt={profile.name}
  editable={isEditing}       // show overlaid camera/trash buttons
  uploading={pictureUploading}
  onUpload={(file) => handlePictureChange(file)}
  onRemove={handlePictureRemove}
  size={80}
>
  {profile.picture_url ? (
    <img src={profile.picture_url} alt={profile.name} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full bg-og-surface-alt border border-og-border flex items-center justify-center">
      <ImageIcon size={28} className="text-gray-300" />
    </div>
  )}
</ImageUploadField>
```

- The circle is always clickable when an image is present — clicking opens `ImagePreviewModal`.
- The overlaid camera button (`-bottom-1 -right-1`, `bg-og-action`) and trash button
  (`-bottom-1 -left-1`, `bg-red-500`, only rendered when an image exists) only appear when
  `editable` is true — outside of edit mode the field is view/preview only.
- `size` must match between the `ImageUploadField` wrapper and whatever `children` renders (e.g.
  `Avatar`'s own `size` prop), since the wrapper clips to a circle of that exact size.

**Rule: never build a bespoke picture-upload UI — use `ImageUploadField`.**

---

## User in a List

Anywhere a user appears as part of a list — members roster, join requests, the admin users list,
activity/audit log entries — use the shared `UserSummary` component
(`@/components/user-summary`) rather than rendering name/email by hand:

```tsx
<UserSummary userId={m.user_id} name={m.name} email={m.email} pictureUrl={m.profile_picture_url} />
```

- Renders the user's avatar (via `Avatar`), then the name and email stacked to its right.
- The name is a link to `/users/{userId}` (via `hover:underline`) when `userId` is known; plain
  text otherwise (e.g. an external calibration lab with no internal account).
- The email renders below the name in `text-xs text-gray-400` — smaller and lighter than the name's
  `text-sm font-medium text-og-text`.
- `size` (default 32) controls the avatar's pixel size — use a smaller size (e.g. 24) in dense
  table rows.

`UserMention` (`@/components/user-mention`) is the audit-log-flavored wrapper around the same
component — it derives a display name from the email when no name is set, and shows the actor's
role as a native `title` tooltip on hover.

**Exception:** a per-row user-selection picker (e.g. the Add Member modal's eligible-users list)
shows the avatar but does not turn the name into a link — the row's click target is already the
`ToggleSwitch` selection control, and a competing navigation link inside it would be confusing.

**Rule: never hand-roll a name+email block for a user in a list — use `UserSummary`, or
`UserMention` for audit-log-style actor references.**

---

## Toggle Switch

All on/off controls use the shared `ToggleSwitch` component (`@/components/toggle-switch`)
instead of a raw `<input type="checkbox">`:

```tsx
<label className="flex items-center gap-2 text-xs text-gray-400">
  <ToggleSwitch checked={enabled} onChange={setEnabled} />
  Enabled
</label>
```

- A pill-shaped track that smoothly transitions color (`bg-og-accent` when on, `bg-gray-300`/
  `dark:bg-gray-600` when off) and slides a white thumb across, both via
  `transition-colors`/`transition-transform duration-200`.
- The switch never renders its own "On"/"Off" text — any adjacent label (e.g. "Private",
  "Reference standard") is the caller's own text, describing what the toggle does, not its state.
- Pass `size="sm"` for compact inline filters (matches the footprint of the old 14px checkbox);
  default `size="md"` for standalone settings toggles.
- Keep the surrounding `<label>` wrapper when the adjacent text should also toggle the control —
  a `<label>` auto-delegates clicks to a single wrapped `<button>` (which is what `ToggleSwitch`
  renders), so no extra `onClick` is needed. Only reach for an explicit container `onClick` (with
  `ToggleSwitch` itself calling `stopPropagation()`) when the row has other interactive/link
  content alongside the switch that would otherwise steal the click.

**Rule: never render a raw `<input type="checkbox">` — use `ToggleSwitch`.**

---

## Compact Numeric Inputs

A numeric input (a coefficient, a tolerance, a coverage factor, a percentage) rarely needs more
than 4-6 characters of width — sizing its column to a full-width label instead of the number it
actually holds is a common source of "why is this field so wide" complaints. Piloted in the
Calibration Wizard's Step 3 (Uncertainty calculation / Conformity assessment panels); apply the
same pattern wherever else a numeric field is added or reworked.

### Sizing

- Size the input to the content, not the label. A short field (a percentage, a coverage factor, a
  small coefficient) fits comfortably in `w-16`–`w-20`; only widen it if the value genuinely needs
  more digits.
- Let the label's own column drive its width (`w-20`–`w-40` depending on how much else shares the
  row — a toggle switch, a refresh icon), independent of the input's width below it.

### Long labels: shorten first, then truncate

1. **Shorten the label itself** when a clear abbreviation exists — "Sensor nominal accuracy" →
   "Sensor acc.", not "Sensor nominal ac…". A real abbreviation reads better than a mid-word
   ellipsis and doesn't shift every time the column resizes slightly.
2. **Cap the width and let it truncate** for whatever doesn't fit even after shortening. `WLabel`
   (the calibration wizard's shared label component) takes a `className` with a `max-w-*` to cap
   it — the text then ellipsizes via a `truncate` span rather than forcing the column wider.
3. **Always keep the tooltip.** A shortened or truncated label is not self-explanatory — every
   `WLabel` usage passes `tooltip` (explaining the concept) so truncation never trades width for
   comprehension. The truncated text itself also gets a native `title` (the full label, shown on
   hover) as a second, literal fallback.

### The `NumberInput` component

Use the shared `NumberInput` component (`@/components/number-input`) instead of a raw
`<input type="number">`:

```tsx
<NumberInput
  value={value}
  onChange={setValue}
  min={0}
  step={0.5}          // optional — also the amount the chevron buttons nudge by
  placeholder="e.g. 0.5"
/>
```

- Renders two small theme-aware chevron buttons (up/down) in place of the browser's native
  spinner arrows, which can only be hidden or shown — never restyled to look like part of the
  app. Typing, arrow keys, and the scroll-wheel all still work on the input itself; the buttons
  are an additional pointer-friendly affordance, not a replacement for them.
- Pass `invalid` to switch to the error border/ring (matches `IB_ERR`), `disabled`/`readOnly` to
  hide the buttons and dim the field, and `className` to set the width (e.g. `className="w-20"`).

**Rule: never render a raw `<input type="number">` in a place with a visible spinner requirement
— use `NumberInput`.** A plain `<input type="number">` is still fine where no visual
increment/decrement affordance is needed at all (rare — most numeric fields benefit from it).

### Native form controls

Some native controls (date inputs, in particular) are worth keeping — they're accessible and
well-tested, and a bespoke calendar widget is a lot of surface area to maintain for little benefit.
What they *do* need is to stop looking like they fell out of the OS: `apps/web/src/app/globals.css`
recolors the date input's calendar icon per theme via `color-scheme` (a light icon on a dark
background and vice versa, no filter hacks) — this applies automatically to every
`<input type="date">` in the app, no per-field change needed. Border, radius, and focus ring
already come from the screen's own `IB`/`IB_OK` classes, same as every other input.

---

## Scrollbars

Scrollbars are themed globally in `globals.css` (`::-webkit-scrollbar` + the standard
`scrollbar-width`/`scrollbar-color` properties for Firefox) rather than left as the browser
default — a thin, fully rounded thumb in `--og-border-md`, transparent track, switching to the
accent color on hover. This applies automatically to every scrollable element (panels,
sidebars, dropdowns, code blocks) in both light and dark mode via the existing color tokens.

**Rule: never add a bespoke `overflow-y-auto` scroll container without this global styling in
mind — don't reintroduce a native/unstyled scrollbar with inline styles or a competing library.**

---

## Color Rules (Summary)

| Use case | Token |
|---|---|
| Panel / card background | `bg-og-surface` |
| Subtle alt background (inputs, rows) | `bg-og-surface-alt` |
| Subtle border | `border-og-border` |
| Input / medium border | `border-og-border-md` |
| Primary text | `text-og-text` |
| Accent (links, active states) | `text-og-accent`, `bg-og-accent` |
| Primary action button | `bg-og-action hover:bg-og-action-dark text-white` |

**Never use:** `bg-white`, `bg-gray-50`, `bg-gray-100`, `border-gray-100`, `border-gray-200` for structural UI.

---

## Typography

| Role | Classes |
|---|---|
| Page heading | `text-xl font-bold text-og-text` |
| Panel heading | `text-sm font-semibold text-og-text` |
| Section label (caps) | `text-[10px] font-semibold uppercase tracking-widest text-gray-400` |
| Body / field value | `text-sm text-og-text` |
| Subtext / description | `text-sm text-gray-400` |
| Mono values (IDs, coords) | `text-xs font-mono text-gray-500` |

---

## Do NOT

- Add a background color to the page header — it must float over the `og-grid-bg`
- Use flush-edge panels (no border-radius, no shadow) — all content panels are rounded cards
- Show empty/null fields in detail views — skip them entirely
- Define inline SVG icons — add to `icons.tsx` and import
- Use `bg-white`, `bg-gray-50`, `border-gray-100`, `border-gray-200` for structural UI
- Build a bespoke picture-upload UI — use the shared `ImageUploadField` component
- Hand-roll a name+email block for a user in a list — use `UserSummary`/`UserMention`
- Render a raw `<input type="checkbox">` — use the shared `ToggleSwitch` component
- Size a numeric input's column to its label instead of its content — shorten the label first,
  then cap its width and let it truncate (with a tooltip) for whatever's left over
- Render a raw `<input type="number">` where a visible increment/decrement affordance is
  expected — use the shared `NumberInput` component
