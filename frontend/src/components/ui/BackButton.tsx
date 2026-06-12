'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      aria-label="Go back"
      className="relative z-10 mb-4 w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
    >
      <ArrowLeft size={15} strokeWidth={2} />
    </button>
  );
}

export default BackButton;
