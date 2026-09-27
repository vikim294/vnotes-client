import { twMerge } from "tailwind-merge";

type ButtonType = "primary" | "secondary" | "danger" | "default";

interface ButtonProps {
  children: React.ReactNode;
  type?: ButtonType;
  glass?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

export default function Button({
  children,
  type = "default",
  glass = false,
  className,
  onClick,
  disabled = false,
}: ButtonProps) {
  // Base button styles with enhanced theming
  const baseStyles = "inline-flex items-center justify-center cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 select-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 whitespace-nowrap";
  
  // Type-specific styles with the new color palette
  const solidTypeStyles = {
    primary: disabled
      ? "bg-slate-600 text-slate-400 cursor-not-allowed"
      : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 focus:ring-emerald-500",
    secondary: disabled
      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
      : "bg-slate-700 hover:bg-slate-600 text-slate-100 shadow-lg shadow-slate-700/20 hover:shadow-slate-700/30 focus:ring-slate-500",
    danger: disabled
      ? "bg-slate-600 text-slate-400 cursor-not-allowed"
      : "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 focus:ring-rose-500",
    default: disabled
      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
      : "bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-lg shadow-slate-800/20 hover:shadow-slate-800/30 focus:ring-slate-600"
  };

  const glassTypeStyles = {
    primary: disabled
      ? "  text-slate-500  cursor-not-allowed"
      : "   hover:bg-emerald-900/60 text-emerald-100   focus:ring-emerald-500",
    secondary: disabled
      ? "  text-slate-500  cursor-not-allowed"
      : "  hover:bg-slate-700/70 text-slate-100   focus:ring-slate-500",
    danger: disabled
      ? "  text-slate-500  cursor-not-allowed"
      : "   hover:bg-rose-900/60 text-rose-100   focus:ring-rose-500",
    default: disabled
      ? "  text-slate-500  cursor-not-allowed"
      : "  hover:bg-slate-800/70 text-slate-200   focus:ring-slate-600"
  };

  const typeStyles = glass ? glassTypeStyles : solidTypeStyles;

  return (
    <button
      className={twMerge(
        baseStyles,
        typeStyles[type],
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
