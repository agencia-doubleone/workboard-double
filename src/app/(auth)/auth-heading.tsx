/** Título e descrição das telas públicas, centralizados acima do formulário. */
export function AuthHeading({
  title,
  description,
  icon,
}: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {icon}
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-sm text-pretty text-muted-foreground">{description}</p>
    </header>
  );
}
