import type { ReactNode } from 'react';

interface NotificationProps {
  type?: 'error' | 'success' | 'info' | 'warning';
  children?: ReactNode;
}

export function Notification({ type = 'info', children }: NotificationProps) {
  if (!children) return null;

  return (
    <div
      className={`notification notification-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
