"use client";

import { useParams } from "next/navigation";
import type { JSX } from "react";
import { ConversationPage } from "@/features/conversations/components/conversation-page";

type RouteParams = { id: string | string[] };

export default function ConversationRoute(): JSX.Element {
  const params = useParams<RouteParams>();
  const conversationId = resolveId(params?.id);

  return <ConversationPage conversationId={conversationId} />;
}

function resolveId(rawId: string | string[] | undefined): string {
  if (Array.isArray(rawId)) return rawId[0] ?? "";

  return rawId ?? "";
}
