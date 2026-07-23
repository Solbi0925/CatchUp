import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function FolderIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3.5 7.5v10A2.5 2.5 0 0 0 6 20h12a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18 7h-6l-2-2H6A2.5 2.5 0 0 0 3.5 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function UploadCloudIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 54" fill="none" aria-hidden="true" {...props}>
      <path d="M19 45H13C6.4 45 2 40.3 2 34.4 2 28.8 6 24.5 11.4 23.9 12.3 14.5 20.2 7 30 7c8.8 0 16.2 6.1 18.2 14.3C56 21.7 62 27.9 62 35.5 62 43.4 55.5 49 48 49h-5" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <path d="m22 31 10-10 10 10M32 22v29" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <path d="m4.5 12 9.5-8 9.5 8v10.5a2 2 0 0 1-2 2h-5v-7h-5v7h-5a2 2 0 0 1-2-2V12Z" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="5.5" width="21" height="19" rx="3" stroke="currentColor" strokeWidth="2.2" />
      <path d="M8 3v5M20 3v5M3.5 11h21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function TabUploadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 30 28" fill="none" aria-hidden="true" {...props}>
      <path d="M9 23H7a5 5 0 0 1-.6-10A9 9 0 0 1 24 10.8 6 6 0 0 1 23 23h-2" fill="currentColor" opacity=".95" />
      <path d="m11 18 4-4 4 4M15 14v11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
