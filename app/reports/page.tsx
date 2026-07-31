'use client';

import { ButtonLink } from '@/components/ui/Button';
import { Placeholder } from '@/components/Placeholder';
import { useT } from '@/lib/i18n';

export default function ReportsPage() {
  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      {/* Sales history exists from session 4; the reports themselves land in 7. */}
      <ButtonLink href="/sales" variant="quiet">
        <span className="ethiopic">{t.sales.title}</span>
      </ButtonLink>

      <Placeholder screen="reports" session={7} />
    </div>
  );
}
