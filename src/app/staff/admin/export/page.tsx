import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import PayrollWorkspace from "@/components/staff/PayrollWorkspace";

export default async function PayrollExportPage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <h1 className="text-xl font-semibold">給与データ出力</h1>
      <p className="text-sm text-neutral-500">
        対象月の全スタッフ分の給与明細を、この画面で確認してから、Excelファイルでダウンロードできます。税理士さんへの共有はダウンロードしたファイルをいつも通りメールやLINEで送ってください。
      </p>
      <PayrollWorkspace />
    </div>
  );
}
