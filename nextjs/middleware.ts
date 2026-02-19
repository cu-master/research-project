import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Protect all routes except login, register, auth API, and db init API
  matcher: [
    "/((?!login|register|api/auth|api/db/init|_next/static|_next/image|favicon.ico).*)",
  ],
};
