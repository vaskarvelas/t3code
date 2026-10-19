import { memo } from "react";
import { Square, Volume2 } from "lucide";
import { create } from "zustand";
import { searchableMessageSegments } from "@t3tools/shared/threadFindText";

import { MorphIcon } from "../MorphIcon";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// Shared by virtualized message rows so switching replies never leaves a stale Stop button.
const usePlayback = create<{ activeId: string | null; generation: number }>(() => ({
  activeId: null,
  generation: 0,
}));

export const MessageReadAloudButton = memo(function MessageReadAloudButton({
  messageId,
  text,
}: {
  messageId: string;
  text: string;
}) {
  const active = usePlayback((state) => state.activeId === messageId);
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (!bridge?.readAloud || !bridge.stopReadAloud) return null;
  const label = active ? "Stop reading" : "Read aloud";

  const toggle = async () => {
    const generation = usePlayback.getState().generation + 1;
    usePlayback.setState({ activeId: active ? null : messageId, generation });
    try {
      if (active) {
        await bridge.stopReadAloud?.();
      } else {
        const spokenText = searchableMessageSegments({ role: "assistant", text, streaming: false })
          ?.join("\n")
          .trim();
        if (spokenText) await bridge.readAloud?.(spokenText);
      }
    } catch (error) {
      if (usePlayback.getState().generation === generation) {
        toastManager.add({
          type: "error",
          title: "Read aloud failed",
          description: error instanceof Error ? error.message : "Could not play local speech.",
        });
      }
    } finally {
      if (usePlayback.getState().generation === generation)
        usePlayback.setState({ activeId: null });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            onClick={() => void toggle()}
            type="button"
            size="xs"
            variant="ghost-muted"
          />
        }
      >
        <MorphIcon className="size-3" icon={active ? Square : Volume2} />
      </TooltipTrigger>
      <TooltipPopup>
        <p>{label}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
