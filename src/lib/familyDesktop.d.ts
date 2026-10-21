import type { GuardianHealth } from "../components/Family/GuardianStatus";
declare global {
  interface Window {
    blueyFamily?: {
      request(
        path: string,
        token: string,
        body: unknown,
        method: string,
      ): Promise<{ status: number; data: any }>;
      guardianStatus(): Promise<GuardianHealth>;
      openGuardianSetup(): Promise<string>;
      openSetupGuide(): Promise<string>;
      vaultRead(): Promise<{ token: string }>;
      vaultWrite(options: { token: string }): Promise<void>;
      vaultClear(): Promise<void>;
    };
  }
}
export {};
