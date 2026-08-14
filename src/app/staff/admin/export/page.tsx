import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import PayrollExportPanel from "@/components/staff/PayrollExportPanel";

export default async function PayrollExportPage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold">給与データ出力</h1>
      <p className="text-sm text-neutral-500">
        対象月の全スタッフ分の給与明細をCSVでダウンロードできます。税理士さんへの共有はダウンロードしたファイルをいつも通りメールやLINEで送ってください。
      </p>
      <PayrollExportPanel />
    </div>
  );
}
