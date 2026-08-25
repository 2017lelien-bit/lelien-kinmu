"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
    >
      印刷する
    </button>
  );
}
