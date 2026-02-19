export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth pages (login/register) render without the sidebar
  return <>{children}</>;
}
