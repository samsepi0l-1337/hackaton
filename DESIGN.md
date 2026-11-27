# DESIGN.md

The design system of the web app. The service name is **해보까**. Use it everywhere (title, brand, logo label "해보까 홈", footer). Never write the old name "부산 청년 창업 길잡이".

Source of truth: `apps/web/src/styles/tokens.css` (tokens) and `apps/web/src/styles/app.css` (rules). The reference capture is in `apps/web/design-ref/`. Target viewport is desktop, 1440x900. Narrow screens only have to stay usable.

## Tokens

Colours:
- Page background `--color-bg` #f7f9fc. Surface `--color-surface` #fff. Text `--color-text` #1b1f27. Muted `--color-muted` #667085. Border `--color-border` #e1e5eb.
- Primary `--color-primary` #1d5fd6, soft `--color-primary-soft` #e8f0fe. Portal blue `--portal-blue` #2568e9 (main buttons). Ink `--portal-ink` #192b42 (portal text). Panel line `--panel-line` #d5e1f3 (pane border).
- Status: danger #d92d20 / soft #fdecea, warn #b54708 / soft #fff4e5, ok #067647 / soft #e7f6ee.
- Tile colours (classes): blue #e6efff / #3579ce, teal #ddf6ee / #098869, coral #fff0e5 / #d87538, violet #f0eaff / #8562c7 (background / icon).
- Other fixed colours: strip #edf2f7, brand accent #124c85, shortcut pane #e6f3fe, row grey #eff3f8, chip border #d6e0ed.

Fonts: Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif (`--font-base`). Base 16px, line height 1.55. Sizes: sm 13, base 16, lg 18, xl 24, hero 26. Portal text uses 12 to 24px. Letter spacing is tight: -.035em on the dashboard, -.055em on pane titles, -.07em on the banner title. Korean text keeps words together (`word-break: keep-all`).

Spacing: 4, 8, 12, 16, 24, 32 (`--space-1` to `--space-6`). Portal gaps: 22 (top grid), 15 (lower grid), 14 (stacks), 10 (tiles).

Radius: 6 (sm), 12 (md), 999 (pill). Pane 17. Tile 9. Row 10. Banner 16. Process cell 11.

Shadow: `--shadow` 0 1px 3px rgba(16,24,40,.1) for cards. Pane 0 3px 9px #183e6508. Menu panel 0 10px 25px #203d631a. Search pill 0 5px 11px #216ece24.

## Layout grid

- Content width: `.portal-width` is min(1280px, 90%), centred. Other pages still use `.container` (max 960px, padding 16px).
- Main page `.dashboard` has top margin 24px.
- `.top-grid`: 2 columns, 2.06fr / 1fr, gap 22. Left is `.primary-stack` (search + shortcuts), right is the account panel.
- `.lower-grid`: 3 columns, .79fr / 1.215fr / 1fr, gap 15, top margin 15. Columns: stage pane, `.middle-stack` (service + fields), `.right-stack` (deadlines + banner, 6px left margin).
- `.shortcut-grid`: 4 columns, gap 10. `.account-grid`: 2 columns, gap 11. `.process-list`: 3 columns, gap 7.
- Below 1100, 860 and 700px the CSS only narrows and stacks columns. No separate mobile design.

## Shell

- Skip link `.skip` ("본문 바로가기"), shown on focus.
- Strip `.civic-strip`: grey bar, 2px top border #647180, 32px high, `.sea-mark` icon (≈) then one line. Text: "부산 청년 창업 지원 정보를 공식 출처와 함께 안내합니다."
- Masthead `.masthead` (93px): left `.brand` (logo `/brand.svg` 49px, name in `<b>` with colour #124c85, weight 800, size 22 to 31px). Right `.mast-actions`: `.utility` (이용 방법, divider, K-Startup external) above `.account-actions` (AI 멘토, 공고 검색, 내 정보, 팀 통계; 20px icon + 16px bold text).
- Nav `.portal-nav`: border top and bottom #cdd4df, `.nav-group` x4 (지원사업, AI 창업 상담, 창업 가이드, 내 활동). Button 17px bold, min height 53. First button has a grey tint #eef3f8.
- Menu `.menu-panel`: under the button, min width 190, white, radius 0 0 12 12. Opens on click and on hover. Closes on Escape, outside click, link click and route change.
- Footer `.footer-inner`: brand line (strong 16px), data-use sentence, source line with licence link.
- Mobile only: `.mobile-menu` button and `.mobile-account` links (hidden on desktop).

## Components

- Pane `.pane`: white, 1px `--panel-line` border, radius 17, padding 17 to 25. Title row `.pane-title` (h2 18 to 22px, right side icon or `.text-action`). Variants: `.shortcuts` (blue-tinted), `.account-panel`, `.stage-panel`, `.service-panel`, `.fields-panel`, `.deadline-panel`.
- Search `.search-pill`: gradient border (green to blue), inner `.search-input` 64px high with the gull image (`/images/gull.png`), right link "AI 창업멘토". Hint line below, 14px.
- Tile `.shortcut-grid > a`: white, radius 9, min height 50, bold 14 to 16px, label left, `.tile-icon` (26x28, radius 8) right with colour class `blue|teal|coral|violet`.
- Account link `.account-grid a`: 36px round icon on #eff3f8 plus bold 15px label. Main button `.btn.primary.block` inside `.account-panel` is portal blue, radius 7, 48px high.
- Stage tabs `.stage-tabs button`: emoji in a 41x42 rounded square, label 13px. Active uses `aria-pressed="true"`.
- Stage links `.stage-links a`: grey rows #eff3f8, radius 10, label left, chevron right.
- Process `.process-list li`: grey cell, icon, bold title 15px, small text 13px.
- Start link `.start-link`: pale blue bar #eaf1ff, bold, centred.
- Chip `.field-links a`: pill, 1px #d6e0ed border, 14px. (App chips on other pages: `.chip`, `.chip.selected`.)
- Badge `.badge`: 13px bold, radius 6. D-n badge is `.badge.dday-soon` (red, 7 days or less), `.dday-always` (blue), `.dday-closed` (grey). Inside `.deadline-list` it is 12px.
- Live stats `.live-stats`: grey-blue bar, bold blue numbers 17px, divider `<i>`.
- List row `.deadline-list li`: title (strong 15px, one line with ellipsis) and badge on the first line; small meta (12px) and "원문" link on the second. 1px divider #e7edf3.
- Banner `.type-banner`: min height 169, radius 16, photo `/images/busan.jpg` with a green-white gradient from the left, white pill label, 24px title, 14px note.
- Buttons `.btn`, `.btn.primary`, `.btn.danger`, `.btn.ghost`, `.btn.small`, `.btn.block`. Cards `.card`. Forms `.field`, `.input`. States `.state`, `.skeleton`.

## States

- Link hover (account actions, stage links, account links, chips, text actions, deadline links): colour #155bc1 and underline.
- Tile hover: 1px inset #92b9eb ring, text #1652a4.
- Nav button hover and open: background #e6efff, text #175ac7.
- Menu item hover: background #edf4ff.
- Active stage tab: bold blue text #1859b8, 2px teal outline (#179d96) on the icon, pale green fill.
- Focus: 3px #075ec7 outline, 3px offset, on links, buttons and inputs.
- Expand button toggles "펼쳐보기" and "접기". Four tiles by default, eight when open.
- Loading and error in the deadline pane keep the list height with three skeleton rows.

## Icons

Inline SVG from `PortalIcons.tsx`. 24x24 box, no fill, `currentColor` stroke, width 1.7, round caps and joins. Sizes: 12 to 15 in text, 18 to 20 in tiles and actions, 25 in search. Colour follows the text. Do not add an icon font or images for icons. Emoji appear only in the stage tabs.

## Restyling the detail pages

- Keep the shell as is. Page content sits in `.container` (or `.portal-width`) inside `<main>`.
- Use the tokens and the classes above. Do not add new colours, radii or shadows. Take a pane for a group of content, a `.card` for a repeated item.
- Page title h1 24px, section titles h2 18px (22px inside a pane).
- Rows and lists use the list-row look (grey or divider rows, small meta line). Links use ink colour and blue on hover.
- Status uses the badge colours. Primary actions use `.btn.primary`. Main call to action on a pane uses portal blue.
- Keep Korean copy short. Keep words together.
- Desktop first at 1440x900. Check narrow widths only for overflow.
