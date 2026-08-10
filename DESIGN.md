---
name: OPTIMA
description: Calm communication, meetings and learning in one coherent workspace.
colors:
  indigo: "#45429A"
  indigo-deep: "#292760"
  mist-blue: "#BAC6EA"
  cream: "#FFF6E9"
  paper: "#FFFDFA"
  ink: "#171827"
  body: "#565B6D"
  success: "#248D68"
  danger: "#C44955"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(28px, 2.5vw, 40px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.48
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 720
rounded:
  control: "13px"
  button: "14px"
  panel: "18px"
  modal: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "46px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: OPTIMA

## Overview

**Creative North Star: "The Calm Operating Surface"**

OPTIMA is a professional workspace where communication, meetings and learning share one visual language. Warm cream reduces glare, mist blue creates structure, and indigo is reserved for selection and primary actions. Density stays practical: familiar controls, clear hierarchy and no decorative dashboard clutter.

**Key Characteristics:** warm, calm, compact, trustworthy, responsive.

## Colors

The palette combines warm neutral surfaces with a restrained cool accent.

### Primary
- **OPTIMA Indigo** (`#45429A`): primary actions, selected navigation and progress.
- **Deep Indigo** (`#292760`): high-contrast text on mist surfaces.

### Secondary
- **Calm Mist Blue** (`#BAC6EA`): selected secondary controls, focus support and quiet structure.

### Neutral
- **Soft Cream** (`#FFF6E9`): light canvas.
- **Paper** (`#FFFDFA`): controls, panels and cards.
- **Ink** (`#171827`): primary text.
- **Body Grey** (`#565B6D`): supporting text.

**The One Accent Rule.** Indigo communicates action or selection; it is not ambient decoration.

## Typography

**Display Font:** Georgia with Times New Roman fallback.  
**Body Font:** Inter with system sans-serif fallback.

**Character:** editorial headings give the product confidence while compact sans-serif copy keeps operational screens fast to scan.

### Hierarchy
- **Display** (700, `clamp(28px, 2.5vw, 40px)`, 1.08): major page titles only.
- **Title** (700, 18-24px): panel and conversation titles.
- **Body** (400, 14px, 1.48): interface and message copy.
- **Label** (720, 13px): buttons, tabs and compact metadata.

## Layout

Desktop uses a 248px navigation rail and fluid content. Chat uses a 300-390px conversation list plus a flexible message area. At 820px and below, navigation becomes bottom-mounted and chat becomes a list/detail flow. Stable rows, `minmax(0, 1fr)` and safe-area padding prevent controls from resizing content. Every release is checked at 390px, 768px and 1440px.

## Elevation & Depth

Depth is ambient and sparse. Resting panels use a fine border and low diffuse shadow; modals and transient menus use the stronger shadow. Video surfaces remain neutral and do not use decorative depth.

- **Ambient low:** `0 1px 2px rgba(41,39,96,.04), 0 8px 22px rgba(41,39,96,.05)`.
- **Overlay:** `0 18px 48px rgba(41,39,96,.12)`.

**The Flat-by-Default Rule.** Shadows clarify layer or interaction; they do not decorate page sections.

## Shapes

Controls use 13-14px corners, repeated records and panels use 18px, and modals use 20px. Pills are reserved for filters and compact state selection. Chat bubbles use asymmetric 5px tail corners to preserve conversational direction.

## Components

### Buttons
- **Shape:** 14px radius, 44px minimum height.
- **Primary:** indigo with white text; hover lifts by 1px.
- **Focus:** visible mist-blue outline and soft ring.
- **Danger:** red is reserved for leave, delete and destructive states.

### Chips
- **Style:** bordered paper pill at rest, indigo or mist fill when selected.
- **State:** horizontal scrolling is allowed on narrow screens without shrinking labels.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** paper on cream; deep tonal surfaces in dark mode.
- **Border:** one quiet semantic divider, never nested decorative frames.

### Inputs / Fields
- **Style:** 46px minimum height, 13px radius, paper or muted tonal fill.
- **Focus:** mist border plus a visible three-pixel ring.
- **Disabled:** readable but visibly reduced; no hidden required action.

### Navigation
- Desktop navigation is compact and left-aligned. Mobile navigation uses persistent labeled destinations. Active state uses indigo in light mode and mist blue in dark mode.

### Chat
- Desktop is split list/detail; mobile shows one layer at a time.
- Composer remains 64px on mobile and 74px on desktop unless reply, edit or upload context is visible.
- Custom emoji render as image assets in messages and conversation previews.

### Meeting
- Video occupies the dominant neutral surface.
- Controls remain stable at the bottom; red is reserved for leave and disabled media.
- Side panels replace or compress the stage smoothly according to viewport width.

## Do's and Don'ts

### Do:
- **Do** preserve real backend state and existing API contracts.
- **Do** keep keyboard focus visible and touch targets at least 40px.
- **Do** use cream, mist and indigo consistently across all modules.
- **Do** respect reduced-motion preferences.

### Don't:
- **Don't** add production mock data or hardcoded identities.
- **Don't** use starfields, neon glows, gradient orbs or cartoon decoration.
- **Don't** nest decorative cards or let chat and meeting controls resize the primary workspace.
- **Don't** use color as the only signal for state.
