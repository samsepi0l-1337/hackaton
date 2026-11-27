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
- Detail pages: `.main > .container` has 30px top padding (not 16px) so content clears the nav bar. Keep it.
- Main page `.dashboard` has top margin 24px.
- Collapsed shortcuts pane is content-height with the design padding; `.search-area` takes the spare height (content centred) so both top columns end on one line. Expanded looks as designed.
- `.top-grid`: 2 columns, 2.06fr / 1fr, gap 22. Left is `.primary-stack` (search + shortcuts), right is the account panel.
- `.lower-grid`: 3 columns, .79fr / 1.215fr / 1fr, gap 15, top margin 15. Columns: stage pane, `.middle-stack` (service + fields), `.right-stack` (deadlines + banner, 6px left margin).
- `.shortcut-grid`: 4 columns, gap 10. `.account-grid`: 2 columns, gap 11. `.process-list`: 3 columns, gap 7.
- Below 1100, 860 and 700px the CSS only narrows and stacks columns. No separate mobile design.

## Shell

- Skip link `.skip` ("본문 바로가기"), shown on focus.
- Strip `.civic-strip`: grey bar, 2px top border #647180, 32px high, `.sea-mark` icon (≈) then one line. Text: "부산 청년 창업 지원 정보를 공식 출처와 함께 안내합니다."
- Masthead `.masthead` (93px): left `.brand` (logo `/brand.svg` 49px, name in `<b>` with colour #124c85, weight 800, size 22 to 31px). Right `.mast-actions`: `.utility` (이용 방법, divider, K-Startup external) above `.account-actions` (AI 멘토, 공고 검색, 로그인 before sign-in or 내 정보 after, 팀 통계; 20px icon + 16px bold text).
- Nav `.portal-nav`: border top and bottom #cdd4df, `.nav-group` x4 (지원사업, AI 창업 상담, 창업 가이드, 내 활동). Button 17px bold, min height 53. First button has a grey tint #eef3f8. 'AI 창업 상담' is not a dropdown: a plain nav item without chevron that goes straight to `/mentor` (a `Link` with class `.nav-direct`, styled like the group buttons; it preloads the page on hover and focus and has `aria-current` on `/mentor`). The other three open a menu. The masthead account link reads "로그인" when signed out and "내 정보" when signed in. On `/login` the "로그인" link keeps the existing `next` and is the current page. The reset on the consult result screen deletes the server exploration record and clears this browser's `gil.*` storage (including the type-test result); it does not delete the account or restore the consult quota.
- Menu `.menu-panel`: under the button, min width 190, white, radius 0 0 12 12. Opens on click and on hover. Closes on Escape, outside click, link click and route change.
- Footer `.footer-inner`: brand line (strong 16px), data-use sentence (submitted consult input and 내 정보 are stored on the server and consult text may go to Upstage (외부 AI); the result-screen reset deletes the server exploration record when one exists and clears this browser's consult and test data; account deletion removes server data, browser data stays until cleared), source line with licence link.
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
- Loading (deadline pane): three skeleton rows keep the list height, `aria-busy` on the list. No message.
- Error (deadline pane): the skeleton rows go away. A `.state` block with `role="alert"` says what failed ("마감 공고를 불러오지 못했어요. 다시 시도해 주세요.") and a "다시 시도" button reloads. A response that is not the expected shape (HTML fallback, `{}`) counts as an error, checked in `api.home`.
- Empty (deadline pane): a muted line says there are no closing-soon notices and points to 전체 지원공고.
- Current page: links to the current route carry `aria-current="page"` (bold blue in the shell). Only a link whose path and query match is current.
- Menu: hover previews, click pins, focus inside the panel keeps it open. Escape restores focus to the group button only when focus was inside that group.
- Hover and active states change colour only. No motion; `prefers-reduced-motion` turns off any transition.
- Main page links: each destination appears at most twice (shell links not counted). Labels name what the destination shows. `/programs` takes type, stage, sort (fit, recent, popular, deadline; deadline is the default) and q. Stage tabs are idea stages, not business age.

## Guide page (/guide)

- "이용 방법" page, linked from the masthead utility link and the 창업 가이드 menu. Lazy-loaded, CSS in `pages-guide.css`, scoped under `.guide-page`.
- `.portal-width` (max 960px), h1, a lead line, then `.pane` blocks. Numbered `.guide-steps` only for the AI consult sequence. Other content uses `.guide-rows` (grey rows, radius 10, bold title, 14px text) with links to each page.
- Copy states only what the app does (labels and limits come from `@gil/shared`). No new colours, radii or shadows.

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
