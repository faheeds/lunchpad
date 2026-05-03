"use client";

interface ConfirmButtonProps {
  message: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A submit button that shows a browser confirm() dialog before submitting.
 * Safe to use inside server-component forms — it is itself a client component.
 */
export function ConfirmButton({ message, className, children }: ConfirmButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
