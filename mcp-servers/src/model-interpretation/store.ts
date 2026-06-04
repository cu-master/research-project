import { log } from "../shared/logger.js";

// Called when starting a new chat session to prevent context pollution.
export function clearAllStoredContent(): void {
  log.info("All stored content cleared");
}
