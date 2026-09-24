"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export function AllergenTagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      {tags.length > 0 ? (
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {tags.map((tag) => (
            <span key={tag} className="pill p-warn">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} aria-label={`Отстрани ${tag}`}>
                <Icon name="x" size="sm" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="fld"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Додади алерген"
        />
        <button type="button" onClick={addTag} className="btn btn-ghost">
          Додади
        </button>
      </div>
    </div>
  );
}
