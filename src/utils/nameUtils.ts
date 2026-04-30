export const getFirstName = (nameOrEmail: string | null | undefined): string => {
  if (!nameOrEmail) return 'Someone';
  if (nameOrEmail.includes('@')) {
    return nameOrEmail.split('@')[0] ?? 'Someone';
  }
  return nameOrEmail.split(' ')[0] ?? 'Someone';
};
