import type { CapacitorConfig } from "@capacitor/cli";
const variant = process.env.BLUEY_VARIANT || "companion";
if (!["companion", "home", "kids"].includes(variant))
  throw new Error("Unknown Bluey variant");
const config: CapacitorConfig = {
  appId: `app.bluey.${variant}`,
  appName:
    variant === "home"
      ? "Bluey Home"
      : variant === "kids"
        ? "Bluey for Kids"
        : "Bluey",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: {
    backgroundColor: "#18191d",
    allowMixedContent: variant === "companion",
  },
};
export default config;
