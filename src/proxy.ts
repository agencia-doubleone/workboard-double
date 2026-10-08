import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Checagem otimista: só olha se o cookie de sessão existe, sem ir ao banco.
// A validação real acontece em requireSession() (src/lib/session.ts).
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") {
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tudo exceto páginas públicas (login, redefinir senha), API, assets do
  // Next e arquivos com extensão.
  matcher: ["/((?!api|login|redefinir-senha|_next/static|_next/image|.*\\..*).*)"],
};
