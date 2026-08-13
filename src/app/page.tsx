import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-wide">Le lien</h1>
      <p className="text-sm text-neutral-500">勤務管理・給与計算システム</p>
      <Link
        href="/staff/login"
        className="rounded-xl bg-neutral-900 px-6 py-3 text-sm text-white dark:bg-white dark:text-black"
      >
        スタッフログイン
      </Link>
    </main>
  );
}
