# API Routes

*Auto-generated from server/routes/*

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

## /process

| Method | Path |
|--------|------|
| POST | `/cnxml` |
| POST | `/module/:moduleId` |
| GET | `/jobs/:jobId` |
| GET | `/jobs` |

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


Generated: 2026-01-18T12:53:21.603Z
