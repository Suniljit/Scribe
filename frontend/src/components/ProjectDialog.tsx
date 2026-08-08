import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ProjectDraft {
  id?: string;
  name: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ProjectDraft | null;
  onSave: (name: string, description: string) => void;
}

export function ProjectDialog({ open, onOpenChange, draft, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(draft?.name ?? "");
      setDescription(draft?.description ?? "");
    }
  }, [open, draft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Rename Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim(), description.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
