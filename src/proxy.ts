import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /staff 以下(ログインページを除く)はSupabaseセッション+staff_profilesの存在確認で保護する。
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const PUBLIC_STAFF_ROUTES = ["/staff/login", "/staff/set-password"];
  // set-passwordは招待・パスワード再設定リンクからの遷移直後(まだセッション未確立)に
  // クライアント側でトークンを処理してセッションを張る画面のため、ここでは保護しない。
  const isProtectedStaffRoute = pathname.startsWith("/staff") && !PUBLIC_STAFF_ROUTES.includes(pathname);

  if (isProtectedStaffRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/staff/login";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/staff/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/staff/:path*"],
};
