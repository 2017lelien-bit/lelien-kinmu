import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getStaffDetail } from "@/lib/staff-admin";
import { getPayslipsForStaff } from "@/lib/payroll";
import TaxSettingsForm from "@/components/staff/TaxSettingsForm";
import PayCategoryManager from "@/components/staff/PayCategoryManager";
import PayRateRuleManager from "@/components/staff/PayRateRuleManager";
import PayrollPanel from "@/components/staff/PayrollPanel";

export default async function StaffAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const [detail, payslips] = await Promise.all([getStaffDetail(id), getPayslipsForStaff(id)]);
  if (!detail) notFound();

  const { profile, payCategories, payRateRules } = detail;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{profile.name} さん</h1>

      <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="text-neutral-500">権限</dt>
        <dd>{profile.role === "admin" ? "管理者" : "スタッフ"}</dd>
        <dt className="text-neutral-500">電話番号</dt>
        <dd>{profile.phone ?? "-"}</dd>
        <dt className="text-neutral-500">連絡先メール</dt>
        <dd>{profile.contact_email ?? "-"}</dd>
      </dl>

      <TaxSettingsForm
        staffId={profile.id}
        dependentCount={profile.dependent_count}
        hasSpouseDeduction={profile.has_spouse_deduction}
        isActive={profile.is_active}
      />

      <PayCategoryManager staffId={profile.id} payCategories={payCategories} />

      <PayRateRuleManager staffId={profile.id} payRateRules={payRateRules} />

      <PayrollPanel staffId={profile.id} payslips={payslips} />
    </div>
  );
}
