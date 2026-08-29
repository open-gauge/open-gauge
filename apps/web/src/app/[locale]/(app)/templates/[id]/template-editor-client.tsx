"use client";

import { useParams } from "next/navigation";
import { TemplateEditorShell } from "@/components/templates/editor-shell";

export default function TemplateEditorClient() {
  const params = useParams<{ id: string }>();
  return <TemplateEditorShell templateId={params.id} />;
}
