"use client";

import Button from "@/components/ui/Button";

type VoiceHelpAction = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "accent";
};

type VoiceHelpControlsProps = {
  voiceHelpEnabled: boolean;
  onToggleVoiceHelp?: (enabled: boolean) => void;
  actions?: VoiceHelpAction[];
  showToggle?: boolean;
  className?: string;
};

export default function VoiceHelpControls({
  voiceHelpEnabled,
  onToggleVoiceHelp,
  actions = [],
  showToggle = true,
  className,
}: VoiceHelpControlsProps) {
  const visibleActions = voiceHelpEnabled ? actions : [];

  if (!showToggle && visibleActions.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {showToggle ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              Voice help {voiceHelpEnabled ? "On" : "Off"}
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                  !voiceHelpEnabled ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => onToggleVoiceHelp?.(false)}
                aria-pressed={!voiceHelpEnabled}
              >
                Off
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                  voiceHelpEnabled ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => onToggleVoiceHelp?.(true)}
                aria-pressed={voiceHelpEnabled}
              >
                On
              </button>
            </div>
          </div>
        ) : null}

        {visibleActions.length ? (
          <div className={`${showToggle ? "mt-3" : ""} grid gap-2`}>
            {visibleActions.map((action) => (
              <Button
                key={action.id}
                className="w-full"
                variant={action.variant ?? "secondary"}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
