import { invoke } from "@tauri-apps/api/core";

export async function detectNetcoredbg(): Promise<string | null> {
  try {
    const path = await invoke<string | null>("dap_detect_netcoredbg");
    return path;
  } catch {
    return null;
  }
}

export function getNetcoredbgDownloadUrl(): { url: string; filename: string } | null {
  const isMac = navigator.userAgent.includes("Mac");

  // Samsung netcoredbg latest release 3.2.0-1092
  const baseUrl = "https://github.com/Samsung/netcoredbg/releases/download/3.2.0-1092";

  if (isMac) {
    // Both arm64 and x64 builds exist. Default to arm64 on modern macOS
    return {
      url: `${baseUrl}/netcoredbg-osx-arm64.zip`,
      filename: "netcoredbg-osx-arm64.zip",
    };
  }

  if (navigator.userAgent.includes("Linux")) {
    return {
      url: `${baseUrl}/netcoredbg-linux-amd64.tar.gz`,
      filename: "netcoredbg-linux-amd64.tar.gz",
    };
  }

  if (navigator.userAgent.includes("Win")) {
    return {
      url: `${baseUrl}/netcoredbg-win64.zip`,
      filename: "netcoredbg-win64.zip",
    };
  }

  return null;
}
