# Changelog

All notable product changes are recorded here. This project follows Semantic Versioning.

## Unreleased

- Hide empty optional OKR detail fields while preserving populated historical and weekly-update values.

## v0.7.7 - 2026-08-11

- Separate team and member Objectives with explicit scope and owner-email fields so refilling one scope cannot overwrite the other.
- Center each visual child group around its parent, indent child teams without changing organization ownership, and prevent nodes in shared columns from overlapping.
- Show member Objectives after their team Objective, collapsed by default, and keep zoom controls fixed to the lower-left viewport while the map is dragged.
- Allow explicitly enabled local credentials to remain on the same origin for stable local production-mode testing.

## v0.7.6 - 2026-08-11

- Keep each Objective under its configured organization hierarchy in the alignment map, while rendering explicit OKR alignment as a separate dashed arrow and leaving unaligned Objectives in their owning team.

## v0.7.5 - 2026-08-11

- Retry machine translation when source text is unchanged but the target-language value is missing.
- Log Cloud Translation failures without exposing OKR content and show editors that the original was saved without a translation.

## v0.7.4 - 2026-08-11

- Enforce same-team Objective/KR parent relationships and reject missing, duplicate, or self-aligned draft IDs before publishing.
- Build the active-period snapshot and period view from one candidate record set, and clear optional cross-team alignment when its target is removed.
- Add a dry-run-first Firestore OKR reset command with raw backup and post-delete verification.

## v0.7.2 - 2026-08-10

- Rename Integration Team / Integration Lead to System Team / System Leader and Platform Team / Platform Lead to Infra Team / Infra Leader without changing personnel assignments.
- Allow unconfigured `@unitxlabs.com` accounts to browse OKRs with no edit, publish, progress-update, or administration permissions.
- Show newly added members at the top of the admin member list, select them immediately, clear active search filters, and scroll them into view.
- Render the main OKR overview at 90% density on laptop-height desktop viewports while leaving mobile, large-screen, and admin layouts unchanged.
- Drive the alignment-map navigation from the configured organization hierarchy, remove obsolete teams, and add Software child-team views.
- Make baseline, target, KR confidence, risk, and decision details optional so simple OKRs can be published without advanced fields.

## v0.7.1 - 2026-07-15

- Use the verified company IAP identity throughout the online app without triggering a second Google OAuth login.
- Turn administrator feedback records into a two-state work queue with pending and completed filters.
- Allow system administrators to complete, reopen, and permanently delete feedback with confirmation and audit records.

## v0.7.0 - 2026-07-14

- Add a bilingual My Action Center that collects the signed-in user's owned KRs, updates overdue by more than seven days, and open risk or decision context.
- Add a team-scoped review queue for team leaders and system administrators with direct links to existing draft and progress editing flows.
- Preserve per-Objective draft and published status so review items clear after publishing and owner-scoped edits do not mark unrelated Objectives as draft.

## v0.6.2 - 2026-07-14

- Enforce team scope when team leaders or contributors update owner-scoped drafts and progress records.
- Verify signed IAP JWT identity claims and configure Cloud Run to fail closed when IAP authentication is enabled.
- Require two enabled system administrators and prevent administrators from deleting, disabling, or demoting themselves.

## v0.6.1 - 2026-07-14

- Add a persistent feedback entry point across user pages with bilingual submission UI and automatic page context.
- Store authenticated user feedback in local JSON or Firestore and restrict the feedback list to system administrators.
- Add a searchable user-feedback section to the admin console and include feedback in full backup exports.

## v0.6.0 - 2026-07-14

- Redesign the admin area as an OKR operating console with four task-oriented sections: runtime status, periods, organization and access, and audit and recovery.
- Replace passive configuration counts with actionable operational attention items and published-team/data-quality status.
- Add AdminConfig v2 read-time migration, a single period state, stable team IDs, configuration revisions, conflict rejection, and domain-specific audit summaries.
- Replace raw parent/color/role fields with structured controls, effective-access previews, account deactivation, and guarded permanent deletion.
- Add version impact previews before team-and-period rollback and expose storage/version information as read-only system context.

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
