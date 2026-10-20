import { useRef, useState } from "react";
import { MicIcon, SquareIcon } from "lucide-react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ComposerDictationButton({
  disabled,
  onFocusComposer,
  onTranscription,
}: {
  disabled: boolean;
  onFocusComposer: () => void;
  onTranscription: (text: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const busy = useRef(false);
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (!bridge?.controlDictation) return null;
  const label =
    state === "recording"
      ? "Stop dictation"
      : state === "processing"
        ? "Transcribing…"
        : "Dictate message";
  const toggle = async () => {
    if (busy.current) return;
    onFocusComposer();
    if (state === "recording") {
      busy.current = true;
      setState("processing");
      try {
        await bridge.controlDictation!("stop");
      } catch {
        setState("recording");
        toastManager.add({
          type: "error",
          title: "Could not stop dictation",
          description: "Use F9 to stop, or retry.",
        });
      } finally {
        busy.current = false;
      }
      return;
    }
    setState("recording");
    try {
      const text = await bridge.controlDictation!("start");
      if (typeof text === "string" && text.trim()) onTranscription(text.trim());
    } catch {
      toastManager.add({
        type: "error",
        title: "Dictation failed",
        description: "Check that hyprwhspr is running and no F9 recording is active.",
      });
    } finally {
      setState("idle");
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={state === "recording"}
            disabled={state === "processing" || (disabled && state === "idle")}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void toggle()}
          />
        }
      >
        {state === "recording" ? <SquareIcon /> : <MicIcon />}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
