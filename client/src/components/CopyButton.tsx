import { useState } from "react";

type Props = { text: string; label: string };

export function CopyButton({ text, label }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{ fontSize: 12, padding: "3px 8px" }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
