// Pill colour for a file movement's status (File Desk and file page).
import type { Tone } from "@/app/_components/status";
import type { MovementStatus } from "@/domain/files";

export const MOVEMENT_TONE: Record<MovementStatus, Tone> = {
  Overdue: "overdue",
  Out: "awaiting",
  Returned: "closed",
};
