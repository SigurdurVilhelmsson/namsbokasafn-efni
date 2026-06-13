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
| POST | `/books/:slug/fetch-source` |
| GET | `/books` |
| GET | `/books/data-status` |
| GET | `/books/:slug` |
| GET | `/books/:slug/chapters/:chapter` |
| POST | `/books/:slug/generate-data` |
| GET | `/users` |
| GET | `/users/roles` |
| GET | `/users/:id` |
| POST | `/users` |
| PUT | `/users/:id` |
| DELETE | `/users/:id` |
| POST | `/users/:id/books` |
| DELETE | `/users/:id/books/:bookSlug` |
| GET | `/users/:id/chapters` |
| POST | `/users/:id/chapters` |
| DELETE | `/users/:id/chapters/:book/:chapter` |
| GET | `/assignments/:book` |
| POST | `/assignments/:book/enforcement` |
| POST | `/assignments/:book/:chapter` |
| DELETE | `/assignments/:book/:chapter` |
| GET | `/migrate` |
| POST | `/migrate` |
| GET | `/validate-pipeline` |

## /analytics

| Method | Path |
|--------|------|
| GET | `/stats` |
| GET | `/recent` |
| POST | `/event` |
| GET | `/dashboard-data` |

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
| GET | `/list` |
| GET | `/` |
| GET | `/:bookId` |
| GET | `/:bookId/chapters/:chapter` |
| GET | `/:bookId/chapters/:chapter/files` |
| POST | `/:bookId/chapters/:chapter/files/scan` |
| DELETE | `/:bookId/chapters/:chapter/files` |
| GET | `/:bookId/files/summary` |
| GET | `/:bookId/download` |
| GET | `/:bookId/chapters/:chapter/faithful-count` |
| POST | `/:bookId/chapters/:chapter/import` |
| POST | `/:bookId/chapters/:chapter/import-mt` |

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

## /localization-editor

| Method | Path |
|--------|------|
| GET | `/settings/:book` |
| POST | `/settings/:book` |
| GET | `/review-queue/:book` |
| POST | `/loc-edit/:editId/approve` |
| POST | `/loc-edit/:editId/reject` |
| GET | `/:book/chapters` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/:moduleId` |
| POST | `/:book/:chapter/:moduleId/save` |
| POST | `/:book/:chapter/:moduleId/save-all` |
| GET | `/:book/:chapter/:moduleId/pending-edits` |
| GET | `/:book/:chapter/:moduleId/history` |
| GET | `/:book/:chapter/:moduleId/:segmentId/history` |
| POST | `/:book/:chapter/:moduleId/log` |

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

## /pipeline-status

| Method | Path |
|--------|------|
| GET | `/:bookSlug/:chapterNum` |
| POST | `/:bookSlug/:chapterNum/advance` |
| POST | `/:bookSlug/:chapterNum/revert` |
| POST | `/:bookSlug/:chapterNum/lock` |
| DELETE | `/:bookSlug/:chapterNum/lock` |

## /pipeline

| Method | Path |
|--------|------|
| POST | `/inject` |
| POST | `/render` |
| POST | `/run` |
| GET | `/jobs` |
| GET | `/jobs/:jobId` |

## /profile

| Method | Path |
|--------|------|
| GET | `/` |
| PUT | `/` |

## /publication

| Method | Path |
|--------|------|
| GET | `/:bookSlug/:chapterNum/status` |
| GET | `/:bookSlug/:chapterNum/readiness` |
| GET | `/:bookSlug/:chapterNum/modules` |
| POST | `/:bookSlug/:chapterNum/mt-preview` |
| POST | `/:bookSlug/:chapterNum/faithful` |
| POST | `/:bookSlug/:chapterNum/localized` |
| GET | `/:bookSlug/overview` |

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

## /segment-editor

| Method | Path |
|--------|------|
| GET | `/terminology/lookup` |
| GET | `/concordance` |
| GET | `/reviews/:reviewId` |
| GET | `/edit/:editId/comments` |
| GET | `/:book/chapters` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/repetition-report` |
| GET | `/:book/:chapter/:moduleId` |
| POST | `/:book/:chapter/:moduleId/edit` |
| DELETE | `/edit/:editId` |
| POST | `/:book/:chapter/:moduleId/submit` |
| GET | `/reviews` |
| GET | `/review-queue` |
| POST | `/edit/:editId/approve` |
| POST | `/edit/:editId/reject` |
| POST | `/edit/:editId/discuss` |
| POST | `/edit/:editId/unapprove` |
| POST | `/reviews/:reviewId/complete` |
| POST | `/edit/:editId/comment` |
| GET | `/:book/:chapter/:moduleId/terms` |
| GET | `/:book/:chapter/:moduleId/repetitions` |
| GET | `/:book/:chapter/:moduleId/stats` |
| GET | `/:book/:chapter/:moduleId/apply-status` |
| POST | `/:book/:chapter/:moduleId/apply` |
| POST | `/:book/:chapter/:moduleId/apply-and-render` |
| POST | `/:book/:chapter/apply-all` |
| GET | `/:book/:chapter/:moduleId/versions` |
| GET | `/:book/:chapter/:moduleId/versions/:version` |
| POST | `/:book/:chapter/:moduleId/restore/:version` |
| GET | `/:book/:chapter/:moduleId/segment-history/:segmentId` |
| GET | `/:book/:chapter/:moduleId/preview` |

## /status

| Method | Path |
|--------|------|
| GET | `/dashboard` |
| GET | `/activity/timeline` |
| GET | `/activity/types` |
| GET | `/analytics` |
| GET | `/meeting-agenda` |
| GET | `/:book/editorial-progress` |
| GET | `/:book` |
| GET | `/:book/summary` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/sections` |
| GET | `/:book/scan` |
| POST | `/:book/sync` |
| POST | `/:book/:chapter/sync` |

## /suggestions

| Method | Path |
|--------|------|
| POST | `/scan/:sectionId` |
| POST | `/scan-book/:bookSlug` |
| GET | `/patterns` |
| GET | `/:sectionId` |
| GET | `/:sectionId/stats` |
| POST | `/:id/accept` |
| POST | `/:id/reject` |
| POST | `/:id/modify` |
| POST | `/:sectionId/bulk` |
| POST | `/:sectionId/sync-log` |

## /terminology

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/lookup` |
| GET | `/stats` |
| GET | `/review-queue` |
| GET | `/subjects` |
| GET | `/categories` |
| GET | `/export` |
| GET | `/:id` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |
| POST | `/:headwordId/translations` |
| PUT | `/translations/:id` |
| DELETE | `/translations/:id` |
| POST | `/translations/:id/approve` |
| POST | `/translations/:id/dispute` |
| POST | `/:id/discuss` |
| POST | `/import/csv` |
| POST | `/import/glossary` |
| POST | `/import/excel` |
| POST | `/import/key-terms` |
| POST | `/import/existing-glossary` |
| POST | `/check-consistency` |

## /views

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/login` |
| GET | `/editor` |
| GET | `/progress` |
| GET | `/terminology` |
| GET | `/reviews` |
| GET | `/localization` |
| GET | `/library` |
| GET | `/admin` |
| GET | `/assignments` |
| GET | `/profile` |
| GET | `/feedback` |
| GET | `/my-work` |
| GET | `/segment-editor` |
| GET | `/status` |
| GET | `/review-queue` |
| GET | `/localization-editor` |
| GET | `/localization-review` |
| GET | `/books` |
| GET | `/books/:bookId` |
| GET | `/chapter` |
| GET | `/images` |
| GET | `/admin/users` |
| GET | `/admin/books` |
| GET | `/admin/feedback` |
| GET | `/analytics` |
| GET | `/workflow` |
| GET | `/dashboard` |
| GET | `/pipeline` |
| GET | `/pipeline/:bookSlug/:chapterNum` |
| GET | `/issues` |
| GET | `/for-teachers` |

