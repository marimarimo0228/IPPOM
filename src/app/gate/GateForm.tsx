"use client";

import { useActionState } from "react";
import { enterGate, type GateState } from "./actions";

const initial: GateState = { error: null };

export default function GateForm() {
  const [state, action, pending] = useActionState(enterGate, initial);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-bold text-ippon">
        合言葉
        <input
          name="passphrase"
          className="w-full border-2 border-white/30 bg-black px-3 py-3 text-lg font-bold text-white outline-none focus:border-ippon"
          maxLength={100}
          autoComplete="off"
          autoFocus
          required
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-ippon px-4 py-4 text-xl font-black text-ink disabled:opacity-50"
      >
        {pending ? "確認中…" : "入る"}
      </button>
    </form>
  );
}
