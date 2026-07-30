import { useState, useEffect } from "react";

type Props = {
  label: string;
  values: number[];
  onChange: (values: number[]) => void;
};

// Mirrors CitizenPanel.java's CSV-of-ints text field UX: free text while typing,
// parsed to number[] on blur/change; unparseable tokens are dropped rather than
// silently zeroing the whole array (a small improvement over the Java tool's
// all-or-nothing csvToIntArray behavior).
export function CsvArrayInput({ label, values, onChange }: Props) {
  const [text, setText] = useState(values.join(", "));

  useEffect(() => {
    setText(values.join(", "));
  }, [values]);

  function commit(raw: string) {
    setText(raw);
    const parsed = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    onChange(parsed);
  }

  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <input
        type="text"
        value={text}
        onChange={(e) => commit(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
    </label>
  );
}
