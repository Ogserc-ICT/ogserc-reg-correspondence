"use client";
import { useActionState } from "react";
import { Messages, SubmitButton, type FormState } from "@/app/_components/form";
import { runJobAction } from "./actions";

export function RunButton({ job }: { job: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    () => runJobAction(job),
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary">Run now</SubmitButton>
      <Messages state={state} />
    </form>
  );
}
