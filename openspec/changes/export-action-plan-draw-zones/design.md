## Context

The review workspace already renders structured action plans grouped by investment account. Each plan includes a system symbol, `supportLevels`, and `resistanceLevels`. These fields are currently free-form multiline text, but the common useful shape is a price range with strength and optional notes, such as `381-392（中） 长线`.

The export target is a plain text command list that users can paste into a charting script:

```js
draw_zone('MSFT', 381, 392, '支撑: 381-392 (中) 长线')
draw_zone('MSFT', 397, 430, '压力: 397-430 (超强) 突破右侧')
```

## Goals / Non-Goals

**Goals:**

- Add an export affordance to the `个股与资产操作计划` page/step.
- Generate deterministic `draw_zone(...)` commands from currently loaded structured action plans.
- Parse support and resistance ranges from multiline text while preserving strength labels and trailing notes in the command label.
- Let users preview and copy the generated output.
- Keep export behavior local to the frontend and covered by smoke/unit-level frontend tests.

**Non-Goals:**

- Do not add a new backend API or database table.
- Do not persist exported commands.
- Do not attempt to parse arbitrary natural-language trading notes beyond recognizable numeric ranges.
- Do not change the semantics of `supportLevels` or `resistanceLevels`.

## Decisions

### Decision 1: Export from frontend state

Use `state.actionPlans` as the source of truth. The user is exporting exactly what is currently loaded in the action-plan editor, including unsaved edits only after they have been committed into the selected plan state by existing editor behavior.

Alternative considered: add a Worker endpoint that reads plans and exports server-side. This would make the feature harder to iterate, require review-date routing decisions, and not help with current unsaved page state.

### Decision 2: Parse one command per recognizable range line

Each support/resistance textarea is split by line. A line is exportable when it contains a numeric range in one of the common forms:

- `381-392（中） 长线`
- `381 – 392 (中) 长线`
- `381 - 392`

The parser normalizes whitespace, dash variants, and Chinese parentheses. The lower numeric value is exported as the second argument and the upper numeric value as the third argument, regardless of the order typed by the user.

Alternative considered: export the full raw textarea as a single command. This loses separate chart zones and makes multi-zone support/resistance text less useful.

### Decision 3: Preserve strength and notes in the label

The label format is:

```text
<类型>: <下限>-<上限> (<力度>) <备注>
```

Examples:

- `支撑: 381-392 (中) 长线`
- `压力: 397-430 (超强) 突破右侧`

If no strength is present, omit the strength parentheses. If trailing notes remain after the range and strength are removed, append them after one space.

Alternative considered: keep only strength and drop notes. The user explicitly chose to include notes because notes like `长线` and `突破右侧` can make the zone label more useful on the chart.

### Decision 4: Preview before copying

Clicking export opens a lightweight preview dialog with a textarea containing the generated commands and a copy button. If no exportable zones exist, show an empty-state message instead of copying an empty string.

Alternative considered: copy directly on button click. Preview is safer because range parsing can skip malformed lines and users should see the exact output before pasting into chart tooling.

## Risks / Trade-offs

- [Risk] Free-form text may contain ranges that are meaningful to the user but do not match the parser. → Mitigation: skip only unparseable lines, keep the parser focused on visible numeric ranges, and make preview output obvious.
- [Risk] Decimal ranges and mixed punctuation may be common. → Mitigation: support decimal numbers, dash variants, whitespace, and Chinese/English parentheses.
- [Risk] The same symbol may appear in multiple accounts and produce duplicate zones. → Mitigation: export each action-plan row independently; users can remove duplicates from preview if needed. Account names are not added to labels unless explicitly requested later.
- [Risk] Browser clipboard permissions may fail. → Mitigation: keep the textarea selectable so manual copy still works.
