# PQFMS Interface Redesign

## Design intent

The refreshed interface retains the existing RMSH teal/forest-green and emerald identity, with a restrained warm-gold accent and calm neutral surfaces. The visual system uses clearer hierarchy, more deliberate spacing, responsive navigation, refined surfaces, reduced visual noise and small state-oriented animations. Clinical actions remain visually clear and do not depend on animation to communicate a state change.

## Accessibility preferences

The Display & Accessibility panel offers:

- Light or dark theme, persisted locally on the device.
- Four text-size settings, from standard to largest.
- Standard or high-contrast styling.
- Operating-system motion preference or an explicit reduced-motion override.
- Larger controls for touch and motor accessibility.

The interface also includes a skip link, visible keyboard focus, semantic navigation, labelled controls, accessible modal semantics and keyboard focus management, state announcements for important status changes, and reduced-motion CSS for both explicit and operating-system preferences.

## Queue and estimate behaviour

Waiting-time values are estimates, not countdown appointments. Predictions are refreshed by the existing frontend polling lifecycle (every 30 seconds) and after queue changes. An estimate reaching zero does **not** change queue status, call a patient, or discharge a visit. A doctor must explicitly call the waiting ticket to transition it to `In-Consultation`. The public display continues to show ticket/queue information only, not patient names, identification numbers or clinical notes.

## Functional invariants

The redesign is a frontend-only presentation/accessibility update. Existing API routes, database schema, patient check-in behaviour, daily ticket sequence, role permissions, queue state transitions, triage tiers, staff/shift administration, audit history and analytics contracts should remain unchanged.

## Verification note

The uploaded current source had already passed backend unit/integration checks, analytics checks, frontend lint/build, and a local load test before this interface work began. The redesign must be re-verified after these UI changes. A local CSS and JavaScript/JSX syntax parse was performed during preparation; the package-manager install in the preparation environment did not complete, so do not treat that as a replacement for running the frontend lint/build on the Windows development machine.
