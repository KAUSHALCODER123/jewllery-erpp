/**
 * "Back up to a Google Drive sync folder" — no OAuth, offline-first.
 *
 * The shop points this at a folder the Google Drive desktop app syncs (e.g.
 * `G:\My Drive\Jewel-ERP-Backups`). We write the same JSON the manual backup
 * produces straight into that folder; the Drive app uploads it in the
 * background. Desktop (Tauri) only — the Tauri fs/dialog plugins are
 * dynamic-imported so the web build and Playwright tests never touch them.
 */
import { isTauri } from "@/db/sqlite"

const FOLDER_KEY = "jewel.driveBackupFolder"

export function getDriveFolder(): string | null {
  return localStorage.getItem(FOLDER_KEY)
}

export function setDriveFolder(path: string): void {
  localStorage.setItem(FOLDER_KEY, path)
}

export function clearDriveFolder(): void {
  localStorage.removeItem(FOLDER_KEY)
}

export function driveBackupSupported(): boolean {
  return isTauri()
}

/** Open the native folder picker; remembers and returns the chosen path (or null). */
export async function pickDriveFolder(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("The folder picker is only available in the desktop app")
  }
  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose your Google Drive backup folder",
  })
  if (typeof selected === "string") {
    setDriveFolder(selected)
    return selected
  }
  return null
}

/** Write a backup file into the configured Drive folder. Returns the full path. */
export async function writeBackupToDrive(
  filename: string,
  contents: string,
): Promise<string> {
  if (!isTauri()) {
    throw new Error("Saving to a folder is only available in the desktop app")
  }
  const folder = getDriveFolder()
  if (!folder) {
    throw new Error("No Google Drive folder chosen yet")
  }
  const { writeTextFile } = await import("@tauri-apps/plugin-fs")
  const sep = folder.includes("\\") ? "\\" : "/"
  const full = folder.endsWith(sep) ? `${folder}${filename}` : `${folder}${sep}${filename}`
  await writeTextFile(full, contents)
  return full
}
