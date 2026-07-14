# Changelog

All notable product changes are recorded here. This project follows Semantic Versioning.

## Unreleased

- Add user-facing changes here before merging them into `main`.

## v0.5.0 - 2026-07-14

- Separate structural Objective/KR relationships from cross-team alignment and repair legacy orphan records.
- Validate the complete OKR graph, required KR metrics, weights, ownership, and non-green risk context before publishing.
- Remove the hard-coded quarter and use admin-configured periods throughout the application.
- Add team-and-period snapshot versions, scoped rollback, and optimistic concurrency protection.
- Unify weekly KR updates with actual value, progress, confidence, risk, next steps, and evidence links.
- Add data-quality warnings, team search, destructive-action confirmations, and full JSON backup export.
- Validate admin periods, teams, users, references, and hierarchy cycles before saving configuration.
- Add deterministic repair and alignment migration commands with preserved local backups.

## v0.4.0 - 2026-06-24

- Add browser-based Objective and KR editing with draft and publish workflows.
- Add normalized publish safeguards and weighted Objective progress calculation.
- Add snapshot rollback data, period snapshots, and admin event history.
- Display the application version in the main navigation.

## v0.3.0 - 2026-06-17

- Add Google OAuth login with Auth.js.
- Add role-based permissions for `super_admin`, `team_leader`, and `user`.
- Keep OKR pages publicly visible while restricting edit, publish, sync, rollback, and admin configuration writes.
- Add admin user and role configuration with teams and owner aliases.
- Gate edit UI and write APIs through shared authorization helpers.

## v0.2.0 - 2026-06-17

- Limit OKR progress and weight inputs to 0-100.
- Derive Owner from the selected team instead of manual entry.
- Calculate Objective progress from weighted KR progress.
- Exit edit mode automatically after a successful publish.
- Add server-side draft and publish safeguards for normalized OKR data.
