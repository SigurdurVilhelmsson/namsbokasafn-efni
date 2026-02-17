# Admin Guide - Námsbókasafn Translation Workflow

This guide is for the **Head Editor** (aðalritstjóri) who manages the translation team and workflow.

## Daily Monitoring Checklist

Start each day by checking these items:

### 1. Dashboard Review (`/status`)
- [ ] Check overall chapter progress
- [ ] Identify any chapters with stalled progress
- [ ] Note chapters nearing publication readiness

### 2. Blocked Items (`/chapter`)
- [ ] Review chapters with BLOCKED issues
- [ ] Make terminology decisions if needed
- [ ] Unblock work by resolving critical issues

### 3. Pending Reviews (`/review-queue`)
- [ ] Check SLA summary for review status across all chapters
- [ ] Complete reviews pending >2 days (SLA target)
- [ ] Address critical (red) reviews immediately
- [ ] Prioritize reviews blocking publication

**SLA Status Colors:**
| Color | Status | Days | Action |
|-------|--------|------|--------|
| Green | On Track | 0-2 | Normal processing |
| Yellow | At Risk | 2-3 | Prioritize today |
| Orange | Overdue | 3-5 | Process immediately |
| Red | Critical | 5+ | Drop everything, handle now |

### 4. Team Communications
- [ ] Respond to editor questions
- [ ] Update team on priorities if needed

## Weekly Team Coordination

### Meeting Topics
1. **Progress Review** (5 min)
   - Chapters completed
   - Chapters blocked
   - Upcoming deadlines

2. **Issue Resolution** (15 min)
   - BOARD_REVIEW items requiring consensus
   - Terminology decisions pending
   - Localization policy questions

3. **Planning** (10 min)
   - Next week's focus areas
   - Capacity discussion
   - Risk identification

### Post-Meeting Actions
1. Record decisions in shared document (Google Docs / GitHub Issues)
2. Resolve marked issues at `/issues`
3. Send meeting summary to team

## Approval Gates and Authority Matrix

| Action | Who Can Do It | Where |
|--------|--------------|-------|
| Approve translations | Head Editor, Editor | `/segment-editor` (review mode) |
| Request changes | Head Editor, Editor | `/segment-editor` (review mode) |
| Resolve QUICK_FIX issues | Any Editor | `/issues` |
| Resolve TEAM_DISCUSSION issues | Head Editor only | `/issues` |
| Make terminology decisions | Head Editor (after team input) | `/terminology` |
| Publish MT preview | Head Editor, Admin | `/chapter` → Pipeline buttons |
| Publish faithful translation | Head Editor, Admin | `/chapter` → Pipeline buttons |
| Prepare TM files | Head Editor, Admin | `/chapter` → "Undirbúa TM" button |

## Editor Workflow

### Assigning Work
1. Tell editors which chapters/modules to review via team communication channel
2. Editors log in at `/segment-editor`, select the assigned book/chapter/module
3. Review progress at `/review-queue` (shows all pending submissions across chapters)
4. Use `/chapter` for single-chapter overview with section progress

### Capacity Guidelines

| Guideline | Default | Description |
|-----------|---------|-------------|
| Weekly chapters | 2 | Max new assignments per week |
| Concurrent max | 3 | Max active chapters at once |
| Hours/week | 10 | Available translation hours |

### Handling Blocked Work
When work is blocked:
1. Identify the blocking issue in `/chapter`
2. Determine if you can resolve it:
   - Terminology: Decide at `/terminology` or in team meeting
   - Policy: Discuss at weekly meeting
   - Technical: Contact development team
3. Document the resolution
4. Notify affected editors

### Understanding Split Files

When a section exceeds 18,000 characters, it's automatically split for machine translation:
- **Naming**: `5-1(a).is.md`, `5-1(b).is.md`, etc.
- **Editor view**: Shows "Part X of Y" badge with navigation
- **Assignment**: Assign the whole section; editors review each part

**What to tell editors about splits:**
- Each part must be reviewed separately
- Use the prev/next arrows to navigate between parts
- Click the info icon for explanation
- All parts should be completed before submission

## Escalation Procedures

### Level 1: Editor Question (same day)
- Editor posts question in segment editor comments
- Head Editor responds same day
- No formal escalation needed

### Level 2: Blocking Issue (24h)
- Editor marks issue as BLOCKED
- Head Editor reviews within 24h
- Either resolves or escalates to team

### Level 3: Team Decision Needed (next meeting)
- Add to weekly meeting agenda
- Discuss at team meeting
- Record decision and rationale

### Level 4: External Escalation
- Issues requiring subject matter expert
- Contact OpenStax for clarification
- Document in issue tracker

## Risk Management

### Common Risks and Mitigations

| Risk | Early Warning Signs | Mitigation |
|------|-------------------|------------|
| Editor unavailable | No activity for 3+ days | Reassign work, contact backup |
| Deadline at risk | 50%+ work remaining with <3 days left | Add resources or extend |
| Terminology dispute | Multiple editors disagreeing | Escalate to weekly meeting |
| Quality issues | Many reviews rejected | Provide feedback, offer training |
| Technical problems | MT service down | Use backup process, notify team |

### If malstadur.is is Down
1. Notify team that MT is unavailable
2. Editors can continue reviewing existing MT output
3. Stage 1 (EN segments) can continue
4. Contact malstadur.is support
5. Resume normal workflow when service restored

## Useful URLs

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/status` | Overall progress |
| My Work | `/my-work` | Individual editor view |
| Chapter Control | `/chapter` | Single chapter management + TM prep |
| Review Queue | `/review-queue` | Cross-chapter review overview with SLA |
| Reviews | `/reviews` | Detailed review dashboard |
| Issues | `/issues` | Issue tracker |
| Terminology | `/terminology` | Term database |
| Segment Editor | `/segment-editor` | Pass 1 editing and review |
| Localization Editor | `/localization-editor` | Pass 2 editing |

## API Quick Reference

```bash
# Get chapter status
curl /api/status/efnafraedi/1

# Get review queue
curl /api/segment-editor/review-queue?book=efnafraedi

# Get chapter issues
curl /api/issues?book=efnafraedi&chapter=1&status=pending

# Run inject + render pipeline
curl -X POST /api/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"book":"efnafraedi","chapter":1,"track":"faithful"}'

# Prepare TM files for a chapter
curl -X POST /api/pipeline/prepare-tm \
  -H "Content-Type: application/json" \
  -d '{"book":"efnafraedi","chapter":1}'

# Check pipeline job status
curl /api/pipeline/jobs/{jobId}
```

## Contact Information

- **Technical Issues**: File issue at GitHub repository
- **Content Questions**: Post at weekly team meeting
- **Urgent Matters**: Contact project lead directly

---

*Last updated: February 2026*
