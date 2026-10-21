import { useId } from "react";
import type { NewExpression } from "../../lib/expressions";
import "./expressions.css";

const brows: Record<NewExpression, [string, string]> = {
  excited: ["M92 77Q116 52 140 77", "M201 77Q225 52 249 77"],
  proud: ["M91 80Q116 70 141 80", "M200 80Q225 70 250 80"],
  skeptical: ["M91 67Q116 48 141 67", "M200 84L250 84"],
  embarrassed: ["M94 80Q116 74 138 88", "M203 88Q225 74 247 80"],
  worried: ["M92 92Q116 72 140 73", "M201 73Q225 72 249 92"],
  relieved: ["M92 82Q116 77 140 82", "M201 82Q225 77 249 82"],
  mischievous: ["M91 74L141 90", "M200 90L250 74"],
  amazed: ["M91 68Q116 41 141 68", "M200 68Q225 41 250 68"],
  confused: ["M91 84L141 88", "M200 69Q225 53 250 75"],
  disappointed: ["M92 92L140 77", "M201 77L249 92"],
  laughing: ["M92 77Q116 64 140 77", "M201 77Q225 64 249 77"],
  zen: ["M92 86Q116 80 140 86", "M201 86Q225 80 249 86"],
};
const mouths: Record<NewExpression, string> = {
  excited: "M145 194Q170 203 195 194Q194 239 170 239Q146 239 145 194Z",
  proud: "M144 209Q170 224 196 204",
  skeptical: "M151 215L188 207",
  embarrassed: "M148 215Q162 203 173 215Q182 220 192 211",
  worried: "M148 219Q158 207 169 217Q179 207 192 219",
  relieved: "M149 205Q170 226 191 205",
  mischievous: "M143 198Q170 219 198 192Q187 232 164 224Q150 217 143 198Z",
  amazed: "M170 192C194 192 194 237 170 237C146 237 146 192 170 192Z",
  confused: "M147 215L160 209L174 219L192 208",
  disappointed: "M148 220Q170 201 192 220",
  laughing: "M139 195Q170 207 201 195Q193 243 170 243Q147 243 139 195Z",
  zen: "M154 211Q170 220 186 211",
};
const filled = new Set<NewExpression>([
  "excited",
  "mischievous",
  "amazed",
  "laughing",
]);

/** Canonical facial coordinates are shared by the blob, Windows pointer and Android face. */
export function ExpressionFeatures({
  expression,
}: {
  expression: NewExpression;
}) {
  const id = useId().replace(/:/g, "");
  const closed = ["relieved", "laughing", "zen"].includes(expression);
  return (
    <g
      className={`expression-features emotion-${expression}`}
      data-expression={expression}
    >
      <defs>
        <filter id={`${id}blush`} x="-50%" y="-100%" width="200%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        {[116, 225].map((cx, i) => (
          <clipPath key={cx} id={`${id}eye${i}`}>
            <ellipse
              cx={cx}
              cy={expression === "confused" && i ? 130 : 135}
              rx={expression === "amazed" ? 39 : 35}
              ry={
                expression === "amazed"
                  ? 44
                  : expression === "skeptical" && i
                    ? 27
                    : 37
              }
            />
          </clipPath>
        ))}
      </defs>
      <g
        className="emotion-cheeks"
        fill="#ef9dcb"
        opacity={expression === "embarrassed" ? 0.8 : 0.4}
      >
        <g filter={`url(#${id}blush)`}>
          <ellipse cx="76" cy="183" rx="19" ry="8" />
          <ellipse cx="265" cy="183" rx="19" ry="8" />
        </g>
      </g>
      <g
        className="emotion-brows"
        fill="none"
        stroke="#22245c"
        strokeWidth="6"
        strokeLinecap="round"
      >
        {brows[expression].map((d, i) => (
          <path className={`emotion-brow-${i}`} key={i} d={d} />
        ))}
      </g>
      {[116, 225].map((cx, i) => (
        <g
          key={cx}
          className={`emotion-eye eye-${i}`}
          style={{ transformOrigin: `${cx}px 135px` }}
        >
          {closed ? (
            <path
              d={`M${cx - 27} ${expression === "laughing" ? 145 : 133}Q${cx} ${expression === "laughing" ? 111 : 155} ${cx + 27} ${expression === "laughing" ? 145 : 133}`}
              fill="none"
              stroke="#202134"
              strokeWidth={expression === "laughing" ? 9 : 7}
              strokeLinecap="round"
            />
          ) : expression === "excited" ? (
            <>
              <ellipse cx={cx} cy="135" rx="35" ry="39" fill="white" />
              <path
                className="emotion-star"
                style={{ transformOrigin: `${cx}px 135px` }}
                d={`M${cx} 111l7 16 18 2-13 12 4 18-16-9-16 9 4-18-13-12 18-2Z`}
                fill="#7860b9"
              />
            </>
          ) : (
            <>
              <ellipse
                cx={cx}
                cy={expression === "confused" && i ? 130 : 135}
                rx={expression === "amazed" ? 39 : 35}
                ry={
                  expression === "amazed"
                    ? 44
                    : expression === "skeptical" && i
                      ? 27
                      : 37
                }
                fill="white"
              />
              <g
                className="emotion-pupil"
                style={{ transformOrigin: `${cx}px 135px` }}
              >
                <circle
                  cx={
                    cx +
                    (expression === "embarrassed"
                      ? -9
                      : expression === "mischievous"
                        ? 9
                        : 0)
                  }
                  cy={expression === "embarrassed" ? 145 : 137}
                  r={
                    expression === "amazed"
                      ? 12
                      : expression === "worried"
                        ? 15
                        : 20
                  }
                  fill="#202134"
                />
                <circle cx={cx - 5} cy="130" r="5" fill="white" />
              </g>
              {["proud", "skeptical", "mischievous", "disappointed"].includes(
                expression,
              ) && (
                <path
                  className="emotion-lid"
                  clipPath={`url(#${id}eye${i})`}
                  d={`M${cx - 37} 97H${cx + 37}V${expression === "disappointed" ? 126 : 115}Q${cx} ${expression === "mischievous" ? 131 : 121} ${cx - 37} 115Z`}
                  fill="#879afa"
                />
              )}
            </>
          )}
        </g>
      ))}
      <path
        className="emotion-mouth"
        d={mouths[expression]}
        fill={filled.has(expression) ? "#22245c" : "none"}
        stroke="#22245c"
        strokeWidth={filled.has(expression) ? 2 : 6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {["excited", "laughing"].includes(expression) && (
        <path
          className="emotion-tongue"
          d="M157 229Q170 215 183 229Q170 242 157 229Z"
          fill="#ed96be"
        />
      )}
      {expression === "mischievous" && (
        <path d="M177 208l10-4-6 12Z" fill="white" />
      )}
      {expression === "embarrassed" && (
        <path
          d="M67 180l-3 8m12-8-3 8m12-8-3 8m174-8-3 8m12-8-3 8m12-8-3 8"
          stroke="#be648d"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {expression === "relieved" && (
        <g
          className="emotion-sigh"
          fill="none"
          stroke="#d2e2ff"
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M206 214q24-10 32 0m-26 9q19-6 25 1" />
        </g>
      )}
      {expression === "confused" && (
        <g
          className="emotion-question"
          fill="none"
          stroke="#e8ddff"
          strokeWidth="5"
          strokeLinecap="round"
        >
          <path d="M277 82q-3-20 12-20t4 22q-8 4-8 10" />
          <circle cx="285" cy="105" r="2" fill="#e8ddff" />
        </g>
      )}
      {expression === "disappointed" && (
        <path
          className="emotion-tear"
          d="M258 163q-15 21 0 24q15-3 0-24Z"
          fill="#a4e1ff"
          stroke="#68a9d9"
          strokeWidth="1.5"
        />
      )}
      {expression === "amazed" && (
        <g className="emotion-glints" fill="#e7dbff">
          <path d="M72 103l3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM270 89l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        </g>
      )}
      {expression === "zen" && (
        <ellipse
          className="emotion-breath"
          cx="170"
          cy="227"
          rx="35"
          ry="8"
          fill="none"
          stroke="#b6cee9"
          strokeWidth="2"
          opacity=".5"
        />
      )}
    </g>
  );
}
