"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { INPUT } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}

export function PasswordField({ id, value, onChange, autoComplete, placeholder, invalid, describedBy }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(INPUT, "h-12 pr-12")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px] text-faint transition-colors hover:bg-[#e6eaf2] hover:text-ink-soft"
      >
        {visible ? <EyeOff size={18} strokeWidth={2.1} /> : <Eye size={18} strokeWidth={2.1} />}
      </button>
    </div>
  );
}
