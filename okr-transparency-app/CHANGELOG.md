# Changelog

All notable product changes are recorded here. This project follows Semantic Versioning.

## Unreleased

## v0.8.5 - 2026-08-21

- Fold the alignment view's second-level column into one collapsible band per team. Seventeen Objectives laid out flat pushed a carrier group a thousand pixels below the root it aligns to; bands past two Objectives now start folded, a fold holds until it is clicked open, and a search still pulls its match into view.
- Bring a focused chain onto one row. Hovering or pinning a card floats the rest of its chain alongside it instead of only fading the others out, and a folded band the chain runs through opens itself, so the Objective arrives rather than a "3 Objectives collapsed" strip.
- Draw everything aligning into one Objective as a single line under a single arrowhead. The alignment edges landing on one card previously fanned out into as many near-parallel neighbours, with their arrowheads stacked on one point; arrowheads also now take the colour of the line they belong to instead of always rendering black.

## v0.8.4 - 2026-08-21

- Stop pre-selecting an upper-level alignment target in a member's editor. Adding an Objective, opening the editor, and paste import no longer fill in the team's first Objective, so an alignment is only ever recorded when the member picks one. Alignments already published are unaffected.

## v0.8.3 - 2026-08-21

- Restore upper-level alignment for members: the picker matched candidates against the configured team owner label while publishing records the resolved owner display name, so every team with a configured leader offered its members no alignment target at all.
- Keep a leader's personal OKR out of the alignment targets offered to their team members.
- Show the resolved team owner in the alignment view group headers, matching the name every other view already shows.

## v0.8.2 - 2026-08-17

- Keep personal-scope OKRs out of the team overview and calculate team health from the records actually shown.
- Add Chinese guidance for Type and Confidence choices while preserving the existing stored values and publishing flow.

## v0.8.1 - 2026-08-14

- Publish the PR18 launch-hardening release and align the repository version with production.

## v0.7.11 - 2026-08-13

- Rebuild the OKR alignment view as three fixed columns (top-level team, second-level team, individual carrier group) carrying a single kind of edge, each routed through its own vertical channel.
- Scale the alignment canvas with the screen: columns fill the available width, and past a 1900px baseline cards, gaps, and type scale up together instead of leaving the map at laptop size on a large monitor.
- Compact the rows above the alignment canvas on short viewports, so a scaled 1080p laptop gains 84px of canvas and no longer scrolls the page to show it.
- Render the navigation bar identically on every route, and align the account, sign-in, and language controls with the navigation type size.

## v0.7.10 - 2026-08-12

- Hide the large unaligned-objectives warning list while preserving alignment data, summary metrics, map nodes, and publishing behavior.
- Add a paste-to-draft assistant that recognizes Objective/KR hierarchy, preserves the full pasted text, previews corrections, and supports append or confirmed replacement without auto-publishing.

## v0.7.9 - 2026-08-12

- Redesign My Action Center around a prioritized update, risk, alignment, and review inbox, with clear owner-mapping guidance.
- Add a permission-aware KR entry page that routes members and management roles into the correct editor scope.
- Hide weekly progress entry points, history, overdue actions, and stale-update health warnings when weekly progress is disabled, while preserving existing progress data and APIs.
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
