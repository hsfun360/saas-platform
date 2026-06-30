# Working Conventions

These are general working agreements for this project.
They apply across writing, git, technical decisions, bug fixing, and testing.
They sit alongside the Angular/TypeScript rules in [`coding-standards.md`](coding-standards.md).

## Writing & Markdown

- Never use the em dash ("-").
  Use a plain hyphen ("-") instead.
- When writing or substantially editing long Markdown files, put each full sentence on its own line.
  Preserve normal Markdown structure (headings, lists, code blocks), but do not wrap multiple sentences onto one physical line.
  This keeps diffs readable: a one-word edit touches one line, not a whole paragraph.

## Git & Generated Files

- When writing commit messages, never auto-add an agent name as co-author.
  Do not append a `Co-Authored-By` trailer for the AI agent.
- Never manually modify `CHANGELOG.md` or any file marked as auto-generated.
  Change the source that produces them instead.

## Technical Decisions

- When making technical decisions, do not give much weight to development cost.
  Prefer quality, simplicity, robustness, scalability, and long-term maintainability instead.

## Bug Fixing

- When doing bug fixes, always start by reproducing the bug in an end-to-end setting, as closely aligned with how a real end user uses the product as you can.
  This makes sure you find the real problem, so the fix will actually solve it rather than mask a symptom.

## Testing & Engineering Excellence

- When end-to-end testing a product, be picky about the UI you see and obsess over pixel perfection.
  If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along the way.
- Apply that same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.
