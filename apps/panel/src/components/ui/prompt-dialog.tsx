"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Field, Input } from "./input";

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void> | void;
}

export function PromptDialog({ open, onOpenChange, title, description, label, initialValue = "", placeholder, confirmLabel = "Save", onSubmit }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    try {
      await onSubmit(value.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="sm">
        <form onSubmit={submit}>
          <DialogBody>
            <Field label={label} htmlFor="prompt-input">
              <Input id="prompt-input" autoFocus value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={!value.trim()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
