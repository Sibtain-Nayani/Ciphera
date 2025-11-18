export default function Button({ children, className = "", variant = "primary", ...rest }) {
  return (
    <button
      className={`button ${variant === "secondary" ? "secondary" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}