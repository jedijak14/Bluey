import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ExpressionScene, LAB_PRESETS } from "./MobileExpressionLab";

it("offers unique presets covering all existing moods and three new scenes", () => {
  expect(LAB_PRESETS).toHaveLength(13);
  expect(new Set(LAB_PRESETS.map((p) => p.id)).size).toBe(13);
  expect(new Set(LAB_PRESETS.map((p) => p.mood))).toEqual(
    new Set([
      "listening",
      "thinking",
      "talking",
      "pointing",
      "happy",
      "sleepy",
      "resting",
    ]),
  );
  expect(LAB_PRESETS.filter((p) => p.scene).map((p) => p.scene)).toEqual([
    "computer",
    "idea",
    "celebrate",
  ]);
});
it("renders named original Bluey artwork for every preset without audio or remote assets", () => {
  for (const preset of LAB_PRESETS) {
    const html = renderToStaticMarkup(<ExpressionScene preset={preset} />);
    expect(html).toContain(`aria-label="Bluey: ${preset.label}"`);
    expect(html).toContain(`avatar mood-${preset.mood}`);
    expect(html).not.toMatch(/<(audio|video|iframe|img)\b|https?:\/\//);
  }
});
it("includes animated SVG parts for typing, ideas and celebrations", () => {
  const scenes = LAB_PRESETS.slice(0, 3).map((preset) =>
    renderToStaticMarkup(<ExpressionScene preset={preset} />),
  );
  expect(scenes[0]).not.toContain("lab-paw");
  expect(scenes[0]).toContain("lab-power-flow");
  expect(scenes[0]).toContain("lab-powered-key");
  expect(scenes[0]).toContain("lab-screen-caret");
  expect(scenes[1]).toContain("lab-idea-rays");
  expect(scenes[2]).toContain("lab-confetti");
});
