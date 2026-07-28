"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

/** Collapsed-by-default comments (the Topic Queue card): the discussion is
 * decision context, not the main path — the fold keeps the card short so
 * the ❤️/🔁 buttons stay prominent. Children are the server-rendered
 * CommentList + composer. */
export function FoldedComments({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root
      className="comments-fold"
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger className="comments-fold-toggle">
        {open ? (
          <ChevronDown size={14} aria-hidden />
        ) : (
          <ChevronRight size={14} aria-hidden />
        )}{" "}
        💬 Comments ({count})
      </Collapsible.Trigger>
      <Collapsible.Panel>{open ? children : null}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
