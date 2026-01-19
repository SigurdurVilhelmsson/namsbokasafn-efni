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

## /modules

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/books` |
| GET | `/book/:bookId` |
| GET | `/chapter/:chapter` |
| GET | `/:moduleId` |

## /notifications

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| POST | `/:id/read` |
| POST | `/read-all` |

## /process

| Method | Path |
|--------|------|
| POST | `/cnxml` |
| POST | `/module/:moduleId` |
| GET | `/jobs/:jobId` |
| GET | `/jobs` |

## /reviews

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| GET | `/:id` |
| POST | `/:id/approve` |
| POST | `/:id/changes` |

## /status

| Method | Path |
|--------|------|
| GET | `/:book` |
| GET | `/:book/summary` |
| GET | `/:book/:chapter` |

## /sync

| Method | Path |
|--------|------|
| GET | `/config` |
| POST | `/prepare` |
| POST | `/create-pr` |
| GET | `/status/:prNumber` |
| GET | `/prs` |

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

