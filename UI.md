# MAR UI Layout Reference

This document defines the standard page layout and UI patterns used across all MAR pages.
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
- The page lives inside `<main className="flex-1 overflow-y-auto mar-grid-bg">` which provides the grid background and scroll

---

## Page Header

The header floats over the grid background — no background color, no border, no card.

```tsx
<div className="flex items-start justify-between">
  <div>
    <h1 className="text-xl font-bold text-mar-text">Page title</h1>
    <p className="text-sm text-gray-400 mt-1">
      Brief description or live count
    </p>
  </div>
  <div className="flex items-center gap-2">
    {/* Action buttons */}
    <button type="button"
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
      Secondary action
    </button>
    <button type="button"
      className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
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
<div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
  {/* content */}
</div>
```

For panels with a header row:

```tsx
<div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
  <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
    <p className="text-xs font-semibold text-mar-text">Panel title</p>
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
  <div className="w-72 flex-shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-sm overflow-y-auto max-h-[calc(100vh-180px)] sticky top-0">
    <div className="px-3 py-3 border-b border-mar-border sticky top-0 bg-mar-surface rounded-t-xl z-10">
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
<div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Field label</p>
  <p className="text-sm text-mar-text">Value</p>
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
const INPUT_BASE = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 transition-colors placeholder-gray-300";
const INPUT_OK   = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
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
    <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
      <XIcon size={12} /> Cancel
    </button>
    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
      <CheckIcon size={12} /> Save
    </button>
  </div>
) : (
  <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
    <EditIcon size={12} /> Edit
  </button>
)}
```

---

## Color Rules (Summary)

| Use case | Token |
|---|---|
| Panel / card background | `bg-mar-surface` |
| Subtle alt background (inputs, rows) | `bg-mar-surface-alt` |
| Subtle border | `border-mar-border` |
| Input / medium border | `border-mar-border-md` |
| Primary text | `text-mar-text` |
| Accent (links, active states) | `text-mar-accent`, `bg-mar-accent` |
| Primary action button | `bg-mar-action hover:bg-mar-action-dark text-white` |

**Never use:** `bg-white`, `bg-gray-50`, `bg-gray-100`, `border-gray-100`, `border-gray-200` for structural UI.

---

## Typography

| Role | Classes |
|---|---|
| Page heading | `text-xl font-bold text-mar-text` |
| Panel heading | `text-sm font-semibold text-mar-text` |
| Section label (caps) | `text-[10px] font-semibold uppercase tracking-widest text-gray-400` |
| Body / field value | `text-sm text-mar-text` |
| Subtext / description | `text-sm text-gray-400` |
| Mono values (IDs, coords) | `text-xs font-mono text-gray-500` |

---

## Do NOT

- Add a background color to the page header — it must float over the `mar-grid-bg`
- Use flush-edge panels (no border-radius, no shadow) — all content panels are rounded cards
- Show empty/null fields in detail views — skip them entirely
- Define inline SVG icons — add to `icons.tsx` and import
- Use `bg-white`, `bg-gray-50`, `border-gray-100`, `border-gray-200` for structural UI
