import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { PORTAL_COOKIE_PREFIX, PORTAL_HOME_PATH, PORTAL_SIGN_IN_PATH } from "@/lib/portal";

// Checagem otimista: só olha se o cookie de sessão existe, sem ir ao banco.
// A validação real acontece em requireSession() (src/lib/session.ts) e, no
// portal do cliente, em requirePortalSession() (src/lib/portal-session.ts).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Portal do cliente: cookie próprio, tela de entrada própria. O cookie da
  // equipe não abre o portal, e o do portal não abre o resto do sistema.
  if (pathname === PORTAL_HOME_PATH || pathname.startsWith(`${PORTAL_HOME_PATH}/`)) {
    if (pathname === PORTAL_SIGN_IN_PATH || getSessionCookie(request, { cookiePrefix: PORTAL_COOKIE_PREFIX })) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(PORTAL_SIGN_IN_PATH, request.url));
  }

  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tudo exceto páginas públicas (login, esqueci a senha, redefinir senha),
  // API, assets do Next e arquivos com extensão. O portal (/portal) é tratado acima.
  matcher: ["/((?!api|login|esqueci-a-senha|redefinir-senha|_next/static|_next/image|.*\\..*).*)"],
};
