import LoginForm from "@/components/staff/LoginForm";

export default function StaffLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4 py-16">
      <p className="text-2xl font-semibold tracking-wide">Le lien</p>
      <h1 className="text-xl font-semibold">スタッフログイン</h1>
      <LoginForm />
    </main>
  );
}
