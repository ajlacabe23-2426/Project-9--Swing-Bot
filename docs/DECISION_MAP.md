# Entry/exit decision and code map

Open the local `/workstation.html`, refresh a permitted local market dataset, then select a scanned symbol. Under the chart choose **Current scan references** or one of that symbol's **Frozen P9-…** tickets. The chart and 3D map use that same reference basis.

In **Explore entry & exit references**, drag the map, use Rotate left/right, or focus the map and use arrow keys. Home/Reset restores the initial angle. Flat view and the node buttons provide alternatives to rotation. Code labels show the actual scanner/store functions represented by each node; selecting a node explains its evidence, rules, level and source path. Map connections are predefined code dependencies, not correlations or probabilistic predictions.

Current scan entry = completed close. Nominal risk distance = 2 × ATR14; stop = max(0.01, entry − distance); target = entry + 2 × distance. The map reads these existing outputs exactly; it does not recalculate signals, forecast turning points or change eligibility. The scanner's weighted score is not a probability. Costs, gaps and slippage are outside these workstation reference formulas.

Frozen ticket levels retain their opening date and stored values. Trend, momentum, breakout and source nodes explicitly show the latest scan; at-open ATR and individual checks are not stored in existing tickets and cannot be reconstructed from current indicators. The entry circle appears at the opening/scan date only when that date is inside the displayed 60-bar window. Stop/target circles at the right edge identify horizontal reference levels, not observed exit events. A white circle marks a subsequently observed paper stop or target touch on its daily-bar date. Both levels touched in one bar remain ambiguous, with no exit marker. Hovering a marker exposes its basis/date. Chart labels and node controls are available without hover.

Creating a paper ticket always uses the current scan, even while inspecting an older frozen ticket. Map/view changes perform no API mutations and do not alter tickets, scanner state, watchlist or market data. This is personal paper decision support; there is no broker or real-order route.

## Verification

`npm run check`, `npm run security:baseline`, `npm run security:secrets`.

`RUN_BROWSER_ACCEPTANCE=1 CHROME_BIN=/path/to/chrome node --test tests/browser-workstation.test.mjs` exercises the complete loopback browser → API → disposable synthetic data → rendered chart/map path. It verifies rotation, direct SVG selection, keyboard interaction, code/flat views, mobile containment, unchanged state during exploration, frozen references after refresh, subsequent outcome marker and stale-refresh rejection. Existing paper files and external provider keys are not used by this test.

Manual acceptance: select your locally verified symbol; inspect entry/stop/target explanations; rotate and switch code/flat views; choose an existing frozen ticket; confirm its levels and opening date match the journal; return to the current scan. No new ticket is needed for map acceptance. No claim is made about improved returns or real-provider correctness.
