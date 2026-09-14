import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      {...props}
    />
  );
}

export function RotateLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 9a8 8 0 1 1 1.64 8.84" />
      <path d="M4 4v5h5" />
    </Icon>
  );
}

export function RotateRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 9a8 8 0 1 0-1.64 8.84" />
      <path d="M20 4v5h-5" />
    </Icon>
  );
}

export function FlipHorizontalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v18" strokeDasharray="2.5 3" />
      <path d="M7 8 3 12l4 4" />
      <path d="M17 8l4 4-4 4" />
    </Icon>
  );
}

export function FlipVerticalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" strokeDasharray="2.5 3" />
      <path d="M8 7 12 3l4 4" />
      <path d="M8 17l4 4 4-4" />
    </Icon>
  );
}

export function ImagePlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5.5" width="13" height="13" rx="2.2" />
      <circle cx="7.3" cy="10.3" r="1.3" />
      <path d="M4 16.5 8 12.5l2.5 2.5 2-2 2.5 2.5" />
      <path d="M19 3v6M16 6h6" />
    </Icon>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function HistogramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20V10" />
      <path d="M9 20V4" />
      <path d="M14 20V13" />
      <path d="M19 20V7" />
    </Icon>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

export function StarIcon({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <Icon
      {...props}
      fill={filled ? "currentColor" : "none"}
      strokeWidth={filled ? 1.2 : 1.6}
    >
      <path d="M12 3.5l2.47 5.18 5.53.66-4.06 3.87 1.07 5.6L12 15.9l-4.99 2.9 1.06-5.6L4 9.34l5.53-.66Z" />
    </Icon>
  );
}
