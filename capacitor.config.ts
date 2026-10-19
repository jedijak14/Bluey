import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.bluey.companion",
  appName: "Bluey",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#18191d", allowMixedContent: true },
};
export default config;
