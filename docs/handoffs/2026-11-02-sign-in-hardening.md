# Sign-in and permissions hardening — handoff

> **Handoff, banner-dated 2026-11-02.** Evidence and a work list, never status: status lives in the
> campaign register's ⏩ RESUME block (the 2026-11-02 security-review entry) and on [USER]'s private
> dashboard.

## What happened

On 2026-11-02 a read-only review looked at Ritstjóri's Microsoft sign-in, sessions and
permissions. It was prompted by the breach of Inna, where attackers reached teacher accounts
through its Microsoft login, raised their privileges and changed records. The review found work
to do on this server.

## 🔴 The findings stay off this repo until they are fixed

**This repository is public.** The detailed findings (what is wrong, where, and how it could be
used) are held by [USER] on a private dashboard:
<https://claude.ai/artifact/1bAa1RTNZ1JmEeP53av4vN>. It also holds the task list, which says what
[USER] does and what Claude may do once approved.

Until the fixes are deployed:

- Do not write the findings into this repo, a commit message, a pull request, an issue or a code
  comment. Describe a fix by what it adds ("bind admin accounts to the Microsoft account ID"), not by
  what it closes.
- Do not start a task until [USER] has approved it on the dashboard. A session reads approvals
  with the `ArtifactData` tool: `list` on collection `tasks` of the dashboard URL. A Claude task
  whose `status` is `approved` may start; mark it `in-progress` and then `done`, with the pull
  request's URL in its `pr` field.
- Each task below is its own draft pull request.

## The work, by area

Claude's tasks (each waits for [USER]'s approval):

1. Identity binding for privileged and invited accounts.
2. ID-token validation, and a startup check on the tenant setting.
3. An audit log of sign-ins and administrative changes, kept in the database.
4. Session freshness: changes to a user take effect at once, and sessions can be ended.
5. Request and redirect validation on the sign-in and write routes.
6. Object-level permission checks on some section, terminology, feedback and activity routes.
7. A batch of smaller hardening fixes.
8. A read-only check of the reader site (namsbokasafn-vefur), which bears on item 5.
9. Once all of this is deployed: the full write-up into the repo, with a decision record.

[USER]'s tasks: checks on the production configuration and database, three questions for
Reiknistofnun HÍ about the Menntaský tenant, three policy rulings, the approvals, and deploying.
The exact steps and commands are on the dashboard.

## Notes for the implementing session

- The review was read-only and changed no code. It was made against `main` at `a8807f84`.
- Item 1 adds one dependency for token validation, so the lockfile changes: use npm 10, as
  § Tech Stack requires.
- `npm audit` found nothing high or critical in either tree. The git history (4,782 commits) holds
  no committed credentials.
- Deploying from dev puts prod's content backup behind until the next deploy (CLAUDE.md § Content
  delivery).
