import SelfRegisterForm from "@/components/staff/SelfRegisterForm";

export default function StaffRegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4 py-16">
      <p className="text-2xl font-semibold tracking-wide">Le lien</p>
      <h1 className="text-xl font-semibold">スタッフ登録</h1>
      <SelfRegisterForm />
    </main>
  );
}
