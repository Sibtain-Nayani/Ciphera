import React from 'react';

const Button = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold text-base-900 h-12 px-6 bg-accent hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-900 disabled:opacity-50 disabled:pointer-events-none transition-colors ${className}`}
      ref={ref}
      {...props}
    />
  );
});

Button.displayName = 'Button';

export { Button };
