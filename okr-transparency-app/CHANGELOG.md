# Changelog

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
