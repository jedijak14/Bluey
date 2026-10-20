import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Avatar, CursorAvatar, FaceScreen } from "./FloatingWidget/Avatar";
import { ListeningEdge } from "./ListeningEdge";
it("renders a distinct wink and sad expression without changing protocol moods", () => {
  expect(renderToStaticMarkup(<Avatar expression="wink" />)).toContain(
    "Bluey is winking",
  );
  expect(renderToStaticMarkup(<Avatar expression="sad" />)).toContain(
    "Bluey is sad",
  );
});
it("uses a confident smile for On it in all three character presentations", () => {
  for (const face of [
    <Avatar mood="pointing" />,
    <CursorAvatar mood="pointing" />,
    <FaceScreen mood="pointing" gazeX={0} gazeY={0} talk={0} />,
  ])
    expect(renderToStaticMarkup(face)).toContain("confident-smile");
});
it("shows the microphone border only when capture is active", () => {
  expect(renderToStaticMarkup(<ListeningEdge active={false} level={1} />)).toBe(
    "",
  );
  const ring = renderToStaticMarkup(<ListeningEdge active level={100} />);
  expect(ring).toContain("--listen-opacity:0.8");
  expect(ring).toContain('aria-hidden="true"');
  expect(renderToStaticMarkup(<ListeningEdge active level={NaN} />)).toContain(
    "--listen-opacity:0.55",
  );
});
