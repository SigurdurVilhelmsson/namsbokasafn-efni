# API Routes

*Auto-generated from server/routes/*

## /activity

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/recent` |
| GET | `/user/:userId` |
| GET | `/book/:book` |
| GET | `/section/:book/:chapter/:section` |
| GET | `/my` |
| GET | `/types` |

## /admin

| Method | Path |
|--------|------|
| GET | `/catalogue` |
| GET | `/catalogue/predefined` |
| POST | `/catalogue/sync` |
| POST | `/catalogue/add` |
| POST | `/books/register` |
| GET | `/books` |
| GET | `/books/:slug` |
| GET | `/books/:slug/chapters/:chapter` |
| GET | `/users` |
| GET | `/users/:id` |
| POST | `/users` |
| PUT | `/users/:id` |
| DELETE | `/users/:id` |
| POST | `/users/:id/books` |
| DELETE | `/users/:id/books/:bookSlug` |
| GET | `/users/roles` |
| POST | `/migrate` |

## /analytics

| Method | Path |
|--------|------|
| GET | `/stats` |
| GET | `/recent` |
| POST | `/event` |
| GET | `/dashboard-data` |

## /assignments

| Method | Path |
|--------|------|
| GET | `/capacity` |
| GET | `/capacity/:username` |
| PUT | `/capacity/:username` |
| GET | `/check-capacity` |
| GET | `/` |
| GET | `/overview` |
| GET | `/:id` |
| POST | `/bulk/assign` |
| PUT | `/bulk/update` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |

## /auth

| Method | Path |
|--------|------|
| GET | `/status` |
| GET | `/login` |
| GET | `/callback` |
| GET | `/me` |
| POST | `/logout` |
| GET | `/roles` |

## /books

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/:bookId` |
| GET | `/:bookId/chapters/:chapter` |
| GET | `/:bookId/chapters/:chapter/files` |
| POST | `/:bookId/chapters/:chapter/files/scan` |
| POST | `/:bookId/chapters/:chapter/generate` |
| DELETE | `/:bookId/chapters/:chapter/files` |
| GET | `/:bookId/files/summary` |
| GET | `/:slug/download` |
| POST | `/:bookId/chapters/:chapter/import` |

## /deadlines

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/calendar` |
| GET | `/stats` |
| GET | `/alerts` |

## /decisions

| Method | Path |
|--------|------|
| GET | `/types` |
| GET | `/stats` |
| GET | `/related` |
| GET | `/highlights` |
| GET | `/recent` |
| GET | `/` |
| GET | `/:id` |
| GET | `/by-issue/:issueId` |
| POST | `/` |

## /editor

| Method | Path |
|--------|------|
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/:section` |
| POST | `/:book/:chapter/:section/save` |
| POST | `/:book/:chapter/:section/submit` |
| GET | `/:book/:chapter/:section/history` |
| GET | `/history/:historyId` |
| POST | `/:book/:chapter/:section/restore/:historyId` |
| GET | `/section/:sectionId` |
| POST | `/section/:sectionId/save` |
| POST | `/section/:sectionId/submit-review` |
| POST | `/section/:sectionId/submit-localization` |
| GET | `/:book/:chapter/:section/notes` |
| POST | `/:book/:chapter/:section/notes` |
| DELETE | `/:book/:chapter/:section/notes` |
| GET | `/notes/all` |
| POST | `/:book/:chapter/:section/notes/pin` |
| POST | `/:book/:chapter/:section/presence` |
| DELETE | `/:book/:chapter/:section/presence` |
| GET | `/:book/:chapter/:section/presence` |
| DELETE | `/presence/me` |

## /feedback

| Method | Path |
|--------|------|
| GET | `/types` |
| POST | `/` |
| GET | `/` |
| GET | `/stats` |
| GET | `/open` |
| GET | `/:id` |
| POST | `/:id/status` |
| POST | `/:id/resolve` |
| POST | `/:id/priority` |
| POST | `/:id/assign` |
| POST | `/:id/respond` |

## /images

| Method | Path |
|--------|------|
| GET | `/:book` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/:id` |
| POST | `/:book/:chapter/:id/status` |
| POST | `/:book/:chapter/:id/upload` |
| GET | `/:book/:chapter/:id/download` |
| POST | `/:book/:chapter/init` |
| POST | `/:book/:chapter/:id/approve` |

## /issues

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/stats` |
| GET | `/session/:sessionId` |
| POST | `/session/:sessionId/:issueId/resolve` |
| GET | `/:id` |
| POST | `/:id/resolve` |
| POST | `/batch-resolve` |
| POST | `/auto-fix` |
| POST | `/report` |

## /localization

| Method | Path |
|--------|------|
| GET | `/:sectionId` |
| POST | `/:sectionId/log/add` |
| PUT | `/:sectionId/log/:entryId` |
| DELETE | `/:sectionId/log/:entryId` |
| POST | `/:sectionId/log/save` |
| POST | `/:sectionId/submit` |
| POST | `/:sectionId/approve` |
| POST | `/:sectionId/request-changes` |
| GET | `/stats` |

## /matecat

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/config` |
| POST | `/projects` |
| GET | `/projects/:id/status` |
| GET | `/jobs/:id/stats` |
| GET | `/jobs/:id/urls` |
| GET | `/jobs/:id/download` |
| GET | `/projects` |
| POST | `/projects/:id/poll` |

## /meetings

| Method | Path |
|--------|------|
| GET | `/agenda` |
| GET | `/agenda/preview` |

## /modules

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/books` |
| GET | `/book/:bookId` |
| GET | `/chapter/:chapter` |
| GET | `/:moduleId` |

## /my-work

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/today` |
| GET | `/summary` |

## /notifications

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| POST | `/:id/read` |
| POST | `/read-all` |
| GET | `/preferences` |
| PUT | `/preferences` |

## /process

| Method | Path |
|--------|------|
| POST | `/cnxml` |
| POST | `/chapter/:chapter` |
| POST | `/module/:moduleId` |
| GET | `/jobs/:jobId` |
| GET | `/jobs` |

## /publication

| Method | Path |
|--------|------|
| GET | `/:bookSlug/:chapterNum/status` |
| GET | `/:bookSlug/:chapterNum/readiness` |
| POST | `/:bookSlug/:chapterNum/mt-preview` |
| POST | `/:bookSlug/:chapterNum/faithful` |
| POST | `/:bookSlug/:chapterNum/localized` |
| GET | `/:bookSlug/overview` |

## /reports

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/weekly` |
| GET | `/comparison` |

## /reviews

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| GET | `/sla` |
| GET | `/:id` |
| POST | `/:id/approve` |
| POST | `/bulk/approve` |
| POST | `/:id/changes` |

## /sections

| Method | Path |
|--------|------|
| GET | `/:sectionId` |
| POST | `/:sectionId/upload/:uploadType` |
| POST | `/:sectionId/assign-reviewer` |
| POST | `/:sectionId/assign-localizer` |
| POST | `/:sectionId/status` |
| POST | `/:sectionId/submit-review` |
| POST | `/:sectionId/approve-review` |
| POST | `/:sectionId/request-changes` |

## /status

| Method | Path |
|--------|------|
| GET | `/dashboard` |
| GET | `/activity/timeline` |
| GET | `/activity/types` |
| GET | `/:book` |
| GET | `/:book/summary` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/sections` |
| GET | `/:book/scan` |
| POST | `/:book/sync` |
| POST | `/:book/:chapter/sync` |
| GET | `/analytics` |
| GET | `/meeting-agenda` |

## /suggestions

| Method | Path |
|--------|------|
| POST | `/scan/:sectionId` |
| POST | `/scan-book/:bookSlug` |
| GET | `/:sectionId` |
| GET | `/:sectionId/stats` |
| GET | `/patterns` |
| POST | `/:id/accept` |
| POST | `/:id/reject` |
| POST | `/:id/modify` |
| POST | `/:sectionId/bulk` |
| POST | `/:sectionId/sync-log` |

## /sync

| Method | Path |
|--------|------|
| GET | `/config` |
| POST | `/prepare` |
| POST | `/create-pr` |
| GET | `/status/:prNumber` |
| GET | `/prs` |

## /terminology

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/lookup` |
| GET | `/stats` |
| GET | `/review-queue` |
| GET | `/categories` |
| GET | `/:id` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |
| POST | `/:id/approve` |
| POST | `/:id/dispute` |
| POST | `/:id/discuss` |
| POST | `/import/csv` |
| POST | `/import/excel` |
| POST | `/import/key-terms` |
| POST | `/import/existing-glossary` |
| POST | `/check-consistency` |

## /views

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/login` |
| GET | `/workflow` |
| GET | `/issues` |
| GET | `/images` |
| GET | `/editor` |
| GET | `/reviews` |
| GET | `/status` |
| GET | `/dashboard` |
| GET | `/books` |
| GET | `/terminology` |
| GET | `/decisions` |
| GET | `/my-work` |
| GET | `/assignments` |
| GET | `/chapter` |
| GET | `/meetings` |
| GET | `/deadlines` |
| GET | `/reports` |
| GET | `/analytics` |
| GET | `/localization-review` |
| GET | `/feedback` |
| GET | `/admin` |
| GET | `/admin/users` |
| GET | `/admin/books` |
| GET | `/admin/feedback` |
| GET | `/for-teachers` |

## /workflow

| Method | Path |
|--------|------|
| POST | `/start` |
| GET | `/sessions` |
| GET | `/sessions/all` |
| GET | `/:sessionId` |
| POST | `/:sessionId/upload/:step` |
| GET | `/:sessionId/download/:artifact` |
| GET | `/:sessionId/download-all` |
| POST | `/:sessionId/advance` |
| POST | `/:sessionId/cancel` |
| GET | `/:sessionId/errors` |
| POST | `/:sessionId/retry` |
| POST | `/:sessionId/rollback` |
| POST | `/:sessionId/reset` |
| GET | `/:sessionId/recovery` |
| POST | `/assignments` |
| POST | `/assignments/kickoff` |
| GET | `/assignments/workload` |
| GET | `/assignments` |
| GET | `/assignments/mine` |
| POST | `/assignments/:id/complete` |
| GET | `/assignments/matrix` |
| POST | `/assignments/:id/cancel` |

