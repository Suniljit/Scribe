import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/chat";

interface Props {
  title: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
  disabledReason?: string;
}

export function ChatPanel({ title, messages, onSend, onClose, disabledReason }: Props) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-hairline bg-glass backdrop-blur-2xl">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
        <span className="flex-1 truncate text-sm font-semibold">{title}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {disabledReason ? (
        <p className="p-4 text-sm text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                  m.role === "user"
                    ? "self-end bg-brand text-brand-foreground"
                    : "self-start bg-card text-card-foreground ring-1 ring-foreground/10",
                )}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 border-t border-hairline p-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Ask a question…"
              className="flex-1 rounded-full border border-hairline bg-card/60 px-3.5 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <Button size="icon-sm" onClick={submit} disabled={!draft.trim()} className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90">
              →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
