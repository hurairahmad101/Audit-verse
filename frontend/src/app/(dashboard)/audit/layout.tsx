import type { ReactNode } from 'react';

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <div className="audit-light -m-6 min-h-full !bg-[var(--color-subtle)]">
      <div className="p-6">{children}</div>
    </div>
  );
}
