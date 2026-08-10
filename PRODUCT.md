# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

OPTIMA is used by Uzbek-speaking teams, students, educators, and community members on both mobile and desktop. Core users repeatedly move between messaging, meetings, shared learning materials, and profile/workspace management. Investors also evaluate the real production product, not a separate demo.

## Product Purpose

OPTIMA combines real-time chat, direct and group communication, video meetings, education content, a library, workspace coordination, and user profiles in one authenticated product. Success means users can complete these workflows quickly and confidently on common phone, tablet, and desktop sizes without mock data or visual breakage.

## Positioning

OPTIMA brings Telegram-like communication ergonomics, Meet-like calls, and structured Uzbek learning/work resources into one coherent workspace backed by real user and workspace data.

## Operating Context

Users sign in with existing authentication, choose or create a workspace, exchange direct/group/channel messages, share files and voice messages, join or create meetings, browse education and library content, and manage their profile and preferences. Mobile and desktop are equally important.

## Capabilities and Constraints

- Preserve the existing React, TypeScript, REST, Socket.IO, WebRTC, auth, workspace, and API contracts.
- Do not add production mock data or fake functionality.
- Keep real permission, loading, empty, error, disabled, and connection states visible.
- Preserve four-language localization: Uzbek, Russian, English, and Turkish.
- Keep light and dark themes, with light as the unauthenticated default.
- Do not push to GitHub unless the user explicitly asks.
- AWS at `api.honeymedia.uz` is the production test environment; Vercel is out of scope.

## Brand Commitments

- Product name: OPTIMA.
- Preserve the supplied OPTIMA logo.
- Core colors: Calm Mist Blue `#BAC6EA` and Soft Cream `#FFF6E9`.
- Chat should inherit Telegram's clarity and density without copying it literally.
- Meetings should inherit Google Meet's control clarity without copying it literally.
- Avoid cartoon styling, decorative gradients, excessive glass, excessive cards, and one-note dark purple styling.

## Evidence on Hand

- Existing production application and real backend data.
- Existing OPTIMA logo and mobile visual references supplied by the user.
- Existing authenticated routes for dashboard, chat, meetings, education, library, profiles, and settings.
- No fabricated testimonials, metrics, or commercial claims should be introduced.

## Product Principles

1. Real functionality before decorative polish.
2. Mobile and desktop receive equal design care.
3. Dense workflows remain calm, readable, and familiar.
4. Shared patterns behave consistently across every module.
5. Every permission, network, and empty state explains what the user can do next.

## Accessibility & Inclusion

Target keyboard-operable controls, visible focus, usable touch targets, reduced-motion support, resilient localization, and WCAG 2.2 AA contrast for essential text and controls.
