import { useEffect, useState } from "react";

export type FamilyEnrollment = {
  code: string;
  childId: string;
  childName: string;
  scope: "kids" | "windows";
  expiresAt: number;
};

export function EnrollmentCode({
  enrollment,
  onHide,
}: {
  enrollment: FamilyEnrollment;
  onHide: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enrollment]);
  const seconds = Math.max(0, Math.ceil((enrollment.expiresAt - now) / 1000));
  return (
    <section className="home-enrollment" aria-label="Pairing code">
      <h3>
        {enrollment.scope === "windows"
          ? "Windows Guardian enrollment"
          : "Bluey for Kids app enrollment"}{" "}
        · {enrollment.childName}
      </h3>
      {seconds > 0 ? (
        <>
          <p>
            {enrollment.scope === "windows"
              ? "Enter this code only in the administrator’s Guardian setup wizard—not in the Kids app."
              : "Enter this code in the Kids app on Windows or an existing Android installation—not in the Guardian installer."}
          </p>
          <code>{enrollment.code}</code>
          <p>
            Expires in {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, "0")}. One use only. Creating a
            new code invalidates the previous code of this type.
          </p>
        </>
      ) : (
        <p role="status">
          This code has expired. Create a new code for {enrollment.childName}.
        </p>
      )}
      <button className="home-text" onClick={onHide}>
        Hide code
      </button>
      <p className="home-fine">
        Hiding a code does not revoke it. Pairing the Kids app does not install
        or enable Windows Guardian.
      </p>
    </section>
  );
}
