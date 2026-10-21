import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Avatar, CursorAvatar, FaceScreen } from "./Avatar";
import {
  EXPRESSION_PRESETS,
  isNewExpression,
  liveExpression,
} from "../../lib/expressions";

it("offers twelve genuinely different faces in all three app renderers", () => {
  expect(EXPRESSION_PRESETS).toHaveLength(12);
  const shapes = new Set<string>();
  for (const p of EXPRESSION_PRESETS) {
    for (const view of [
      <Avatar mood={p.mood} expression={p.id} />,
      <CursorAvatar mood={p.mood} expression={p.id} />,
      <FaceScreen
        mood={p.mood}
        expression={p.id}
        gazeX={0}
        gazeY={0}
        talk={0}
      />,
    ]) {
      const html = renderToStaticMarkup(view);
      expect(html).toContain(`data-expression="${p.id}"`);
      expect(html).toContain("emotion-mouth");
      expect(html).not.toMatch(/<audio|<video|<iframe/);
    }
    const html = renderToStaticMarkup(<Avatar expression={p.id} />);
    shapes.add(html.match(/class="emotion-mouth" d="([^"]+)"/)![1]);
  }
  expect(shapes.size).toBe(12);
});
it("keeps protocol moods stable and refreshes live app defaults", () => {
  expect(isNewExpression("excited")).toBe(true);
  expect(isNewExpression("unknown")).toBe(false);
  expect(liveExpression("happy")).toBe("laughing");
  expect(liveExpression("resting")).toBe("zen");
  expect(liveExpression("talking")).toBeUndefined();
  expect(liveExpression("listening", "worried")).toBe("worried");
});
