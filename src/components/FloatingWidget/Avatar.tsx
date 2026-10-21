import { useEffect, useId, useRef, useState } from "react";
import type { Mood } from "../../lib/types";

// Geometry and palette adapted from rbrown101010/bluey-by-riley (Unlicense).
export function Avatar({
  mood = "listening",
  className = "",
  gaze,
  talk = 0,
  onClick,
  expression,
}: {
  mood?: Mood;
  expression?: "wink" | "sad" | "alarmed";
  className?: string;
  gaze?: { x: number; y: number };
  talk?: number;
  onClick?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const node = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (gaze) {
      setLook(gaze);
      return;
    }
    const move = (e: PointerEvent) => {
      const r = node.current?.getBoundingClientRect();
      if (r)
        setLook({
          x: Math.max(-1, Math.min(1, (e.clientX - r.x - r.width / 2) / 400)),
          y: Math.max(-1, Math.min(1, (e.clientY - r.y - r.height / 2) / 300)),
        });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [gaze]);
  const x = mood === "thinking" ? 7 : mood === "pointing" ? 0 : look.x * 13;
  const y = mood === "thinking" ? -14 : mood === "pointing" ? -3 : look.y * 12;
  return (
    <svg
      ref={node}
      viewBox="0 0 340 280"
      className={`avatar mood-${mood} expression-${expression || "default"} ${className}`}
      onClick={onClick}
      role="img"
      aria-label={`Bluey is ${expression === "alarmed" ? "surprised" : expression === "sad" ? "sad" : expression === "wink" ? "winking" : mood}`}
    >
      <defs>
        <linearGradient
          id={`${id}body`}
          x1=".25"
          y1=".067"
          x2=".75"
          y2=".933"
          gradientUnits="objectBoundingBox"
        >
          <stop stopColor="#a9bcff" />
          <stop offset=".34" stopColor="#6c86f5" />
          <stop offset=".68" stopColor="#4254d6" />
          <stop offset="1" stopColor="#2b2f8f" />
        </linearGradient>
        <radialGradient id={`${id}shine`} cx=".3" cy=".2" r=".7">
          <stop stopColor="white" stopOpacity=".48" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}blush`}>
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g className="berry-body">
        <path
          d="M170 25C255 25 325 94 325 181C325 252 260 268 170 268C80 268 15 247 15 183C15 96 86 25 170 25Z"
          fill={`url(#${id}body)`}
        />
        <path
          d="M170 25C255 25 325 94 325 181C325 252 260 268 170 268C80 268 15 247 15 183C15 96 86 25 170 25Z"
          fill={`url(#${id}shine)`}
        />
        <ellipse
          cx="89"
          cy="65"
          rx="12"
          ry="5"
          fill="white"
          opacity=".28"
          transform="rotate(-25 89 65)"
        />
        <path
          d="M170 15L177 31L194 28L181 41L186 56L170 47L154 56L159 41L146 28L163 31Z"
          fill="#1c1f66"
        />
        <g
          fill="#f3a6d8"
          opacity={mood === "happy" ? 0.7 : 0.38}
          filter={`url(#${id}blush)`}
        >
          <ellipse cx="77" cy="192" rx="19" ry="9" />
          <ellipse cx="264" cy="192" rx="19" ry="9" />
        </g>
        {[116, 225].map((cx, i) => (
          <g key={cx}>
            <path
              className={`eyebrow brow-${i}`}
              d={
                expression === "sad"
                  ? `M${cx - 21} ${i === 0 ? 87 : 72}Q${cx} 73 ${cx + 21} ${i === 0 ? 72 : 87}`
                  : mood === "pointing"
                    ? `M${cx - 21} 80Q${cx} 76 ${cx + 21} 80`
                    : `M${cx - 21} 82Q${cx} ${mood === "thinking" && i === 1 ? 68 : 70} ${cx + 21} 82`
              }
              fill="none"
              stroke="#1c1f66"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {expression === "wink" && i === 1 ? (
              <path
                d={`M${cx - 25} 136Q${cx} 152 ${cx + 25} 136`}
                fill="none"
                stroke="#17151f"
                strokeWidth="9"
                strokeLinecap="round"
              />
            ) : mood === "happy" ? (
              <path
                d={`M${cx - 25} 145Q${cx} 107 ${cx + 25} 145`}
                fill="none"
                stroke="#17151f"
                strokeWidth="10"
                strokeLinecap="round"
              />
            ) : mood === "resting" ? (
              <path
                d={`M${cx - 25} 132Q${cx} 151 ${cx + 25} 132`}
                fill="none"
                stroke="#17151f"
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : (
              <g className="eye" style={{ transformOrigin: `${cx}px 135px` }}>
                <clipPath id={`${id}clip${i}`}>
                  <ellipse cx={cx} cy="135" rx="40" ry="43" />
                </clipPath>
                <ellipse cx={cx} cy="135" rx="40" ry="43" fill="white" />
                <g clipPath={`url(#${id}clip${i})`}>
                  <g
                    className="pupil"
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                  >
                    <circle
                      cx={cx + 2}
                      cy="139"
                      r={
                        expression === "alarmed"
                          ? 14
                          : mood === "listening"
                            ? 22
                            : 20
                      }
                      fill="#17151f"
                    />
                    <circle cx={cx - 5} cy="131" r="6" fill="white" />
                    <circle
                      cx={cx + 11}
                      cy="147"
                      r="2.6"
                      fill="white"
                      opacity=".8"
                    />
                  </g>
                  {mood === "sleepy" && (
                    <>
                      <rect
                        x={cx - 45}
                        y="88"
                        width="90"
                        height="49"
                        fill={`url(#${id}body)`}
                      />
                      <path
                        d={`M${cx - 41} 137h82`}
                        stroke="#1c1f66"
                        strokeWidth="3"
                        opacity=".7"
                      />
                    </>
                  )}
                  {mood === "pointing" && (
                    <rect
                      x={cx - 45}
                      y="88"
                      width="90"
                      height="15"
                      fill="#8198fa"
                    />
                  )}
                </g>
              </g>
            )}
          </g>
        ))}
        {expression === "sad" ? (
          <path
            d="M150 216Q170 198 190 216"
            fill="none"
            stroke="#1c1f66"
            strokeWidth="7"
            strokeLinecap="round"
          />
        ) : mood === "pointing" || expression === "wink" ? (
          <path
            className="confident-smile"
            d="M150 201Q170 222 190 201"
            fill="none"
            stroke="#1c1f66"
            strokeWidth="7"
            strokeLinecap="round"
          />
        ) : mood === "happy" ? (
          <path d="M155 205Q170 226 185 205Z" fill="#1c1f66" />
        ) : (
          <g
            className={mood === "talking" ? "talk-mouth" : ""}
            style={{ transformOrigin: "170px 207px" }}
          >
            <ellipse
              cx="170"
              cy="207"
              rx="12"
              ry={
                expression === "alarmed"
                  ? 16
                  : mood === "talking"
                    ? 15 + talk * 5
                    : 8
              }
              fill="#1c1f66"
            />
            {mood === "talking" && (
              <ellipse cx="170" cy="215" rx="6" ry="4" fill="#e58bc4" />
            )}
          </g>
        )}
        {mood === "resting" && (
          <g
            className="sleep-z"
            fill="#b3b7ff"
            fontFamily="Fredoka"
            fontSize="19"
          >
            <text x="282" y="72">
              z
            </text>
            <text x="300" y="48" fontSize="15">
              z
            </text>
          </g>
        )}
        {mood === "thinking" && (
          <g className="thinking-dots" fill="#e9e6ff">
            <circle cx="281" cy="60" r="3" />
            <circle cx="292" cy="51" r="3" opacity=".6" />
            <circle cx="303" cy="42" r="3" opacity=".3" />
          </g>
        )}
      </g>
    </svg>
  );
}

export function CursorAvatar({
  mood = "listening",
  className = "",
}: {
  mood?: Mood;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="-20 -20 140 140"
      className={`cursor-avatar mood-${mood} ${className}`}
      aria-label={`Bluey's pointer is ${mood}`}
      role="img"
    >
      <defs>
        <linearGradient id={id} x1=".25" y1=".067" x2=".75" y2=".933">
          <stop stopColor="#c7d3ff" />
          <stop offset=".34" stopColor="#8195fa" />
          <stop offset=".68" stopColor="#4254d6" />
          <stop offset="1" stopColor="#2b2f8f" />
        </linearGradient>
      </defs>
      <g className="pointer-body">
        <g transform="rotate(17 48 48)">
          <path
            d="M7 2H48A46 46 0 1 1 2 48V7Q2 2 7 2Z"
            fill={`url(#${id})`}
            stroke="white"
            strokeWidth="3.5"
          />
          {[42, 66].map((cx) => (
            <g
              className="eye"
              key={cx}
              style={{ transformOrigin: `${cx}px 52px` }}
            >
              {mood === "resting" || mood === "happy" ? (
                <path
                  d={`M${cx - 7} 53q7 ${mood === "happy" ? -9 : 6} 14 0`}
                  fill="none"
                  stroke="#17151f"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <ellipse
                    cx={cx}
                    cy="52"
                    rx="9"
                    ry={mood === "sleepy" ? 5 : 10}
                    fill="white"
                  />
                  <circle
                    cx={cx + (mood === "pointing" ? 3 : -2)}
                    cy={mood === "thinking" ? 48 : 50}
                    r="4.8"
                    fill="#17151f"
                  />
                </>
              )}
            </g>
          ))}
          {mood === "pointing" && (
            <path
              className="confident-smile"
              d="M47 72q8 9 16 0"
              fill="none"
              stroke="#17151f"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
        </g>
      </g>
    </svg>
  );
}

/** The original 844 × 390 bottom-peeking landscape composition, separate from the desk-sized blob. */
export function FaceScreen({
  mood,
  gazeX,
  gazeY,
  talk,
}: {
  mood: Mood;
  gazeX: number;
  gazeY: number;
  talk: number;
}) {
  const id = useId().replace(/:/g, "");
  const gx = mood === "thinking" ? 0.3 : mood === "pointing" ? 0 : gazeX,
    gy = mood === "thinking" ? -0.7 : mood === "pointing" ? -0.08 : gazeY;
  return (
    <svg
      className={`face-screen mood-${mood}`}
      viewBox="0 0 844 390"
      preserveAspectRatio="xMidYMax slice"
      aria-label={`Bluey is ${mood}`}
      role="img"
    >
      <defs>
        <linearGradient id={`${id}skin`} x1=".25" y1=".067" x2=".75" y2=".933">
          <stop stopColor="#a9bcff" />
          <stop offset=".34" stopColor="#6c86f5" />
          <stop offset=".68" stopColor="#4254d6" />
          <stop offset="1" stopColor="#2b2f8f" />
        </linearGradient>
        <radialGradient id={`${id}light`} cx=".3" cy=".18" r=".55">
          <stop stopColor="white" stopOpacity=".5" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}soft`}>
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <g className="berry-body" style={{ transformOrigin: "422px 744px" }}>
        <ellipse cx="422" cy="394" rx="410" ry="350" fill={`url(#${id}skin)`} />
        <ellipse
          cx="422"
          cy="394"
          rx="410"
          ry="350"
          fill={`url(#${id}light)`}
        />
        <path
          d="M422 29L434 51L451 45L437 64L445 81L422 70L399 81L407 64L393 45L410 51Z"
          fill="#1c1f66"
        />
        {[292, 552].map((cx, i) => (
          <g key={cx}>
            <path
              d={`M${cx - 38} 93Q${cx} ${mood === "thinking" && i === 1 ? 68 : 75} ${cx + 38} 93`}
              fill="none"
              stroke="#1c1f66"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {mood === "resting" ? (
              <path
                d={`M${cx - 62} 207Q${cx} 253 ${cx + 62} 207`}
                fill="none"
                stroke="#17151f"
                strokeWidth="18"
                strokeLinecap="round"
              />
            ) : mood === "happy" ? (
              <path
                d={`M${cx - 60} 235Q${cx} 147 ${cx + 60} 235`}
                fill="none"
                stroke="#17151f"
                strokeWidth="24"
                strokeLinecap="round"
              />
            ) : (
              <g className="eye" style={{ transformOrigin: `${cx}px 201px` }}>
                <clipPath id={`${id}eye${i}`}>
                  <ellipse cx={cx} cy="201" rx="95" ry="95" />
                </clipPath>
                <ellipse cx={cx} cy="201" rx="95" ry="95" fill="white" />
                <g clipPath={`url(#${id}eye${i})`}>
                  <g
                    className="pupil"
                    style={{
                      transform: `translate(${gx * 42}px,${gy * 42 + (mood === "sleepy" ? 26 : 0)}px)`,
                    }}
                  >
                    <circle cx={cx} cy="206" r="46" fill="#17151f" />
                    <circle cx={cx - 15} cy="184" r="13" fill="white" />
                    <circle
                      cx={cx + 18}
                      cy="222"
                      r="6"
                      fill="#fff"
                      opacity=".8"
                    />
                  </g>
                  {mood === "sleepy" && (
                    <>
                      <rect
                        x={cx - 100}
                        y="96"
                        width="200"
                        height="108"
                        fill="#879bfa"
                      />
                      <path
                        d={`M${cx - 95} 204h190`}
                        stroke="#1c1f66"
                        strokeWidth="7"
                        opacity=".6"
                      />
                    </>
                  )}
                  {mood === "pointing" && (
                    <rect
                      x={cx - 100}
                      y="96"
                      width="200"
                      height="28"
                      fill="#8ea2fc"
                    />
                  )}
                </g>
              </g>
            )}
            <ellipse
              cx={cx + (i === 0 ? -62 : 62)}
              cy="309"
              rx="44"
              ry="21"
              fill="#f3a6d8"
              opacity={mood === "happy" ? 0.65 : 0.35}
              filter={`url(#${id}soft)`}
            />
          </g>
        ))}
        {mood === "pointing" ? (
          <path
            className="confident-smile"
            d="M384 324Q422 363 460 324"
            fill="none"
            stroke="#1c1f66"
            strokeWidth="15"
            strokeLinecap="round"
          />
        ) : mood === "happy" ? (
          <path d="M384 324Q422 373 460 324Z" fill="#1c1f66" />
        ) : (
          <g
            className={mood === "talking" ? "talk-mouth" : ""}
            style={{ transformOrigin: "422px 334px" }}
          >
            <ellipse
              cx="422"
              cy="334"
              rx="30"
              ry={mood === "talking" ? 29 + talk * 7 : 19}
              fill="#1c1f66"
            />
            {mood === "talking" && (
              <ellipse cx="422" cy="350" rx="15" ry="9" fill="#e58bc4" />
            )}
          </g>
        )}
        {mood === "thinking" && (
          <g className="thinking-dots" fill="white">
            <circle cx="702" cy="84" r="8" />
            <circle cx="728" cy="72" r="8" opacity=".6" />
            <circle cx="754" cy="60" r="8" opacity=".3" />
          </g>
        )}
        {mood === "resting" && (
          <g
            className="sleep-z"
            fill="#d4cce5"
            fontFamily="Fredoka"
            fontSize="27"
          >
            <text x="730" y="106">
              z
            </text>
            <text x="751" y="74">
              z
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
