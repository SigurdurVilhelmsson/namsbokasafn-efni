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

### 3. Overdue Assignments (`/assignments`)
- [ ] Check for assignments past due date
- [ ] Contact editors with overdue work
- [ ] Reassign if editor is unavailable

### 4. Pending Reviews (`/reviews`)
- [ ] Complete any reviews pending >3 days
- [ ] Prioritize reviews blocking publication

### 5. Team Communications
- [ ] Respond to editor questions
- [ ] Update team on priorities if needed

## Weekly Team Coordination

### Weekly Meeting Preparation
1. Go to `/meetings` to generate meeting agenda
2. Review:
   - Decisions made this week
   - Issues needing team discussion
   - Chapters ready for next stage
3. Share agenda with team 24h before meeting

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
   - Next week's assignments
   - Capacity discussion
   - Risk identification

### Post-Meeting Actions
1. Record decisions at `/decisions`
2. Update assignments at `/assignments`
3. Resolve marked issues at `/issues`
4. Send meeting summary to team

## Approval Gates and Authority Matrix

| Action | Who Can Do It | Where |
|--------|--------------|-------|
| Create assignments | Head Editor, Admin | `/assignments` |
| Cancel assignments | Head Editor, Admin | `/assignments` |
| Approve translations | Head Editor, Editor | `/reviews` |
| Request changes | Head Editor, Editor | `/reviews` |
| Resolve QUICK_FIX issues | Any Editor | `/issues` |
| Resolve TEAM_DISCUSSION issues | Head Editor only | `/issues` |
| Make terminology decisions | Head Editor (after team input) | `/decisions` |
| Publish MT preview | Head Editor, Admin | `/chapter` |
| Publish faithful translation | Head Editor, Admin | `/chapter` |

## Assignment Best Practices

### Creating Assignments
1. Check editor workload before assigning:
   - Go to `/api/assignments/overview`
   - Verify editor has capacity (target: 2-3 active chapters max)
2. Set realistic due dates:
   - Linguistic review: 1-2 weeks per chapter
   - Localization: 1 week per chapter
3. Add helpful notes:
   - Priority level
   - Special considerations
   - Related decisions to follow

### Reassigning Work
1. Communicate with current assignee first
2. Cancel existing assignment with reason
3. Create new assignment
4. Update any related deadlines

### Handling Blocked Work
When work is blocked:
1. Identify the blocking issue in `/chapter`
2. Determine if you can resolve it:
   - Terminology: Make decision at `/decisions`
   - Policy: Discuss at weekly meeting
   - Technical: Contact development team
3. Document the resolution
4. Notify affected editors

## Escalation Procedures

### Level 1: Editor Question (same day)
- Editor posts question in comments
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
3. Stage 1 (EN Markdown) can continue
4. Contact malstadur.is support
5. Resume normal workflow when service restored

### If a Team Member is Unavailable
1. Check their current assignments at `/assignments`
2. Determine urgency of each assignment
3. Reassign critical work immediately
4. Hold non-urgent work for their return

## Useful URLs

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/status` | Overall progress |
| My Work | `/my-work` | Individual editor view |
| Chapter Control | `/chapter` | Single chapter management |
| Assignments | `/assignments` | Team assignment overview |
| Reviews | `/reviews` | Pending reviews |
| Issues | `/issues` | Issue tracker |
| Decisions | `/decisions` | Decision log |
| Terminology | `/terminology` | Term database |
| Meetings | `/meetings` | Meeting agenda generator |

## API Quick Reference

```bash
# List all assignments
curl /api/assignments

# Team overview
curl /api/assignments/overview

# Create assignment
curl -X POST /api/assignments \
  -H "Content-Type: application/json" \
  -d '{"book":"efnafraedi","chapter":1,"stage":"linguisticReview","assignedTo":"username"}'

# Cancel assignment
curl -X DELETE /api/assignments/{id}

# Get chapter issues
curl /api/issues?book=efnafraedi&chapter=1&status=pending
```

## Contact Information

- **Technical Issues**: File issue at GitHub repository
- **Content Questions**: Post at weekly team meeting
- **Urgent Matters**: Contact project lead directly

---

*Last updated: January 2026*
